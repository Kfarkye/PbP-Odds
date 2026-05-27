import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { isDbDisabled, reportDbError } from '../db-breaker';

const LOG_PREFIX = '[AURA:KALSHI:INGESTION]';

// ============================================================================
// 1. Zod Runtime Firewall (Data Integrity)
// Guarantees upstream API changes from Kalshi do not poison our Firestore database
// ============================================================================
const KalshiMarketSchema = z.object({
    ticker: z.string(),
    title: z.string().default(''),
    yes_sub_title: z.string().optional().default(''),
    yes_ask_dollars: z.coerce.number().catch(0), // Safely coerces strings like "0.55" to floats, drops nulls to 0
    no_ask_dollars: z.coerce.number().catch(0)
}).passthrough();

const KalshiResponseSchema = z.object({
    markets: z.array(KalshiMarketSchema).default([])
});

// ============================================================================
// Utilities
// ============================================================================
function hashString(value: string): string {
    return createHash('sha1').update(value).digest('hex').slice(0, 12);
}

function calculateAmericanOdds(impliedProb: number): string {
    if (impliedProb <= 0) return '+10000';
    if (impliedProb >= 1) return '-10000';
    
    const prob = impliedProb * 100;
    if (prob > 50) {
        return '-' + Math.round((prob / (100 - prob)) * 100).toString();
    } else {
        return '+' + Math.round(((100 - prob) / prob) * 100).toString();
    }
}

// Generates a strict word-boundary Regex to prevent substring collisions
function createStrictMatcher(teamName: string, teamLocation: string): RegExp {
    const terms = [teamName, teamLocation && teamName ? `${teamLocation} ${teamName}` : ''].filter(Boolean);
    if (terms.length === 0) return /(?!)/; // Matches nothing
    const escapedTerms = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(`\\b(${escapedTerms.join('|')})\\b`, 'i');
}

// ============================================================================
// Core Ingestion Pipeline
// ============================================================================
export async function runKalshiIngestion(db: any) {
    if (!db || isDbDisabled()) {
         console.warn(`${LOG_PREFIX} Firestore is offline or disabled. Bypassing Kalshi ingestion pipeline.`);
         return { recordsUpdated: 0, receiptId: '', errors: ['Database offline'] };
    }
    console.log(`${LOG_PREFIX} Initiating structural ingestion pipeline...`);
    
    const runId = `kalshi_run_${Date.now()}`;
    const fetchedAt = new Date().toISOString();
    
    const receiptDocRef = doc(collection(db, 'sports_sources_staging'));
    const receiptId = receiptDocRef.id;

    let successCount = 0;
    let recordsUpdated = 0;
    let extractedCount = 0;
    const errors: string[] = [];

    // ============================================================================
    // Chunked Batch Utility (Bypasses Firestore 500-write limit)
    // ============================================================================
    let batch = writeBatch(db);
    let batchOperationCount = 0;
    
    async function commitBatchIfNeeded(force = false) {
        try {
            if (batchOperationCount >= 450 || (force && batchOperationCount > 0)) {
                await batch.commit();
                console.log(`${LOG_PREFIX} Flushed atomic batch of ${batchOperationCount} operations.`);
                batch = writeBatch(db);
                batchOperationCount = 0;
            }
        } catch (batchErr: any) {
            reportDbError(batchErr, 'Kalshi Batch Commit');
            throw batchErr;
        }
    }

    try {
        console.log(`${LOG_PREFIX} Fetching real-time market liquidity from Kalshi...`);
        
        // Timeout & Error handling for external fetch to prevent memory leaks
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Fetch timed out')), 10000)
        );

        // Target high limit to capture broad weekend slates and exclude combo/MVE contracts
        const fetchPromise = fetch('https://api.elections.kalshi.com/trade-api/v2/markets?limit=500&mve_filter=exclude');

        const res = await Promise.race([fetchPromise, timeoutPromise]) as Response;
        
        if (!res.ok) {
            throw new Error(`Kalshi API responded with status: ${res.status}`);
        }
        
        const rawData = await res.json();
        
        // Pipe through Zod Firewall
        const parsedData = KalshiResponseSchema.safeParse(rawData);
        if (!parsedData.success) {
            throw new Error(`Kalshi API schema mismatch: ${parsedData.error.message}`);
        }

        const markets = parsedData.data.markets;
        extractedCount = markets.length;
        console.log(`${LOG_PREFIX} Validated ${extractedCount} active markets.`);

        // Locate Canonical Games
        const gamesRef = collection(db, 'sports_games_staging');
        const q1 = query(gamesRef, where('status', 'in', ['STATUS_SCHEDULED', 'STATUS_IN_PROGRESS']));
        const gamesSnap = await getDocs(q1);

        console.log(`${LOG_PREFIX} Cross-referencing against ${gamesSnap.docs.length} active canonical games...`);

        for (const gameDoc of gamesSnap.docs) {
            const game = gameDoc.data();
            
            const homeName = game.home_team?.name || '';
            const awayName = game.away_team?.name || '';
            const homeLoc = game.home_team?.location || '';
            const awayLoc = game.away_team?.location || '';

            if (!homeName || !awayName) continue;

            const homeRegex = createStrictMatcher(homeName, homeLoc);
            const awayRegex = createStrictMatcher(awayName, awayLoc);

            let bestMarket = null;
            let matchedSide = null;

            for (const market of markets) {
                // Skip Multivariate Event (MVE) combo contracts or parlay legs
                if (market.market_mve_id || market.mve_ticker || (market.title && (market.title.toLowerCase().includes('[leg') || market.title.includes(',')))) {
                    continue;
                }

                // Ignore illiquid markets where asking price is 0 (Prevents NaN logic errors)
                if (market.yes_ask_dollars <= 0 && market.no_ask_dollars <= 0) continue;

                const title = (market.title || '').toLowerCase();
                const subTitle = (market.yes_sub_title || '').toLowerCase();
                const ticker = (market.ticker || '').toLowerCase();
                const searchString = `${title} ${subTitle} ${ticker}`;
                
                // Advanced Entity Resolution (Word Boundaries prevent "Kings" from matching "Vikings")
                const isHomeMatch = homeRegex.test(searchString);
                const isAwayMatch = awayRegex.test(searchString);
                
                if (isHomeMatch || isAwayMatch) {
                    
                    // Prioritize standard Moneyline / Game Winner markets over derivative props
                    const isDerivative = searchString.includes('over') || searchString.includes('under') || searchString.includes('spread');
                    if (isDerivative) continue;

                    bestMarket = market;
                    matchedSide = isHomeMatch ? 'home' : 'away';

                    // If BOTH teams are in the string, it's an exact high-confidence match. Break early.
                    if (isHomeMatch && isAwayMatch) break;
                }
            }

            if (bestMarket && matchedSide) {
                const yesPriceCents = bestMarket.yes_ask_dollars * 100;
                const noPriceCents = bestMarket.no_ask_dollars * 100;
                
                // Clamp mathematically to prevent 0 or 1 edge-case rendering crashes
                const impliedProbability = Math.max(Math.min(bestMarket.yes_ask_dollars, 0.99), 0.01);
                
                const marketData = {
                    provider: 'kalshi',
                    ticker: bestMarket.ticker,
                    title: bestMarket.title,
                    yes_price_cents: Math.round(yesPriceCents),
                    no_price_cents: Math.round(noPriceCents),
                    implied_probability: Number(impliedProbability.toFixed(4)),
                    american_odds: calculateAmericanOdds(impliedProbability),
                    timestamp: fetchedAt
                };

                const updateData = matchedSide === 'home' ? 
                    { 'market_odds.home_kalshi': marketData } :
                    { 'market_odds.away_kalshi': marketData };

                batch.update(gameDoc.ref, updateData);
                batchOperationCount++;
                successCount++;
                recordsUpdated++;
                
                await commitBatchIfNeeded();
                console.log(`${LOG_PREFIX} Linked [${bestMarket.ticker}] to Canonical Game: ${gameDoc.id}`);
            }
        }

        // Generate Valid Cryptographic Source Receipt
        const receiptData = {
            id: receiptId,
            run_id: runId,
            receipt_mode: 'per_run_audit',
            fetch_type: 'prediction_market',
            source_key: `kalshi_markets_${fetchedAt.split('T')[0]}`,
            source: 'kalshi',
            league: 'multiple',
            url: 'https://api.elections.kalshi.com/trade-api/v2/markets',
            fetched_at: fetchedAt,
            status: 'success',
            records_extracted: extractedCount,
            records_applied: successCount,
            cryptographic_hash: hashString(`${runId}_${successCount}_${fetchedAt}`),
            error: null
        };

        batch.set(receiptDocRef, receiptData);
        batchOperationCount++;

        // Final flush of any remaining operations
        await commitBatchIfNeeded(true);

        console.log(`${LOG_PREFIX} Successfully merged ${successCount} prediction markets into canonical games.`);
        console.log(`${LOG_PREFIX} Audit Receipt: ${receiptId}`);

    } catch (e: any) {
        console.error(`${LOG_PREFIX} Ingestion Fault:`, e.message);
        errors.push(e.message);

        // Record error receipt atomically in a rescue batch
        try {
            const errorBatch = writeBatch(db);
            const errorReceipt = {
                id: receiptId,
                run_id: runId,
                receipt_mode: 'per_run_audit',
                fetch_type: 'prediction_market',
                source: 'kalshi',
                fetched_at: fetchedAt,
                status: 'error',
                error: e.message
            };
            
            errorBatch.set(receiptDocRef, errorReceipt);
            await errorBatch.commit();
        } catch (rescueErr: any) {
            console.error(`${LOG_PREFIX} Fatal: Failed to write error receipt.`, rescueErr.message);
        }
    }

    return { recordsUpdated, receiptId, errors };
}
