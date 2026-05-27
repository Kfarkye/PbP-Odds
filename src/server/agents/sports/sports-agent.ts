import { GoogleGenAI, Type } from '@google/genai';
import { AuraAgent, RouteContext, AgentResponse } from '../types';
import { z } from 'zod';

export class SportsAgent implements AuraAgent {
  public readonly id = 'sports-agent';
  public readonly name = 'Sports Agent';

  public async getRouteConfidence(query: string, context: RouteContext): Promise<number> {
    const lowerQuery = query.toLowerCase();
    const sportsKeywords = ['score', 'schedule', 'stats', 'team', 'game', 'highlights', 'player stats', 'matchup', 'roster', 'league', 'standings'];

    if (context.domain === 'sports') {
      return 0.95;
    }

    const hasKeyword = sportsKeywords.some(keyword => lowerQuery.includes(keyword));
    if (hasKeyword) {
      return 0.85;
    }

    return 0.10;
  }

  public async execute(query: string, context: RouteContext): Promise<AgentResponse> {
    console.log(`[SportsAgent] Analyzing sports query: "${query}"`);

    // Use Gemini for semantic routing of sports entities
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY is missing");
      const ai = new GoogleGenAI({ apiKey });

      const getTeamProfile = {
        name: "get_team_profile",
        description: "Fetch a sports team's dashboard/profile, including record and stats.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            team: { type: Type.STRING, description: "Team name" },
            league: { type: Type.STRING, description: "League name or abbreviation" }
          },
          required: ["team"]
        }
      };

      const getPlayerProfile = {
        name: "get_player_profile",
        description: "Fetch a specific player's profile and stats.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            player: { type: Type.STRING, description: "Player name" },
            team: { type: Type.STRING, description: "Team name, if known" }
          },
          required: ["player"]
        }
      };

      const getLeagueProfile = {
        name: "get_league_profile",
        description: "Fetch a league overview, including top standings.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            league: { type: Type.STRING, description: "League name or abbreviation" }
          },
          required: ["league"]
        }
      };

      const systemInstruction = `You are the AURA Sports Agent. Route the user's sports query to the correct tool. If it's general commentary or chatter, respond conversationally. Ensure accurate entity mapping for teams, players, and leagues.`;

      // Build history
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

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
         contents: formattedContents,
         config: {
          systemInstruction,
          temperature: 0.1,
          tools: [{ functionDeclarations: [getTeamProfile, getPlayerProfile, getLeagueProfile] }]
        }
      });

      const functionCalls = response.functionCalls;

      if (functionCalls && functionCalls.length > 0) {
        const call = functionCalls[0];
        
        // Mock data generator for SDUI contract mapping
        if (call.name === 'get_team_profile') {
           const teamArg = (call.args as any).team || 'Unknown Team';
           return {
             success: true,
             output: [{
               id: `team_${Date.now()}`,
               type: 'TEAM_PROFILE_ARTIFACT',
               resolution_state: 'MAPPED',
               context_summary: `Rendered team profile for ${teamArg}.`,
               data: {
                 team: { id: "1", name: teamArg, abbreviation: teamArg.substring(0,3).toUpperCase(), primaryColorHex: "#1d428a", logo: "https://a.espncdn.com/i/teamlogos/nba/500/gs.png" },
                 stats: { wins: 45, losses: 20, standing: '1st in Division', streak: 4, winPercentage: 0.692 },
                 recentForm: ['W','W','L','W','W']
               }
             }]
           };
        } else if (call.name === 'get_player_profile') {
           const playerArg = (call.args as any).player || 'Unknown Player';
           return {
             success: true,
             output: [{
               id: `player_${Date.now()}`,
               type: 'PLAYER_PROFILE_ARTIFACT',
               resolution_state: 'MAPPED',
               context_summary: `Rendered player profile for ${playerArg}.`,
               data: {
                 player: { id: "1", name: playerArg, position: "PG", number: "30", headshotUrl: "https://a.espncdn.com/i/headshots/nba/players/full/3975.png" },
                 team: { abbreviation: "GSW" },
                 stats: { PPG: 26.4, APG: 5.1, RPG: 4.5 },
                 lastGame: { date: 'Yesterday', stats: { PTS: 31, AST: 6, REB: 4 } }
               }
             }]
           };
        } else if (call.name === 'get_league_profile') {
           const leagueArg = (call.args as any).league || 'Unknown League';
           return {
             success: true,
             output: [{
               id: `league_${Date.now()}`,
               type: 'LEAGUE_PROFILE_ARTIFACT',
               resolution_state: 'MAPPED',
               context_summary: `Rendered league profile for ${leagueArg}.`,
               data: {
                 league: { name: leagueArg, season: '2025-2026', stage: 'Regular Season' },
                 standings: [
                    { name: 'Boston Celtics', wins: 50, losses: 14, winPercentage: 0.781 },
                    { name: 'Denver Nuggets', wins: 48, losses: 16, winPercentage: 0.750 },
                    { name: 'Oklahoma City Thunder', wins: 47, losses: 17, winPercentage: 0.734 }
                 ],
                 latestNews: [
                     { title: "Major trades alter playoff picture as deadline passes.", time: "2h ago" },
                     { title: "MVP race tightens after spectacular 50-point performance.", time: "5h ago" }
                 ]
               }
             }]
           };
        }
      }

      // If no function call, it's conversational
      return {
          success: true,
          output: [{
              id: `sys_${Date.now()}`,
              type: 'SYSTEM_MESSAGE',
              resolution_state: 'CONVERSATIONAL',
              context_summary: response.text || "I am processing your sports query."
          }]
      };

    } catch (e: any) {
        console.error(`[SportsAgent] Error execution context:`, e);
        return {
           success: false,
           output: [{
              id: `err_${Date.now()}`,
              type: 'SYSTEM_MESSAGE',
              resolution_state: 'GROUNDING_FAULT',
              context_summary: "Sports model analysis interrupted: " + e.message
           }]
        };
    }
  }
}
