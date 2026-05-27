import { AuraAgent, RouteContext, AgentResponse } from '../types';

export class MarketsAgent implements AuraAgent {
  public readonly id = 'markets-agent';
  public readonly name = 'Markets Agent';

  /**
   * Stateless confidence scoring. Safe for concurrent Promise.all execution.
   */
  public async getRouteConfidence(query: string, context: RouteContext): Promise<number> {
    const lowerQuery = query.toLowerCase();
    const marketKeywords = ['kalshi', 'market', 'prediction', 'odds', 'will the', 'chance of', 'probability of', 'betting line'];

    if (context.domain === 'markets') {
      return 0.95;
    }

    const hasKeyword = marketKeywords.some(keyword => lowerQuery.includes(keyword));
    if (hasKeyword) {
      return 0.85;
    }

    return 0.10; // Baseline fallback
  }

  /**
   * Executes prediction market analysis. Yields to Deep Research on API failures.
   */
  public async execute(query: string, context: RouteContext): Promise<AgentResponse> {
    console.log(`[MarketsAgent] Executing market analysis for query: "${query}"`);
    
    const carrier = context.payloadCarrier || {};
    // Use pre-extracted parameters from sports-agent if available, otherwise use raw query
    const resolvedQuery = carrier.canonicalTeam 
      ? `Will the ${carrier.canonicalTeam} win on ${carrier.gameDate || 'today'}?`
      : query;

    try {
      const markets = await this.fetchKalshiMarkets(resolvedQuery);
      
      // ELIMINATE FALSE-POSITIVE ERROR MASKING
      if (!markets || markets.length === 0) {
        console.warn(`[MarketsAgent] No active markets found for "${resolvedQuery}". Yielding to Deep Research.`);
        return {
          success: false,
          output: null,
          handoffTo: 'deep-research-agent',
          handoffPayload: {
            failedMarketQuery: resolvedQuery,
            reason: 'NO_ACTIVE_PREDICTION_MARKETS'
          }
        };
      }

      const marketStatus = 'LIVE'; // Or dynamically resolved from API
      const calculatedEdge = 0.045; // Simulating a calculated 4.5% edge on the market odds
      const marketOdds = -105;
      const marketId = 'KALSHI_MCI_SPREAD';
      const extractedTeam = carrier.canonicalTeam || 'NYK';

      // Play 1: Yield to Live In-Game Agent if market is active/locked
      if (marketStatus === 'LIVE' || query.toLowerCase().includes('live')) {
        console.log(`[MarketsAgent] Market is live. Handing off to Live In-Game Agent.`);
        return {
          success: true,
          output: null,
          handoffTo: 'live-in-game-agent',
          handoffPayload: {
            canonicalTeam: extractedTeam,
            liveStatus: 'ACTIVE',
            sport: carrier.sport || 'nba'
          }
        };
      }

      // Play 2: Yield to Portfolio Sharp if a mathematical edge is identified
      if (calculatedEdge > 0.02) {
        console.log(`[MarketsAgent] Identified high edge (${calculatedEdge * 100}%). Handing off to Portfolio Sharp.`);
        return {
          success: true,
          output: null,
          handoffTo: 'portfolio-sharp-agent',
          handoffPayload: {
            edgePercent: calculatedEdge,
            odds: marketOdds,
            marketId: marketId,
            bankroll: 10000 // In production, read from user session/DB
          }
        };
      }

      return {
        success: true,
        output: markets
      };

    } catch (error: any) {
      console.error(`[MarketsAgent] API failure or timeout:`, error);
      return {
        success: false,
        output: null,
        handoffTo: 'deep-research-agent',
        handoffPayload: {
          failedMarketQuery: resolvedQuery,
          reason: 'API_TIMEOUT_OR_ERROR',
          error: error.message
        }
      };
    }
  }

  /**
   * Upstream Kalshi API fetch wrapper.
   */
  private async fetchKalshiMarkets(query: string): Promise<any[]> {
    // In production, this integrates with your real Kalshi / Polymarket API wrappers.
    // Returning empty array here to demonstrate the deterministic fallback path.
    return []; 
  }
}
