// ============================================================================
// AURA: Kalshi Telemetry Ingestion Adapter
// Strictly Read-Only. Extracts, Normalizes, and Stages Prediction Market Data.
// ============================================================================

import { writeBatch, doc, collection, Firestore } from 'firebase/firestore';
import { createHash } from 'node:crypto';
import { z } from 'zod';

const LOG_PREFIX = '[AURA:KALSHI:INGESTION]';
const KALSHI_BASE_URL = 'https://api.elections.kalshi.com/trade-api/v2';

// ============================================================================
// 1. Zod Validation Firewalls (Upstream API Defense)
// Protects the staging layer from upstream API structural changes
// ============================================================================

const KalshiEventSchema = z.object({
    event_ticker: z.string(),
    title: z.string().default(''),
    sub_title: z.string().optional().default(''),
    category: z.string().optional().default('Uncategorized'),
    mutually_exclusive: z.boolean().optional().default(false),
}).passthrough();

const KalshiMarketSchema = z.object({
    ticker: z.string(),
    event_ticker: z.string(),
    title: z.string().default(''),
    yes_sub_title: z.string().optional().default(''),
    status: z.string().default('unknown'),
    close_time: z.string().optional().nullable(),
    
    // Financial telemetry (Kalshi uses cents as integers)
    yes_ask: z.coerce.number().catch(0),
    yes_bid: z.coerce.number().catch(0),
    no_ask: z.coerce.number().catch(0),
    no_bid: z.coerce.number().catch(0),
    last_price: z.coerce.number().catch(0),
    
    // Liquidity metrics
    volume: z.coerce.number().catch(0),
    open_interest: z.coerce.number().catch(0),
}).passthrough();

const KalshiResponseSchema = z.object({
    events: z.array(KalshiEventSchema).optional().default([]),
    markets: z.array(KalshiMarketSchema).optional().default([]),
});

// ============================================================================
// 2. Canonical Database Schemas
// ============================================================================

export interface KalshiEvent {
    id: string; // Stable ID: kalshi_evt_{ticker}
    event_ticker: string;
    title: string;
    sub_title: string;
    category: string;
    mutually_exclusive: boolean;
    ingested_at: string;
}

export interface KalshiMarket {
    id: string; // Stable ID: kalshi_mkt_{ticker}
    ticker: string;
    event_ticker: string;
    title: string;
    subtitle: string;
    status: string;
    close_time: string | null;
    ingested_at: string;
}

export interface MarketSnapshot {
    id: string; // Idempotent State Hash: kalshi_snap_{ticker}_{hash}
    market_id: string;
    ticker: string;
    yes_bid: number;
    yes_ask: number;
    no_bid: number;
    no_ask: number;
    last_price: number;
    volume: number;
    open_interest: number;
    implied_probability: number;
    timestamp: string;
}

export interface SourceReceipt {
    id: string;
    run_id: string;
    source: string;
    mode: 'LIVE_INGEST' | 'DRY_RUN';
    status: 'SUCCESS' | 'FAULT';
    fetched_at: string;
    metrics: Record<string, number>;
    cryptographic_hash: string;
    error?: string;
}

export interface KalshiIngestionOptions {
    dryRun?: boolean;
    limit?: number;
}

// ============================================================================
// 3. Cryptographic & Utility Functions
// ============================================================================

function generateStableId(prefix: string, value: string): string {
    const hash = createHash('sha256').update(value).digest('hex').slice(0, 16);
    return `${prefix}_${hash}`;
}

/**
 * Generates an Idempotent State Hash.
 * If the exact pricing and liquidity hasn't changed since the last fetch, 
 * this guarantees the generated document ID is identical, resulting in a 
 * zero-delta overwrite in Firestore (preventing time-series bloat).
 */
function generateStateHash(m: z.infer<typeof KalshiMarketSchema>): string {
    const stateString = `${m.ticker}_${m.yes_bid}_${m.yes_ask}_${m.no_bid}_${m.no_ask}_${m.last_price}_${m.volume}_${m.open_interest}`;
    return generateStableId('kalshi_snap', stateString);
}

function calculateImpliedProbability(yesAsk: number, yesBid: number, lastPrice: number): number {
    // If an active spread exists, use the midpoint
    if (yesAsk > 0 && yesBid > 0 && yesAsk >= yesBid) return ((yesAsk + yesBid) / 2) / 100;
    // Fallback to last traded price if spread is illiquid
    if (lastPrice > 0) return lastPrice / 100;
    return 0; // Illiquid / No consensus
}

async function fetchWithSla(url: string, timeoutMs = 15000): Promise<any> {
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Fetch timed out')), timeoutMs)
    );

    const fetchPromise = fetch(url, { 
        headers: { 'Accept': 'application/json' }
    });

    const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;
    
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return await response.json();
}

// ============================================================================
// 4. Core Ingestion Pipeline
// ============================================================================

export async function runKalshiMarketIngestion(db: Firestore, options: KalshiIngestionOptions = {}) {
    const { dryRun = false, limit = 500 } = options;
    const runId = `kalshi_run_${Date.now()}`;
    const timestamp = new Date().toISOString();
    
    console.log(`${LOG_PREFIX} Initiating structural ingestion. Dry Run: ${dryRun}`);

    let batch = writeBatch(db);
    let batchOpCount = 0;
    
    const stats = {
        events_processed: 0,
        markets_processed: 0,
        snapshots_generated: 0,
    };
    const errors: string[] = [];

    // Dynamic Chunking (Bypasses Firestore 500-write limit securely)
    async function commitBatchIfNeeded(force = false) {
        if (dryRun) return; 
        if (batchOpCount >= 450 || (force && batchOpCount > 0)) {
            await batch.commit();
            console.log(`${LOG_PREFIX} Flushed chunk of ${batchOpCount} atomic operations.`);
            batch = writeBatch(db);
            batchOpCount = 0;
        }
    }

    try {
        // --- STEP 1: Fetch Upstream Telemetry ---
        console.log(`${LOG_PREFIX} Fetching Events & Markets (limit=${limit})...`);
        const [rawEventsData, rawMarketsData] = await Promise.all([
            fetchWithSla(`${KALSHI_BASE_URL}/events?limit=${limit}&status=open`),
            fetchWithSla(`${KALSHI_BASE_URL}/markets?limit=${limit}&status=open&mve_filter=exclude`)
        ]);

        // --- STEP 2: Zod Firewall Verification ---
        const parsedEvents = KalshiResponseSchema.safeParse(rawEventsData);
        const parsedMarkets = KalshiResponseSchema.safeParse(rawMarketsData);

        if (!parsedEvents.success || !parsedMarkets.success) {
            throw new Error(`Upstream API violated schema boundaries. Halting ingestion to protect staging tables.`);
        }

        const events = parsedEvents.data.events || [];
        const markets = parsedMarkets.data.markets || [];

        // --- STEP 3: Map & Hydrate Events ---
        const eventMap = new Map<string, KalshiEvent>();
        
        for (const rawEvent of events) {
            const eventId = `kalshi_evt_${rawEvent.event_ticker}`;
            const canonicalEvent: KalshiEvent = {
                id: eventId,
                event_ticker: rawEvent.event_ticker,
                title: rawEvent.title,
                sub_title: rawEvent.sub_title,
                category: rawEvent.category,
                mutually_exclusive: rawEvent.mutually_exclusive,
                ingested_at: timestamp
            };

            eventMap.set(rawEvent.event_ticker, canonicalEvent);

            if (!dryRun) {
                const ref = doc(collection(db, 'sports_kalshi_events_staging'), eventId);
                batch.set(ref, canonicalEvent, { merge: true }); // Idempotent Upsert
                batchOpCount++;
                await commitBatchIfNeeded();
            }
            stats.events_processed++;
        }

        // --- STEP 4: Map & Hydrate Markets and Snapshots ---
        for (const rawMarket of markets) {
            // Strict filtration of Multivariate Event (MVE) combo/parlay contracts
            if (rawMarket.market_mve_id || rawMarket.mve_ticker || (rawMarket.title && (rawMarket.title.toLowerCase().includes('[leg') || rawMarket.title.includes(',')))) {
                continue;
            }

            const marketId = `kalshi_mkt_${rawMarket.ticker}`;
            
            // Canonical Market Entity
            const canonicalMarket: KalshiMarket = {
                id: marketId,
                ticker: rawMarket.ticker,
                event_ticker: rawMarket.event_ticker,
                title: rawMarket.title,
                subtitle: rawMarket.yes_sub_title,
                status: rawMarket.status,
                close_time: rawMarket.close_time || null,
                ingested_at: timestamp
            };

            // Idempotent Market Snapshot
            const snapshotId = generateStateHash(rawMarket);
            const canonicalSnapshot: MarketSnapshot = {
                id: snapshotId,
                market_id: marketId,
                ticker: rawMarket.ticker,
                yes_bid: rawMarket.yes_bid,
                yes_ask: rawMarket.yes_ask,
                no_bid: rawMarket.no_bid,
                no_ask: rawMarket.no_ask,
                last_price: rawMarket.last_price,
                volume: rawMarket.volume,
                open_interest: rawMarket.open_interest,
                implied_probability: calculateImpliedProbability(rawMarket.yes_ask, rawMarket.yes_bid, rawMarket.last_price),
                timestamp: timestamp
            };

            if (!dryRun) {
                // Upsert Market
                const mktRef = doc(collection(db, 'sports_kalshi_markets_staging'), marketId);
                batch.set(mktRef, canonicalMarket, { merge: true });
                batchOpCount++;

                // Upsert Snapshot (Overwrites identical hash if pricing hasn't moved)
                const snapRef = doc(collection(db, 'sports_market_snapshots_staging'), snapshotId);
                batch.set(snapRef, canonicalSnapshot, { merge: true });
                batchOpCount++;

                await commitBatchIfNeeded();
            }
            
            stats.markets_processed++;
            stats.snapshots_generated++;
        }

        // --- STEP 5: Run Receipt Generation ---
        const receiptId = `receipt_${runId}`;
        const sourceReceipt: SourceReceipt = {
            id: receiptId,
            run_id: runId,
            mode: dryRun ? 'DRY_RUN' : 'LIVE_INGEST',
            source: 'kalshi_v2',
            fetched_at: timestamp,
            status: 'SUCCESS',
            metrics: stats,
            cryptographic_hash: generateStableId('hash', `${runId}_${stats.snapshots_generated}_${timestamp}`)
        };

        if (!dryRun) {
            const receiptRef = doc(collection(db, 'sports_sources_staging'), receiptId);
            batch.set(receiptRef, sourceReceipt);
            batchOpCount++;
            await commitBatchIfNeeded(true); // Final flush
        }

        console.log(`${LOG_PREFIX} Pipeline Complete. Events: ${stats.events_processed} | Markets: ${stats.markets_processed} | Snaps: ${stats.snapshots_generated}`);

        return { success: true, runId, dryRun, stats, receiptId, errors };

    } catch (error: any) {
        console.error(`${LOG_PREFIX} Pipeline Fault:`, error.message);
        errors.push(error.message);

        // Attempt rescue receipt write
        if (!dryRun) {
            try {
                const rescueBatch = writeBatch(db);
                const errorReceiptRef = doc(collection(db, 'sports_sources_staging'), `error_${runId}`);
                rescueBatch.set(errorReceiptRef, {
                    run_id: runId,
                    mode: 'LIVE_INGEST',
                    source: 'kalshi_v2',
                    fetched_at: timestamp,
                    status: 'FAULT',
                    metrics: stats,
                    cryptographic_hash: generateStableId('err', runId),
                    error: error.message
                });
                await rescueBatch.commit();
            } catch (rescueErr: any) {
                console.error(`${LOG_PREFIX} Failed to write error receipt:`, rescueErr.message);
            }
        }

        return { success: false, runId, dryRun, stats, error: error.message, errors };
    }
}
