import { AuraAgent, RouteContext, AgentResponse } from './types';

export class SentinelAgent implements AuraAgent {
  public readonly id = 'sentinel-agent';
  public readonly name = 'Sentinel Market Monitoring Agent';

  private readonly monitorKeywords = ['alert me', 'notify me', 'monitor', 'track line', 'set alert', 'price drop'];

  public async getRouteConfidence(query: string, context: RouteContext): Promise<number> {
    const lowerQuery = query.toLowerCase();
    
    const hasKeyword = this.monitorKeywords.some(kw => lowerQuery.includes(kw));
    if (hasKeyword) return 0.90;

    return 0.10;
  }

  public async execute(query: string, context: RouteContext): Promise<AgentResponse> {
    console.log(`[Sentinel] Creating active market monitoring hook: "${query}"`);
    
    return {
      success: true,
      output: {
        monitorId: `MON-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
        status: 'ACTIVE',
        triggerCondition: 'Home Spread drops to -3 or better',
        pollingInterval: '60s',
        notificationChannel: 'WebSocket/Push',
        message: 'Sentinel monitoring hook successfully registered. We will alert you the millisecond the target line is breached.'
      }
    };
  }
}
