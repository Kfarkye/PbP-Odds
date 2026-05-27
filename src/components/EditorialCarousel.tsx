import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // Changed to framer-motion for consistency
import { ChevronLeft, ChevronRight, Info, Eye, ExternalLink, Globe, CloudFog, Activity } from 'lucide-react'; // Added icons, removed Pin as it's not used in this component
import { Link, useNavigate } from 'react-router-dom';

// ============================================================================
// Types
// ============================================================================
export interface EditorialArticle {
  headline: string;
  summary: string;
  category?: string;
  image_url?: string;
  source?: string;
  source_url?: string; // Added for external news deep linking
  publishedAt?: number | string; // Added for consistent date display
}

interface EditorialCarouselProps {
  data: string;
}

const SPRING_TRANSITION = { type: "spring" as const, stiffness: 400, damping: 30 };
const EASE_TRANSITION = [0.16, 1, 0.3, 1];

// ============================================================================
// Source Theming Utilities (Dynamic Brand Mapping - Tailwind Safe)
// ============================================================================
const getSourceBrandStyling = (source?: string) => {
    const s = (source || '').toLowerCase();
    if (s.includes('espn')) return { bg: 'bg-[#CC0000]', text: 'text-[#CC0000]', border: 'border-[#CC0000]/20', glow: 'group-hover:from-[#CC0000]/15', hoverBorder: 'group-hover:border-[#CC0000]/50' };
    if (s.includes('yahoo')) return { bg: 'bg-[#7B0099]', text: 'text-[#B040E0]', border: 'border-[#7B0099]/20', glow: 'group-hover:from-[#7B0099]/20', hoverBorder: 'group-hover:border-[#7B0099]/50' };
    if (s.includes('aura')) return { bg: 'bg-[#4285F4]', text: 'text-[#4285F4]', border: 'border-[#4285F4]/20', glow: 'group-hover:from-[#4285F4]/15', hoverBorder: 'group-hover:border-[#4285F4]/50' };
    return { bg: 'bg-white', text: 'text-white', border: 'border-white/[0.04]', glow: 'group-hover:from-white/10', hoverBorder: 'group-hover:border-white/20' };
};

// ============================================================================
// Institutional Image Loader (Vignette & Grayscale Scoping) - REFINED
// ============================================================================
const SafeImage = React.memo(({ src, alt, containerClassName, imageClassName, priority = false }: { src: string; alt: string; containerClassName?: string; imageClassName?: string; priority?: boolean; }) => {
    const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

    if (status === 'error' || !src) {
        return (
            <div className={`bg-neutral-900 flex flex-col items-center justify-center border border-white/[0.04] ${containerClassName || ''}`} aria-hidden="true">
                <CloudFog className="w-5 h-5 text-neutral-800 mb-1.5" />
                <span className="text-[9px] font-mono uppercase tracking-widest text-neutral-600 font-bold">Asset Offline</span>
            </div>
        );
    }

    return (
        <div className={`relative overflow-hidden bg-neutral-950 border border-white/[0.04] ${containerClassName || ''}`} aria-busy={status === 'loading'}>
            {status === 'loading' && (
                <div className="absolute inset-0 bg-neutral-900 overflow-hidden pointer-events-none z-10" aria-hidden="true">
                    <motion.div 
                        className="absolute inset-0 w-[200%] h-full bg-gradient-to-r from-transparent via-white/[0.03] to-transparent -skew-x-12"
                        animate={{ x: ['-100%', '100%'] }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                    />
                </div>
            )}
            <motion.img 
                src={src} 
                alt={alt} 
                referrerPolicy="no-referrer"
                className={`w-full h-full object-cover transform-gpu will-change-[transform,opacity] transition-all duration-1000 ease-[0.16,1,0.3,1] ${status === 'loaded' ? 'opacity-100 scale-100' : 'opacity-0 scale-[1.03]'} ${imageClassName || ''}`}
                onLoad={() => setStatus('loaded')} 
                onError={() => setStatus('error')}
                loading={priority ? "eager" : "lazy"} 
                decoding="async"
            />
            {/* Ambient Vignette Mask for Text Readability */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.6)_100%)] pointer-events-none mix-blend-multiply opacity-60 z-[5]" />
        </div>
    );
});
SafeImage.displayName = 'SafeImage';

// ============================================================================
// Internal Sub-Component: Article Card - REFINED
// ============================================================================
const EditorialArticleCard = React.memo(({ article }: { article: EditorialArticle }) => {
    const navigate = useNavigate();
    const [isExpanded, setIsExpanded] = useState(false);
    
    // Generate a safe fallback slug based on the headline if an ID is missing
    const storySlug = useMemo(() => {
        return article.headline.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'unknown-story';
    }, [article.headline]);

    // Determine if the summary should even have a "Read More" button
    const isLongSummary = article.summary && article.summary.length > 120;

    const publishedDate = useMemo(() => {
        if (!article.publishedAt) return '';
        const d = new Date(article.publishedAt);
        const diffHrs = Math.floor((Date.now() - d.getTime()) / 3600000);
        if (diffHrs < 24) return `${diffHrs}h ago`;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }, [article.publishedAt]);

    const sourceStyling = getSourceBrandStyling(article.source);
    const isExternalNews = article.source && (article.source.toLowerCase().includes('espn') || article.source.toLowerCase().includes('yahoo'));

    return (
        <motion.article 
            layout // Enable layout animations for Framer Motion
            initial={{ opacity: 0, x: 50, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -50, scale: 0.95 }}
            transition={SPRING_TRANSITION}
            className="flex flex-col min-w-[85%] sm:min-w-[340px] max-w-[340px] snap-center sm:snap-start overflow-hidden rounded-[24px] bg-neutral-900/60 backdrop-blur-[60px] saturate-[1.2] border border-white/[0.04] transition-all duration-300 hover:bg-neutral-900/80 group relative shadow-lg"
        >
            {/* Cinematic Image Frame - Wrapped as Link */}
            {article.image_url && (
                <div className="h-48 w-full overflow-hidden relative bg-neutral-950 border-b border-white/[0.02]">
                    <SafeImage src={article.image_url} alt={article.headline} containerClassName="absolute inset-0 z-0 border-none" imageClassName={`opacity-80 group-hover:opacity-100 grayscale-[0.2] group-hover:grayscale-0 transition-all duration-700 scale-[1.01] group-hover:scale-[1.04]`} />
                    
                    {article.category && (
                        <div className="absolute top-4 left-4 z-20">
                            <span className="px-3 py-1.5 bg-black/70 backdrop-blur-[60px] saturate-[1.2] rounded-[6px] border border-white/[0.1] text-[10px] font-bold text-white uppercase tracking-widest select-none shadow-sm flex items-center gap-2">
                                {isExternalNews ? <Globe className={`w-3.5 h-3.5 ${sourceStyling.text}`} /> : <Activity className="w-3.5 h-3.5 text-blue-400" />}
                                {article.category}
                            </span>
                        </div>
                    )}
                </div>
            )}
            
            {/* Content Body */}
            <div className={`p-6 flex flex-col flex-1 relative z-10 ${article.image_url ? '' : 'pt-8'}`}>
                {!article.image_url && article.category && (
                    <div className="mb-4">
                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest select-none">
                            {article.category}
                        </span>
                    </div>
                )}
                
                <Link to={`/story/${storySlug}`} className="block mb-3">
                    <h4 className="text-[18px] font-medium text-white leading-[1.35] tracking-tight group-hover:text-white transition-colors duration-300">
                        {article.headline}
                    </h4>
                </Link>

                <div className="mb-6 flex-1">
                    <p className={`text-[14px] text-neutral-400 leading-relaxed font-normal transition-all duration-300 ${isExpanded ? '' : 'line-clamp-3'}`}>
                        {article.summary}
                    </p>
                    {isLongSummary && (
                        <button 
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsExpanded(!isExpanded); }}
                            className="mt-3 text-blue-400 hover:text-blue-300 text-[11px] font-medium tracking-wider uppercase transition-colors py-1 select-none flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40 rounded-sm"
                        >
                            {isExpanded ? 'Show Less' : 'Read More'}
                            <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`} />
                        </button>
                    )}
                </div>

                {/* Footer Data */}
                <div className="mt-auto flex items-center justify-between pt-5 border-t border-white/[0.04]">
                    <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${sourceStyling.bg} group-hover:scale-110 transition-transform duration-300`} />
                        <span className={`text-[10px] font-mono font-bold ${sourceStyling.text} uppercase tracking-widest select-none`}>
                            {article.source || 'Aura Protocol'}
                        </span>
                    </div>
                    {publishedDate && (
                        <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest select-none">
                            {publishedDate}
                        </span>
                    )}
                </div>
            </div>
        </motion.article>
    );
});
EditorialArticleCard.displayName = 'EditorialArticleCard';


// ============================================================================
// Primary Component
// ============================================================================
export function EditorialCarousel({ data }: EditorialCarouselProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true); // Assume can scroll right initially

  // Defensive Parsing: Memoized to prevent re-evaluation on parent renders
  const parsedArticles = useMemo<EditorialArticle[]>(() => {
    try {
      if (!data) return [];
      let cleanData = data.trim();
      if (cleanData.startsWith('```json')) cleanData = cleanData.replace(/^```json/, '');
      if (cleanData.startsWith('```')) cleanData = cleanData.replace(/^```/, '');
      if (cleanData.endsWith('```')) cleanData = cleanData.replace(/```$/, '');
      cleanData = cleanData.trim();
      
      const parsed = JSON.parse(cleanData);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('[AURA:UI] Editorial Carousel block contains text or conversational analysis rather than strict JSON. Rendering as standard text.');
      return [];
    }
  }, [data]);

  const checkScrollability = useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth);
    }
  }, []);

  useEffect(() => {
    // Initial check and re-check on resize or data change
    checkScrollability();
    const handleResize = () => checkScrollability();
    window.addEventListener('resize', handleResize);
    // Also re-check if parsedArticles changes (e.g., new data arrives)
    // This is important because scrollWidth/clientWidth might change if content changes
    const observer = new MutationObserver(checkScrollability);
    if (scrollContainerRef.current) {
        observer.observe(scrollContainerRef.current, { childList: true, subtree: true });
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, [parsedArticles, checkScrollability]);


  const handleScroll = (direction: 'left' | 'right') => {
      if (scrollContainerRef.current) {
          const scrollAmount = 360; // Card width (340) + gap (20)
          scrollContainerRef.current.scrollBy({
              left: direction === 'left' ? -scrollAmount : scrollAmount,
              behavior: 'smooth'
          });
          // Small delay to allow scroll to complete before re-checking
          setTimeout(checkScrollability, 350); 
      }
  };

  if (parsedArticles.length === 0) {
      if (data && data.trim().length > 0) {
          return (
              <div className="bg-neutral-950 p-6 rounded-[24px] overflow-x-auto border border-white/[0.04] text-[12px] leading-[1.65] font-mono text-neutral-300 m-0 shadow-inner whitespace-pre-wrap">
                  {data}
              </div>
          );
      }
      return null;
  }

  return (
    <div className="w-full my-12 font-sans relative group/carousel">
        
        {/* Institutional Header */}
        <div className="mb-6 flex items-center justify-between border-b border-white/[0.04] pb-3 px-1">
            <h3 className="text-[11px] font-bold text-neutral-400 tracking-widest uppercase select-none">
                Trending Storylines
            </h3>
            
            <div className="flex items-center gap-4">
                <span className="text-[10px] font-mono text-neutral-600 tracking-widest uppercase select-none tabular-nums hidden sm:block">
                    {parsedArticles.length} Updates
                </span>
                
                {/* Desktop Navigation Buttons - REFINED */}
                <div className="hidden sm:flex items-center gap-1">
                    <motion.button 
                        onClick={() => handleScroll('left')}
                        disabled={!canScrollLeft}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        transition={SPRING_TRANSITION}
                        className="p-2 rounded-full bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white transition-colors duration-200 disabled:opacity-30 disabled:hover:bg-neutral-800 disabled:text-neutral-500"
                        aria-label="Previous story"
                    >
                        <ChevronLeft size={18} strokeWidth={1.5} />
                    </motion.button>
                    <motion.button 
                        onClick={() => handleScroll('right')}
                        disabled={!canScrollRight}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        transition={SPRING_TRANSITION}
                        className="p-2 rounded-full bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white transition-colors duration-200 disabled:opacity-30 disabled:hover:bg-neutral-800 disabled:text-neutral-500"
                        aria-label="Next story"
                    >
                        <ChevronRight size={18} strokeWidth={1.5} />
                    </motion.button>
                </div>
            </div>
        </div>
        
        {/* Native CSS Snap Carousel */}
        <div className="relative -mx-6 px-6 sm:mx-0 sm:px-0">
            <div 
                ref={scrollContainerRef}
                onScroll={checkScrollability} // Check scrollability on scroll
                className="flex gap-5 overflow-x-auto snap-x snap-mandatory pt-2 pb-8 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                role="region"
                aria-label="Editorial Stories"
            >
                <AnimatePresence mode="popLayout">
                    {parsedArticles.map((article, idx) => (
                        <EditorialArticleCard key={article.headline + idx} article={article} /> // Unique key
                    ))}
                </AnimatePresence>
            </div>
        </div>
        
        {/* Subtle helper text */}
        {parsedArticles.length > 0 && (
            <div className="text-center mt-4 opacity-50 select-none">
                <span className="text-[10px] text-neutral-500 font-mono font-bold uppercase tracking-widest">
                    Scroll Horizontally for More
                </span>
            </div>
        )}
    </div>
  );
}

