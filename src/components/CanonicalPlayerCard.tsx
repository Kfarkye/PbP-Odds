import React from 'react';
import { User, Activity, Star } from 'lucide-react';

export const CanonicalPlayerCard: React.FC<{ data: any }> = ({ data }) => {
    if (!data) return null;

    const player = data.player || {};
    const team = data.team || {};
    const stats = data.stats || {};
    const lastGame = data.lastGame;

    return (
        <div className="bg-[#050505] rounded-[24px] border border-white/[0.04] p-6 shadow-sm font-sans flex flex-col sm:max-w-md w-full">
            <div className="flex gap-5">
                {player.headshotUrl ? (
                    <img src={player.headshotUrl} alt={player.name} className="w-20 h-20 rounded-full object-cover bg-white/5 border border-white/[0.04]" />
                ) : (
                    <div className="w-20 h-20 rounded-full bg-white/5 border border-white/[0.04] flex items-center justify-center shrink-0">
                        <User className="w-8 h-8 text-white/30" />
                    </div>
                )}
                
                <div className="flex-1 flex flex-col justify-center">
                    <h3 className="text-[20px] font-medium text-white/95 tracking-tight leading-tight">{player.name || 'Unknown Player'}</h3>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-[12px] text-neutral-400 font-medium">{player.position || 'PO'}</span>
                        {team.abbreviation && (
                            <>
                                <span className="text-white/10">•</span>
                                <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-neutral-500">{team.abbreviation}</span>
                            </>
                        )}
                        {player.number && (
                            <>
                                <span className="text-white/10">•</span>
                                <span className="text-[12px] font-mono font-medium text-neutral-400">#{player.number}</span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-3">
                {Object.entries(stats).slice(0, 3).map(([key, value]) => (
                    <div key={key} className="bg-[#0A0A0C] border border-white/[0.02] rounded-[12px] p-3 text-center flex flex-col justify-center items-center">
                        <div className="text-[20px] font-bold text-white tabular-nums tracking-tight">{String(value)}</div>
                        <div className="text-[9px] uppercase tracking-widest font-mono text-neutral-500 mt-0.5">{key}</div>
                    </div>
                ))}
            </div>

            {lastGame && (
                <div className="mt-5 pt-4 border-t border-white/[0.04]">
                    <div className="flex items-center gap-2 text-[10px] font-mono font-bold tracking-widest uppercase text-neutral-500 mb-2">
                        <Activity className="w-3 h-3" /> Last Game ({lastGame.date})
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {Object.entries(lastGame.stats || {}).map(([key, val]) => (
                            <span key={key} className="px-2 py-1 bg-white/[0.02] border border-white/[0.02] rounded text-[11px] font-mono text-neutral-400">
                                {key}: <strong className="text-white font-medium">{String(val)}</strong>
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
