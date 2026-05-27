import { GoogleGenerativeAI, SchemaType, Schema } from "@google/generative-ai";
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const MasterclassSchema: Schema = {
    type: SchemaType.OBJECT,
    properties: {
        analysis_markdown: { 
            type: SchemaType.STRING,
            description: "The narrative analysis. Must use markdown headers (##, ###)."
        } as Schema,
        consensus: {
            type: SchemaType.OBJECT,
            properties: {
                game_name: { type: SchemaType.STRING } as Schema,
                splits: {
                    type: SchemaType.ARRAY,
                    items: {
                        type: SchemaType.OBJECT,
                        properties: {
                            betType: { type: SchemaType.STRING },
                            selectionHome: { type: SchemaType.STRING },
                            selectionAway: { type: SchemaType.STRING },
                            homeTickets: { type: SchemaType.NUMBER },
                            homeMoney: { type: SchemaType.NUMBER },
                            awayTickets: { type: SchemaType.NUMBER },
                            awayMoney: { type: SchemaType.NUMBER },
                            sharpSignal: { type: SchemaType.STRING }
                        } as unknown as Record<string, Schema>
                    } as Schema
                } as Schema
            } as Record<string, Schema>
        } as Schema,
        chart: {
            type: SchemaType.OBJECT,
            properties: {
                title: { type: SchemaType.STRING } as Schema,
                lines: {
                    type: SchemaType.ARRAY,
                    items: {
                        type: SchemaType.OBJECT,
                        properties: {
                            dataKey: { type: SchemaType.STRING },
                            invertColors: { type: SchemaType.BOOLEAN }
                        } as unknown as Record<string, Schema>
                    } as Schema
                } as Schema,
                data: { type: SchemaType.ARRAY, items: { type: SchemaType.OBJECT } } as Schema
            } as Record<string, Schema>
        } as Schema
    } as Record<string, Schema>,
    required: ["analysis_markdown"]
};

// THE TEMPORAL GOLDEN PROMPT: Hardened to reject pre-game previews
const macroModel = ai.getGenerativeModel({ 
    model: "gemini-3.1-pro-preview", 
    generationConfig: {
        responseMimeType: "application/json",
        responseSchema: MasterclassSchema,
        temperature: 0.05, // Near-zero variance for strict adherence
    },
    systemInstruction: `You are the Lead Quantitative Live-Betting Analyst for an elite sports hedge fund. 

ABSOLUTE TEMPORAL CONSTRAINTS:
1. YOU ARE STRICTLY A LIVE, IN-GAME ENGINE. 
2. You must NEVER write pre-game previews. You must NEVER talk about "tomorrow's board" or "tonight's slate".
3. You ONLY analyze the exact live, in-progress game state provided to you. Speak about the current inning, quarter, period, and active pitch count/fatigue levels.

CRITICAL RULES:
1. SHOW, DON'T TELL. Do not announce your analysis. Do not use headers like "THE SETUP:" or "EXECUTIVE SUMMARY". Just start writing the facts.
2. TONE: Cold, analytical, objective. Speak in terms of Expected Value (EV), variance, leverage indexes, xFIP, WPA, and physiological fatigue.
3. FORMATTING: Use Markdown. Use ### for sub-headers. 

GOLDEN NARRATIVE EXAMPLE (Notice the immediate focus on the live clock):
"We are currently live at Petco Park in the bottom of the 5th inning, with the Philadelphia Phillies holding a razor-thin 1-0 lead over the San Diego Padres. Since Schwarber's 1st inning blast, the retail live betting market has aggressively backed the Phillies Moneyline. 

However, the raw score completely masks a massive statistical asymmetry. The public sees a 1-0 shutout and assumes Luzardo is dominant. Sharp models see an exhausted starter at 82 pitches through 4.2 innings, whose fastball velocity has dipped 1.4 mph over his last 15 deliveries.

Luzardo is highly unlikely to record an out in the 7th inning. With the Padres' Live Run Expectancy in high-stress situations sitting at 1.85 expected runs, the negative variance they suffered in the 1st and 3rd innings is mathematically primed for a positive regression."`
});

export async function generateLiveMasterclass(liveDataDump: string) {
    // 1. THE TEMPORAL ANCHOR (CRITICAL FIX)
    // The server forces the exact current time into the LLM's context window.
    const currentTime = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles", timeStyle: "long", dateStyle: "full" });
    logger.info({ currentTime }, `[AURA:SYNTHESIS] Triggering Live Synthesis at ${currentTime}...`);
    
    // Prefix the prompt payload with a physical command to stay in the present
    const prompt = `SYSTEM TIME OVERRIDE: The exact current time is ${currentTime} Pacific Time.
    
CURRENT ENGINE DIRECTIVE: Analyze ONLY the active live telemetry. Do NOT write a pre-game preview. 

RAW TELEMETRY:
${liveDataDump}`;
    
    try {
        const result = await macroModel.generateContent(prompt);
        return JSON.parse(result.response.text());
    } catch (error) {
        logger.error(error, "Synthesis Failed:");
        return null;
    }
}
