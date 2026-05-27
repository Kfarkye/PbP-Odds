import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { CalendarDays, Trophy, TrendingUp, AlertTriangle, Clock } from 'lucide-react';
import { SportsData, LeagueContext } from '../types/aura';

// ============================================================================
// Safe Image Handler (Hydration Safe)
// ============================================================================
const TeamLogo = React.memo(({ src, alt }: { src?: string; alt: string }) => {
    const [hasError, setHasError] = useState(false);

    if (hasError || !src) {
        return (
            <div className="w-8 h-8 rounded-full bg-white/[0.03] border border-white/[0.04] flex items-center justify-center shrink-0 select-none">
                <span className="text-[9px] font-mono text-neutral-500 tracking-widest uppercase">{alt.substring(0, 3)}</span>
            </div>
        );
    }

    return (
        <div className="w-8 h-8 flex items-center justify-center bg-white/[0.01] rounded-full p-1 border border-white/[0.04] shrink-0 overflow-hidden shadow-inner group-hover:border-white/[0.04] transition-colors duration-300">
            <img 
                src={src} 
                alt={alt} 
                className="w-full h-full object-contain opacity-90 grayscale-[0.2] transition-all duration-500 ease-[0.16,1,0.3,1] group-hover:grayscale-0 group-hover:opacity-100 group-hover:scale-105"
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
// Internal Utility: Odds Display Row
// ============================================================================
const OddsDataBlock = React.memo(({ odds }: { odds: any[] }) => {
    if (!odds || odds.length === 0) return null;
    
    return (
        <div className="pt-5 mt-2 border-t border-white/[0.04] flex flex-col gap-3 select-none">
            <span className="text-[9px] font-mono text-neutral-600 uppercase tracking-widest">
                Market Consensus
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {odds.map((odd, idx) => (
                    <div key={idx} className="bg-[#0A0A0A] border border-white/[0.04] rounded-lg p-3 flex flex-col gap-1.5 transition-colors hover:border-white/[0.04]">
                        <span className="text-[10px] font-mono text-neutral-500 tracking-widest uppercase">
                            {odd.provider}
                        </span>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-mono tabular-nums lining-nums">
                            {odd.details && (
                                <span className="text-white/90">
                                    <span className="text-neutral-600 mr-1.5 text-[10px]">SPR</span>{odd.details}
                                </span>
                            )}
                            {odd.overUnder && (
                                <span className="text-white/90">
                                    <span className="text-neutral-600 mr-1.5 text-[10px]">O/U</span>{odd.overUnder}
                                </span>
                            )}
                            {odd.moneyline && (
                                <span className="text-[#34C759] font-medium truncate max-w-full">
                                    <span className="text-neutral-600 mr-1.5 text-[10px]">ML</span>{odd.moneyline.replace(/Implied Probability:\s*/i, '')}
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
});
OddsDataBlock.displayName = 'OddsDataBlock';

// ============================================================================
// Primary Component
// ============================================================================
interface SportsCalendarProps {
  games: SportsData[];
  leagueContext?: LeagueContext;
}

export function SportsCalendar({ games, leagueContext }: SportsCalendarProps) {
  
  // Deterministic Grouping
  const groupedGames = useMemo(() => {
    const getDayStr = (d: Date) => {
        if (isNaN(d.getTime())) return 'Upcoming Events';
        return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    };

    const grouped = games.reduce((acc, game) => {
      const gameDate = new Date(game.start_time);
      const dayStr = getDayStr(gameDate);
      if (!acc[dayStr]) acc[dayStr] = [];
      acc[dayStr].push(game);
      return acc;
    }, {} as Record<string, SportsData[]>);
    
    Object.keys(grouped).forEach(key => {
        grouped[key].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    });

    return grouped;
  }, [games]);

  if (!games || games.length === 0) return null;

  return (
    <div className="flex flex-col gap-8 w-full animate-in fade-in duration-700 ease-[0.16,1,0.3,1] font-sans text-left mb-8">
      
      {/* 1. Contextual League Metrics (Playoff Implications) */}
      {leagueContext && (
         <div className="bg-[#0A0A0A] border border-white/[0.04] rounded-[16px] overflow-hidden select-none">
              <div className="px-5 py-3 border-b border-white/[0.04] bg-white/[0.02] flex items-center gap-2">
                  <Trophy className="w-3.5 h-3.5 text-neutral-500" strokeWidth={2} />
                  <h4 className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">
                      Positional Context
                  </h4>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/[0.04]">
                  <div className="bg-[#050505] p-5 flex flex-col gap-1.5">
                      <span className="text-[9px] font-mono uppercase tracking-widest text-neutral-600">Standing</span>
                      <span className="text-[16px] font-medium text-white/95 tracking-tight truncate">
                          {leagueContext.teamAbbreviation} <span className="text-[12px] text-neutral-500 ml-1">{leagueContext.groupName}</span>
                      </span>
                  </div>
                  <div className="bg-[#050505] p-5 flex flex-col gap-1.5">
                      <span className="text-[9px] font-mono uppercase tracking-widest text-neutral-600">Games Back</span>
                      <span className="text-[16px] font-mono text-white/90 tabular-nums">
                          {leagueContext.gamesBack || '-'}
                      </span>
                  </div>
                  <div className="bg-[#050505] p-5 flex flex-col gap-1.5">
                      <span className="text-[9px] font-mono uppercase tracking-widest text-neutral-600">Record</span>
                      <span className="text-[16px] font-mono text-white/90 tabular-nums">
                          {leagueContext.overallRecord || '-'} <span className="text-[12px] text-neutral-500 ml-1">({leagueContext.winPercent})</span>
                      </span>
                  </div>
                  <div className="bg-[#050505] p-5 flex flex-col gap-1.5">
                      <span className="text-[9px] font-mono uppercase tracking-widest text-neutral-600">Current Streak</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                          <TrendingUp className={`w-3.5 h-3.5 ${(leagueContext.streak || '').includes('W') ? 'text-[#34C759]' : 'text-[#FF3B30]'}`} strokeWidth={2} />
                          <span className={`text-[16px] font-mono tabular-nums ${(leagueContext.streak || '').includes('W') ? 'text-[#34C759]' : 'text-[#FF3B30]'}`}>
                              {leagueContext.streak || '-'}
                          </span>
                      </div>
                  </div>
              </div>
         </div>
      )}

      {/* 2. Chronological Game Ledger */}
      {Object.entries(groupedGames).map(([dateLabel, dayGames]) => (
        <div key={dateLabel} className="flex flex-col">
          
          {/* Date Divider */}
          <div className="flex items-center justify-between border-b border-white/[0.04] pb-3 mb-5 px-1 select-none">
            <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-neutral-500" strokeWidth={1.5} />
                <h4 className="text-[13px] font-medium text-neutral-300 tracking-wide">{dateLabel}</h4>
            </div>
            <span className="text-[10px] font-mono text-neutral-600 uppercase tracking-widest tabular-nums font-bold">
                {dayGames.length} Event{dayGames.length !== 1 ? 's' : ''}
            </span>
          </div>
          
          <div className="flex flex-col gap-4">
            {dayGames.map((game: any, idx: number) => {
               const gameDate = new Date(game.start_time);
               const timeString = isNaN(gameDate.getTime()) ? 'TBD' : gameDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
               
               const rawStatus = (game.status || '').toUpperCase();
               const isFinal = rawStatus.includes('FINAL') || rawStatus.includes('POST') || rawStatus === 'STATUS_FINAL' || rawStatus.includes('FT') || rawStatus.includes('COMPLETED');
               const isLive = rawStatus.includes('IN_PROGRESS') || rawStatus.includes('IN') || rawStatus.includes('HALF') || rawStatus === 'STATUS_IN_PROGRESS' || rawStatus.includes('LIVE');
               
               const awayScore = game.away_team.score;
               const homeScore = game.home_team.score;
               
               const hasScores = typeof awayScore === 'number' && typeof homeScore === 'number';
               const awayWon = hasScores && isFinal && awayScore > homeScore;
               const homeWon = hasScores && isFinal && homeScore > awayScore;
               
               return (
                 <motion.article 
                    key={game.game_id || idx} 
                    whileTap={{ scale: 0.99 }}
                    className="bg-white/[0.015] border border-white/[0.04] rounded-[16px] p-5 hover:bg-white/[0.03] transition-all duration-300 cursor-default group flex flex-col gap-5 select-none outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                 >
                    {/* Header Row: Notes & Status */}
                    <div className="flex items-start justify-between w-full">
                        <div className="flex flex-col gap-1">
                            {/* Injected Series/Game Notes */}
                            {(game.series_summary || game.game_notes) && (
                                <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest font-bold">
                                    {game.game_notes || game.series_summary}
                                </span>
                            )}
                        </div>
                        
                        <div className="flex flex-col items-end gap-1">
                            {isLive ? (
                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[#34C759]/10 border border-[#34C759]/20 rounded-[4px]">
                                    <div className="w-1.5 h-1.5 rounded-full bg-[#34C759] animate-pulse shadow-[0_0_8px_rgba(52,199,89,0.8)]" />
                                    <span className="text-[9px] font-bold text-[#34C759] tracking-widest uppercase">Live</span>
                                </div>
                            ) : isFinal ? (
                                <span className="text-[10px] text-neutral-500 font-bold tracking-widest uppercase bg-white/[0.03] px-2 py-0.5 rounded-[4px]">
                                    {game.short_status || 'FINAL'}
                                </span>
                            ) : (
                                <span className="text-[10px] text-neutral-400 font-mono tracking-widest uppercase flex items-center gap-1.5 font-bold">
                                    <Clock className="h-3 w-3 text-neutral-500" />
                                    {timeString}
                                </span>
                            )}
                            
                            {/* Live Clock / Inning Output */}
                            {isLive && game.short_status && (
                                <span className="text-[10px] font-mono text-[#34C759] tracking-widest uppercase mt-1 font-bold">
                                    {game.short_status}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Team Scores Ledger */}
                    <div className="flex flex-col gap-4">
                        {/* Away Team */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <TeamLogo src={game.away_team.logo} alt={game.away_team.abbreviation || 'AWY'} />
                                <span className={`text-[15px] tracking-tight ${awayWon || (!isFinal && !homeWon) ? 'font-medium text-white/95' : 'font-normal text-neutral-500'}`}>
                                    {game.away_team.name}
                                </span>
                            </div>
                            {hasScores && (
                                <span className={`text-[18px] font-mono tabular-nums lining-nums ${awayWon || (!isFinal && !homeWon) ? 'font-medium text-white/95' : 'font-medium text-neutral-500'}`}>
                                    {awayScore}
                                </span>
                            )}
                        </div>
                        
                        {/* Home Team */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <TeamLogo src={game.home_team.logo} alt={game.home_team.abbreviation || 'HME'} />
                                <span className={`text-[15px] tracking-tight ${homeWon || (!isFinal && !awayWon) ? 'font-medium text-white/95' : 'font-normal text-neutral-500'}`}>
                                    {game.home_team.name}
                                </span>
                            </div>
                            {hasScores && (
                                <span className={`text-[18px] font-mono tabular-nums lining-nums ${homeWon || (!isFinal && !awayWon) ? 'font-medium text-white/95' : 'font-medium text-neutral-500'}`}>
                                    {homeScore}
                                </span>
                            )}
                        </div>
                    </div>
                    
                    {/* Conditional: Injury Impact Array */}
                    {game.injuries && game.injuries.length > 0 && (
                       <div className="mt-3 bg-[#FF9500]/5 border border-[#FF9500]/10 rounded-[12px] p-4 flex flex-col gap-3">
                          <div className="flex items-center gap-2 border-b border-[#FF9500]/10 pb-2">
                              <AlertTriangle className="h-3.5 w-3.5 text-[#FF9500]" strokeWidth={2} />
                              <span className="text-[9px] text-[#FF9500] uppercase tracking-widest font-mono font-bold">Structural Availability Impact</span>
                          </div>
                          <div className="flex flex-col gap-3 pt-1">
                             {game.injuries.map((teamInjs: any) => (
                                <div key={teamInjs.teamAbbreviation} className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
                                    <span className="text-[10px] font-mono font-bold text-neutral-500 w-8 pt-1">
                                        {teamInjs.teamAbbreviation}
                                    </span>
                                    <div className="flex flex-wrap gap-2 flex-1">
                                        {teamInjs.players.slice(0, 5).map((p: any) => (
                                            <div key={p.id} className="flex items-center gap-2 bg-[#050505] border border-white/[0.04] rounded-[6px] px-2.5 py-1">
                                               <span className="text-[9px] font-mono text-neutral-500 font-bold">{p.position}</span>
                                               <span className="text-[11px] text-neutral-300">{p.name}</span>
                                               <span className="text-[9px] text-[#FF9500] uppercase tracking-widest font-bold">{p.status}</span>
                                            </div>
                                        ))}
                                        {teamInjs.players.length > 5 && (
                                           <span className="text-[10px] font-mono text-neutral-600 self-center font-bold">
                                               +{teamInjs.players.length - 5}
                                           </span>
                                        )}
                                    </div>
                                </div>
                             ))}
                          </div>
                       </div>
                    )}

                    {/* Conditional: Odds / Market Ledger */}
                    {(game as any).odds && (game as any).odds.length > 0 && !isFinal && (
                        <OddsDataBlock odds={(game as any).odds} />
                    )}

                 </motion.article>
               );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
