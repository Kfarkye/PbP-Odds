import { AuraAgent, RouteContext, AgentResponse } from '../types';

export class YouTubeAgent implements AuraAgent {
  public readonly id = 'youtube-agent';
  public readonly name = 'YouTube Media Agent';

  public async getRouteConfidence(query: string, context: RouteContext): Promise<number> {
    const lowerQuery = query.toLowerCase();
    const mediaKeywords = ['watch', 'highlights', 'recap video', 'play clip', 'youtube', 'video of', 'film study'];

    const hasKeyword = mediaKeywords.some(keyword => lowerQuery.includes(keyword));
    if (hasKeyword) {
      return 0.95; // High confidence to intercept visual requests
    }

    return 0.05;
  }

  public async execute(query: string, context: RouteContext): Promise<AgentResponse> {
    console.log(`[YouTubeAgent] Intercepting media request: "${query}"`);

    // Extract the ideal search query terms for the YouTube API
    const cleanSearchQuery = query
      .replace(/watch|play|clip|video|highlights|youtube|show me/gi, '')
      .trim();

    const outputQuery = cleanSearchQuery.length > 0 
      ? `${cleanSearchQuery} highlights` 
      : 'New York Knicks playoff highlights';

    // Output strictly matching the requested youtube_media block format
    const formattedOutput = `\`\`\`youtube_media\n{\n  "query": "${outputQuery}"\n}\n\`\`\``;

    return {
      success: true,
      output: formattedOutput
    };
  }
}
