import { GoogleGenAI, Type } from '@google/genai';
import { AuraAgent, RouteContext, AgentResponse } from './types';

export class ArchitectAgent implements AuraAgent {
  public readonly id = 'architect-agent';
  public readonly name = 'System Architect Agent';

  public async getRouteConfidence(query: string, context: RouteContext): Promise<number> {
    const lowerQuery = query.toLowerCase();
    
    // Exact phrase routing for explicit intent targeting
    if (lowerQuery.includes('intent architect') || lowerQuery.trim() === 'architect') {
      return 1.0;
    }
    
    // Fallback heuristic scoring
    const architectureKeywords = ['architecture', 'design pattern', 'system design', 'infrastructure', 'scaling', 'microservices', 'monolith', 'tech stack', 'architect'];
    const hasKeyword = architectureKeywords.some(kw => lowerQuery.includes(kw));
    
    if (hasKeyword) return 0.96;

    return 0.10;
  }

  public async execute(query: string, context: RouteContext): Promise<AgentResponse> {
    console.log(`[ArchitectAgent] Providing architectural guidance: "${query}"`);
    
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY is missing");
      const ai = new GoogleGenAI({ apiKey });

      const systemInstruction = `You are the AURA System Architect Agent, an absolute elite specialist in code, application architecture, distributed systems, and enterprise software design. 
You act as a Principal Engineer / Staff Engineer. Answer the user's questions about architecture, technical design, patterns, and scaling. 
Provide extremely technical, precise, and beautiful explanations formatted cleanly in Markdown. Focus on real-world engineering pragmatism.`;

      const formattedContents: any[] = [];
      if (context?.history && context.history.length > 0) {
          for (const msg of context.history) {
              formattedContents.push({
                  role: msg.role === 'model' ? 'model' : 'user',
                  parts: [{ text: msg.content }]
              });
          }
      }
      formattedContents.push({ role: 'user', parts: [{ text: query }] });

      if (context?.onToken) {
          const responseStream = await ai.models.generateContentStream({
            model: "gemini-3.1-pro-preview",
            contents: formattedContents,
            config: {
              systemInstruction,
              temperature: 0.2
            }
          });

          let fullText = '';
          for await (const chunk of responseStream) {
              if (chunk.text) {
                  fullText += chunk.text;
                  context.onToken(chunk.text);
              }
          }

          return {
            success: true,
            output: [{
              id: `sys_${Date.now()}`,
              type: 'SYSTEM_MESSAGE',
              resolution_state: 'CONVERSATIONAL',
              context_summary: fullText
            }]
          };
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: formattedContents,
        config: {
          systemInstruction,
          temperature: 0.2
        }
      });

      return {
        success: true,
        output: [{
          id: `sys_${Date.now()}`,
          type: 'SYSTEM_MESSAGE',
          resolution_state: 'CONVERSATIONAL',
          context_summary: response.text || "Architectural analysis complete."
        }]
      };

    } catch (e: any) {
        console.error(`[ArchitectAgent] Error execution context:`, e);
        return {
           success: false,
           output: [{
              id: `err_${Date.now()}`,
              type: 'SYSTEM_MESSAGE',
              resolution_state: 'GROUNDING_FAULT',
              context_summary: "Architecture agent processing failed: " + e.message
           }]
        };
    }
  }
}
