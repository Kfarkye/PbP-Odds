import { AuraArtifact } from '../types/aura';

interface PlayerPropParams {
    team: string;
    league?: string;
}

export async function handlePlayerPropQuery(params: PlayerPropParams): Promise<AuraArtifact> {
    const { team, league } = params;
    const sport = league === 'nba' ? 'basketball' : 'baseball';
    const l = league || 'mlb';

    let gameId = '';
    let eventData: any = null;
    
    try {
        const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${l}/scoreboard`;
        const res = await fetch(url);
        const data = await res.json();
        
        eventData = data.events.find((e: any) => 
            e.name.toLowerCase().includes(team.toLowerCase()) || 
            e.shortName.toLowerCase().includes(team.toLowerCase()) || 
            e.competitions[0].competitors.some((c: any) => c.team.abbreviation.toLowerCase() === team.toLowerCase() || c.team.name.toLowerCase().includes(team.toLowerCase()))
        );

        if (eventData) {
            gameId = eventData.id;
        } else {
            throw new Error("Could not find an active game for that team");
        }
    } catch (e: any) {
        return {
           id: `evt_prop_err_${Date.now()}`,
           type: 'SYSTEM_MESSAGE',
           resolution_state: 'GROUNDING_FAULT',
           context_summary: `Player Props failed (no game found): ${e.message}`,
        };
    }

    const summaryUrl = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${l}/summary?event=${gameId}`;
    
    try {
        const response = await fetch(summaryUrl);
        if (!response.ok) throw new Error("Failed to fetch ESPN summary");
        
        const data = await response.json();
        const header = data.header;
        const comps = header?.competitions?.[0];
        const boxscore = data.boxscore;
        
        if (!comps || !boxscore || !boxscore.players) {
             throw new Error("Game data or player statistics not available");
        }

        const props: any[] = [];
        const isBaseball = sport === 'baseball';

        // 1. Fetch real PrizePicks Projections
        let ppData: any = null;
        try {
            const ppRes = await fetch('https://api.prizepicks.com/projections');
            ppData = await ppRes.json();
        } catch (e) {
            console.warn("Failed to fetch PrizePicks projections");
        }

        // 2. Fusion Layer
        for (const teamBox of boxscore.players) {
            const teamId = teamBox.team.id;
            const competitor = comps.competitors.find((c: any) => c.team.id === teamId);
            const teamAbbrev = competitor?.team?.abbreviation || '';
            const teamColor = competitor?.team?.color ? `#${competitor.team.color}` : '#fff';
            
            const statsGroup = teamBox.statistics[0]; // Usually batting or generic
            if (!statsGroup || !statsGroup.athletes) continue;

            const targetStatKey = isBaseball ? 'hits' : 'points';
            const statDisplayStr = isBaseball ? 'Hits' : 'Points';

            for (const athleteObj of statsGroup.athletes) {
                const displayName = athleteObj.athlete.displayName;
                const statIdx = statsGroup.keys.indexOf(targetStatKey);
                const currentStatVal = statIdx !== -1 ? parseInt(athleteObj.stats[statIdx] || '0', 10) : 0;

                // Match with PrizePicks data if available
                let realPropLine: number | null = null;
                
                if (ppData && ppData.included) {
                    // Find player in included
                    const ppPlayer = ppData.included.find((i: any) => 
                         i.type === 'new_player' && 
                         (i.attributes.name === displayName || i.attributes.display_name === displayName) && 
                         i.attributes.league.toLowerCase() === l.toLowerCase()
                    );

                    if (ppPlayer) {
                        // Find a projection for this player
                        const ppProj = ppData.data.find((p: any) => 
                            p.relationships.new_player.data.id === ppPlayer.id &&
                            (p.attributes.stat_type === 'Hits' || p.attributes.stat_type === 'Points' || p.attributes.stat_type === 'Pts+Rebs+Asts')
                        );
                        
                        if (ppProj) {
                             realPropLine = ppProj.attributes.line_score;
                        }
                    }
                }

                // If we found a real prop line, definitely add it!
                if (realPropLine !== null) {
                     props.push({
                         playerId: athleteObj.athlete.id,
                         playerName: athleteObj.athlete.shortName || displayName,
                         headshot: athleteObj.athlete.headshot?.href || '',
                         teamAbbreviation: teamAbbrev,
                         teamColor: teamColor,
                         statName: statDisplayStr,
                         currentValue: currentStatVal,
                         propLine: realPropLine,
                         overPrice: 'MORE',
                         underPrice: 'LESS'
                     });
                }
            }
        }
        
        // Ensure we only show top 4 at max for UI elegance to avoid spam
        const finalProps = props.slice(0, 4);

        if (finalProps.length === 0) {
             throw new Error("No live PrizePicks props found for the players in this game.");
        }

        return {
            id: `evt_prop_${Date.now()}`,
            type: 'PLAYER_PROP_ARTIFACT',
            resolution_state: 'LIVE_DATA',
            data: {
                gameId,
                props: finalProps
            }
        };

    } catch (e: any) {
        return {
           id: `evt_prop_err_${Date.now()}`,
           type: 'SYSTEM_MESSAGE',
           resolution_state: 'GROUNDING_FAULT',
           context_summary: `Could not fetch real player props: ${e.message}`,
        };
    }
}
