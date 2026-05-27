import { GoogleGenerativeAI, SchemaType, GenerationConfig } from "@google/generative-ai";
import { EventEmitter } from "events";
import { Redis } from "@upstash/redis";
import pino from 'pino';
import { randomUUID } from "crypto";

const isProd = process.env.NODE_ENV === 'production';
const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    ...(isProd ? {} : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l Z', ignore: 'pid,hostname' } } })
});

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const generationConfig: GenerationConfig = {
    responseMimeType: "application/json",
    temperature: 0.05, 
    responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
            severity: { type: SchemaType.STRING },
            headline: { type: SchemaType.STRING, description: "A sophisticated, financial-style headline. Must reflect an IN-PROGRESS event." },
            quantitative_analysis: { type: SchemaType.STRING, description: "Direct, factual live analysis. Focus on the current game clock and active momentum shifts." },
            recommended_action: {
                type: SchemaType.OBJECT,
                properties: {
                    market: { type: SchemaType.STRING },
                    action: { type: SchemaType.STRING },
                    target_price_cents: { type: SchemaType.NUMBER },
                    expected_value_delta: { type: SchemaType.NUMBER }
                },
                required: ["market", "action", "target_price_cents", "expected_value_delta"]
            }
        },
        required: ["severity", "headline", "quantitative_analysis", "recommended_action"]
    }
};

const flashModel = ai.getGenerativeModel({ 
    model: "gemini-3.1-pro-preview", 
    generationConfig,
    systemInstruction: `You are an elite High-Frequency Quant Analyst evaluating a game THAT IS HAPPENING RIGHT NOW.
ABSOLUTE RULE: DO NOT preview upcoming games. DO NOT talk about tomorrow's slate. You are evaluating a LIVE order book against LIVE play-by-play telemetry.
DO NOT use meta-phrases like "Here is the analysis", "The setup:", or "Aura Executive Summary". 
Deliver the raw, direct mathematical breakdown of the current inning/quarter. Speak exclusively in EV, variance, and live liquidity.`
});

const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! });

export interface PbPEvent { readonly id: string; readonly clock: string; readonly period: number; readonly description: string; readonly teamAbbr: string; readonly isHighLeverage: boolean; readonly wpa: number; readonly homeScore: number; readonly awayScore: number; readonly timestamp: number; }
export interface KalshiMarketState { readonly ticker: string; readonly impliedHomeWinProb: number; readonly restingAsk: number; readonly restingBid: number; readonly volume: number; readonly openInterest: number; readonly lastPrice: number; readonly orderBook?: { yes: [number, number][]; no: [number, number][]; }; }
export interface GameStateVector { gameId: string; homeTeam: string; awayTeam: string; recentPlays: PbPEvent[]; kalshiState: KalshiMarketState | null; mathBaselineProb: number; lastReasonedAt: number; consecutiveLeverageTicks: number; currentHomeScore: number; currentAwayScore: number; }

export class TelemetryOrchestrator extends EventEmitter {
    private inMemoryStateCache = new Map<string, GameStateVector>(); 
    private gameMutexLocks = new Set<string>(); 
    private localReasoningLocks = new Map<string, string>(); 
    private lastActivityTimestamps = new Map<string, number>(); 
    private readonly BASE_COOLDOWN_MS = 10000; 
    private readonly MIN_COOLDOWN_MS = 2500; 
    private readonly STATE_KEY_PREFIX = "aura:state:game:"; 
    private readonly STATE_TTL_SECONDS = 86400; 
    private readonly GC_INTERVAL_MS = 1800000;  

    constructor() {
        super();
        this.setMaxListeners(5000); 
        logger.info("[AURA SUBSTRATE] 🟢 TelemetryOrchestrator initialized with Gemini 3.1 Pro Preview.");
        const gcInterval = setInterval(() => this.garbageCollectInactiveGames(), this.GC_INTERVAL_MS);
        if (gcInterval.unref) gcInterval.unref();
    }

    public async ingestTelemetryTick(
        gameId: string, homeTeam: string, awayTeam: string,
        rawPbP: PbPEvent[], liveKalshi: KalshiMarketState | null, mathBaselineProb: number
    ): Promise<void> {
        this.lastActivityTimestamps.set(gameId, Date.now());

        if (this.gameMutexLocks.has(gameId)) return;
        this.gameMutexLocks.add(gameId);
        
        try {
            await this.executeTickProcessing(gameId, homeTeam, awayTeam, rawPbP, liveKalshi, mathBaselineProb);
        } catch (err: any) {
            logger.error({ err, gameId }, `[AURA:FATAL] Processing pipeline breached`);
        } finally {
            this.gameMutexLocks.delete(gameId);
        }
    }

    private async executeTickProcessing(
        gameId: string, homeTeam: string, awayTeam: string,
        rawPbP: PbPEvent[], liveKalshi: KalshiMarketState | null, mathBaselineProb: number
    ) {
        const state = await this.getGameState(gameId);
        state.homeTeam = homeTeam; state.awayTeam = awayTeam;
        const sanitizedRawPbP = (rawPbP || []).filter(p => p && p.id && typeof p.timestamp === 'number');

        const existingIds = new Set(state.recentPlays.map(p => `${p.id}-${p.timestamp}`));
        const newPlays = sanitizedRawPbP.filter(p => !existingIds.has(`${p.id}-${p.timestamp}`));

        if (newPlays.length === 0) {
            if (liveKalshi) { state.kalshiState = liveKalshi; await this.saveGameState(state); }
            return; 
        }

        state.recentPlays = [...newPlays, ...state.recentPlays].sort((a, b) => b.timestamp - a.timestamp).slice(0, 15); 
        state.kalshiState = liveKalshi;
        state.mathBaselineProb = mathBaselineProb;
        state.currentHomeScore = newPlays[0]?.homeScore ?? state.currentHomeScore;
        state.currentAwayScore = newPlays[0]?.awayScore ?? state.currentAwayScore;

        process.nextTick(() => { newPlays.forEach(play => this.emit(`PBP_TICK_${gameId}`, play)); });

        const leverageDetected = this.evaluateLeverage(state, newPlays);
        state.consecutiveLeverageTicks = leverageDetected ? state.consecutiveLeverageTicks + 1 : 0;

        const dynamicCooldownMs = Math.max(this.MIN_COOLDOWN_MS, this.BASE_COOLDOWN_MS - (state.consecutiveLeverageTicks * 1500));
        const isCooldownActive = (Date.now() - state.lastReasonedAt) < dynamicCooldownMs;

        if (leverageDetected && !isCooldownActive) {
            const lockToken = randomUUID();
            const hasLock = await this.acquireDistributedLock(gameId, lockToken, dynamicCooldownMs);
            
            if (hasLock) {
                state.lastReasonedAt = Date.now();
                this.synthesizeIntelligence(state).catch(e => {
                    logger.error(e, `[AURA:SYNTHESIS] Asynchronous evaluation failed for ${gameId}`);
                }).finally(() => {
                    this.releaseDistributedLock(gameId, lockToken).catch(() => {});
                });
            }
        }
        await this.saveGameState(state);
    }

    private evaluateLeverage(state: GameStateVector, newPlays: PbPEvent[]): boolean {
        if (newPlays.some(p => p.isHighLeverage)) return true;
        if (newPlays.some(p => Math.abs(p.wpa) > 0.05)) return true;
        if (state.kalshiState && typeof state.kalshiState.impliedHomeWinProb === 'number' && typeof state.mathBaselineProb === 'number') {
            const divergence = Math.abs(state.kalshiState.impliedHomeWinProb - state.mathBaselineProb);
            if (divergence > 0.065) return true; 
        }
        if (state.recentPlays.length >= 5) {
            const latest = state.recentPlays[0];
            const historical = state.recentPlays[Math.min(state.recentPlays.length - 1, 4)];
            if (latest && historical && typeof latest.homeScore === 'number' && typeof historical.homeScore === 'number') {
                const homeDiff = latest.homeScore - historical.homeScore;
                const awayDiff = latest.awayScore - historical.awayScore;
                if (Math.abs(homeDiff - awayDiff) >= 8) return true; 
            }
        }
        return false;
    }

    private async acquireDistributedLock(gameId: string, token: string, durationMs: number): Promise<boolean> {
        try {
            const acquired = await redis.set(`aura:lock:reasoning:${gameId}`, token, { nx: true, ex: Math.ceil(durationMs / 1000) });
            return !!acquired;
        } catch (err) {
            if (this.localReasoningLocks.has(gameId)) return false;
            this.localReasoningLocks.set(gameId, token);
            return true;
        }
    }

    private async releaseDistributedLock(gameId: string, token: string): Promise<void> {
        const lockKey = `aura:lock:reasoning:${gameId}`;
        try {
            const currentToken = await redis.get<string>(lockKey);
            if (currentToken === token) await redis.del(lockKey);
        } catch (err) {
            if (this.localReasoningLocks.get(gameId) === token) this.localReasoningLocks.delete(gameId);
        }
    }

    private async synthesizeIntelligence(state: GameStateVector) {
        const prompt = `
            MATCHUP: ${state.homeTeam} vs ${state.awayTeam} (CURRENT LIVE SCORE: ${state.currentHomeScore}-${state.currentAwayScore})
            LATEST ${state.recentPlays.length} IN-GAME PLAYS:
            ${state.recentPlays.map(p => `[${p.clock} - ${p.teamAbbr}] ${p.description} (WPA: ${(p.wpa * 100).toFixed(1)}%)`).join('\n')}
            
            LIVE MARKET PRICING (Kalshi): Ticker: ${state.kalshiState?.ticker || 'N/A'}, Implied Win Prob: ${state.kalshiState ? (state.kalshiState.impliedHomeWinProb * 100).toFixed(1) : 'N/A'}%, Ask: ${state.kalshiState?.restingAsk || 'N/A'}¢
            AURA LIVE MODEL: True Win Prob: ${(state.mathBaselineProb * 100).toFixed(1)}%
            
            DIRECTIVE: Output strict JSON. Evaluate the CURRENT live momentum. You are strictly forbidden from mentioning tomorrow or future slates. Focus only on the LIVE IN-PLAY action.
        `;
        
        try {
            const result = await flashModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
            let rawText = result.response.text().trim();
            if (rawText.startsWith("```")) {
                rawText = rawText.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
            }
            const insight = JSON.parse(rawText);
            this.emit(`ALPHA_SIGNAL_${state.gameId}`, insight);
        } catch (error) {
            logger.error(error, `[AURA:SYNTHESIS] Synthesis failed for ${state.gameId}`);
        }
    }

    private async getGameState(gameId: string): Promise<GameStateVector> {
        if (this.inMemoryStateCache.has(gameId)) return this.inMemoryStateCache.get(gameId)!;
        const cached = await redis.get<GameStateVector>(`${this.STATE_KEY_PREFIX}${gameId}`);
        if (cached) {
            this.inMemoryStateCache.set(gameId, cached);
            return cached;
        }
        const freshState: GameStateVector = {
            gameId, homeTeam: 'TBD', awayTeam: 'TBD', recentPlays: [], kalshiState: null,
            mathBaselineProb: 0.5, lastReasonedAt: 0, consecutiveLeverageTicks: 0,
            currentHomeScore: 0, currentAwayScore: 0
        };
        this.inMemoryStateCache.set(gameId, freshState);
        return freshState;
    }

    private async saveGameState(state: GameStateVector) {
        this.inMemoryStateCache.set(state.gameId, state);
        await redis.set(`${this.STATE_KEY_PREFIX}${state.gameId}`, state, { ex: this.STATE_TTL_SECONDS });
    }

    private garbageCollectInactiveGames() {
        const now = Date.now();
        for (const [gameId, last] of this.lastActivityTimestamps.entries()) {
            if (now - last > 3600000) { 
                this.lastActivityTimestamps.delete(gameId);
                this.inMemoryStateCache.delete(gameId);
                logger.info(`[AURA:GC] Garbage collected idle game: ${gameId}`);
            }
        }
    }
}

export const liveEngine = new TelemetryOrchestrator();
