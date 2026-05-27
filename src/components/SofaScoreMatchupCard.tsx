import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ReadonlySofaScoreLiveState,
    ReadonlyTeamIdentity,
    ReadonlyAthlete,
    ReadonlyBaseballState,
    ReadonlyClockBasedState
} from './SofaScoreMatchupCard.types';
import { normalizeMatchData } from './SofaScoreMatchupCard.adapter';

// ============================================================================
// Core UI Primitives (Agnostic & Hardened)
// ============================================================================

export const TeamLogo = React.memo(({ identity, fallback }: { readonly identity: ReadonlyTeamIdentity; readonly fallback: string }) => {
    const [hasError, setHasError] = useState(false);
    
    if (hasError || !identity.logo) {
        return (
            <div 
                className="w-7 h-7 rounded-full bg-neutral-900 border border-white/[0.04] flex items-center justify-center shrink-0"
                role="img"
                aria-label={`Fallback logo for ${identity.displayName}`}
            >
                <span className="text-[8px] font-mono text-neutral-500 tracking-widest font-light select-none" aria-hidden="true">
                    {(identity.abbreviation || fallback).substring(0, 3).toUpperCase()}
                </span>
            </div>
        );
    }

    return (
        <div className="w-7 h-7 flex items-center justify-center bg-neutral-950 rounded-full p-1 border border-white/[0.04] shrink-0 overflow-hidden">
            <img 
                src={identity.logo} 
                alt={`${identity.displayName} team logo`} 
                className="w-full h-full object-contain opacity-70 grayscale transition-all duration-300 hover:grayscale-0 hover:opacity-100"
                onError={() => setHasError(true)}
                loading="lazy"
                decoding="async"
            />
        </div>
    );
});
TeamLogo.displayName = 'TeamLogo';

export const Indicator = React.memo(({ count, total, label }: { readonly count: number; readonly total: number; readonly label: string }) => (
    <div className="flex gap-1" role="meter" aria-label={`${label} count`} aria-valuenow={count} aria-valuemin={0} aria-valuemax={total}>
        <span className="sr-only">{`${count} out of ${total} ${label}`}</span>
        {Array.from({ length: total }).map((_, i) => (
            <motion.div
                key={`${label}-indicator-${i}`}
                initial={{ scale: 0.8, opacity: 0.5 }}
                animate={{ scale: 1, opacity: 1 }}
                className={`w-1.5 h-1.5 rounded-full border transition-all duration-300 ${
                    i < count ? 'bg-neutral-300 border-transparent shadow-[0_0_4px_rgba(255,255,255,0.2)]' : 'bg-neutral-950 border-white/[0.05]'
                }`}
                aria-hidden="true"
            />
        ))}
    </div>
));
Indicator.displayName = 'Indicator';

export const PlayerStat = React.memo(({ roleLabel, player, onClick }: { readonly roleLabel: string; readonly player: ReadonlyAthlete | null; readonly onClick?: () => void }) => {
    if (!player) {
        return (
            <div className="w-full text-left p-4 rounded-[16px] bg-neutral-950/40 border border-white/[0.01] min-h-[90px] flex flex-col justify-center">
                <div className="text-[9px] font-mono uppercase tracking-widest text-neutral-600 font-light mb-2">{roleLabel}</div>
                <div className="text-[12px] font-mono text-neutral-600 italic">Awaiting active data...</div>
            </div>
        );
    }

    return (
        <button 
            onClick={onClick}
            disabled={!onClick} 
            className="w-full text-left p-4 rounded-[16px] bg-neutral-950/50 border border-white/[0.01] shadow-inner min-h-[90px] transition-all duration-200 hover:bg-neutral-900/40 focus:outline-none focus:ring-1 focus:ring-neutral-700 disabled:cursor-default disabled:hover:bg-neutral-950/50 group"
            aria-label={`${roleLabel}: ${player.displayName}`}
        >
            <div className="flex justify-between items-center mb-2" aria-hidden="true">
                <div className="text-[9px] font-mono uppercase tracking-widest text-neutral-500 font-light">{roleLabel}</div>
                {player.jersey && (
                    <div className="text-[9px] font-mono text-neutral-400 font-light bg-neutral-900 px-1.5 py-0.5 rounded shadow-inner border border-white/[0.02]">
                        #{player.jersey}
                    </div>
                )}
            </div>
            <div className="text-[15px] font-light text-neutral-200 truncate group-hover:text-white transition-colors">{player.displayName}</div>
            
            {player.summary ? (
                <div className="text-[11px] font-mono text-neutral-500 mt-1 truncate">{player.summary}</div>
            ) : (
                <div className="text-[11px] font-mono text-neutral-600 mt-1 italic">Stats unavailable</div>
            )}
        </button>
    );
});
PlayerStat.displayName = 'PlayerStat';

// ============================================================================
// Dynamic Box Score (Polymorphic Presentation Grid)
// ============================================================================

export const DynamicBoxScore = React.memo(({ data }: { readonly data: ReadonlySofaScoreLiveState }) => {
    const TeamRow = ({ identity, fallback, metrics }: { identity: ReadonlyTeamIdentity, fallback: string, metrics: React.ReactNode }) => (
        <div className="contents" role="row">
            <div className="text-left font-sans font-light text-neutral-200 flex items-center gap-2 text-[12px] min-w-[100px]" role="cell">
                <TeamLogo identity={identity} fallback={fallback} />
                <span className="truncate max-w-[80px] font-medium tracking-wide">{identity.abbreviation || fallback}</span>
            </div>
            {metrics}
        </div>
    );

    if (data.sportType === 'baseball') {
        return (
            <div className="grid grid-cols-4 gap-x-4 gap-y-1.5 text-center text-xs font-mono text-neutral-400 min-w-[240px]" role="table" aria-label="Baseball Box Score">
                <div className="contents" role="row">
                    <div className="text-left font-sans font-light text-neutral-500 text-[9px] uppercase tracking-widest" role="columnheader">TEAM</div>
                    <div className="font-light text-[9px] uppercase tracking-widest" role="columnheader" aria-label="Runs">R</div>
                    <div className="font-light text-[9px] uppercase tracking-widest" role="columnheader" aria-label="Hits">H</div>
                    <div className="font-light text-[9px] uppercase tracking-widest" role="columnheader" aria-label="Errors">E</div>
                </div>
                
                <TeamRow 
                    identity={data.awayTeamBox.team} 
                    fallback="AWY"
                    metrics={
                        <>
                            <div className="font-medium text-neutral-100 text-[13px] tabular-nums" role="cell">{data.awayTeamBox.runs}</div>
                            <div className="text-neutral-500 text-[12px] tabular-nums" role="cell">{data.awayTeamBox.hits}</div>
                            <div className="text-neutral-500 text-[12px] tabular-nums" role="cell">{data.awayTeamBox.errors}</div>
                        </>
                    } 
                />
                
                <TeamRow 
                    identity={data.homeTeamBox.team} 
                    fallback="HOM"
                    metrics={
                        <>
                            <div className="font-medium text-neutral-100 text-[13px] tabular-nums" role="cell">{data.homeTeamBox.runs}</div>
                            <div className="text-neutral-500 text-[12px] tabular-nums" role="cell">{data.homeTeamBox.hits}</div>
                            <div className="text-neutral-500 text-[12px] tabular-nums" role="cell">{data.homeTeamBox.errors}</div>
                        </>
                    } 
                />
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-center text-xs font-mono text-neutral-400 min-w-[160px]" role="table" aria-label="Game Score">
            <div className="contents" role="row">
                <div className="text-left font-sans font-light text-neutral-500 text-[9px] uppercase tracking-widest" role="columnheader">TEAM</div>
                <div className="font-light text-[9px] uppercase tracking-widest text-right pr-1" role="columnheader" aria-label="Score">SCORE</div>
            </div>
            
            <TeamRow 
                identity={data.awayTeamBox.team} 
                fallback="AWY"
                metrics={<div className="font-medium text-neutral-100 text-[14px] tabular-nums text-right pr-1" role="cell">{data.awayTeamBox.score}</div>} 
            />
            
            <TeamRow 
                identity={data.homeTeamBox.team} 
                fallback="HOM"
                metrics={<div className="font-medium text-neutral-100 text-[14px] tabular-nums text-right pr-1" role="cell">{data.homeTeamBox.score}</div>} 
            />
        </div>
    );
});
DynamicBoxScore.displayName = 'DynamicBoxScore';

// ============================================================================
// Cross-Browser SVG Base Primitive (With Inline Glow Filters)
// ============================================================================
const Base = React.memo(({ active, x, y, label }: { readonly active: boolean; readonly x: number; readonly y: number; readonly label: string }) => (
    <rect
        x={x} y={y} width="26" height="26" rx="4"
        filter={active ? "url(#base-glow-filter)" : undefined}
        className={`transition-all duration-500 stroke-white/[0.04] stroke-[1] ${
            active ? 'fill-neutral-200 opacity-100' : 'fill-neutral-900 opacity-80'
        }`}
        role="img"
        aria-label={`${label} base ${active ? 'occupied' : 'empty'}`}
    />
));
Base.displayName = 'Base';

// ============================================================================
// Baseball Theater (Event & Spatial UI)
// ============================================================================
export const BaseballTheater = React.memo(({ 
    data, 
    onPlayerClick 
}: { 
    readonly data: ReadonlyBaseballState;
    readonly onPlayerClick: (role: string, id: string) => void;
}) => {
    const { situation } = data;
    
    const inningText = situation.inning !== null 
        ? `${situation.isTopInning === true ? '▲' : situation.isTopInning === false ? '▼' : ''} ${situation.inning}`.trim()
        : null;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 py-6 border-b border-white/[0.02] relative z-10" role="region" aria-label="Baseball Situation">
            {/* Spatial Diamond & Counts */}
            <div className="flex flex-col items-center justify-center gap-4 bg-neutral-900/40 border border-white/[0.01] p-5 rounded-[20px] shadow-inner min-h-[180px] relative">
                
                {inningText && (
                    <div className="absolute top-4 left-5 text-[10px] font-mono text-neutral-500 tracking-widest" aria-label={`Inning: ${inningText}`}>
                        {inningText}
                    </div>
                )}

                <div className="relative w-28 h-28 flex items-center justify-center select-none mt-2">
                    <svg className="w-full h-full rotate-45 transform drop-shadow-md overflow-visible" viewBox="0 0 100 100" aria-label="Baseball Diamond">
                        <defs>
                            <filter id="base-glow-filter" x="-30%" y="-30%" width="160%" height="160%">
                                <feGaussianBlur stdDeviation="3" result="blur" />
                                <feComponentTransfer in="blur" result="brightBlur">
                                    <feFuncA type="linear" slope="0.4" />
                                </feComponentTransfer>
                                <feMerge>
                                    <feMergeNode in="brightBlur" />
                                    <feMergeNode in="SourceGraphic" />
                                </feMerge>
                            </filter>
                        </defs>
                        <Base active={situation.onSecond} x={10} y={10} label="Second" />
                        <Base active={situation.onThird} x={10} y={60} label="Third" />
                        <Base active={situation.onFirst} x={60} y={10} label="First" />
                        <polygon points="65,65 90,65 90,90 65,90" className="fill-neutral-950 stroke-white/[0.04] stroke-[1]" />
                    </svg>
                    
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center bg-neutral-950/60 backdrop-blur-sm px-2 py-1 rounded-md border border-white/[0.02]" aria-live="polite">
                        <span className="text-[14px] font-sans font-medium text-neutral-200 tabular-nums leading-none block mb-0.5">
                            {situation.outs}
                        </span>
                        <div className="text-[7px] font-mono uppercase tracking-widest text-neutral-500 leading-none">Outs</div>
                    </div>
                </div>
                
                <div className="flex items-center gap-6 text-[10px] font-mono uppercase tracking-widest font-light text-neutral-600 mt-2">
                    <div className="flex flex-col items-center gap-1.5">
                        <span aria-hidden="true">B</span>
                        <Indicator count={situation.balls} total={4} label="Balls" />
                    </div>
                    <div className="flex flex-col items-center gap-1.5">
                        <span aria-hidden="true">S</span>
                        <Indicator count={situation.strikes} total={3} label="Strikes" />
                    </div>
                </div>
            </div>

            {/* Active Matchups */}
            <div className="lg:col-span-2 flex flex-col justify-center gap-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                    <PlayerStat 
                        roleLabel="At Bat" 
                        player={situation.batter} 
                        onClick={() => situation.batter && onPlayerClick('batter', situation.batter.id)} 
                    />
                    <PlayerStat 
                        roleLabel="Pitching" 
                        player={situation.pitcher} 
                        onClick={() => situation.pitcher && onPlayerClick('pitcher', situation.pitcher.id)} 
                    />
                </div>
            </div>
        </div>
    );
});
BaseballTheater.displayName = 'BaseballTheater';

// ============================================================================
// Clock/Court Theater (Time & Possession UI)
// ============================================================================
export const ClockTheater = React.memo(({ 
    data, 
    onPlayerClick 
}: { 
    readonly data: ReadonlyClockBasedState;
    readonly onPlayerClick: (role: string, id: string) => void;
}) => {
    const { situation, awayTeamBox, homeTeamBox } = data;

    const possessionText = situation.possession === 'away' 
        ? `◄ ${awayTeamBox.team.abbreviation} BALL` 
        : situation.possession === 'home' 
            ? `${homeTeamBox.team.abbreviation} BALL ►` 
            : 'NEUTRAL POSSESSION';

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 py-6 border-b border-white/[0.02] relative z-10" role="region" aria-label="Game Situation">
            {/* Clock & Period */}
            <div className="flex flex-col items-center justify-center gap-2 bg-neutral-900/40 border border-white/[0.01] p-5 rounded-[20px] shadow-inner min-h-[180px]">
                <div className="text-[11px] font-mono uppercase tracking-widest text-neutral-500 font-light mb-2">
                    {situation.periodLabel}
                </div>
                
                <div className="text-[42px] font-sans font-light tracking-tight text-neutral-100 tabular-nums mb-4 leading-none" aria-live="polite">
                    {situation.clock || '--:--'}
                </div>

                <div 
                    className={`text-[9px] font-mono uppercase tracking-widest px-3 py-1 rounded-full border transition-colors ${
                        situation.possession !== 'neutral' 
                            ? 'border-neutral-700 text-neutral-300 bg-neutral-800/50' 
                            : 'border-transparent text-neutral-600'
                    }`}
                >
                    {possessionText}
                </div>
            </div>

            {/* Active Player Context */}
            <div className="lg:col-span-2 flex flex-col justify-center">
                <PlayerStat 
                    roleLabel="Impact Player" 
                    player={situation.primaryAthlete} 
                    onClick={() => situation.primaryAthlete && onPlayerClick('primaryAthlete', situation.primaryAthlete.id)} 
                />
            </div>
        </div>
    );
});
ClockTheater.displayName = 'ClockTheater';

// ============================================================================
// Generic Theater Fallback
// ============================================================================
export const GenericTheater = React.memo(() => (
    <div className="flex flex-col items-center justify-center py-12 relative z-10 text-center">
        <div className="text-[12px] font-mono uppercase tracking-widest text-neutral-500 font-light mb-2">
            Tracking Active Match
        </div>
        <div className="text-[10px] font-mono text-neutral-600 max-w-sm mx-auto">
            Live spatial data is not currently standardized for this specific event.
        </div>
    </div>
));
GenericTheater.displayName = 'GenericTheater';

// ============================================================================
// Mathematically Flawless SVG Momentum Sparkline
// ============================================================================
export const MomentumChart = React.memo(({ history }: { readonly history: ReadonlyArray<number> }) => {
    if (history.length === 0) return null;

    const maxVal = Math.max(...history.map(Math.abs), 1);
    
    // Hardcoded canvas size for clean inner math
    const width = 360;
    const height = 48;
    const midY = height / 2;
    const barWidth = Math.max(1, (width / history.length) - 1.5);

    return (
        <motion.footer 
            initial={{ height: 0, opacity: 0, paddingTop: 0 }}
            animate={{ height: 'auto', opacity: 1, paddingTop: 24 }}
            exit={{ height: 0, opacity: 0, paddingTop: 0 }}
            className="relative z-10 overflow-hidden"
        >
            <div className="flex justify-between items-center mb-4 text-[9px] font-mono uppercase tracking-widest text-neutral-600 font-light" aria-hidden="true">
                <span className="text-neutral-500">Away Momentum</span>
                <span>Live Momentum Index</span>
                <span className="text-neutral-500">Home Momentum</span>
            </div>
            
            <div className="w-full bg-neutral-900/40 rounded-[16px] border border-white/[0.01] p-3 relative overflow-hidden shadow-inner">
                <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible">
                    {/* Equilibrium Center Line */}
                    <line x1="0" y1={midY} x2={width} y2={midY} stroke="white" strokeOpacity="0.05" strokeWidth="1" strokeDasharray="2,4" />

                    {history.map((val, i) => {
                        const isHome = val > 0;
                        const barHeight = (Math.abs(val) / maxVal) * (midY - 4);
                        const x = i * (width / history.length);
                        const y = isHome ? midY - barHeight : midY;

                        return (
                            <rect
                                key={`momentum-bar-${i}`}
                                x={x}
                                y={y}
                                width={barWidth}
                                height={Math.max(barHeight, 1)}
                                className={`transition-all duration-300 rounded-[1px] ${
                                    isHome 
                                        ? 'fill-neutral-400/40 hover:fill-neutral-200' 
                                        : 'fill-neutral-700/60 hover:fill-neutral-500'
                                }`}
                            />
                        );
                    })}
                </svg>
            </div>
        </motion.footer>
    );
});
MomentumChart.displayName = 'MomentumChart';

// ============================================================================
// Master Orchestrator (Unified Integration Layer)
// ============================================================================

export interface SofaScoreMatchupCardProps {
    // Drop-in raw vendor game payload (adapter handles mapping internally)
    readonly rawGame?: unknown;
    // Or pass pre-normalized clean state directly for pure architectures
    readonly data?: ReadonlySofaScoreLiveState;
    readonly onPlayerClick?: (role: string, id: string) => void;
    readonly onCardClick?: (gameId: string) => void;
    readonly onMount?: (componentName: string, timestamp: number) => void;
}

export const SofaScoreMatchupCard: React.FC<SofaScoreMatchupCardProps> = ({ 
    rawGame,
    data,
    onPlayerClick,
    onCardClick,
    onMount 
}) => {
    
    // Safe, unified data routing
    const resolvedData = useMemo(() => {
        if (data) return data;
        return normalizeMatchData(rawGame);
    }, [data, rawGame]);

    // Telemetry Hooks
    useEffect(() => {
        if (onMount) onMount('SofaScoreMatchupCard', Date.now());
    }, [onMount]);

    const handlePlayerClick = useCallback((role: string, playerId: string) => {
        if (onPlayerClick) {
            onPlayerClick(role, playerId);
        }
    }, [onPlayerClick]);

    const isLive = resolvedData.gameState === 'live';
    const displayStatus = resolvedData.statusText || resolvedData.gameState.toUpperCase();

    return (
        <motion.section 
            layout 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => onCardClick?.(resolvedData.gameId)}
            className={`w-full bg-neutral-950 border rounded-[24px] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.7),inset_0_1px_2px_rgba(255,255,255,0.01)] overflow-hidden font-sans relative group transition-all duration-500 ${
                onCardClick ? 'cursor-pointer hover:border-white/[0.08] hover:shadow-[0_32px_90px_rgba(0,0,0,0.8),inset_0_1px_2px_rgba(255,255,255,0.02)]' : 'border-white/[0.01]'
            }`}
            role="region"
            aria-label={`Matchup: ${resolvedData.awayTeamBox.team.abbreviation} vs ${resolvedData.homeTeamBox.team.abbreviation}`}
        >
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.005] via-transparent to-transparent pointer-events-none" aria-hidden="true" />
            
            {/* Header & Polymorphic Box Score */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-white/[0.02] relative z-10">
                <div className="flex items-center gap-3">
                    <div 
                        className={`px-2.5 py-0.5 border text-[9px] font-mono font-light uppercase tracking-widest rounded-full flex items-center gap-1.5 shadow-inner transition-colors duration-500 ${
                            isLive ? 'bg-neutral-900 border-white/[0.03] text-neutral-300' : 'bg-neutral-900/50 border-transparent text-neutral-600'
                        }`}
                        aria-live="polite"
                    >
                        {isLive && (
                            <motion.span 
                                animate={{ opacity: [1, 0.3, 1] }}
                                transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                                className="w-1 h-1 rounded-full bg-neutral-400" 
                                aria-hidden="true" 
                            /> 
                        )}
                        <span className="truncate max-w-[200px]">{displayStatus}</span>
                    </div>
                </div>
                
                <div className="flex items-center overflow-x-auto scrollbar-hide">
                    <DynamicBoxScore data={resolvedData} />
                </div>
            </header>

            {/* Polymorphic Theater Routing */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={`${resolvedData.gameId}-${resolvedData.sportType}`}
                    initial={{ opacity: 0, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, filter: 'blur(4px)' }}
                    transition={{ duration: 0.3 }}
                >
                    {resolvedData.sportType === 'baseball' && (
                        <BaseballTheater data={resolvedData} onPlayerClick={handlePlayerClick} />
                    )}
                    
                    {resolvedData.sportType === 'clock' && (
                        <ClockTheater data={resolvedData} onPlayerClick={handlePlayerClick} />
                    )}

                    {resolvedData.sportType === 'generic' && (
                        <GenericTheater />
                    )}
                </motion.div>
            </AnimatePresence>

            {/* Autonomous Momentum Footer */}
            <AnimatePresence mode="popLayout">
                {resolvedData.momentumHistory.length > 0 && (
                    <MomentumChart history={resolvedData.momentumHistory} />
                )}
            </AnimatePresence>

        </motion.section>
    );
};
SofaScoreMatchupCard.displayName = 'SofaScoreMatchupCard'
