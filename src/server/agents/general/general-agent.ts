import { GoogleGenerativeAI, Part, SchemaType, Tool } from '@google/generative-ai';
import { AuraAgent, AgentResponse, RouteContext, ChatMessage, Artifact } from '../types'; 

// ============================================================================
// TOOL DECLARATIONS & TYPES
// ============================================================================
const DELEGATE_TO_AGENT_TOOL: Tool = {
  functionDeclarations: [{
    name: "delegate_to_agent",
    description: "Delegate the user's query to a specialized agent.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        agent_id: { 
          type: SchemaType.STRING, 
          description: "The ID of the specialized agent (e.g., 'sports-agent', 'coding-agent', 'workspace-agent', 'deep-research-agent', 'markets-agent', 'live-in-game-agent', 'youtube-agent', 'portfolio-sharp-agent', 'line-shopper-agent', 'sentinel-agent', 'contrarian-agent')." 
        },
        rationale: { 
          type: SchemaType.STRING, 
          description: "A brief, professional, user-facing explanation of why AURA is routing to this agent." 
        }
      },
      required: ["agent_id", "rationale"]
    }
  }]
};

const GOOGLE_SEARCH_TOOL: any = {
  googleSearch: {}
};

interface HandoffPayload {
    originalQuery: string;
    trigger: string;
    rationale?: string;
    targetTeam?: string; 
    [key: string]: any; // Allow extensibility for future agent needs
}

// ============================================================================
// AGENT IMPLEMENTATION
// ============================================================================

export class GeneralAgent implements AuraAgent {
  public readonly id = 'general-conversational-agent';
  public readonly name = 'General Conversational Agent';

  public async getRouteConfidence(query: string, context?: RouteContext): Promise<number> {
    // Acts as the baseline orchestrator. Low confidence allows specialized heuristics to win, 
    // but high enough to catch unhandled/conversational intent.
    if (query.length > 5 && !context?.clientDomain) { 
        return 0.35; 
    }
    return 0.1; 
  }

  /**
   * Main Orchestration Pipeline
   */
  public async execute(query: string, context: RouteContext): Promise<AgentResponse> {
    console.log(`[${context.traceId || 'unknown'}] [GENERAL-AGENT] Processing: "${query}"`);
    
    // PHASE 1: Fast-Path Heuristics (Bypass LLM for known patterns to save latency)
    const heuristicResponse = this.evaluateHeuristics(query, context);
    if (heuristicResponse) return heuristicResponse;
    
    // PHASE 2: Environment Validation & Proactive Error Routing
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return this.generateSystemError(
        "System Offline: Missing Credentials", 
        "AURA's core intelligence engine requires an API key.\n> \n> **Action Required:** Please obtain a free key from [Google AI Studio](https://aistudio.google.com/app/apikey) and configure your `GEMINI_API_KEY` environment variable.",
        context
      );
    }

    // PHASE 3: AI Orchestration & Setup
    try {
      const ai = new GoogleGenerativeAI(apiKey);
      const model = ai.getGenerativeModel({ 
          model: "gemini-3.1-pro-preview", // Updated to the stable modern flash model
          systemInstruction: this.getSystemInstruction(),
          tools: [DELEGATE_TO_AGENT_TOOL],
          toolConfig: { functionCallingConfig: { mode: "AUTO" } } as any
      });

      const formattedContents = this.buildConversationHistory(query, context.history);
      
      const responseStream = await model.generateContentStream({
        contents: formattedContents,
        generationConfig: { temperature: 0.15 } // Low temp for routing precision, slight buffer for conversational tone
      });

      // PHASE 4: Stream Processing
      return await this.processLLMStream(responseStream, query, context);

    } catch (error: any) {
      return this.generateSystemError(
        "Critical Execution Fault", 
        `AURA encountered an unexpected interruption: \`${error.message || 'Unknown network timeout'}\`\n> \n> **Next Steps:** Please verify your network connection or check the [Google Cloud Status Dashboard](https://status.cloud.google.com/).`,
        context
      );
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS (Process Organization)
  // ============================================================================

  /**
   * Fast-path heuristic detection. Keeps the main handle block clean and organized.
   */
  private evaluateHeuristics(query: string, context: RouteContext): AgentResponse | null {
    if (query.match(/blow them out|lock|guarantee|everyone knows|sure thing/i)) {
      const rationale = "Analyzing underlying data to check for emotional retail bias.";
      console.log(`[${context.traceId}] [GeneralAgent] Emotional retail narrative detected. Fast-routing.`);
      
      if (context.onToken) {
          // UX: Anticipatory and formatted cleanly
          context.onToken(`\n> ⚡ **AURA INSIGHT:** Strong market sentiment detected. Bypassing standard protocols and routing directly to the **Contrarian Agent** to ${rationale.toLowerCase()}...\n\n`);
      }

      return {
        success: true,
        output: `Routing to Contrarian Agent. Rationale: ${rationale}`,
        handoffTo: 'contrarian-agent',
        handoffPayload: {
          originalQuery: query,
          trigger: 'EMOTIONAL_RETAIL_BIAS',
          rationale: rationale
        } as HandoffPayload
      };
    }
    return null;
  }

  /**
   * Defines the persona, routing logic, and strict UX/formatting rules.
   */
  private getSystemInstruction(): string {
    return `You are AURA, an elite, open-world agentic virtual assistant and the main orchestrator/delegator. Act as a Chief of Staff, meticulously analyzing the user's request.

CORE OBJECTIVES:
1. **Answer with Live Web Search:** You are equipped with Google Search capabilities. For general knowledge, current events, conversational queries, or fact-checking, perform a live web search yourself to answer the user directly with absolute precision.
2. **Delegate for Deep Execution:** ONLY use 'delegate_to_agent' if the task requires deep integration, specialized execution pipelines, specific API data, or complex workflows that fall strictly into the domain of a specialized agent described below. Provide a brief, professional rationale.
3. **Respond with Excellence:** If answering directly, be highly accurate, clear, and analytical.

USER EXPERIENCE (UX) & FORMATTING MANDATES - STRICT COMPLIANCE:
- **Anticipate Needs:** Never "dead-end" the user. Don't just answer the question; anticipate the next logical step. Suggest follow-up actions or offer to deploy a specialized agent (e.g., "Would you like me to hand this off to the Research Agent for a deeper dive?").
- **Inject Hyperlinks (CRITICAL):** Whenever you mention a well-known concept, tool, platform, or reference, you MUST embed a relevant Markdown hyperlink (e.g., [Google Workspace](https://workspace.google.com), [DraftKings](https://sportsbook.draftkings.com)). Never tell a user to "google it."
- **Visual Organization:** Format your responses beautifully. Use **bolding** for emphasis, bullet points for readability, and \`code blocks\` for technical terms.

AVAILABLE DELEGATION AGENTS (Use ONLY for deep execution/pipelines, NOT basic search):
- 'sports-agent': Deep execution for sports scores, schedules, player stats APIs.
- 'deep-research-agent': Multi-step deep web search, comprehensive long-form research.
- 'workspace-agent': Google Workspace API integration (Gmail, Calendar, Drive).
- 'markets-agent': Quantitative betting markets, odds, Kalshi execution logic.
- 'live-in-game-agent': Real-time play-by-play, momentum, game telemetry.
- 'youtube-agent': YouTube Data API media/video searches and execution.
- 'coding-agent': Code generation, GitHub API integration, software development.
- 'portfolio-sharp-agent': Betting portfolio risk analysis, kelly criterion sizing.
- 'line-shopper-agent': Scans deep sportsbooks endpoints for the best odds.
- 'sentinel-agent': Background monitoring and alert management.
- 'contrarian-agent': Data-driven contrarian betting angles, fading retail bias.`;
  }

  /**
   * Prepares the history array for the Gemini SDK format.
   */
  private buildConversationHistory(query: string, history?: ChatMessage[]): any[] {
    const formatted: any[] = [];
    if (history && history.length > 0) {
        for (const msg of history) {
            formatted.push({
                role: msg.role === 'model' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            });
        }
    }
    formatted.push({ role: 'user', parts: [{ text: query }] });
    return formatted;
  }

  /**
   * Processes the LLM chunk stream, handles tool calls, and dispatches UI tokens.
   */
  private async processLLMStream(responseStream: any, query: string, context: RouteContext): Promise<AgentResponse> {
    let fullText = "";
    let toolCallDetected = false;

    for await (const chunk of responseStream.stream) {
        if (!chunk.candidates || chunk.candidates.length === 0) continue;
        
        const candidate = chunk.candidates[0];
        if (!candidate.content?.parts) continue;

        for (const part of candidate.content.parts) {
            // Check for Tool Delegation
            if (part.functionCall && part.functionCall.name === 'delegate_to_agent') {
                toolCallDetected = true;
                const args = part.functionCall.args as any;
                const agentId = args.agent_id || 'specialized-agent';
                const rationale = args.rationale || 'process your request';
                
                console.log(`[${context.traceId}] [GeneralAgent] Orchestrator delegating to ${agentId}.`);
                
                // UX: Beautiful formatted routing message in the UI
                if (context.onToken) {
                    const readableAgentName = agentId.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
                    context.onToken(`\n\n> 🔄 **AURA CORE:** Routing your request to the **${readableAgentName}**...\n> *Rationale: ${rationale}*\n\n`);
                }

                return {
                    success: true,
                    output: `Delegated to ${agentId}. Rationale: ${rationale}`,
                    handoffTo: agentId,
                    handoffPayload: { originalQuery: query, trigger: 'LLM_DELEGATION', rationale } as HandoffPayload
                };
            } 
            // Stream standard conversational text
            else if (part.text) {
                fullText += part.text;
                if (context.onToken) context.onToken(part.text); 
            }
        }
    }

    // Handle non-delegation outcomes (Conversational Response)
    if (!toolCallDetected) {
        // UX Anticipation: Proactive fallback menu if the AI somehow returns nothing or gets confused
        const proactiveHelp = fullText || "I've analyzed your request, but I need a bit more clarity to assist you effectively.\n\n**Here are a few domains I can help with:**\n- 🏀 **Sports & Markets:** *\"Find the best odds for the Knicks tonight.\"*\n- 💻 **Engineering:** *\"Help me write a React component.\"*\n- 📅 **Workspace:** *\"Check my calendar for tomorrow.\"*\n\nHow would you like to proceed?";
        
        if (!fullText && context.onToken) context.onToken(proactiveHelp);
        
        return {
          success: true,
          output: proactiveHelp,
          artifacts: fullText ? undefined : [{ 
              type: 'SYSTEM_MESSAGE',
              resolution_state: 'NO_RESPONSE',
              context_summary: "Query was ambiguous. Proactive help menu provided."
          }]
        };
    }

    // Fallback for an interrupted/broken tool call stream
    return this.generateSystemError(
      "Stream Interrupted",
      "AURA attempted to route your request, but the data stream was interrupted. Please try asking that one more time.",
      context
    );
  }

  /**
   * Centralized error formatting for a consistent, actionable User Experience.
   */
  private generateSystemError(title: string, resolution: string, context: RouteContext): AgentResponse {
    const formattedError = `\n\n> 🚨 **${title}**\n> ${resolution}\n\n`;
    
    console.error(`[${context.traceId}] [GeneralAgent] ${title}`);
    if (context.onToken) context.onToken(formattedError);
    
    return {
      success: false,
      output: formattedError,
      artifacts: [{
          type: 'SYSTEM_MESSAGE',
          resolution_state: 'CRITICAL_FAULT',
          context_summary: title
      }]
    };
  }
}
