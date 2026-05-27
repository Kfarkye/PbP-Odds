import { z } from 'zod';
import { getDocs, query, collection, where, Firestore } from 'firebase/firestore';
import { AuraArtifact } from '../types/aura';
import { isDbDisabled, reportDbError } from './db-breaker';
import { resolveTeamAbbreviation, resolveLeagueFromTeamName } from './entity-resolution';
import { normalizeDraftKingsOdds, normalizeKalshiOdds } from './normalizers';

const LOG_PREFIX = '[AURA:SPORTS:ORCHESTRATOR]';

// ============================================================================
// Input Validation Firewall
// ============================================================================
const SportsQuerySchema = z.object({
    team: z.string().trim().toLowerCase().optional(),
    league: z.string().trim().toLowerCase().optional(),
    date: z.string().regex(/^\d{8}$/, "Date must be YYYYMMDD").optional(),
    include_odds: z.boolean().optional().default(false)
});

export type SportsQueryParams = z.infer<typeof SportsQuerySchema>;

const LEAGUE_SPORT_MAP: Record<string, string> = {
    nba: 'basketball',
    wnba: 'basketball',
    nfl: 'football',
    mlb: 'baseball',
    nhl: 'hockey',
    mls: 'soccer',
    epl: 'soccer'
};

// ============================================================================
// Network Utilities
// ============================================================================
/**
 * Executes a network fetch with a strict timeout.
 * Prevents third-party API outages from hanging the Node Event Loop.
 */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response | null> {
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Fetch timed out')), timeoutMs)
    );
    try {
        const fetchPromise = fetch(url);
        const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;
        return response.ok ? response : null;
    } catch (error: any) {
        console.warn(`${LOG_PREFIX} Fetch fault for ${url.split('?')[0]}:`, error.message);
        return null;
    }
}

// ============================================================================
// Pipeline Stages
// ============================================================================

function parseTemporalContext(dateStr?: string) {
    if (!dateStr || dateStr.length !== 8) return { isHistorical: false, formattedDate: '' };
    
    try {
        const y = parseInt(dateStr.substring(0, 4), 10);
        const m = parseInt(dateStr.substring(4, 6), 10) - 1;
        const d = parseInt(dateStr.substring(6, 8), 10);
        
        const qDate = new Date(Date.UTC(y, m, d));
        const isHistorical = (Date.now() - qDate.getTime()) > 24 * 60 * 60 * 1000;
        
        return {
            isHistorical,
            formattedDate: `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}`
        };
    } catch {
        return { isHistorical: false, formattedDate: '' };
    }
}

async function fetchRosterInjuries(sport: string, league: string, teamId: string, teamAbbr: string) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/teams/${teamId}/roster`;
    const res = await fetchWithTimeout(url, 2500); // Strict secondary SLA
    if (!res) return null;

    try {
        const data = await res.json();
        const injured: Array<{ id: string; name: string; position: string; status: string }> = [];

        for (const group of data.athletes || []) {
            for (const athlete of group.items || []) {
                const statusStr = athlete.injuries?.[0]?.status || (athlete.status?.id !== '1' ? athlete.status?.name : '');
                
                if (statusStr && !statusStr.toLowerCase().includes('active')) {
                    injured.push({
                        id: athlete.id,
                        name: athlete.fullName,
                        position: athlete.position?.abbreviation || group.position || 'UNK',
                        status: statusStr
                    });
                }
            }
        }
        return injured.length > 0 ? { teamAbbreviation: teamAbbr, players: injured } : null;
    } catch (e) {
        return null; 
    }
}

function extractLeagueContext(standingsData: any, searchTeam: string) {
    if (!standingsData?.children) return undefined;
    
    const normalizedSearch = searchTeam.toLowerCase();
    let foundEntry: any = null;
    let groupName = '';

    for (const conf of standingsData.children) {
        if (conf.standings?.entries) {
            const match = conf.standings.entries.find((e: any) => 
                e.team?.abbreviation?.toLowerCase() === normalizedSearch || 
                e.team?.name?.toLowerCase().includes(normalizedSearch) ||
                e.team?.displayName?.toLowerCase().includes(normalizedSearch)
            );
            if (match) {
                foundEntry = match;
                groupName = conf.name;
                break;
            }
        }

        const searchGroups = conf.children ? [conf, ...conf.children] : [conf];
        
        for (const group of searchGroups) {
            const match = group.standings?.entries?.find((e: any) => 
                e.team?.abbreviation?.toLowerCase() === normalizedSearch || 
                e.team?.name?.toLowerCase().includes(normalizedSearch) ||
                e.team?.displayName?.toLowerCase().includes(normalizedSearch)
            );
            
            if (match) {
                foundEntry = match;
                groupName = group.name;
                break;
            }
        }
        if (foundEntry) break;
    }

    if (!foundEntry) return undefined;

    const getStat = (name: string, fallback = '-') => {
        const stat = foundEntry.stats?.find((s: any) => s.name === name);
        return stat ? stat.displayValue : fallback;
    };

    return {
        teamAbbreviation: foundEntry.team?.abbreviation,
        groupName: groupName,
        gamesBack: getStat('gamesBehind'),
        streak: getStat('streak'),
        winPercent: getStat('winPercent'),
        overallRecord: getStat('overall')
    };
}

// ============================================================================
// Core Execution Orchestrator
// ============================================================================
export async function handleSportsQuery(rawParams: any, db?: Firestore | any): Promise<AuraArtifact> {
    
    // 1. Zod Firewall Validation
    const validation = SportsQuerySchema.safeParse(rawParams);
    if (!validation.success) {
        console.warn(`${LOG_PREFIX} Grounding Fault:`, validation.error.format());
        return {
            id: `err_val_${Date.now()}`,
            type: 'SPORTS_ARTIFACT',
            resolution_state: 'GROUNDING_FAULT',
            context_summary: "Invalid query parameters. Please specify a valid league (e.g., NBA) and optionally a team or date."
        };
    }

    let { team, league, date } = validation.data;

    // Auto-resolve league from team if team is provided but league is missing
    if (!league && team) {
        league = resolveLeagueFromTeamName(team) || undefined;
    }

    // Default to 'mlb' if league cannot be resolved at all for the schedule
    if (!league) {
        league = 'mlb';
    }

    const safeLeague = league.toLowerCase();
    const sport = LEAGUE_SPORT_MAP[safeLeague] || 'basketball';
    const { isHistorical, formattedDate } = parseTemporalContext(date);

    // 2. Google Scale Hot/Cold Routing (Firestore / BigQuery)
    if (db && !isDbDisabled()) {
        try {
            const gamesCollection = isHistorical ? 'bq_historical_games' : 'sports_games_staging';
            const logsCollection = isHistorical ? 'bq_historical_logs' : 'sports_player_game_logs_staging';
            
            let gamesQ: any = query(collection(db, gamesCollection), where('league', '==', safeLeague));
            if (formattedDate) gamesQ = query(gamesQ, where('date', '==', formattedDate));
            
            const gamesSnap = await getDocs(gamesQ);
            
            if (!gamesSnap.empty) {
                const dbEvents = [];
                for (const gameDoc of gamesSnap.docs) {
                    const gameData = gameDoc.data() as any;
                    
                    // Client-Side Entity Filtering
                    if (team) {
                        const hAbbr = (gameData.home_team?.abbreviation || '').toLowerCase();
                        const aAbbr = (gameData.away_team?.abbreviation || '').toLowerCase();
                        const hName = (gameData.home_team?.name || '').toLowerCase();
                        const aName = (gameData.away_team?.name || '').toLowerCase();
                        if (!(hAbbr === team || aAbbr === team || hName.includes(team) || aName.includes(team))) continue;
                    }

                    // Parallel Hydrate Logs
                    const logsSnap = await getDocs(query(collection(db, logsCollection), where('game_id', '==', gameData.id)));
                    const playerStats = logsSnap.docs.map(doc => doc.data());

                    dbEvents.push({
                        game_id: gameData.id,
                        status: gameData.status,
                        short_status: gameData.short_status || gameData.status,
                        start_time: gameData.scheduled_at_utc || gameData.date,
                        venue: gameData.venue,
                        home_team: gameData.home_team,
                        away_team: gameData.away_team,
                        home_score: gameData.home_score,
                        away_score: gameData.away_score,
                        player_stats: playerStats
                    });
                }
                
                if (dbEvents.length > 0) {
                     console.log(`${LOG_PREFIX} Resolved ${dbEvents.length} events from ${gamesCollection}`);
                     return {
                         id: `evt_db_${Date.now()}`,
                         type: 'SPORTS_ARTIFACT',
                         resolution_state: isHistorical ? 'COLD_STORAGE_DATA' : 'HOT_MEMORY_DATA',
                         data: {
                             events: dbEvents,
                             source: isHistorical ? 'BigQuery Simulation' : 'Firestore Memory'
                         }
                     };
                }
            } else if (isHistorical) {
                 return {
                     id: `evt_none_${Date.now()}`,
                     type: 'SPORTS_ARTIFACT',
                     resolution_state: 'NO_GAMES_SCHEDULED',
                     context_summary: `No historical events located for ${safeLeague.toUpperCase()} on ${formattedDate}.`
                 };
            }
        } catch (dbErr) {
             reportDbError(dbErr, 'SportsOrchestrator');
             // Silently fall back to external API
        }
    }

    // 3. Upstream API Resolution (ESPN + Kalshi)
    try {
        const scoreboardUrl = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${safeLeague}/scoreboard${date ? `?dates=${date}` : ''}`;
        const standingsUrl = `https://site.api.espn.com/apis/v2/sports/${sport}/${safeLeague}/standings`;
        const kalshiUrl = 'https://api.elections.kalshi.com/trade-api/v2/markets?limit=150&mve_filter=exclude';

        // Parallel Bounded Network Execution
        const [sbRes, stRes, kRes] = await Promise.all([
            fetchWithTimeout(scoreboardUrl, 5000), // Primary SLA
            team ? fetchWithTimeout(standingsUrl, 3000) : Promise.resolve(null),
            fetchWithTimeout(kalshiUrl, 3000)
        ]);

        if (!sbRes) throw new Error("Primary upstream provider timed out or rejected connection.");

        const data = await sbRes.json();
        const standingsData = stRes ? await stRes.json().catch(() => null) : null;
        
        let rawKalshiMarkets: any[] = [];
        if (kRes) {
            const kalshiData = await kRes.json().catch(() => null);
            rawKalshiMarkets = kalshiData?.markets || [];
        }

        if (!data.events || data.events.length === 0) {
            return {
                id: `evt_none_${Date.now()}`,
                type: 'SPORTS_ARTIFACT',
                resolution_state: 'NO_GAMES_SCHEDULED',
                context_summary: `No ${safeLeague.toUpperCase()} events scheduled${date ? ` for ${formattedDate}` : " live"}.`
            };
        }

        // Entity Filtering
        let events = data.events;
        if (team) {
            events = events.filter((e: any) => 
                e.competitions?.[0]?.competitors?.some((c: any) => 
                    c.team?.abbreviation?.toLowerCase() === team || 
                    c.team?.name?.toLowerCase().includes(team) ||
                    c.team?.displayName?.toLowerCase().includes(team)
                )
            );
        }

        if (events.length === 0) {
             return {
                id: `evt_none_team_${Date.now()}`,
                type: 'SPORTS_ARTIFACT',
                resolution_state: 'NO_GAMES_SCHEDULED',
                context_summary: `No active events located for '${team}' in the ${safeLeague.toUpperCase()} circuit.`
            };
        }

        // 4. Payload Structuring & Integration
        const parsedEvents = (await Promise.all(events.map(async (game: any) => {
            const comp = game.competitions?.[0];
            if (!comp) return null;

            const homeComp = comp.competitors?.find((c: any) => c.homeAway === 'home');
            const awayComp = comp.competitors?.find((c: any) => c.homeAway === 'away');
            if (!homeComp || !awayComp) return null;

            const homeAbbr = resolveTeamAbbreviation(homeComp.team?.displayName || homeComp.team?.name, { league: safeLeague });
            const awayAbbr = resolveTeamAbbreviation(awayComp.team?.displayName || awayComp.team?.name, { league: safeLeague });
            if (!homeAbbr || !awayAbbr) return null;

            const isPreGame = comp.status?.type?.state === 'pre';
            const homeScoreRaw = parseInt(homeComp.score, 10);
            const awayScoreRaw = parseInt(awayComp.score, 10);

            // DraftKings
            const rawOddsArray = comp.odds || [];
            const rawDkOdds = rawOddsArray.find((o: any) => 
                o.provider?.name?.toLowerCase().includes('draftkings') || 
                o.provider?.name?.toLowerCase().includes('william')
            ) || rawOddsArray[0];

            const dkOdds = rawDkOdds ? normalizeDraftKingsOdds(game.id, homeAbbr, awayAbbr, rawDkOdds) : null;

            // Kalshi
            let kalshiOdds = null;
            if (rawKalshiMarkets.length > 0) {
                const searchTerms = [
                    homeComp.team?.name, awayComp.team?.name, 
                    homeComp.team?.displayName, awayComp.team?.displayName, 
                    homeAbbr, awayAbbr
                ].map(t => (t || '').toLowerCase());

                const matchedMarket = rawKalshiMarkets.find((m: any) => {
                    const searchStr = `${m.title || ''} ${m.yes_sub_title || ''} ${m.ticker || ''}`.toLowerCase();
                    // Basic heuristic: Ensure at least one team name/abbr is in the market string
                    return searchTerms.some(term => term && searchStr.includes(term));
                });

                if (matchedMarket) {
                    kalshiOdds = normalizeKalshiOdds(game.id, homeAbbr, awayAbbr, matchedMarket);
                }
            }

            // Fallback string odds for general payload
            const finalOdds: any[] = [];
            if (dkOdds) {
                finalOdds.push({
                    provider: dkOdds.moneylineHome?.provider || 'draftkings',
                    details: dkOdds.spreadHome?.line || dkOdds.spreadAway?.line,
                    overUnder: dkOdds.overUnder?.threshold,
                    moneyline: `ML Home (${homeAbbr}): ${dkOdds.moneylineHome?.line} / Away (${awayAbbr}): ${dkOdds.moneylineAway?.line}`
                });
            }
            if (kalshiOdds) {
                finalOdds.push({
                    provider: 'kalshi',
                    moneyline: `Implied Probability: ${kalshiOdds.moneylineHome?.priceCents}% (${homeAbbr}) / ${kalshiOdds.moneylineAway?.priceCents}% (${awayAbbr})`
                });
            }

            // SDUI Injection Array
            const sduiComponents: any[] = [{
                type: 'SmartScoreCard',
                props: {
                    gameId: game.id,
                    status: comp.status?.type?.shortDetail || comp.status?.type?.name,
                    startTime: game.date,
                    homeTeam: { name: homeComp.team?.name, abbreviation: homeAbbr, logo: homeComp.team?.logo, score: isPreGame || isNaN(homeScoreRaw) ? undefined : homeScoreRaw },
                    awayTeam: { name: awayComp.team?.name, abbreviation: awayAbbr, logo: awayComp.team?.logo, score: isPreGame || isNaN(awayScoreRaw) ? undefined : awayScoreRaw }
                }
            }];

            if (dkOdds?.moneylineHome) {
                sduiComponents.push({
                    type: 'OddsPill',
                    props: {
                        provider: 'DraftKings',
                        line: dkOdds.spreadHome?.line || 'ML Only',
                        value: dkOdds.moneylineHome?.line,
                        moneylineHome: dkOdds.moneylineHome?.line,
                        moneylineAway: dkOdds.moneylineAway?.line
                    }
                });
            }

            if (kalshiOdds) {
                sduiComponents.push({
                    type: 'OddsPill',
                    props: {
                        provider: 'Kalshi',
                        line: 'Probability',
                        value: `${kalshiOdds.moneylineHome?.priceCents}%`,
                        moneylineHome: kalshiOdds.moneylineHome?.americanOdds,
                        moneylineAway: kalshiOdds.moneylineAway?.americanOdds
                    }
                });
            }

            const eventData: any = {
                game_id: game.id,
                status: comp.status?.type?.name,
                short_status: comp.status?.type?.shortDetail,
                series_summary: comp.series?.summary || game.series?.summary || '',
                game_notes: comp.notes?.[0]?.headline || '',
                start_time: game.date,
                venue: comp.venue?.fullName,
                home_team: { id: homeComp.team?.id, name: homeComp.team?.name, abbreviation: homeAbbr, logo: homeComp.team?.logo, score: isPreGame || isNaN(homeScoreRaw) ? undefined : homeScoreRaw },
                away_team: { id: awayComp.team?.id, name: awayComp.team?.name, abbreviation: awayAbbr, logo: awayComp.team?.logo, score: isPreGame || isNaN(awayScoreRaw) ? undefined : awayScoreRaw },
                odds: finalOdds.length > 0 ? finalOdds : undefined,
                sdui_components: sduiComponents
            };

            // N+1 Rate Limit Protection: Only fetch injuries if the user filtered a specific team
            if (isPreGame && team) {
                const [hInj, aInj] = await Promise.all([
                    fetchRosterInjuries(sport, safeLeague, homeComp.team?.id, homeAbbr),
                    fetchRosterInjuries(sport, safeLeague, awayComp.team?.id, awayAbbr)
                ]);
                const injuries = [hInj, aInj].filter(Boolean);
                if (injuries.length > 0) eventData.injuries = injuries;
            }

            return eventData;
        }))).filter(Boolean);

        return {
            id: `evt_${Date.now()}`,
            type: 'SPORTS_ARTIFACT',
            resolution_state: 'LIVE_DATA',
            data: {
                events: parsedEvents,
                league_context: team && standingsData ? extractLeagueContext(standingsData, team) : undefined,
                sdui_render: {
                    components: parsedEvents.flatMap((e: any) => e.sdui_components || [])
                }
            }
        };

    } catch (e: any) {
        console.error(`${LOG_PREFIX} Orchestration Fault:`, e);
        return {
            id: `err_${Date.now()}`,
            type: 'SPORTS_ARTIFACT',
            resolution_state: 'GROUNDING_FAULT',
            context_summary: "A connection timeout or protocol error occurred while querying the upstream sports telemetry source."
        };
    }
}
