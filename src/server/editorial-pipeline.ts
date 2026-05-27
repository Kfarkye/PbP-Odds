import { GoogleGenerativeAI, SchemaType, Schema } from "@google/generative-ai";
import { db } from "./firebase-admin";

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export const FeedCardSchema: Schema = {
    type: SchemaType.OBJECT,
    properties: {
        id: { type: SchemaType.STRING },
        slug: { type: SchemaType.STRING },
        type: { type: SchemaType.STRING, enum: ["EDITORIAL", "PREDICTION_MARKET"], format: 'enum' },
        priority: { type: SchemaType.STRING, enum: ["standard", "high_live", "breaking"], format: 'enum' },
        category: { type: SchemaType.STRING },
        headline: { type: SchemaType.STRING },
        summary: { type: SchemaType.STRING },
        source: { type: SchemaType.STRING },
        editorial_copy: { 
            type: SchemaType.STRING,
            description: "The Markdown body. MUST include custom ```chart or ```splits blocks."
        },
        betting_angle: { type: SchemaType.STRING },
        metadata: {
            type: SchemaType.OBJECT,
            properties: {
                kalshi_market_injected: { type: SchemaType.BOOLEAN },
                kalshi_title: { type: SchemaType.STRING },
                kalshi_yes_price: { type: SchemaType.NUMBER },
                kalshi_american_odds: { type: SchemaType.STRING }
            }
        }
    },
    required: ["id", "slug", "type", "priority", "category", "headline", "summary", "editorial_copy"]
};

export async function generateQuantitativeEditorial(quantAnomaly: any) {
    console.log(`[AURA:PIPELINE] Initiating Gemini Editorial Generation...`);

    const model = ai.getGenerativeModel({
    model: "gemini-3.1-pro-preview",
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: FeedCardSchema,
            temperature: 0.1,
        },
        systemInstruction: `
            You are the Lead Quantitative Editor for a high-end sports trading desk.
            Your writing style is a hybrid of Bloomberg Terminal analytics and The Athletic deep-dives.
            You do not use fluff, cliches, or emotional language. You speak in math, expected value (EV), variance, and market inefficiencies.
            
            RULES:
            1. TONE: Cold, analytical, objective. 
            2. FORMATTING: Use Markdown. Break sections up with ## and ### headers. Use > for pull quotes.
            3. COMPONENTS: You MUST inject custom markdown blocks into the editorial_copy. 
               - If comparing stats, use: \`\`\`chart { "type": "bar", "title": "...", "labels": [], "datasets": [] } \`\`\`
               - If showing splits, use: \`\`\`splits [ { "market": "...", "sideA": {...}, "sideB": {...} } ] \`\`\`
            4. GROUNDING: Do not hallucinate statistics. ONLY use the quantitative data provided.
        `
    });

    const prompt = `Draft an editorial breakdown based on this verified anomaly:\n${JSON.stringify(quantAnomaly, null, 2)}`;

    try {
        const result = await model.generateContent(prompt);
        const editorialObject = JSON.parse(result.response.text());

        editorialObject.publishedAt = new Date().toISOString();

        // Write to Firestore
        await db.collection("aura_editorial_feed").doc(editorialObject.id).set(editorialObject);
        console.log(`[AURA:PIPELINE] ✅ Successfully deployed asset: ${editorialObject.headline}`);

    } catch (error) {
        console.error(`[AURA:PIPELINE_FAULT] Synthesis failed:`, error);
    }
}
