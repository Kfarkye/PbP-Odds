import { GoogleGenAI, Type, Schema } from '@google/genai';
import { collection, doc, serverTimestamp, writeBatch, Firestore } from 'firebase/firestore';
import { z } from 'zod';
import { isDbDisabled, reportDbError } from './db-breaker';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const LOG_PREFIX = '[AURA:CRON:GENERATOR]';

// ============================================================================
// 1. Zod Runtime Firewall (Data Integrity Layer)
// Structured Outputs ensure the shape, but Zod provides safe defaults and 
// coercion if the LLM hallucinates a type (e.g., string instead of number).
// ============================================================================
const ZodFeedItemSchema = z.object({
    headline: z.string().min(5),
    summary: z.string().min(10),
    category: z.string().default('Intelligence'),
    image_url: z.string().url().catch('https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/nba.png'),
    source: z.string().default('Aura Engine'),
    priority: z.enum(["high_live", "trending", "evergreen"]).catch("trending"),
    factual_claims: z.array(z.object({
        claim: z.string(),
        source_entity: z.string()
    })).default([]),
    editorial_copy: z.string().min(20),
    betting_angle: z.string().nullable().optional(),
    metadata: z.object({
        kalshi_market_injected: z.boolean().optional(),
        kalshi_title: z.string().optional(),
        kalshi_yes_price: z.coerce.number().optional() // Coerces string "50" to number 50
    }).nullable().optional()
});

// ============================================================================
// 2. Deterministic Structured Output Schema (LLM Constraint)
// ============================================================================
const FeedItemSchema: Schema = {
    type: Type.ARRAY,
    description: "Array of premium sports intelligence feed cards.",
    items: {
        type: Type.OBJECT,
        properties: {
            headline: { type: Type.STRING, description: "Actionable, precise headline. No sensationalism." },
            summary: { type: Type.STRING, description: "Two-sentence executive summary." },
            category: { type: Type.STRING, description: "e.g., NBA, NHL, Premier League, MLB" },
            image_url: { type: Type.STRING, description: "MUST be a valid standard ESPN team logo URL." },
            source: { type: Type.STRING },
            priority: { type: Type.STRING, enum: ["high_live", "trending", "evergreen"] },
            factual_claims: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        claim: { type: Type.STRING },
                        source_entity: { type: Type.STRING }
                    },
                    required: ["claim", "source_entity"]
                }
            },
            editorial_copy: { 
                type: Type.STRING, 
                description: "The core analysis. MUST use exact markdown headers: **Market Sentiment**, **Statistical Baseline**, and **Identified Value**. No bullet points for main text, use only for data metrics. Clinical tone." 
            },
            betting_angle: { type: Type.STRING, description: "A clinical, one-sentence summary of the positive expected value (+EV) position." },
            metadata: {
                type: Type.OBJECT,
                properties: {
                    kalshi_market_injected: { type: Type.BOOLEAN },
                    kalshi_title: { type: Type.STRING },
                    kalshi_yes_price: { type: Type.NUMBER }
                }
            }
        },
        required: ["headline", "summary", "category", "image_url", "source", "priority", "factual_claims", "editorial_copy", "betting_angle"]
    }
};

// ============================================================================
// 3. Institutional Quant Persona Prompt
// ============================================================================
const SYSTEM_INSTRUCTION = `You are the Lead Quantitative Analyst for AURA, an elite sports intelligence platform. 
You curate high-leverage sports storylines, treating every event as an opportunity for market analysis and sharp predictive insights.

STRICT FORMATTING & TONE CONSTRAINTS:
1. THE ALGORITHM: You must structure your 'editorial_copy' using exactly these three markdown headers:
   - **Market Sentiment**: Detail the retail money flow and public narrative.
   - **Statistical Baseline**: Provide season-long trends, xG, and historical correlation metrics.
   - **Identified Value**: State the market inefficiency and the +EV position.
2. NEGATIVE CONSTRAINTS: You are strictly forbidden from using sensational hype words. Do NOT use: "massive", "absurd", "trap", "minefield", "vibes", "nightmare", or "lock". 
3. CLINICAL TONE: Use institutional financial terms: "significant", "inefficiency", "variance", "liability", "mispriced", and "disruptive".
4. SCANNABILITY: No paragraph may exceed 3 sentences. Use bullet points for data metrics.
5. PLAYOFF VERIFICATION: For series (NBA/NHL), you MUST search for the exact current series score before generating content. Do not default to "Game 1".
6. IMAGES: You MUST use a VERIFIED REAL URL for image_url. Default to using general team standard ESPN logos to prevent 404s.`;

// ============================================================================
// Utility: Exponential Backoff Retry (Handles API Transients)
// ============================================================================
async function executeWithRetry<T>(operation: () => Promise<T>, maxRetries = 3, delayMs = 2000): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error: any) {
            if (attempt === maxRetries) throw error;
            console.warn(`${LOG_PREFIX} Engine execution failed (Attempt ${attempt}/${maxRetries}). Retrying in ${delayMs}ms...`);
            await new Promise(res => setTimeout(res, delayMs));
            delayMs *= 1.5; // Exponential backoff scaling
        }
    }
    throw new Error("Unreachable");
}

// ============================================================================
// Core Execution Pipeline
// ============================================================================
export async function generateEditorialFeed(db: Firestore | any) {
    if (!db || isDbDisabled()) {
         console.warn(`${LOG_PREFIX} Firestore is offline or disabled via circuit breaker. Skipping generateEditorialFeed trigger.`);
         return;
    }
    
    const currentDate = new Date().toISOString();
    console.log(`${LOG_PREFIX} Initiating autonomous quantitative feed generation at ${currentDate}...`);

    const chat = ai.chats.create({
        model: "gemini-3.1-pro-preview", 
        config: {
            responseMimeType: "application/json",
            responseSchema: FeedItemSchema,
            temperature: 0.15, // Ultra-low temp for deterministic output
            tools: [{ googleSearch: {} }],
            systemInstruction: SYSTEM_INSTRUCTION
        }
    });

    const prompt = `Synthesize the top 5 most consequential active sports events and market inefficiencies right now, strictly based on current Google Search Trends for sports. (Current timestamp: ${currentDate}). Execute deep search grounding to verify all metrics before generating the output JSON.`;
    
    console.log(`${LOG_PREFIX} Generating structural candidates via Engine...`);
    
    let responseText = "";
    try {
        const response = await executeWithRetry(() => chat.sendMessage({ message: prompt }));
        responseText = response.text || "[]";
    } catch (error) {
        console.error(`${LOG_PREFIX} Engine execution fault (exhausted retries):`, error);
        return;
    }

    let rawBlocks: unknown[] = [];
    try {
        rawBlocks = JSON.parse(responseText);
    } catch (e) {
        console.error(`${LOG_PREFIX} Failed to parse JSON payload. Core schema breach.`, e);
        return;
    }

    if (!Array.isArray(rawBlocks) || rawBlocks.length === 0) {
         console.warn(`${LOG_PREFIX} Null set returned from Engine. Terminating write sequence.`);
         return;
    }
    
    const datePrefix = currentDate.split('T')[0].replace(/-/g, '');

    // Initialize Firestore Batch
    const batch = writeBatch(db);
    let writesQueued = 0;

    for (let i = 0; i < rawBlocks.length; i++) {
         const rawItem = rawBlocks[i];
         
         // Zod Safety Net: Drop/Fix malformed items before they touch the database
         const parsed = ZodFeedItemSchema.safeParse(rawItem);
         
         if (!parsed.success) {
             console.warn(`${LOG_PREFIX} Card validation failed at index ${i}. Skipping.`, parsed.error.format());
             continue;
         }

         const item = parsed.data;

         // Generate deterministic semantic slug
         const baseSlug = item.headline.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '').substring(0, 45);
         const slug = `${datePrefix}-${baseSlug}`;
         const cardId = `urn:aura:feed:${slug}`;

         const cardRef = doc(collection(db, "feed_cards"), cardId);

         // Batch the write (Merge true prevents wiping manual DB corrections)
         batch.set(cardRef, {
             id: cardId,
             slug: slug,
             type: 'EDITORIAL_CARD',
             rank: i,
             priority: item.priority,
             status: 'published',
             headline: item.headline,
             summary: item.summary,
             category: item.category,
             image_url: item.image_url,
             source: item.source,
             factual_claims: item.factual_claims,
             editorial_copy: item.editorial_copy,
             betting_angle: item.betting_angle,
             metadata: item.metadata || null,
             publishedAt: serverTimestamp() 
         }, { merge: true });
         
         writesQueued++;
         
         // Decoupled Telemetry: IndexNow ping with AbortController timeout
         if (process.env.PUBLIC_DOMAIN && process.env.INDEXNOW_KEY) {
             const url = `https://${process.env.PUBLIC_DOMAIN}/story/${slug}`;
             const indexNowUrl = `https://api.indexnow.org/indexnow?url=${encodeURIComponent(url)}&key=${process.env.INDEXNOW_KEY}`;
             
             const timeoutPromise = new Promise((_, reject) => {
                 setTimeout(() => reject(new Error('Fetch timed out')), 3000);
             }); // 3-second strict timeout
             
             Promise.race([fetch(indexNowUrl), timeoutPromise])
                 .catch(() => { /* Silent fail for telemetry */ });
         }
    }
    
    try {
        if (writesQueued > 0) {
            await batch.commit();
            console.log(`${LOG_PREFIX} Atomically committed ${writesQueued} canonical entities to Firestore.`);
        } else {
            console.warn(`${LOG_PREFIX} Zero valid entities queued. Batch commit aborted.`);
        }
    } catch (dbError) {
         reportDbError(dbError, 'Cron Editorial Feed');
         console.error(`${LOG_PREFIX} Firestore batch commit failed:`, dbError);
    }
}
