import { PlayerPropArtifactData } from '../types/aura';
import { User, ClipboardList } from 'lucide-react';

interface PlayerPropProgressProps {
    data: PlayerPropArtifactData;
}

export function PlayerPropProgress({ data }: PlayerPropProgressProps) {
    const { props } = data;

    return (
        <div className="bg-[#151517]/40 backdrop-blur-3xl border border-white/[0.04] rounded-[28px] overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.15)] p-6 mb-6 select-none animate-in fade-in slide-in-from-bottom-4 duration-700">
             <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/[0.04]">
                 <div className="flex items-center gap-2.5">
                     <ClipboardList className="h-4.5 w-4.5 text-[#34C759] shadow-[0_0_12px_rgba(52,199,89,0.3)]" />
                     <h4 className="text-[13px] font-semibold text-neutral-200 tracking-wider uppercase">Player Props Tracker</h4>
                 </div>
             </div>

             <div className="flex flex-col gap-6">
                 {props.map((prop, idx) => {
                     const isOver = prop.currentValue > prop.propLine;
                     const progressPct = Math.min((prop.currentValue / prop.propLine) * 100, 100);
                     const barColor = isOver ? 'bg-[#34C759]' : 'bg-[#FF9500]';

                     return (
                         <div key={idx} className="flex flex-col gap-4">
                             <div className="flex justify-between items-center">
                                 <div className="flex items-center gap-3.5">
                                     <div className="w-11 h-11 rounded-full bg-white/[0.02] overflow-hidden border border-white/[0.04] relative">
                                         {prop.headshot ? (
                                            <img src={prop.headshot} alt={prop.playerName} className="w-full h-full object-cover object-top" referrerPolicy="no-referrer" />
                                         ) : (
                                            <User className="w-full h-full p-2.5 text-neutral-500" />
                                         )}
                                     </div>
                                     <div className="flex flex-col">
                                         <span className="text-[15px] font-semibold text-white/95">{prop.playerName}</span>
                                         <span className="text-[9px] font-mono text-neutral-400 uppercase tracking-widest">{prop.teamAbbreviation} • {prop.statName}</span>
                                     </div>
                                 </div>
                                 
                                 <div className="flex items-center gap-2 select-none">
                                     <div className="flex flex-col items-center bg-white/[0.02] py-1 px-2.5 rounded-[10px] border border-white/[0.04]">
                                         <span className="text-[8px] font-mono text-neutral-500 font-bold tracking-widest uppercase">Over</span>
                                         <span className="text-[12px] font-sans font-medium text-white/90 leading-tight mt-0.5">{prop.overPrice}</span>
                                     </div>
                                     <div className="flex flex-col items-center bg-white/[0.02] py-1 px-2.5 rounded-[10px] border border-white/[0.04]">
                                         <span className="text-[8px] font-mono text-neutral-500 font-bold tracking-widest uppercase">Under</span>
                                         <span className="text-[12px] font-sans font-medium text-white/90 leading-tight mt-0.5">{prop.underPrice}</span>
                                     </div>
                                 </div>
                             </div>

                             <div className="flex items-center gap-4 w-full pl-14">
                                 <div className="flex-1 bg-black/45 h-3 rounded-full overflow-hidden border border-white/[0.04] shadow-inner relative">
                                     <div 
                                         className={`h-full ${barColor} transition-all duration-1000 ease-[0.16,1,0.3,1] shadow-[0_0_8px_rgba(255,255,255,0.05)]`} 
                                         style={{ 
                                             width: `${progressPct}%`, 
                                             backgroundColor: isOver ? undefined : (prop.teamColor || '#FF9500')
                                         }} 
                                     />
                                 </div>
                                 <div className="w-16 text-right text-xs font-mono select-none">
                                     <span className={isOver ? "text-[#34C759] font-semibold" : "text-white/80"}>
                                         {prop.currentValue}
                                     </span>
                                     <span className="text-neutral-500"> / {prop.propLine}</span>
                                 </div>
                             </div>
                         </div>
                     );
                 })}
                 {props.length === 0 && (
                     <div className="text-center p-6 bg-white/[0.01] border border-white/[0.04] border-dashed rounded-[16px] text-neutral-500 text-xs">
                         No player props available for this event yet.
                     </div>
                 )}
             </div>
         </div>
     );
}
