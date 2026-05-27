import { Request, Response, Router } from "express";
import { liveEngine } from "../quant-node";
import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const router = Router();

const MAX_CLIENTS_PER_GAME = 10000;
const HEARTBEAT_INTERVAL_MS = 15000;
const RECOVERY_BUFFER_SIZE = 50;

interface ClientSession {
    connectionId: string;
    res: Response;
    stalledWrites: number;
    createdAt: number;
}

interface SsePayload {
    id: string;
    event: 'PBP_TICK' | 'ALPHA_SIGNAL' | 'HEARTBEAT';
    data: any;
    timestamp: number;
}

interface GameMultiplexer {
    pbpListener: (play: any) => void;
    alphaListener: (insight: any) => void;
    clients: Map<string, ClientSession>;
    historyBuffer: SsePayload[];
}

const activeGames = new Map<string, GameMultiplexer>();

/**
 * Safely writes a chunk to an active SSE response stream.
 * Triggers cleanup if the socket is no longer writable.
 */
function safeWrite(client: ClientSession, payload: string): boolean {
    const { res } = client;
    if (res.destroyed || res.writableEnded || !res.writable) return false;
    
    try {
        const canAcceptMore = res.write(payload);
        if (typeof (res as any).flush === 'function') (res as any).flush();
        
        if (!canAcceptMore) {
            client.stalledWrites += 1;
            if (client.stalledWrites > 3) {
                logger.warn(`[SSE] Dropping Client [${client.connectionId}] due to TCP backpressure.`);
                return false;
            }
        } else {
            client.stalledWrites = 0;
        }
        return true;
    } catch (err) {
        return false;
    }
}

function formatSseChunk(payload: SsePayload): string {
    return `id: ${payload.id}\nevent: ${payload.event}\ndata: ${JSON.stringify(payload.data)}\n\n`;
}

router.get("/stream/:gameId", (req: Request, res: Response) => {
    const { gameId } = req.params;
    
    let game = activeGames.get(gameId);
    if (game && game.clients.size >= MAX_CLIENTS_PER_GAME) {
        res.status(429).json({ error: "Capacity reached for this telemetry stream." });
        return;
    }

    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-store, no-transform, must-revalidate");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");          
    res.setHeader("X-Content-Type-Options", "nosniff"); 
    res.setHeader("Content-Encoding", "none");         
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.flushHeaders();

    const clientSession: ClientSession = { connectionId, res, stalledWrites: 0, createdAt: Date.now() };
    
    safeWrite(clientSession, `retry: 3000\n: aura-stream-established\n\n`);

    if (!game) {
        const clientsMap = new Map<string, ClientSession>();
        const historyBuffer: SsePayload[] = [];

        const dispatchToClients = (payload: SsePayload) => {
            historyBuffer.push(payload);
            if (historyBuffer.length > RECOVERY_BUFFER_SIZE) historyBuffer.shift();

            const chunk = formatSseChunk(payload);
            for (const [cId, session] of clientsMap.entries()) {
                if (!safeWrite(session, chunk)) cleanupClient(cId, gameId);
            }
        };

        const pbpListener = (play: any) => dispatchToClients({
            id: `pbp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            event: 'PBP_TICK',
            data: play,
            timestamp: Date.now()
        });

        const alphaListener = (insight: any) => dispatchToClients({
            id: `alpha_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            event: 'ALPHA_SIGNAL',
            data: insight,
            timestamp: Date.now()
        });

        liveEngine.on(`PBP_TICK_${gameId}`, pbpListener);
        liveEngine.on(`ALPHA_SIGNAL_${gameId}`, alphaListener);

        game = { pbpListener, alphaListener, clients: clientsMap, historyBuffer };
        activeGames.set(gameId, game);
        logger.info(`[SSE] Allocated master multiplexer memory block for [${gameId}]`);
    }

    // Recover Dropped State for Mobile Reconnections
    const lastEventId = req.headers['last-event-id'];
    if (lastEventId && typeof lastEventId === 'string') {
        const missedIndex = game.historyBuffer.findIndex(e => e.id === lastEventId);
        if (missedIndex !== -1 && missedIndex < game.historyBuffer.length - 1) {
            const missedEvents = game.historyBuffer.slice(missedIndex + 1);
            for (const ev of missedEvents) {
                safeWrite(clientSession, formatSseChunk(ev));
            }
        }
    }

    game.clients.set(connectionId, clientSession);

    const heartbeatInterval = setInterval(() => {
        const payload: SsePayload = {
            id: `hb_${Date.now()}`,
            event: 'HEARTBEAT',
            data: { timestamp: Date.now(), status: 'alive' },
            timestamp: Date.now()
        };
        if (!safeWrite(clientSession, formatSseChunk(payload))) {
            cleanupClient(connectionId, gameId);
        }
    }, HEARTBEAT_INTERVAL_MS);

    function cleanupClient(cId: string, gId: string) {
        clearInterval(heartbeatInterval);
        const targetGame = activeGames.get(gId);
        if (!targetGame) return;

        const session = targetGame.clients.get(cId);
        if (session) {
            targetGame.clients.delete(cId);
            if (!session.res.destroyed && !session.res.writableEnded) session.res.end();
        }

        if (targetGame.clients.size === 0) {
            liveEngine.off(`PBP_TICK_${gId}`, targetGame.pbpListener);
            liveEngine.off(`ALPHA_SIGNAL_${gId}`, targetGame.alphaListener);
            activeGames.delete(gId);
            logger.info(`[SSE] Zero clients active. Deallocated memory block for [${gId}].`);
        }
    }

    req.on("close", () => cleanupClient(connectionId, gameId));
    req.on("error", () => cleanupClient(connectionId, gameId));
});

router.get("/stream-status", (req: Request, res: Response) => {
    const breakdown: Record<string, { clients: number; uptimeSeconds: number }> = {};
    let totalConnections = 0;

    for (const [gameId, game] of activeGames.entries()) {
        const clients = game.clients.size;
        let oldest = Date.now();
        for (const session of game.clients.values()) {
            if (session.createdAt < oldest) oldest = session.createdAt;
        }
        breakdown[gameId] = { clients, uptimeSeconds: Math.floor((Date.now() - oldest) / 1000) };
        totalConnections += clients;
    }

    const memUsage = process.memoryUsage();
    res.json({
        node_status: totalConnections < (MAX_CLIENTS_PER_GAME * activeGames.size) ? "HEALTHY" : "DEGRADED",
        uptime_seconds: process.uptime().toFixed(0),
        system_metrics: {
            rss_mb: (memUsage.rss / 1024 / 1024).toFixed(2),
            heap_used_mb: (memUsage.heapUsed / 1024 / 1024).toFixed(2),
            heap_total_mb: (memUsage.heapTotal / 1024 / 1024).toFixed(2)
        },
        network_metrics: {
            active_multiplexers: activeGames.size,
            global_tcp_connections: totalConnections,
            max_capacity_per_stream: MAX_CLIENTS_PER_GAME,
            allocation_breakdown: breakdown
        },
        timestamp: new Date().toISOString()
    });
});

const shutdownSSE = () => {
    logger.info(`[SSE] System termination signal intercepted. Flushing multiplexers...`);
    for (const [gameId, game] of activeGames.entries()) {
        const shutdownPayload = `retry: 1000\nevent: SYSTEM_RESTART\ndata: {"status": "reconnecting"}\n\n`;
        for (const [_, session] of game.clients.entries()) {
            safeWrite(session, shutdownPayload);
            if (!session.res.destroyed && !session.res.writableEnded) session.res.end();
        }
        liveEngine.off(`PBP_TICK_${gameId}`, game.pbpListener);
        liveEngine.off(`ALPHA_SIGNAL_${gameId}`, game.alphaListener);
    }
    activeGames.clear();
};

process.on('SIGTERM', () => { shutdownSSE(); process.exit(0); });
process.on('SIGINT', () => { shutdownSSE(); process.exit(0); });

export default router;
