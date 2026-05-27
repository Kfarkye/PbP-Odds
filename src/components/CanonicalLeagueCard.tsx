import React from 'react';
import { Globe } from 'lucide-react';

export const CanonicalLeagueCard: React.FC<{ data: any }> = ({ data }) => {
    if (!data) return null;

    const league = data.league || {};
    const standings = data.standings || [];
    const latestNews = data.latestNews || [];

    return (
        <div className="bg-[#050505] rounded-[24px] border border-white/[0.04] p-6 shadow-sm font-sans w-full max-w-2xl">
            <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-[12px] bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                    <Globe className="w-5 h-5 text-neutral-400" />
                </div>
                <div>
                    <h2 className="text-[20px] font-medium text-white/95 uppercase tracking-widest">{league.name || 'League Overview'}</h2>
                    <p className="text-[12px] text-neutral-500 mt-0.5 font-medium">{league.season || 'Current Season'} • {league.stage || 'Regular Season'}</p>
                </div>
            </div>

            {standings.length > 0 && (
                <div className="mb-6">
                    <h3 className="text-[10px] font-mono font-bold tracking-widest uppercase text-neutral-500 mb-3 border-b border-white/[0.04] pb-2">Top Standings</h3>
                    <div className="space-y-1">
                        {standings.slice(0, 5).map((team: any, i: number) => (
                            <div key={i} className="flex flex-wrap sm:flex-nowrap items-center justify-between py-2 px-3 hover:bg-white/[0.02] rounded-[8px] transition-colors group text-[13px]">
                                <div className="flex items-center gap-3">
                                    <span className="text-[11px] font-mono text-neutral-600 tabular-nums w-4 text-right group-hover:text-neutral-400">{i + 1}</span>
                                    <span className="font-medium text-white/90">{team.name}</span>
                                </div>
                                <div className="flex items-center gap-4 text-mono tabular-nums text-neutral-400">
                                    <span title="Wins">{team.wins}W</span>
                                    <span title="Losses">{team.losses}L</span>
                                    <span className="text-white/20">|</span>
                                    <span title="Win Percentage" className="w-10 text-right">
                                        {team.winPercentage ? (team.winPercentage * 100).toFixed(1) + '%' : '-'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {latestNews.length > 0 && (
                <div>
                    <h3 className="text-[10px] font-mono font-bold tracking-widest uppercase text-neutral-500 mb-3 border-b border-white/[0.04] pb-2">Key Headlines</h3>
                    <div className="space-y-3">
                        {latestNews.slice(0, 3).map((news: any, i: number) => (
                            <div key={i} className="pl-3 border-l-2 border-white/10">
                                <p className="text-[13px] text-white/80 leading-snug hover:text-white transition-colors cursor-pointer">{news.title}</p>
                                <span className="text-[10px] font-mono text-neutral-600 mt-1 block">{news.time}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
