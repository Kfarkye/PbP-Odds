import { AuraAgent, RouteContext, AgentResponse } from './types';

export class PortfolioSharpAgent implements AuraAgent {
  public readonly id = 'portfolio-sharp-agent';
  public readonly name = 'Portfolio Sharp & Bankroll Agent';

  private readonly riskKeywords = ['bankroll', 'units', 'optimal sizing', 'risk', 'kelly criterion', 'portfolio', 'unit size'];

  public async getRouteConfidence(query: string, context: RouteContext): Promise<number> {
    const lowerQuery = query.toLowerCase();
    
    if (context.domain === 'portfolio') return 0.95;
    
    const hasKeyword = this.riskKeywords.some(kw => lowerQuery.includes(kw));
    if (hasKeyword) return 0.85;

    return 0.10;
  }

  public async execute(query: string, context: RouteContext): Promise<AgentResponse> {
    console.log(`[PortfolioSharp] Executing Kelly Criterion calculations for query: "${query}"`);
    
    const carrier = context.payloadCarrier || {};
    const edge = carrier.edgePercent || 0.03; // Default 3% edge if not passed
    const odds = carrier.odds || -110;
    const bankroll = carrier.bankroll || 10000;

    // Decimal odds conversion
    const b = odds > 0 ? (odds / 100) : (100 / Math.abs(odds));
    const p = 0.50 + edge; // Win probability
    const q = 1 - p;       // Loss probability
    
    // Kelly Fraction: f* = (bp - q) / b
    const kellyFraction = ((b * p) - q) / b;
    const fractionalKelly = kellyFraction * 0.5; // Apply 0.5x Fractional Kelly for safety
    const optimalStake = bankroll * fractionalKelly;

    return {
      success: true,
      output: {
        bankroll,
        calculatedEdge: `${(edge * 100).toFixed(1)}%`,
        odds,
        fullKellyPercent: `${(kellyFraction * 100).toFixed(2)}%`,
        recommendedKellyPercent: `${(fractionalKelly * 100).toFixed(2)}% (0.5x Fractional)`,
        optimalStakeAmount: `$${optimalStake.toFixed(2)}`,
        riskLevel: 'MODERATE',
        advice: `To maximize long-term logarithmic growth while minimizing drawdown risk, place a bet of $${optimalStake.toFixed(2)} (${(fractionalKelly * 100).toFixed(1)} units).`
      }
    };
  }
}
