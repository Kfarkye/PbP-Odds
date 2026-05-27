import { AuraAgent, RouteContext, AgentResponse } from './types';
import { SportsAgent } from './sports/sports-agent';
import { DeepResearchAgent } from './research/deep-research-agent';
import { WorkspaceAgent } from './workspace/workspace-agent';
import { MarketsAgent } from './markets/markets-agent';
import { LiveInGameAgent } from './sports/live-in-game-agent';

export class RegistryRouter {
  private agents: Map<string, AuraAgent> = new Map();
  private defaultAgentId: string = 'general-conversational-agent';

  constructor(customAgents?: AuraAgent[], defaultAgentId?: string) {
    if (customAgents) {
      for (const agent of customAgents) {
        this.agents.set(agent.id, agent);
      }
    } else {
      this.agents.set('sports-agent', new SportsAgent());
      this.agents.set('deep-research-agent', new DeepResearchAgent());
      this.agents.set('workspace-agent', new WorkspaceAgent());
      this.agents.set('markets-agent', new MarketsAgent());
      this.agents.set('live-in-game-agent', new LiveInGameAgent());
    }
    if (defaultAgentId) {
      this.defaultAgentId = defaultAgentId;
    }
  }

  public async route(
    query: string,
    context: RouteContext,
    onToken?: (token: string) => void
  ): Promise<AgentResponse> {
    const depth = context.depth || 0;
    const maxDepth = context.maxDepth || 3;

    if (depth >= maxDepth) {
      console.warn(`[RegistryRouter] Max routing depth (${maxDepth}) exceeded. Falling back to default.`);
      return this.executeDefault(query, context, onToken);
    }

    const enrichedContext: RouteContext = {
      ...context,
      depth,
      maxDepth,
      visitedAgents: context.visitedAgents || [],
      originalQuery: context.originalQuery || query,
      onToken: onToken || context.onToken,
      payloadCarrier: context.payloadCarrier || {}
    };

    let bestAgent: AuraAgent | null = null;
    let highestConfidence = 1.0;

    // Check if we are at the initial orchestrator step (depth 0)
    if (depth === 0) {
      bestAgent = this.agents.get(this.defaultAgentId) || null;
      console.log(`[RegistryRouter] Directing query to main orchestration LLM: [${this.defaultAgentId}]`);
    } else if (context.payloadCarrier && context.payloadCarrier.targetAgentId) {
      // Handoff to specific agent requested by orchestrator
      const targetId = context.payloadCarrier.targetAgentId;
      bestAgent = this.agents.get(targetId) || null;
      console.log(`[RegistryRouter] Explicitly routing to target orchestrator delegate: [${targetId}]`);
    } else {
       // Fallback bidding if needed for deeper un-targeted routing
       const eligibleAgents = Array.from(this.agents.entries())
         .filter(([id]) => !enrichedContext.visitedAgents.includes(id));
       
       if (eligibleAgents.length === 0) {
         return this.executeDefault(query, enrichedContext, onToken);
       }
       
       const biddingResults = await Promise.all(
         eligibleAgents.map(async ([id, agent]) => {
           try {
             const confidence = await agent.getRouteConfidence(query, enrichedContext);
             return { id, agent, confidence };
           } catch(err) {
             return { id, agent, confidence: -1 };
           }
         })
       );
       highestConfidence = -1;
       for (const result of biddingResults) {
         if (result.confidence > highestConfidence) {
           highestConfidence = result.confidence;
           bestAgent = result.agent;
         }
       }
    }

    if (!bestAgent) {
       return this.executeDefault(query, enrichedContext, onToken);
    }

    enrichedContext.visitedAgents.push(bestAgent.id);

    let response: AgentResponse;
    try {
      response = await Promise.race([
        bestAgent.execute(query, enrichedContext),
        new Promise<AgentResponse>((_, reject) => 
           setTimeout(() => reject(new Error(`Agent [${bestAgent!.id}] execution timed out`)), 300000)
        )
      ]);
    } catch (err) {
      console.error(`[RegistryRouter] Execution crashed on agent [${bestAgent.id}]:`, err);
      return this.handleExecutionFailure(query, enrichedContext, bestAgent.id, onToken);
    }

    if (response.handoffTo) {
      const targetAgentId = response.handoffTo;
      if (enrichedContext.visitedAgents.includes(targetAgentId)) {
        console.warn(`[RegistryRouter] Circular handoff detected to [${targetAgentId}]. Breaking loop.`);
        return response;
      }

      console.log(`[RegistryRouter] Handing off execution from [${bestAgent.id}] -> [${targetAgentId}]`);
      const handoffContext: RouteContext = {
        ...enrichedContext,
        depth: enrichedContext.depth + 1,
        payloadCarrier: {
          ...enrichedContext.payloadCarrier,
          ...response.handoffPayload,
          targetAgentId: targetAgentId // Pass explicit target
        }
      };
      return this.route(query, handoffContext, onToken);
    }

    return response;
  }

  private async executeDefault(query: string, context: RouteContext, onToken?: (token: string) => void): Promise<AgentResponse> {
    const defaultAgent = this.agents.get(this.defaultAgentId);
    if (!defaultAgent) throw new Error(`[RegistryRouter] Fatal: Default agent [${this.defaultAgentId}] is not registered.`);
    return defaultAgent.execute(query, context);
  }

  private async handleExecutionFailure(query: string, context: RouteContext, failedAgentId: string, onToken?: (token: string) => void): Promise<AgentResponse> {
    if (failedAgentId !== 'deep-research-agent' && this.agents.has('deep-research-agent')) {
      console.log(`[RegistryRouter] Execution failed for [${failedAgentId}]. Initiating Deep Research fallback.`);
      const fallbackContext: RouteContext = {
        ...context,
        depth: context.depth + 1,
        visitedAgents: [...(context.visitedAgents || []), failedAgentId]
      };
      return this.route(query, fallbackContext, onToken);
    }
    return this.executeDefault(query, context, onToken);
  }
}
