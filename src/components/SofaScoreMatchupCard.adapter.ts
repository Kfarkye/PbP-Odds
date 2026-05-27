import {
    ReadonlySofaScoreLiveState,
    ReadonlyGameState,
    ReadonlyTeamIdentity,
    ReadonlyAthlete
} from './SofaScoreMatchupCard.types';

type NormalizedSportType = ReadonlySofaScoreLiveState['sportType'];

function isRecord(val: unknown): val is Record<string, unknown> {
    return typeof val === 'object' && val !== null;
}

function normalizeGameState(rawStatus?: string): ReadonlyGameState {
    if (!rawStatus) return 'unknown';
    const status = rawStatus.toLowerCase().trim();
    
    if (['in progress', 'live', 'playing', 'action', 'top', 'bot', 'bottom', 'mid'].some(s => status.includes(s))) return 'live';
    if (['final', 'ended', 'ft', 'f'].includes(status)) return 'final';
    if (['halftime', 'half', 'ht', 'intermission', 'end period'].some(s => status.includes(s))) return 'intermission';
    if (['scheduled', 'upcoming'].includes(status)) return 'scheduled';
    if (status.includes('delay')) return 'delayed';
    if (status.includes('postpone') || status === 'ppd') return 'postponed';
    if (status.includes('cancel')) return 'cancelled';
    if (status.includes('warmup') || status.includes('pre')) return 'pregame';
    
    return 'unknown';
}

function determineSportType(league?: string): NormalizedSportType {
    if (!league) return 'generic';
    const l = league.toUpperCase();
    
    if (['MLB', 'NPB', 'KBO', 'NCAA_BASEBALL'].includes(l)) return 'baseball';
    if (['NBA', 'WNBA', 'NCAAM', 'NCAAW', 'EPL', 'MLS', 'NHL', 'NFL'].includes(l)) return 'clock';
    
    return 'generic';
}

function parseScore(scoreVal: unknown): number | null {
    if (scoreVal === undefined || scoreVal === null || scoreVal === '') return null;
    const parsed = Number(scoreVal);
    return Number.isFinite(parsed) ? parsed : null;
}

function parseNumber(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePeriodOrdinal(period: unknown): number | null {
    if (period === undefined || period === null) return null;
    const label = String(period).toLowerCase().trim();
    if (label.includes('shootout') || label === 'so' || label.includes('pen')) return null;
    
    const match = label.match(/\d+/);
    if (match) return Number(match[0]);
    if (label === 'ot' || label.includes('overtime')) return 5;
    
    return null;
}

function safeMapAthlete(rawAthlete: unknown, fallbackId: string, fallbackName: string): ReadonlyAthlete {
    const athlete = isRecord(rawAthlete) ? rawAthlete : {};
    return {
        id: athlete.id ? String(athlete.id) : fallbackId,
        displayName: typeof athlete.displayName === 'string' 
            ? athlete.displayName 
            : (typeof athlete.name === 'string' ? athlete.name : fallbackName),
        summary: typeof athlete.summary === 'string' ? athlete.summary : null,
        jersey: athlete.jersey !== undefined && athlete.jersey !== null ? String(athlete.jersey) : null
    };
}

function safeMapTeam(rawTeam: unknown, fallbackAbbrev: string): ReadonlyTeamIdentity {
    const team = isRecord(rawTeam) ? rawTeam : {};
    return {
        id: team.id ? String(team.id) : `team-${fallbackAbbrev}`,
        abbreviation: typeof team.abbreviation === 'string' ? team.abbreviation : fallbackAbbrev,
        displayName: typeof team.displayName === 'string' 
            ? team.displayName 
            : (typeof team.name === 'string' ? team.name : `Unknown ${fallbackAbbrev} Team`),
        logo: typeof team.logo === 'string' ? team.logo : null
    };
}

export function normalizeMatchData(rawGame: unknown): ReadonlySofaScoreLiveState {
    const game = isRecord(rawGame) ? rawGame : {};
    
    const league = typeof game.league === 'string' ? game.league : undefined;
    const status = typeof game.status === 'string' ? game.status : undefined;

    const sportType = determineSportType(league);
    const gameState = normalizeGameState(status);
    
    // Support multi-vendor status text definitions
    const statusText = typeof game.statusText === 'string' 
        ? game.statusText 
        : isRecord(game.status) && typeof game.status.description === 'string'
            ? game.status.description
            : status 
                ? String(status) 
                : null;
    
    const awayTeamIdentity = safeMapTeam(game.awayTeam, 'AWAY');
    const homeTeamIdentity = safeMapTeam(game.homeTeam, 'HOME');

    const gameId = game.id 
        ? String(game.id) 
        : `${league ?? 'unknown'}-${awayTeamIdentity.abbreviation}-${homeTeamIdentity.abbreviation}`;
    
    const momentumHistory = Array.isArray(game.momentum) 
        ? game.momentum.map(Number).filter(Number.isFinite) 
        : [];

    const resolvePossession = (possessionField: unknown): 'home' | 'away' | 'neutral' => {
        if (!possessionField) return 'neutral';
        const p = String(possessionField).toLowerCase().trim();
        if (
            p === 'home' ||
            p === homeTeamIdentity.id.toLowerCase() ||
            p === homeTeamIdentity.abbreviation.toLowerCase()
        ) {
            return 'home';
        }
        if (
            p === 'away' ||
            p === awayTeamIdentity.id.toLowerCase() ||
            p === awayTeamIdentity.abbreviation.toLowerCase()
        ) {
            return 'away';
        }
        return 'neutral';
    };

    const awayTeamObj = isRecord(game.awayTeam) ? game.awayTeam : {};
    const homeTeamObj = isRecord(game.homeTeam) ? game.homeTeam : {};
    const situationObj = isRecord(game.situation) ? game.situation : {};

    switch (sportType) {
        case 'baseball': {
            const rawStatus = status ? status.toLowerCase() : '';
            return {
                sportType: 'baseball',
                gameId,
                gameState,
                statusText,
                momentumHistory,
                awayTeamBox: {
                    team: awayTeamIdentity,
                    runs: parseScore(awayTeamObj.runs ?? awayTeamObj.score) ?? 0,
                    hits: parseNumber(awayTeamObj.hits, 0),
                    errors: parseNumber(awayTeamObj.errors, 0)
                },
                homeTeamBox: {
                    team: homeTeamIdentity,
                    runs: parseScore(homeTeamObj.runs ?? homeTeamObj.score) ?? 0,
                    hits: parseNumber(homeTeamObj.hits, 0),
                    errors: parseNumber(homeTeamObj.errors, 0)
                },
                situation: {
                    inning: situationObj.inning !== undefined && situationObj.inning !== null 
                        ? parseNumber(situationObj.inning, 1) 
                        : null,
                    isTopInning: rawStatus.includes('top')
                        ? true
                        : rawStatus.includes('bot') || rawStatus.includes('bottom')
                            ? false
                            : typeof situationObj.isTopInning === 'boolean'
                                ? situationObj.isTopInning
                                : null,
                    outs: parseNumber(situationObj.outs, 0),
                    balls: parseNumber(situationObj.balls, 0),
                    strikes: parseNumber(situationObj.strikes, 0),
                    onFirst: Boolean(situationObj.onFirst),
                    onSecond: Boolean(situationObj.onSecond),
                    onThird: Boolean(situationObj.onThird),
                    batter: situationObj.batter
                        ? safeMapAthlete(situationObj.batter, 'batter-unknown', 'Unknown Batter')
                        : null,
                    pitcher: situationObj.pitcher
                        ? safeMapAthlete(situationObj.pitcher, 'pitcher-unknown', 'Unknown Pitcher')
                        : null
                }
            };
        }
        case 'clock': {
            const periodLabel = situationObj.periodLabel !== undefined && situationObj.periodLabel !== null
                ? String(situationObj.periodLabel)
                : situationObj.period !== undefined && situationObj.period !== null
                    ? String(situationObj.period)
                    : 'Pregame';

            const periodOrdinal = situationObj.periodOrdinal !== undefined && situationObj.periodOrdinal !== null
                ? Number(situationObj.periodOrdinal)
                : parsePeriodOrdinal(periodLabel);

            return {
                sportType: 'clock',
                gameId,
                gameState,
                statusText,
                momentumHistory,
                awayTeamBox: {
                    team: awayTeamIdentity,
                    score: parseScore(awayTeamObj.score) ?? 0
                },
                homeTeamBox: {
                    team: homeTeamIdentity,
                    score: parseScore(homeTeamObj.score) ?? 0
                },
                situation: {
                    periodLabel,
                    periodOrdinal,
                    clock: situationObj.clock !== undefined && situationObj.clock !== null 
                        ? String(situationObj.clock) 
                        : null,
                    possession: resolvePossession(situationObj.possession ?? situationObj.activePossession),
                    primaryAthlete: situationObj.activePlayer
                        ? safeMapAthlete(situationObj.activePlayer, 'player-unknown', 'Unknown Player')
                        : null
                }
            };
        }
        case 'generic':
        default:
            return {
                sportType: 'generic',
                gameId,
                gameState,
                statusText,
                momentumHistory,
                awayTeamBox: {
                    team: awayTeamIdentity,
                    score: parseScore(awayTeamObj.score) ?? 0
                },
                homeTeamBox: {
                    team: homeTeamIdentity,
                    score: parseScore(homeTeamObj.score) ?? 0
                }
            };
    }
}
