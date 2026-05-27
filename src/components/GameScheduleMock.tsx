import React, { useState, useEffect, useRef, useCallback } from 'react'; // Updated React import
import { Clock, PlayCircle, AlertCircle } from 'lucide-react'; // Updated Lucide import
import { motion, AnimatePresence } from 'framer-motion'; // Using framer-motion for consistency
import { SofaScoreMatchupCard } from './SofaScoreMatchupCard';

// ============================================================================
// Types
// ============================================================================
export interface LiveGame {
  id: string;
  league: string;
  homeTeam: string;
  homeAbbr: string;
  homeLogo?: string;
  homeScore?: number;
  awayTeam: string;
  awayAbbr: string;
  awayLogo?: string;
  awayScore?: number;
  time: string;
  network?: string;
  odds?: string;
  status: 'SCHEDULED' | 'LIVE' | 'FINAL';
  clockOrInning?: string;
  timestamp: number;
}

const SPRING_TRANSITION = { type: "spring" as const, stiffness: 400, damping: 30 };
const EASE_TRANSITION = [0.16, 1, 0.3, 1];

// ============================================================================
// Safe Image Handler (Hydration Safe & Headshot/Flag Compatible) - REFINED
// ============================================================================
const TeamLogo = React.memo(({ src, alt }: { src?: string; alt: string }) => {
    const [hasError, setHasError] = useState(false);

    if (hasError || !src) {
        return (
            <div className="w-9 h-9 rounded-full bg-neutral-800 border border-white/[0.04] flex items-center justify-center shrink-0 shadow-inner">
                <span className="text-[10px] font-mono text-neutral-500 tracking-widest font-bold">
                    {alt.substring(0, 3).toUpperCase()}
                </span>
            </div>
        );
    }

    return (
        <div className="w-10 h-10 flex items-center justify-center bg-white/[0.02] rounded-full p-2 border border-white/[0.04] shrink-0 overflow-hidden shadow-sm transition-all duration-300 group-hover:bg-white/[0.04]">
            <img 
                src={src} 
                alt={alt} 
                className="w-full h-full object-contain opacity-80 drop-shadow-sm grayscale-[0.2] transition-all duration-500 ease-out group-hover:grayscale-0 group-hover:opacity-100 group-hover:scale-110"
                onError={() => setHasError(true)}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
            />
        </div>
    );
});
TeamLogo.displayName = 'TeamLogo';

// ============================================================================
// Skeleton Loader (Zero CLS) - REFINED
// ============================================================================
const ScheduleSkeleton = () => (
    <div className="w-full bg-neutral-900 border border-white/[0.04] rounded-[24px] p-6 animate-pulse shadow-sm">
        <div className="flex justify-between items-center mb-6">
            <div className="h-3 w-16 bg-white/[0.04] rounded-[4px]" />
            <div className="h-3 w-10 bg-white/[0.04] rounded-[4px]" />
        </div>
        <div className="space-y-4 mb-6">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-white/[0.04]" />
                    <div className="h-4 w-20 bg-white/[0.04] rounded-[6px]" />
                </div>
                <div className="h-5 w-8 bg-white/[0.04] rounded-[6px]" />
            </div>
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-white/[0.04]" />
                    <div className="h-4 w-20 bg-white/[0.04] rounded-[6px]" />
                </div>
                <div className="h-5 w-8 bg-white/[0.04] rounded-[6px]" />
            </div>
        </div>
        <div className="pt-4 border-t border-white/[0.02] flex justify-between">
            <div className="h-3 w-16 bg-white/[0.04] rounded-[4px]" />
            <div className="h-4 w-20 bg-white/[0.04] rounded-[6px]" />
        </div>
    </div>
);

// ============================================================================
// Primary Component (SportsCalendar) - PRODUCTION-GRADE
// Renamed to SportsCalendar for consistency with App.tsx imports
// ============================================================================
export function SportsCalendar({ games: propGames, leagueContext }: { games?: LiveGame[]; leagueContext?: string; }) {
  const [games, setGames] = useState<LiveGame[]>(propGames || []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false); // Safeguard against Timezone Hydration mismatch

  // Hydration check for client-side rendering of localized dates
  useEffect(() => {
    setHasHydrated(true);
  }, []);

  // Sync propGames with internal state, and set loading to false if propGames provided
  useEffect(() => {
    if (propGames && propGames.length > 0) {
      setGames(propGames);
      setLoading(false);
      setError(null); 
    } else if (propGames && propGames.length === 0) {
        setGames([]);
        setLoading(false);
        setError("No events found for this selection.");
    }
  }, [propGames]);

  // Autonomous Multi-League Live Data Fetcher (Enhanced for Production)
  const fetchSchedule = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
        const endpoints = [ // Fetch directly from ESPN
            { url: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?limit=50', league: 'NBA' },
            { url: 'https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard?limit=50', league: 'WNBA' },
            { url: 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?limit=50', league: 'NHL' },
            { url: 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?limit=50', league: 'MLB' },
            { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?limit=50', league: 'EPL' },
            { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard?limit=50', league: 'LALIGA' },
            { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard?limit=50', league: 'SERIE A' },
            { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/scoreboard?limit=50', league: 'BUNDESLIGA' },
            { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/scoreboard?limit=50', league: 'LIGUE 1' },
            { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/mex.1/scoreboard?limit=50', league: 'LIGA MX' },
            { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/scoreboard?limit=50', league: 'MLS' },
            { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard?limit=50', league: 'UCL' },
            { url: 'https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard?limit=150', league: 'ATP' },
            { url: 'https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard?limit=150', league: 'WTA' }
        ];

        // Filter endpoints by leagueContext if provided
        const filteredEndpoints = leagueContext ? endpoints.filter(ep => ep.league.toLowerCase() === leagueContext.toLowerCase()) : endpoints;

        const results = await Promise.allSettled(
            filteredEndpoints.map(ep => 
                fetch(ep.url, { signal }) // Pass abort signal to fetch
                .then(r => {
                    if (!r.ok) throw new Error(`HTTP ${r.status} for ${ep.league}`);
                    return r.json();
                })
                .then(d => ({ ...d, _league: ep.league }))
            )
        );

        let parsedGames: LiveGame[] = [];

        for (const result of results) {
                if (result.status === 'fulfilled' && result.value?.events) {
                    const leagueData = result.value;
                    const events = leagueData.events;

                    events.forEach((event: any) => {
                        try {
                            const comp = event.competitions?.[0];
                            if (!comp) return;

                            const homeRaw = comp.competitors?.find((c: any) => c.homeAway === 'home') || comp.competitors?.[0];
                            const awayRaw = comp.competitors?.find((c: any) => c.homeAway === 'away') || comp.competitors?.[1];
                            if (!homeRaw || !awayRaw) return;

                            const homeEntity = homeRaw.team || homeRaw.athlete || homeRaw.player || homeRaw;
                            const awayEntity = awayRaw.team || awayRaw.athlete || awayRaw.player || awayRaw;

                            const state = comp.status?.type?.state;
                            let status: LiveGame['status'] = 'SCHEDULED';
                            if (state === 'in') status = 'LIVE';
                            if (state === 'post') status = 'FINAL';

                            let timeStr = comp.status?.type?.shortDetail || 'TBD';
                            if (status === 'SCHEDULED' && event.date) {
                                const dateObj = new Date(event.date);
                                timeStr = hasHydrated // Only localize date client-side
                                    ? (!isNaN(dateObj.getTime()) ? dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : timeStr)
                                    : timeStr; // Server-side render raw string
                            }

                            let oddsStr = comp.odds?.[0]?.details;
                            if (oddsStr?.toLowerCase() === 'even') oddsStr = 'PK';

                            const homeName = homeEntity.displayName || homeEntity.name || homeEntity.fullName || 'Home';
                            const awayName = awayEntity.displayName || awayEntity.name || awayEntity.fullName || 'Away';

                            const getAbbr = (entity: any, name: string, fallback: string) => {
                                if (entity.abbreviation) return entity.abbreviation;
                                if (entity.shortName) return entity.shortName;
                                if (leagueData._league === 'ATP' || leagueData._league === 'WTA') {
                                    const parts = name.trim().split(' ');
                                    return parts[parts.length - 1].substring(0, 3).toUpperCase();
                                }
                                return fallback;
                            };

                            const extractLogo = (entity: any, raw: any) => {
                                return entity.headshot?.href || 
                                       entity.headshot || 
                                       entity.logo || 
                                       entity.logos?.[0]?.href || 
                                       entity.flag?.href || 
                                       raw.athlete?.flag?.href || 
                                       undefined;
                            };

                            // FIX: Tennis set-score aggregation safeguard
                            const isTennis = leagueData._league === 'ATP' || leagueData._league === 'WTA';
                            const homeScoreVal = isTennis ? homeRaw.score : (homeRaw.score !== undefined ? homeRaw.score : (homeRaw.linescores && homeRaw.linescores.length > 0) ? homeRaw.linescores.map((ls:any)=>ls.value).join('-') : undefined);
                            const awayScoreVal = isTennis ? awayRaw.score : (awayRaw.score !== undefined ? awayRaw.score : (awayRaw.linescores && awayRaw.linescores.length > 0) ? awayRaw.linescores.map((ls:any)=>ls.value).join('-') : undefined);
                            
                            const pHomeScore = parseInt(homeScoreVal, 10);
                            const pAwayScore = parseInt(awayScoreVal, 10);

                            parsedGames.push({
                                id: event.id,
                                league: leagueData._league,
                                homeTeam: homeName,
                                homeAbbr: getAbbr(homeEntity, homeName, 'HM'),
                                homeLogo: extractLogo(homeEntity, homeRaw),
                                homeScore: status !== 'SCHEDULED' && !isNaN(pHomeScore) ? pHomeScore : undefined,
                                awayTeam: awayName,
                                awayAbbr: getAbbr(awayEntity, awayName, 'AW'),
                                awayLogo: extractLogo(awayEntity, awayRaw),
                                awayScore: status !== 'SCHEDULED' && !isNaN(pAwayScore) ? pAwayScore : undefined,
                                time: timeStr,
                                network: comp.broadcasts?.[0]?.names?.[0],
                                odds: oddsStr,
                                status,
                                clockOrInning: comp.status?.type?.shortDetail,
                                timestamp: new Date(event.date).getTime()
                            });
                        } catch (parseErr) {
                            console.warn(`[AURA:SCHEDULE] Suppressed parse error for event ${event?.id}:`, parseErr);
                        }
                    });
                }
            }

        // Institutional Sorting: LIVE -> SCHEDULED -> FINAL
        parsedGames.sort((a, b) => {
            const rank = { 'LIVE': 1, 'SCHEDULED': 2, 'FINAL': 3 };
            if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
            if (a.status === 'FINAL') return b.timestamp - a.timestamp; // Most recently finished first
            return a.timestamp - b.timestamp; // Chronological order
        });

        setGames(parsedGames);
        setLoading(false);
    } catch (e: any) {
        if (e.name !== 'AbortError') console.error('[AURA:SCHEDULE] Sync Failure:', e.message);
        setError(e.message || "Failed to fetch schedule.");
        setLoading(false);
    }
  }, [leagueContext, hasHydrated]); // Added hasHydrated to dependencies to trigger re-fetch on client-side hydrate

  // Initial fetch and auto-refresh
  useEffect(() => {
    const controller = new AbortController();
    fetchSchedule(controller.signal); // Pass initial abort signal

    const intervalId = setInterval(() => fetchSchedule(controller.signal), 30000); // Refresh every 30 seconds
    
    return () => {
        controller.abort(); // Instantly cancel all pending network sockets on unmount
        clearInterval(intervalId);
    };
  }, [fetchSchedule]);

  const groupedGames = React.useMemo(() => {
    return games.reduce((acc, game) => {
        const l = game.league || 'OTHER';
        if (!acc[l]) acc[l] = [];
        acc[l].push(game);
        return acc;
    }, {} as Record<string, LiveGame[]>);
  }, [games]);

  if (!hasHydrated) { // Render skeleton until hydration is complete
      return (
          <div className="w-[100vw] max-w-[1600px] left-1/2 -translate-x-1/2 px-4 sm:px-8 my-8 font-sans overflow-hidden relative group/schedule">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 w-full">
                  <ScheduleSkeleton />
                  <ScheduleSkeleton />
                  <ScheduleSkeleton />
                  <ScheduleSkeleton />
              </div>
          </div>
      );
  }

  if (!loading && games.length === 0 && !error) return null; // Collapse if slate is entirely empty and no error

  return (
    <div className="w-[100vw] max-w-[1600px] left-1/2 -translate-x-1/2 px-4 sm:px-8 my-8 font-sans overflow-hidden relative group/schedule">
      
      <div className="w-full relative">
          <AnimatePresence mode="wait">
              {loading ? (
                  <motion.div key="loading-skeletons" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 w-full pb-8 pt-2">
                      <ScheduleSkeleton key="sk1" />
                      <ScheduleSkeleton key="sk2" />
                      <ScheduleSkeleton key="sk3" />
                  </motion.div>
              ) : error ? (
                  <motion.div 
                    key="error-state"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="w-full bg-neutral-900 border border-rose-500/30 rounded-[24px] p-8 text-center shadow-sm flex flex-col items-center justify-center min-h-[200px]"
                  >
                      <AlertCircle className="w-8 h-8 text-rose-500 mb-3" />
                      <h3 className="text-[12px] font-mono font-bold tracking-widest text-rose-500 uppercase mb-2">Schedule Unavailable</h3>
                      <p className="text-[14px] text-neutral-400 font-sans">{error}</p>
                      <button 
                          onClick={() => fetchSchedule()} 
                          className="mt-6 px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-[12px] font-bold uppercase tracking-widest rounded-full transition-colors active:scale-95 focus-visible:ring-2 focus-visible:ring-blue-400/40"
                      >
                          Retry
                      </button>
                  </motion.div>
              ) : (
                  <motion.div key="games-grid" className="flex flex-col gap-12 w-full">
                      {Object.entries(groupedGames).map(([league, leagueGames]) => (
                          <div key={league} className="w-full flex flex-col">
                              <h3 className="text-[11px] font-medium text-white/50 uppercase tracking-[0.2em] font-mono mb-6 text-left px-1 flex items-center">
                                  {league}
                              </h3>
                              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 w-full">
                                  {leagueGames.map((game, idx) => {
                                      return (
                                          <motion.div 
                                              key={`${game.id}-${game.status}`} 
                                              initial={{ opacity: 0, y: 20 }}
                                              animate={{ opacity: 1, y: 0 }}
                                              transition={{ duration: 0.5, delay: Math.min(idx * 0.05, 0.4), ease: [0.16, 1, 0.3, 1] }}
                                              className="w-full flex"
                                          >
                                              <SofaScoreMatchupCard 
                                                  data={{
                                                      gameId: game.id,
                                                      gameState: game.status === 'LIVE' ? (game.clockOrInning || 'LIVE') : (game.status === 'FINAL' ? 'FINAL' : (game.time || 'SCHEDULED')),
                                                      homeTeamBox: {
                                                          team: { id: game.homeAbbr, abbreviation: game.homeAbbr, displayName: game.homeTeam, logo: game.homeLogo || '' },
                                                          runs: game.homeScore ?? 0,
                                                          hits: 0,
                                                          errors: 0
                                                      },
                                                      awayTeamBox: {
                                                          team: { id: game.awayAbbr, abbreviation: game.awayAbbr, displayName: game.awayTeam, logo: game.awayLogo || '' },
                                                          runs: game.awayScore ?? 0,
                                                          hits: 0,
                                                          errors: 0
                                                      },
                                                      momentumHistory: [],
                                                  }}
                                              />
                                          </motion.div>
                                      );
                                  })}
                              </div>
                          </div>
                      ))}
                  </motion.div>
              )}
          </AnimatePresence>
      </div>
    </div>
  );
}

export { SportsCalendar as GameScheduleMock };