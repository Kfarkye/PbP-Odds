import React from 'react';
import { Shield, TrendingUp, Trophy, Users } from 'lucide-react';
import { CanonicalTeam } from '../types/canonical';

export const CanonicalTeamCard: React.FC<{ data: any }> = ({ data }) => {
    if (!data) return null;

    const team: CanonicalTeam = data.team;
    const stats = data.stats || {};
    const recentForm = data.recentForm || [];

    return (
        <div className="bg-[#050505] rounded-[24px] border border-white/[0.04] p-6 shadow-sm font-sans flex flex-col gap-6 sm:max-w-md w-full relative overflow-hidden group">
            {/* Background Glow */}
            {team?.primaryColorHex && (
                <div 
                    className="absolute -top-12 -right-12 w-32 h-32 blur-[60px] opacity-10 pointer-events-none group-hover:opacity-20 transition-opacity duration-700 rounded-full"
                    style={{ backgroundColor: team.primaryColorHex }}
                />
            )}
            
            <div className="flex items-start justify-between relative z-10">
                <div className="flex items-center gap-4">
                    {team?.logo ? (
                        <img src={team.logo} alt={team.name} className="w-12 h-12 rounded-full object-cover bg-white/5 border border-white/5 p-1.5" />
                    ) : (
                        <div className="w-12 h-12 rounded-full bg-white/5 border border-white/5 flex items-center justify-center">
                            <Shield className="w-5 h-5 text-white/40" />
                        </div>
                    )}
                    <div>
                        <h3 className="text-white font-medium text-[16px] tracking-tight">{team?.name || 'Unknown Team'}</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-neutral-500">{team?.abbreviation}</span>
                            {team?.location && (
                                <>
                                    <span className="text-white/10">•</span>
                                    <span className="text-[11px] text-neutral-400">{team.location}</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                
                <div className="text-right">
                    <div className="text-[20px] font-bold tracking-tight text-white/95 tabular-nums">
                        {stats.wins || 0}-{stats.losses || 0}
                    </div>
                    <div className="text-[10px] font-mono tracking-widest text-neutral-500 uppercase mt-0.5">
                        {stats.standing || 'Unranked'}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 relative z-10">
                <div className="bg-white/5 rounded-[12px] p-3 border border-white/[0.02]">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-widest text-neutral-500 mb-1">
                        <TrendingUp className="w-3 h-3" /> Streak
                    </div>
                    <div className="text-white font-medium text-[14px]">
                        {stats.streak ? `${stats.streak > 0 ? 'W' : 'L'}${Math.abs(stats.streak)}` : 'N/A'}
                    </div>
                </div>
                <div className="bg-white/5 rounded-[12px] p-3 border border-white/[0.02]">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-widest text-neutral-500 mb-1">
                        <Trophy className="w-3 h-3" /> Win %
                    </div>
                    <div className="text-white font-medium text-[14px]">
                        {stats.winPercentage ? (stats.winPercentage * 100).toFixed(1) + '%' : 'N/A'}
                    </div>
                </div>
            </div>

            {recentForm.length > 0 && (
                <div className="pt-2 border-t border-white/[0.04] relative z-10">
                    <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-neutral-500 mb-3">Recent Form</div>
                    <div className="flex items-center gap-2">
                        {recentForm.map((match: any, i: number) => (
                            <div 
                                key={i} 
                                className={`flex-1 h-1.5 rounded-full ${match === 'W' ? 'bg-[#34C759]' : match === 'L' ? 'bg-[#FF3B30]' : 'bg-white/20'}`} 
                                title={match}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
