import { AuraArtifact } from '../types/aura';

interface WinProbParams {
    team: string;
    league?: string;
}

export async function handleWinProbabilityQuery(params: WinProbParams): Promise<AuraArtifact> {
    const { team, league } = params;
    
    const sport = league === 'nba' ? 'basketball' : 'baseball';
    const l = league || 'mlb';

    // First fetch the scoreboard to find the gameId for this team
    let gameId = '';
    try {
        const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${l}/scoreboard`;
        const res = await fetch(url);
        const data = await res.json();
        
        const event = data.events.find((e: any) => 
            e.name.toLowerCase().includes(team.toLowerCase()) || 
            e.shortName.toLowerCase().includes(team.toLowerCase()) || 
            e.competitions[0].competitors.some((c: any) => c.team.abbreviation.toLowerCase() === team.toLowerCase() || c.team.name.toLowerCase().includes(team.toLowerCase()))
        );

        if (event) {
            gameId = event.id;
        } else {
            throw new Error("Could not find a active/recent game for that team");
        }
    } catch (e: any) {
        return {
           id: `evt_wp_err_${Date.now()}`,
           type: 'SYSTEM_MESSAGE',
           resolution_state: 'GROUNDING_FAULT',
           context_summary: `Win probability failed (no game found): ${e.message}`,
        };
    }

    const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${l}/summary?event=${gameId}`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to fetch ESPN summary");
        
        const data = await response.json();
        const header = data.header;
        const comps = header?.competitions?.[0];
        if (!comps || !data.winprobability) {
             throw new Error("Game data or win probability not available");
        }

        const homeCompetitor = comps.competitors.find((c: any) => c.homeAway === 'home');
        const awayCompetitor = comps.competitors.find((c: any) => c.homeAway === 'away');

        const homeTeam = {
            name: homeCompetitor.team.name,
            abbreviation: homeCompetitor.team.abbreviation,
            color: homeCompetitor.team.color || '#ffffff',
            logo: homeCompetitor.team.logos?.[0]?.href || ''
        };

        const awayTeam = {
            name: awayCompetitor.team.name,
            abbreviation: awayCompetitor.team.abbreviation,
            color: awayCompetitor.team.color || '#ffffff',
            logo: awayCompetitor.team.logos?.[0]?.href || ''
        };

        const plays = data.plays || [];
        const playMap = new Map(plays.map((p: any) => [p.id, p.text]));

        const probabilities = data.winprobability.map((wp: any) => ({
            playId: wp.playId,
            homeWinPercentage: wp.homeWinPercentage * 100,
            awayWinPercentage: (1 - wp.homeWinPercentage) * 100,
            playDescription: playMap.get(wp.playId) || ''
        }));

        return {
            id: `evt_wp_${Date.now()}`,
            type: 'WIN_PROBABILITY_ARTIFACT',
            resolution_state: 'LIVE_DATA',
            data: {
                gameId,
                homeTeam,
                awayTeam,
                probabilities
            }
        };

    } catch (e: any) {
        return {
           id: `evt_wp_err_${Date.now()}`,
           type: 'SYSTEM_MESSAGE',
           resolution_state: 'GROUNDING_FAULT',
           context_summary: `Could not fetch win probability: ${e.message}`,
        };
    }
}
