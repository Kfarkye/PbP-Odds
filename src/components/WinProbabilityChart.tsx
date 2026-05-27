import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts';
import { WinProbabilityArtifactData } from '../types/aura';
import { Activity } from 'lucide-react';

interface WinProbabilityChartProps {
    data: WinProbabilityArtifactData;
}

export function WinProbabilityChart({ data }: WinProbabilityChartProps) {
    const { homeTeam, awayTeam, probabilities } = data;
    
    // Add indices so that the chart scales properly on x-axis
    const chartData = probabilities.map((p, idx) => ({
        ...p,
        index: idx,
        homeWinPercentage: p.homeWinPercentage,
        awayWinPercentage: p.awayWinPercentage
    }));

    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8),0_0_20px_rgba(255,255,255,0.02)] p-5 mb-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-neutral-800/60">
                <div className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-neutral-400" />
                    <h4 className="text-sm font-semibold text-neutral-200">Live Win Probability</h4>
                </div>
            </div>

            <div className="flex justify-between items-center px-4 mb-4">
                <div className="flex items-center gap-3">
                   <img src={awayTeam.logo} className="w-8 h-8 object-contain" alt={awayTeam.name}/>
                   <span className="text-sm font-bold text-neutral-300" style={{ color: awayTeam.color }}>{awayTeam.abbreviation}</span>
                </div>
                <div className="flex items-center gap-3">
                   <span className="text-sm font-bold text-neutral-300" style={{ color: homeTeam.color }}>{homeTeam.abbreviation}</span>
                   <img src={homeTeam.logo} className="w-8 h-8 object-contain" alt={homeTeam.name}/>
                </div>
            </div>

            <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                        data={chartData}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                        <defs>
                            <linearGradient id="colorHome" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={homeTeam.color || '#fff'} stopOpacity={0.8}/>
                                <stop offset="95%" stopColor={homeTeam.color || '#fff'} stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorAway" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={awayTeam.color || '#fff'} stopOpacity={0}/>
                                <stop offset="95%" stopColor={awayTeam.color || '#fff'} stopOpacity={0.8}/>
                            </linearGradient>
                        </defs>
                        <XAxis 
                            dataKey="index" 
                            stroke="#525252" 
                            fontSize={10} 
                            tickFormatter={() => ''} 
                            tickLine={false} 
                            axisLine={false} 
                        />
                        <YAxis 
                            domain={[0, 100]} 
                            stroke="#525252" 
                            fontSize={10} 
                            tickFormatter={(value) => `${value}%`} 
                            tickLine={false} 
                            axisLine={false} 
                        />
                        <Tooltip 
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const dataInfo = payload[0].payload;
                                  return (
                                    <div className="bg-neutral-950 border border-neutral-800 p-3 rounded-lg shadow-[0_16px_40px_-8px_rgba(0,0,0,0.6),0_0_15px_rgba(255,255,255,0.015)] text-xs max-w-[200px]">
                                      <p className="text-neutral-300 mb-2 leading-relaxed">{dataInfo.playDescription}</p>
                                      <div className="flex flex-col gap-1 font-mono">
                                          <div className="flex justify-between" style={{ color: homeTeam.color || '#ccc' }}>
                                              <span>{homeTeam.abbreviation}</span>
                                              <span>{dataInfo.homeWinPercentage.toFixed(1)}%</span>
                                          </div>
                                          <div className="flex justify-between" style={{ color: awayTeam.color || '#ccc' }}>
                                              <span>{awayTeam.abbreviation}</span>
                                              <span>{dataInfo.awayWinPercentage.toFixed(1)}%</span>
                                          </div>
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                            }}
                        />
                        <ReferenceLine y={50} stroke="#404040" strokeDasharray="3 3" />
                        <Area 
                            type="monotone" 
                            dataKey="homeWinPercentage" 
                            stroke={homeTeam.color || '#fff'} 
                            fillOpacity={1} 
                            fill="url(#colorHome)" 
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
            
            <div className="flex justify-between text-[10px] font-mono uppercase tracking-widest text-neutral-500 mt-2 px-2">
                <span>Start</span>
                <span>Current</span>
            </div>
        </div>
    );
}
