import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Play, 
    Clock, 
    MonitorPlay, 
    Activity, 
    Share2, 
    Check, 
    ChevronLeft, 
    ChevronRight, 
    AlertCircle 
} from 'lucide-react';

// ============================================================================
// Types & Interfaces
// ============================================================================
export interface VideoItem {
    title: string;
    url: string;
    thumbnail?: string;
    author?: string;
    duration?: string;
}

export interface TelemetryEvent {
    eventName: 'IMAGE_FALLBACK_TRIGGERED' | 'IMAGE_LOAD_FAILURE' | 'SHARE_ACTION_EXECUTED' | 'PLAYBACK_STARTED' | 'QUEUE_NAVIGATION';
    metadata: Record<string, any>;
}

export interface YoutubeMediaCardProps {
    data: {
        videos: VideoItem[];
    };
    /**
     * Optional enterprise telemetry sink (e.g., Sentry, LogRocket, OpenTelemetry)
     */
    telemetrySink?: (event: TelemetryEvent) => void;
}

// ============================================================================
// Utilities
// ============================================================================
/**
 * Tight, battle-tested 11-character YouTube video ID extractor.
 * Enforces strict 11-character boundary matching across all standard and mobile formats.
 */
function extractYoutubeId(url: string): string | null {
    if (!url) return null;
    const regExp = /(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?|shorts)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regExp);
    return match ? match[1] : null;
}

// ============================================================================
// Internal Component: Self-Healing Safe Image with Telemetry Reporting
// ============================================================================
interface SafeThumbnailProps {
    src: string;
    alt: string;
    youtubeId: string | null;
    className?: string;
    priority?: boolean;
    telemetrySink?: (event: TelemetryEvent) => void;
}

const SafeThumbnail = React.memo(({ src, alt, youtubeId, className, priority = false, telemetrySink }: SafeThumbnailProps) => {
    const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
    const [currentSrc, setCurrentSrc] = useState(src);
    const [fallbackLevel, setFallbackLevel] = useState(0); // 0: Original, 1: HQ, 2: SD, 3: Error

    useEffect(() => {
        setCurrentSrc(src);
        setStatus('loading');
        setFallbackLevel(0);
    }, [src]);

    const handleImageError = useCallback(() => {
        if (!youtubeId) {
            setStatus('error');
            telemetrySink?.({
                eventName: 'IMAGE_LOAD_FAILURE',
                metadata: { errorType: 'NO_YOUTUBE_ID', src }
            });
            return;
        }

        // Self-Healing Progressive Resolution Downgrade
        if (fallbackLevel === 0) {
            setFallbackLevel(1);
            const fallbackSrc = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
            setCurrentSrc(fallbackSrc);
            telemetrySink?.({
                eventName: 'IMAGE_FALLBACK_TRIGGERED',
                metadata: { youtubeId, fallbackResolution: 'hqdefault', previousSrc: currentSrc }
            });
        } else if (fallbackLevel === 1) {
            setFallbackLevel(2);
            const fallbackSrc = `https://img.youtube.com/vi/${youtubeId}/sddefault.jpg`;
            setCurrentSrc(fallbackSrc);
            telemetrySink?.({
                eventName: 'IMAGE_FALLBACK_TRIGGERED',
                metadata: { youtubeId, fallbackResolution: 'sddefault', previousSrc: currentSrc }
            });
        } else {
            setStatus('error');
            telemetrySink?.({
                eventName: 'IMAGE_LOAD_FAILURE',
                metadata: { youtubeId, finalFallbackLevel: fallbackLevel }
            });
        }
    }, [youtubeId, fallbackLevel, currentSrc, src, telemetrySink]);

    return (
        <div className="relative w-full h-full overflow-hidden bg-neutral-950 rounded-[10px] border border-white/[0.04]">
            {/* Shimmering Skeleton Loader with AURA Institutional Hex Gradient */}
            {status === 'loading' && (
                <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-[#111113] to-[#050505] animate-pulse z-10" />
            )}
            
            {status !== 'error' ? (
                <img 
                    src={currentSrc} 
                    alt={alt}
                    className={`object-cover w-full h-full transition-opacity duration-500 ${
                        status === 'loaded' ? 'opacity-100' : 'opacity-0'
                    } ${className || ''}`}
                    onLoad={() => setStatus('loaded')}
                    onError={handleImageError}
                    loading={priority ? "eager" : "lazy"}
                    decoding="async"
                    referrerPolicy="no-referrer"
                />
            ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-950 p-4 text-center">
                    <AlertCircle className="w-5 h-5 text-neutral-700 mb-1.5" strokeWidth={1.5} />
                    <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-widest font-bold">Asset Offline</span>
                </div>
            )}
        </div>
    );
});
SafeThumbnail.displayName = 'SafeThumbnail';

// ============================================================================
// Primary Component: Hardened YoutubeMediaCard (Direct Stream Route)
// ============================================================================
export function YoutubeMediaCard({ data, telemetrySink }: YoutubeMediaCardProps) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [copied, setCopied] = useState(false);
    
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const videos = useMemo(() => data?.videos || [], [data]);
    const activeVideo = videos[activeIndex];

    const activeVideoId = useMemo(() => {
        if (!activeVideo?.url) return null;
        return extractYoutubeId(activeVideo.url);
    }, [activeVideo]);

    const resolvedThumbnail = useMemo(() => {
        if (activeVideo?.thumbnail) return activeVideo.thumbnail;
        return activeVideoId ? `https://img.youtube.com/vi/${activeVideoId}/maxresdefault.jpg` : '';
    }, [activeVideo, activeVideoId]);

    // Hardened Embed URL featuring iOS Autoplay bypass parameters
    const embedUrl = useMemo(() => {
        if (!activeVideoId) return '';
        const originUrl = typeof window !== 'undefined' ? window.location.origin : '';
        return `https://www.youtube-nocookie.com/embed/${activeVideoId}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1${
            originUrl ? `&origin=${encodeURIComponent(originUrl)}` : ''
        }`;
    }, [activeVideoId]);

    useEffect(() => {
        setCopied(false);
    }, [activeIndex]);

    // Decoupled, robust playlist scrolling using index-based data queries
    useEffect(() => {
        if (scrollContainerRef.current) {
            const activeItem = scrollContainerRef.current.querySelector(`[data-index="${activeIndex}"]`) as HTMLElement;
            if (activeItem) {
                activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }, [activeIndex]);

    const handlePlayRequest = useCallback(() => {
        setIsPlaying(true);
        telemetrySink?.({
            eventName: 'PLAYBACK_STARTED',
            metadata: { activeIndex, videoTitle: activeVideo?.title, youtubeId: activeVideoId }
        });
    }, [activeIndex, activeVideo, activeVideoId, telemetrySink]);

    const handleQueueSelect = useCallback((index: number) => {
        if (index === activeIndex) {
            setIsPlaying(prev => !prev);
            return;
        }
        setActiveIndex(index);
        setIsPlaying(true);
        telemetrySink?.({
            eventName: 'QUEUE_NAVIGATION',
            metadata: { targetIndex: index, navigationType: 'DIRECT_SELECT' }
        });
    }, [activeIndex, telemetrySink]);

    const handleNext = useCallback(() => {
        if (videos.length <= 1) return;
        setActiveIndex((prev) => (prev + 1) % videos.length);
        setIsPlaying(true);
        telemetrySink?.({
            eventName: 'QUEUE_NAVIGATION',
            metadata: { targetIndex: (activeIndex + 1) % videos.length, navigationType: 'SWIPE_NEXT' }
        });
    }, [videos.length, activeIndex, telemetrySink]);

    const handlePrev = useCallback(() => {
        if (videos.length <= 1) return;
        setActiveIndex((prev) => (prev - 1 + videos.length) % videos.length);
        setIsPlaying(true);
        telemetrySink?.({
            eventName: 'QUEUE_NAVIGATION',
            metadata: { targetIndex: (activeIndex - 1 + videos.length) % videos.length, navigationType: 'SWIPE_PREV' }
        });
    }, [videos.length, activeIndex, telemetrySink]);

    const handleShare = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!activeVideo?.url) return;

        const shareData = {
            title: activeVideo.title,
            text: `AURA Media Intelligence: ${activeVideo.title}`,
            url: activeVideo.url
        };

        try {
            if (navigator.share && navigator.canShare?.(shareData)) {
                await navigator.share(shareData);
                telemetrySink?.({
                    eventName: 'SHARE_ACTION_EXECUTED',
                    metadata: { type: 'NATIVE_SHARE_API', url: activeVideo.url }
                });
            } else {
                await navigator.clipboard.writeText(activeVideo.url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
                telemetrySink?.({
                    eventName: 'SHARE_ACTION_EXECUTED',
                    metadata: { type: 'CLIPBOARD_COPY_FALLBACK', url: activeVideo.url }
                });
            }
        } catch (err) {
            console.error('Failed to execute share actions', err);
        }
    }, [activeVideo, telemetrySink]);

    if (videos.length === 0 || !activeVideo) {
        return (
            <div className="w-full relative z-10 mb-8 mt-4 font-sans text-left bg-black border border-white/[0.04] rounded-[24px] p-8 text-center shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8),0_0_20px_rgba(255,255,255,0.02)] flex flex-col items-center justify-center min-h-[250px]">
                <MonitorPlay className="w-12 h-12 text-neutral-800 mb-4" strokeWidth={1} />
                <h3 className="text-[14px] font-mono text-neutral-300 uppercase tracking-wider mb-2">No Media Synced</h3>
                <p className="text-[12px] text-neutral-500 max-w-sm leading-relaxed">
                    AURA Substrate node reported zero active visual assets for the current query.
                </p>
            </div>
        );
    }

    return (
        <div className="w-full relative z-10 mb-8 mt-4 font-sans text-left animate-in fade-in duration-700 ease-[0.16,1,0.3,1]">
            <div className="bg-[#000000] rounded-[24px] overflow-hidden border border-white/[0.04] shadow-[0_24px_50px_rgba(0,0,0,0.6)]">
                
                {/* Structural Header */}
                <div className="px-6 py-4 border-b border-white/[0.04] bg-neutral-950 flex items-center justify-between select-none">
                    <div className="flex items-center gap-2.5">
                        <MonitorPlay className="w-4 h-4 text-neutral-400" strokeWidth={1.5} />
                        <h4 className="text-[11px] font-mono text-neutral-300 uppercase tracking-widest font-semibold">
                            Media Intelligence
                        </h4>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        {isPlaying ? (
                            <div className="flex items-center gap-2 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-[6px] animate-in fade-in duration-300">
                                <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
                                <span className="text-[9px] font-mono font-bold text-emerald-400 uppercase tracking-wider">Streaming</span>
                            </div>
                        ) : (
                            <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest tabular-nums lining-nums">
                                {videos.length} Item{videos.length !== 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                </div>

                {/* SOTA Performance Player Container */}
                <div className="w-full aspect-[16/9] relative bg-black overflow-hidden group border-b border-white/[0.04]">
                    <AnimatePresence mode="wait">
                        {!isPlaying ? (
                            <motion.div 
                                key="facade"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.3 }}
                                className="absolute inset-0 cursor-pointer"
                                onClick={handlePlayRequest}
                                role="button"
                                tabIndex={0}
                                aria-label={`Play video: ${activeVideo.title}`}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        handlePlayRequest();
                                    }
                                }}
                            >
                                <SafeThumbnail 
                                    src={resolvedThumbnail} 
                                    alt={activeVideo.title}
                                    youtubeId={activeVideoId}
                                    className="w-full h-full opacity-60 group-hover:opacity-100 group-hover:scale-[1.015] transition-all duration-700 ease-[0.16,1,0.3,1] grayscale-[0.2] group-hover:grayscale-0 transform-gpu"
                                    priority
                                    telemetrySink={telemetrySink}
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/30 opacity-90 pointer-events-none" />
                                
                                {/* Glassmorphic Play Button */}
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-black/50 backdrop-blur-xl border border-white/[0.04] flex items-center justify-center shadow-[0_12px_40px_rgba(0,0,0,0.6)] group-hover:bg-white/10 group-hover:border-white/[0.08] group-hover:scale-105 transition-all duration-500 ease-[0.16,1,0.3,1] group-active:scale-95">
                                        <Play className="w-6 h-6 sm:w-8 sm:h-8 text-white ml-1 fill-white" strokeWidth={1} />
                                    </div>
                                </div>

                                {/* Facade Duration Badge */}
                                {activeVideo.duration && (
                                    <div className="absolute bottom-4 right-4 bg-black/85 backdrop-blur-[60px] saturate-[1.2] px-2.5 py-1 rounded-[6px] border border-white/[0.04] pointer-events-none">
                                        <span className="text-[11px] font-mono text-white/90 tracking-wider tabular-nums lining-nums font-medium">
                                            {activeVideo.duration}
                                        </span>
                                    </div>
                                )}
                            </motion.div>
                        ) : activeVideoId ? (
                            <motion.iframe 
                                key={`iframe-${activeVideoId}`}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.5 }}
                                className="absolute inset-0 w-full h-full"
                                src={embedUrl}
                                title={activeVideo.title}
                                frameBorder="0" 
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                                allowFullScreen
                                referrerPolicy="strict-origin-when-cross-origin"
                            />
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 font-mono text-[11px] uppercase tracking-widest select-none p-4 text-center">
                                <AlertCircle className="w-8 h-8 text-rose-500 mb-3" strokeWidth={1.5} />
                                Video Payload Unresolvable
                            </div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Active Video Metadata & Control Actions */}
                <div className="px-6 py-6 flex flex-col md:flex-row md:items-start justify-between gap-4 bg-[#000000]">
                    <div className="flex-1 min-w-0 flex flex-col gap-2.5">
                        <h3 className="text-[18px] sm:text-[22px] font-semibold text-white/95 leading-[1.3] tracking-tight line-clamp-2">
                            {activeVideo.title}
                        </h3>
                        <div className="flex items-center gap-3 text-[11px] font-mono text-neutral-400 uppercase tracking-wider select-none">
                            <span className="text-neutral-200 font-semibold truncate">{activeVideo.author || 'Unknown Source'}</span>
                            {activeVideo.duration && (
                                <>
                                    <span className="text-neutral-700">•</span>
                                    <div className="flex items-center gap-1.5 tabular-nums lining-nums">
                                        <Clock className="w-3.5 h-3.5 opacity-70" />
                                        <span>{activeVideo.duration}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Interactive Navigation Controls */}
                    <div className="flex items-center gap-2 shrink-0 self-end md:self-start">
                        {videos.length > 1 && (
                            <div className="flex items-center bg-white/[0.03] border border-white/[0.04] rounded-[8px] p-0.5">
                                <button 
                                    onClick={handlePrev}
                                    className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/[0.05] rounded-[6px] transition-all outline-none focus-visible:ring-1 focus-visible:ring-white/20"
                                    title="Previous Video"
                                    aria-label="Previous Video"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <button 
                                    onClick={handleNext}
                                    className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/[0.05] rounded-[6px] transition-all outline-none focus-visible:ring-1 focus-visible:ring-white/20"
                                    title="Next Video"
                                    aria-label="Next Video"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                        
                        <button 
                            onClick={handleShare}
                            className={`flex items-center gap-2 px-3.5 py-2 rounded-[8px] border font-mono text-[10px] uppercase tracking-wider font-semibold transition-all duration-300 outline-none focus-visible:ring-1 focus-visible:ring-white/20 ${
                                copied 
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                                    : 'bg-white/[0.03] border-white/[0.04] text-neutral-300 hover:bg-white/[0.08] hover:text-white'
                            }`}
                            aria-label="Share video link"
                        >
                            {copied ? (
                                <>
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Copied</span>
                                </>
                            ) : (
                                <>
                                    <Share2 className="w-3.5 h-3.5" />
                                    <span>Share</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Stateful Playlist Queue */}
                {videos.length > 1 && (
                    <div className="border-t border-white/[0.04] bg-neutral-950">
                        <div className="px-6 py-4 border-b border-white/[0.04] flex items-center justify-between">
                            <h5 className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest select-none font-bold">
                                Playback Queue
                            </h5>
                            <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-wider">
                                {activeIndex + 1} of {videos.length}
                            </span>
                        </div>
                        <div 
                            ref={scrollContainerRef} 
                            className="flex flex-col divide-y divide-white/[0.04] max-h-[320px] overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-800 scrollbar-track-transparent"
                        >
                            {videos.map((video, idx) => {
                                const isActive = idx === activeIndex;
                                const queueVideoId = extractYoutubeId(video.url);
                                const queueThumbnail = video.thumbnail || (queueVideoId ? `https://img.youtube.com/vi/${queueVideoId}/hqdefault.jpg` : '');
                                
                                return (
                                    <button 
                                        key={`${video.url}-${idx}`} // Stable composite key preventing DOM state collisions
                                        data-index={idx} // Decoupled selector anchor
                                        onClick={() => handleQueueSelect(idx)}
                                        className={`flex items-start sm:items-center gap-4 p-4 sm:px-6 transition-all duration-300 outline-none focus-visible:bg-white/[0.05] text-left group ${
                                            isActive 
                                                ? 'bg-white/[0.03]' 
                                                : 'bg-transparent hover:bg-white/[0.015]'
                                        }`}
                                        style={{
                                            // Modern CSS engine optimization for hyper-scale lists (1,000+ items)
                                            contentVisibility: 'auto',
                                            containIntrinsicSize: '0 88px'
                                        }}
                                        aria-label={`Play ${video.title}`}
                                        aria-current={isActive ? 'true' : 'false'}
                                    >
                                        {/* Queue Thumbnail */}
                                        <div className="w-[120px] sm:w-[140px] aspect-video bg-black rounded-[10px] overflow-hidden relative shrink-0 border border-white/[0.04]">
                                            <SafeThumbnail 
                                                src={queueThumbnail} 
                                                alt={video.title} 
                                                youtubeId={queueVideoId}
                                                className={`w-full h-full transition-all duration-500 transform-gpu ${
                                                    isActive 
                                                        ? 'opacity-100 grayscale-0' 
                                                        : 'opacity-50 grayscale-[0.4] group-hover:opacity-90 group-hover:grayscale-0 group-hover:scale-105'
                                                }`} 
                                                telemetrySink={telemetrySink}
                                            />
                                            {video.duration && (
                                                <div className="absolute bottom-1.5 right-1.5 bg-black/85 backdrop-blur-[60px] saturate-[1.2] text-white/90 text-[9px] font-mono px-1.5 py-0.5 rounded-[4px] font-medium tabular-nums lining-nums border border-white/[0.04] pointer-events-none">
                                                    {video.duration}
                                                </div>
                                            )}
                                            {isActive && isPlaying && (
                                                <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
                                                    {/* Hardware-Accelerated Declarative Waveform Visualizer */}
                                                    <span className="flex gap-[3px] items-end h-3.5">
                                                        {[0.1, 0.3, 0.5, 0.2].map((delay, i) => (
                                                            <motion.span 
                                                                key={i}
                                                                className="w-0.5 bg-emerald-400 origin-bottom rounded-full"
                                                                style={{ height: '100%' }}
                                                                animate={{ scaleY: [0.3, 1, 0.3] }}
                                                                transition={{
                                                                    duration: 1,
                                                                    repeat: Infinity,
                                                                    ease: "easeInOut",
                                                                    delay
                                                                }}
                                                            />
                                                        ))}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        
                                        {/* Queue Metadata */}
                                        <div className="flex flex-col gap-1.5 min-w-0 flex-1 py-1">
                                            <h4 className={`text-[13px] font-medium leading-snug line-clamp-2 transition-colors ${
                                                isActive ? 'text-white' : 'text-neutral-400 group-hover:text-neutral-200'
                                            }`}>
                                                {video.title}
                                            </h4>
                                            <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest truncate">
                                                {video.author || 'Unknown Source'}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
