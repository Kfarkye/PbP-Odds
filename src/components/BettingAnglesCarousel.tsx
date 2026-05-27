import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// ============================================================================
// Types
// ============================================================================
export interface BettingAngle {
  title: string;
  description: string;
  edge?: string;
  odds?: string;
  recommendation?: string;
  image_url?: string;
}

interface BettingAnglesListProps {
  data: string;
}

// ============================================================================
// Internal Sub-Component: Safe Image Handler
// Prevents DOM mutations and React hydration errors on image 404s
// ============================================================================
const AngleImage = React.memo(({ src, alt }: { src: string; alt: string }) => {
    const [hasError, setHasError] = useState(false);

    if (hasError || !src) {
        return <div className="h-full w-full bg-white/[0.02]" />;
    }

    return (
        <img 
            src={src} 
            alt={alt}
            className="w-full h-full object-cover grayscale-[0.3] opacity-80 transition-all duration-700 group-hover:grayscale-0 group-hover:opacity-100"
            onError={() => setHasError(true)}
            loading="lazy"
            decoding="async"
        />
    );
});
AngleImage.displayName = 'AngleImage';

// ============================================================================
// Primary Component
// ============================================================================
export function BettingAnglesCarousel({ data }: BettingAnglesListProps) {
  // Defensive Parsing: Memoized to prevent re-evaluation on parent renders
  const parsedAngles = useMemo<BettingAngle[]>(() => {
    try {
      if (!data) return [];
      let cleanData = data.trim();
      // Remove any nested markdown code block syntax if the LLM hallucinated it
      if (cleanData.startsWith('```json')) cleanData = cleanData.replace(/^```json/, '');
      if (cleanData.startsWith('```')) cleanData = cleanData.replace(/^```/, '');
      if (cleanData.endsWith('```')) cleanData = cleanData.replace(/```$/, '');
      cleanData = cleanData.trim();
      
      const parsed = JSON.parse(cleanData);
      return Array.isArray(parsed) ? parsed : (parsed?.angles && Array.isArray(parsed.angles) ? parsed.angles : []);
    } catch (e) {
      console.warn('[AURA:UI] Betting Angles block contains text or conversational analysis rather than strict JSON. Rendering as standard text.');
      return [];
    }
  }, [data]);

  const [angles, setAngles] = useState<BettingAngle[]>(parsedAngles);
  const [pinned, setPinned] = useState<Record<number, boolean>>({});

  if (angles.length === 0) {
      if (data && data.trim().length > 0) {
          return (
              <div className="bg-[#050505] p-6 rounded-[24px] overflow-x-auto border border-white/[0.04] text-[12px] leading-[1.65] font-mono text-neutral-300 m-0 shadow-inner whitespace-pre-wrap">
                  {data}
              </div>
          );
      }
      return null;
  }

  const togglePin = (idx: number) => {
    setPinned(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleDismiss = (idx: number) => {
    setAngles(prev => prev.filter((_, i) => i !== idx));
    setPinned(prev => {
        const newPinned = { ...prev };
        delete newPinned[idx];
        return newPinned; 
    });
  };

  // Sort pinned items to the front of the line
  const sortedIndices = angles.map((_, i) => i).sort((a, b) => {
      if (pinned[a] && !pinned[b]) return -1;
      if (!pinned[a] && pinned[b]) return 1;
      return a - b;
  });

  return (
    <div className="w-full my-12 font-sans overflow-hidden">
        
        {/* Institutional Header */}
        <div className="mb-6 flex items-center justify-between border-b border-white/[0.04] pb-3 px-1">
            <h3 className="text-[11px] font-medium text-neutral-500 tracking-widest uppercase select-none">
                Identified Value
            </h3>
            <span className="text-[10px] font-mono text-neutral-600 tracking-widest uppercase select-none tabular-nums">
                {angles.length} Positions
            </span>
        </div>
        
        {/* Native CSS Snap Carousel */}
        <div className="relative -mx-6 px-6 sm:mx-0 sm:px-0">
            <div 
                className="flex gap-5 overflow-x-auto snap-x snap-mandatory pb-8 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                role="region"
                aria-label="Betting Angles"
            >
                <AnimatePresence mode="popLayout">
                    {sortedIndices.map((idx) => {
                        const angle = angles[idx];
                        const isPinned = pinned[idx];
                        
                        return (
                            <motion.article 
                                layout
                                key={`${angle.title}-${angle.odds}-${idx}`}
                                initial={{ opacity: 0, scale: 0.98, x: 20 }}
                                animate={{ opacity: 1, scale: 1, x: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: -40, filter: 'blur(10px)' }}
                                transition={{ 
                                    duration: 0.5, 
                                    type: "spring", 
                                    bounce: 0.2,
                                    layout: { duration: 0.4 }
                                }}
                                drag="y" // Changed to vertical drag so horizontal scrolling works flawlessly
                                dragConstraints={{ top: 0, bottom: 0 }}
                                dragElastic={0.2}
                                onDragEnd={(_, { offset }) => {
                                    if (offset.y < -60 || offset.y > 60) {
                                        handleDismiss(idx);
                                    }
                                }}
                                className={`relative flex flex-col min-w-[85%] sm:min-w-[340px] max-w-[340px] snap-center sm:snap-start overflow-hidden rounded-[16px] backdrop-blur-[60px] saturate-[1.2] transition-colors duration-500 group cursor-grab active:cursor-grabbing
                                    ${isPinned 
                                        ? 'bg-white/[0.04] border border-white/[0.04] shadow-[0_8px_30px_rgba(0,0,0,0.2)]' 
                                        : 'bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.03]'
                                    }`}
                            >
                                {/* Minimalist Pin Button (Replaced Lucide with inline SVG) */}
                                <button 
                                    onClick={() => togglePin(idx)}
                                    className={`absolute top-4 right-4 p-2 rounded-full transition-colors duration-300 z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 outline-none
                                        ${isPinned 
                                            ? 'text-neutral-200 bg-white/10' 
                                            : 'text-neutral-500 bg-transparent hover:bg-white/5 hover:text-neutral-300'
                                        }`}
                                    aria-label={isPinned ? "Unpin position" : "Pin position"}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill={isPinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="12" y1="17" x2="12" y2="22"></line>
                                        <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
                                    </svg>
                                </button>

                                <div className="p-6 flex flex-col h-full relative z-10">
                                    
                                    {/* Header Section */}
                                    <div className="flex items-start gap-4 mb-5 pr-8">
                                        {angle.image_url && (
                                            <div className="h-10 w-10 rounded-full overflow-hidden shrink-0 border border-white/[0.04] bg-[#0a0a0a] flex items-center justify-center">
                                                <AngleImage src={angle.image_url} alt={angle.title} />
                                            </div>
                                        )}
                                        <div className="flex flex-col justify-center pt-0.5">
                                            <h4 className="text-[16px] font-medium text-neutral-100 leading-[1.3] tracking-tight group-hover:text-white transition-colors duration-300">
                                                {angle.title}
                                            </h4>
                                        </div>
                                    </div>

                                    {/* Analysis Copy */}
                                    <p className="text-[14px] text-neutral-400 leading-relaxed mb-8 font-normal flex-1">
                                        {angle.description}
                                    </p>

                                    {/* Footer / Data Block */}
                                    <div className="flex flex-col gap-4 mt-auto pt-5 border-t border-white/[0.04]">
                                        
                                        <div className="flex items-center justify-between">
                                            {angle.odds && (
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-[9px] font-medium text-neutral-600 uppercase tracking-widest select-none">Line</span>
                                                    <span className="text-[14px] font-mono font-medium text-neutral-200 tabular-nums tracking-wide">
                                                        {angle.odds}
                                                    </span>
                                                </div>
                                            )}
                                            {angle.edge && (
                                               <div className="flex flex-col gap-1 text-right">
                                                   <span className="text-[9px] font-medium text-neutral-600 uppercase tracking-widest select-none">Variance</span>
                                                   <span className="text-[12px] font-medium text-neutral-300 uppercase tracking-widest">
                                                       {angle.edge}
                                                   </span>
                                               </div>
                                            )}
                                        </div>
                                        
                                        {angle.recommendation && (
                                            <div className="mt-2 flex items-center justify-between">
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-[9px] text-neutral-600 font-medium tracking-widest uppercase select-none">Target Position</span>
                                                    <span className="text-[14px] font-medium text-neutral-200 leading-tight">
                                                        {angle.recommendation}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                </div>
                            </motion.article>
                        );
                    })}
                </AnimatePresence>
            </div>
        </div>
        
        {/* Subtle helper text */}
        {angles.length > 0 && (
            <div className="text-center mt-2 opacity-40 select-none">
                <span className="text-[10px] text-neutral-500 font-medium tracking-widest uppercase">
                    Swipe Vertically to Dismiss
                </span>
            </div>
        )}
    </div>
  );
}
