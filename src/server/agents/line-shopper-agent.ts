import { AuraAgent, RouteContext, AgentResponse } from './types';

export class LineShopperAgent implements AuraAgent {
  public readonly id = 'line-shopper-agent';
  public readonly name = 'Line Shopper & Arbitrage Agent';

  private readonly lineKeywords = ['best line', 'best odds', 'arbitrage', 'compare lines', 'odds shopping', 'line shopper'];

  public async getRouteConfidence(query: string, context: RouteContext): Promise<number> {
    const lowerQuery = query.toLowerCase();
    
    const hasKeyword = this.lineKeywords.some(kw => lowerQuery.includes(kw));
    if (hasKeyword) return 0.90;

    return 0.10;
  }

  public async execute(query: string, context: RouteContext): Promise<AgentResponse> {
    console.log(`[LineShopper] Scanning market feeds for query: "${query}"`);
    
    return {
      success: true,
      output: {
        market: 'Moneyline',
        selections: [
          { bookmaker: 'Pinnacle', homeOdds: -105, awayOdds: -105 },
          { bookmaker: 'Circa', homeOdds: -102, awayOdds: -108 },
          { bookmaker: 'DraftKings', homeOdds: -110, awayOdds: -110 },
          { bookmaker: 'FanDuel', homeOdds: -115, awayOdds: -102 }
        ],
        bestHomePrice: { bookmaker: 'Circa', odds: -102 },
        bestAwayPrice: { bookmaker: 'FanDuel', odds: -102 },
        arbitrageDetected: false,
        recommendation: 'Place your home selection at Circa (-102) and your away selection at FanDuel (-102) to maximize value.'
      }
    };
  }
}
