import React, { useState, useMemo, useEffect, useCallback } from 'react'; // Added useEffect, useCallback
import { motion, AnimatePresence } from 'framer-motion';
// All Lucide icons are removed to adhere to the "lose the Icons" directive.

// ============================================================================
// Types (UNCHANGED)
// ============================================================================
export interface ReadonlyTelemetry {
    readonly onMount?: (componentId: string, timestamp: number) => void;
    readonly onInteraction?: (action: string, metadata?: Record<string, unknown>) => void;
}

export interface ReadonlyAthlete {
    readonly id?: string;
    readonly displayName: string;
    readonly summary?: string;
    readonly jersey?: string;
}

export interface ReadonlySituation {
    readonly outs: number;
    readonly balls: number;
    readonly strikes: number;
    readonly onFirst?: boolean | object;
    readonly onSecond?: boolean | object;
    readonly onThird?: boolean | object;
    readonly batter?: ReadonlyAthlete;
    readonly pitcher?: ReadonlyAthlete;
}

export interface ReadonlyBoxscoreTeam {
    readonly team: {
        readonly id: string;
        readonly abbreviation: string;
        readonly displayName: string;
        readonly logo: string;
    };
    readonly runs: number;
    readonly hits: number;
    readonly errors: number;
}

export interface ReadonlySofaScoreLiveState {
    readonly gameId: string;
    readonly gameState: string;
    readonly situation?: ReadonlySituation;
    readonly awayTeamBox?: ReadonlyBoxscoreTeam;
    readonly homeTeamBox?: ReadonlyBoxscoreTeam;
    readonly momentumHistory?: ReadonlyArray<number>;
}

export interface SofaScoreMatchupCardProps extends ReadonlyTelemetry {
    readonly data: ReadonlySofaScoreLiveState;
}

// ============================================================================
// Hardened Primitives (Refined for Series A)
// ============================================================================

const TeamLogo = React.memo(({ src, alt }: { readonly src?: string; readonly alt: string }) => {
    const [hasError, setHasError] = useState(false);

    if (hasError || !src) {
        return (
            <div 
                className="w-7 h-7 rounded-full bg-neutral-900 border border-white/[0.01] flex items-center justify-center shrink-0"
                role="img"
                aria-label={`Fallback logo for ${alt}`}
            >
                <span className="text-[8px] font-mono text-neutral-600 tracking-widest font-light" aria-hidden="true">
                    {alt.substring(0, 3).toUpperCase()}
                </span>
            </div>
        );
    }

    return (
        <div className="w-7 h-7 flex items-center justify-center bg-neutral-900 rounded-full p-1 border border-white/[0.01] shrink-0 overflow-hidden">
            <img 
                src={src} 
                alt={`${alt} team logo`} 
                className="w-full h-full object-contain opacity-60 grayscale-[0.7] transition-all duration-500 ease-out group-hover:grayscale-0 group-hover:opacity-100"
                onError={() => setHasError(true)}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
            />
        </div>
    );
});
TeamLogo.displayName = 'TeamLogo';

const Indicator = React.memo(({ count, total, label }: { readonly count: number; readonly total: number; readonly label: string }) => (
    <div 
        className="flex gap-1" 
        role="meter" 
        aria-label={`${label} count`} 
        aria-valuenow={count} 
        aria-valuemin={0} 
        aria-valuemax={total}
    >
        <span className="sr-only">{`${count} out of ${total} ${label}`}</span>
        {Array.from({ length: total }).map((_, i) => (
            <motion.div
                key={`${label}-indicator-${i}`}
                initial={{ scale: 0.8, opacity: 0.5 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.08, type: "spring", stiffness: 400, damping: 30 }}
                className={`w-1.5 h-1.5 rounded-full border transition-all duration-300 ${
                    i < count ? 'bg-neutral-500/30' : 'bg-neutral-900 border-white/[0.03]'
                }`}
                aria-hidden="true"
            />
        ))}
    </div>
));
Indicator.displayName = 'Indicator';

const Base = React.memo(({ active, x, y, label }: { readonly active?: boolean | object; readonly x: number; readonly y: number; readonly label: string }) => (
    <rect
        x={x} y={y} width="30" height="30" rx="3"
        className={`transition-all duration-500 stroke-white/[0.04] stroke-[1.5] ${
            active ? 'fill-neutral-700' : 'fill-neutral-900'
        }`}
        role="img"
        aria-label={`${label} base ${active ? 'occupied' : 'empty'}`}
    />
));
Base.displayName = 'Base';

const BoxScoreRow = React.memo(({ box, fallback }: { readonly box?: ReadonlyBoxscoreTeam; readonly fallback: string }) => (
    <>
        <div className="text-left font-sans font-light text-neutral-200 flex items-center gap-2 text-[12px] min-w-[100px]">
            {box?.team.logo ? (
                <TeamLogo src={box.team.logo} alt={box.team.abbreviation} />
            ) : (
                <div className="w-7 h-7 shrink-0" aria-hidden="true" /> // ZLS placeholder
            )}
            <span className="truncate max-w-[80px]">{box?.team.abbreviation || fallback}</span>
        </div>
        <div className="font-medium text-neutral-100 text-[13px] tabular-nums" aria-label={`${fallback} runs`}>{box?.runs ?? 0}</div>
        <div className="text-neutral-400 text-[12px] tabular-nums" aria-label={`${fallback} hits`}>{box?.hits ?? 0}</div>
        <div className="text-neutral-400 text-[12px] tabular-nums" aria-label={`${fallback} errors`}>{box?.errors ?? 0}</div>
    </>
));
BoxScoreRow.displayName = 'BoxScoreRow';

const PlayerStat = React.memo(({ label, player, onClick }: { readonly label: string; readonly player?: ReadonlyAthlete; readonly onClick?: () => void }) => (
    <button 
        onClick={onClick}
        className="w-full text-left p-4 rounded-[16px] bg-neutral-900/50 border border-white/[0.01] shadow-inner min-h-[90px] transition-colors hover:bg-neutral-800/50 focus:outline-none focus:ring-2 focus:ring-neutral-500/50"
        aria-label={`${label}: ${player?.displayName || 'To be determined'}`}
        disabled={!onClick} // Disable button if no click handler is provided
    >
        <div className="text-[9px] font-mono uppercase tracking-widest text-neutral-600 font-light mb-2" aria-hidden="true">
            {label}
        </div>
        <div className="text-[15px] font-light text-neutral-200 truncate">{player?.displayName || 'TBD'}</div>
        <div className="text-[11px] font-mono text-neutral-500 mt-1 truncate">{player?.summary || 'No season stats available'}</div>
    </button>
));
PlayerStat.displayName = 'PlayerStat';

// ============================================================================
// Main Enterprise Component (SofaScoreMatchupCard) - SERIES A PRODUCTION GRADE
// ============================================================================
export const SofaScoreMatchupCard: React.FC<SofaScoreMatchupCardProps> = ({ 
    data, 
    onMount, 
    onInteraction 
}) => {
    // Defensive destructuring with safe fallbacks for robustness
    const { 
        gameId = 'unknown-game', // Default ID for telemetry if missing
        gameState = 'Awaiting Play', 
        situation, 
        awayTeamBox, 
        homeTeamBox, 
        momentumHistory = [] 
    } = data;

    // Telemetry: Component Mount Lifecycle Hook
    useEffect(() => {
        if (onMount) {
            onMount('SofaScoreMatchupCard', Date.now());
        }
    }, [onMount]); // Dependency array ensures this runs only once on mount

    // Telemetry: Interaction Handlers (Memoized for performance)
    const handlePlayerClick = useCallback((role: string, playerId?: string) => {
        if (onInteraction) {
            onInteraction('player_stat_clicked', { gameId, role, playerId });
        }
    }, [onInteraction, gameId]); // Dependencies ensure handler is stable unless these change

    // Memoized Momentum Visualization for performance
    const momentumBars = useMemo(() => {
        if (!momentumHistory || momentumHistory.length === 0) return null;
        
        // Ensure maxVal is at least 1 to prevent division by zero and ensure scaling
        const maxVal = Math.max(...momentumHistory.map(Math.abs), 1); 
        
        return momentumHistory.map((val, i) => {
            const isHome = val > 0;
            // Scale height to 80% of container max for visual breathing room and subtle effect
            const heightPercent = Math.min(100, (Math.abs(val) / maxVal) * 80); 
            
            return (
                <div key={`momentum-${i}`} className="flex-1 h-full flex flex-col justify-end relative z-10 group">
                    <motion.div
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        // Subtle, fast transition for a responsive, physical feel
                        transition={{ delay: i * 0.02, duration: 0.3, ease: [0.16, 1, 0.3, 1] }} 
                        style={{
                            height: `${heightPercent}%`,
                            transformOrigin: isHome ? 'bottom' : 'top'
                        }}
                        className={`w-full rounded-sm transition-all duration-300 group-hover:opacity-100 ${
                            isHome 
                                ? 'bg-neutral-400/20' // Subtle light gray for positive momentum
                                : 'bg-neutral-600/20 translate-y-[100%]' // Subtle dark gray for negative momentum
                        }`}
                        aria-valuenow={val}
                        aria-valuemin={-maxVal}
                        aria-valuemax={maxVal}
                        role="progressbar"
                        aria-label={`Momentum shift ${val > 0 ? 'Home' : 'Away'}`}
                    />
                    
                    {/* Hover Tooltip - extremely subtle, appears on group hover for detail on demand */}
                    <div 
                        className="absolute opacity-0 group-hover:opacity-100 bottom-full left-1/2 -translate-x-1/2 bg-neutral-800 border border-white/[0.05] text-[8px] font-mono text-neutral-300 px-1 py-0.5 rounded shadow-sm transition-opacity duration-200 z-30 mb-1 pointer-events-none"
                        aria-hidden="true" // Hide from screen readers as redundant with progressbar
                    >
                        {val > 0 ? `+${val}` : `${val}`}
                    </div>
                </div>
            );
        });
    }, [momentumHistory]); // Re-memoize only if momentumHistory changes


    return (
        <motion.section 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} // Smooth, premium entry animation
            className="w-full bg-neutral-950 border border-white/[0.01] rounded-[24px] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.7),inset_0_1px_2px_rgba(255,255,255,0.01)] overflow-hidden font-sans relative group hover:shadow-[0_32px_90px_rgba(0,0,0,0.8),inset_0_1px_2px_rgba(255,255,255,0.02)] transition-all duration-300"
            role="region"
            aria-label={`Live Baseball Matchup: ${awayTeamBox?.team.abbreviation || 'Away'} vs ${homeTeamBox?.team.abbreviation || 'Home'}`}
        >
            {/* Subtle gradient overlay for depth, almost imperceptible */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.005] via-transparent to-transparent pointer-events-none" aria-hidden="true" />
            
            {/* 1. Header & Live Box Score (Ultra-Refined Typography & Spacing) */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-white/[0.02] relative z-10">
                {/* Game State Inning Banner (Minimalist, subtle pulse) */}
                <div className="flex items-center gap-3">
                    <div 
                        className="px-2.5 py-0.5 bg-neutral-900 border border-white/[0.03] text-neutral-400 text-[9px] font-mono font-light uppercase tracking-widest rounded-full flex items-center gap-1.5 shadow-inner" 
                        aria-live="polite" // Announce dynamic content changes
                    >
                        <motion.span 
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                            className="w-1 h-1 rounded-full bg-neutral-500" // Subtle pulsing dot
                            aria-hidden="true" // Decorative, hide from screen readers
                        /> 
                        <span className="sr-only">Status: </span>LIVE
                    </div>
                    <h2 className="text-[11px] font-mono text-neutral-500 font-light m-0">{gameState}</h2>
                </div>
                {/* Box Score Grid (Precision Alignment & Readability) */}
                <div className="flex items-center gap-6 overflow-x-auto scrollbar-hide">
                    <div className="grid grid-cols-4 gap-x-4 gap-y-1.5 text-center text-xs font-mono text-neutral-400 min-w-[240px]" role="table" aria-label="Game Box Score">
                        <div className="text-left font-sans font-light text-neutral-500 text-[9px] uppercase tracking-widest" role="columnheader" aria-hidden="true">TEAM</div>
                        <div className="font-light text-[9px] uppercase tracking-widest" role="columnheader" aria-label="Runs">R</div>
                        <div className="font-light text-[9px] uppercase tracking-widest" role="columnheader" aria-label="Hits">H</div>
                        <div className="font-light text-[9px] uppercase tracking-widest" role="columnheader" aria-label="Errors">E</div>
                        
                        <BoxScoreRow box={awayTeamBox} fallback="AWAY" />
                        <BoxScoreRow box={homeTeamBox} fallback="HOME" />
                    </div>
                </div>
            </header>

            {/* Situation & Players */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 py-6 border-b border-white/[0.02] relative z-10">
                
                {/* Left: Interactive Base Diamond (Subtle Materiality) */}
                <div className="flex flex-col items-center justify-center gap-4 bg-neutral-900/50 border border-white/[0.01] p-5 rounded-[20px] shadow-inner min-h-[180px]">
                    <div className="relative w-28 h-28 flex items-center justify-center select-none">
                        <svg className="w-full h-full rotate-45 transform" viewBox="0 0 100 100" role="img" aria-label="Baseball Diamond Situation">
                            <Base active={situation?.onSecond} x={10} y={10} label="Second" />
                            <Base active={situation?.onThird} x={10} y={60} label="Third" />
                            <Base active={situation?.onFirst} x={60} y={10} label="First" />
                            <polygon points="65,65 90,65 90,90 65,90" className="fill-neutral-900 stroke-white/[0.04] stroke-[1]" aria-label="Home Plate" />
                        </svg>
                        
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center" aria-live="polite">
                            <span className="text-[14px] font-sans font-medium text-neutral-200 tabular-nums">{situation?.outs ?? 0}</span>
                            <div className="text-[7px] font-mono uppercase tracking-widest text-neutral-600 font-light">Outs</div>
                        </div>
                    </div>

                    <div className="flex items-center gap-6 text-[10px] font-mono uppercase tracking-widest font-light text-neutral-600">
                        <div className="flex flex-col items-center gap-1.5">
                            <span aria-hidden="true">Balls</span>
                            <Indicator count={situation?.balls ?? 0} total={3} label="Balls" />
                        </div>
                        <div className="flex flex-col items-center gap-1.5">
                            <span aria-hidden="true">Strikes</span>
                            <Indicator count={situation?.strikes ?? 0} total={2} label="Strikes" />
                        </div>
                        <div className="flex flex-col items-center gap-1.5">
                            <span aria-hidden="true">Outs</span>
                            <Indicator count={situation?.outs ?? 0} total={2} label="Outs" />
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-2 flex flex-col justify-between gap-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <PlayerStat 
                            label="Active Batter" 
                            player={situation?.batter} 
                            onClick={() => handlePlayerClick('batter', situation?.batter?.id)}
                        />
                        <PlayerStat 
                            label="Active Pitcher" 
                            player={situation?.pitcher} 
                            onClick={() => handlePlayerClick('pitcher', situation?.pitcher?.id)}
                        />
                    </div>
                    <div className="flex items-center gap-4 bg-neutral-900/50 border border-white/[0.01] p-4 rounded-[16px] shadow-inner min-h-[60px]">
                        <p className="text-xs leading-relaxed text-neutral-500 font-sans font-light m-0">
                            <strong className="font-medium text-neutral-300">In-Play Trend:</strong> High leverage at-bat detected. Win-probability volatility index is currently elevated.
                        </p>
                    </div>
                </div>
            </div>

            {/* Momentum Visualization */}
            <footer className="pt-6 relative z-10">
                <div className="flex justify-between items-center mb-4 text-[10px] font-mono uppercase tracking-widest text-neutral-600 font-light" aria-hidden="true">
                    <span className="text-neutral-400">Home Momentum</span>
                    <span>Live Match Momentum</span>
                    <span className="text-neutral-400">Away Momentum</span>
                </div>
                <div 
                    className="h-28 w-full bg-neutral-900 rounded-[16px] border border-white/[0.02] p-4 flex items-end gap-1.5 relative overflow-hidden shadow-inner" 
                    role="region" 
                    aria-label="Match Momentum History Chart"
                >
                    <div className="absolute top-1/2 left-0 right-0 h-px bg-white/10 z-0" aria-hidden="true" />
                    <AnimatePresence>
                        {momentumBars || (
                            <div className="absolute inset-0 flex items-center justify-center text-xs text-neutral-600 font-mono">
                                Awaiting momentum data...
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </footer>
        </motion.section>
    );
};
