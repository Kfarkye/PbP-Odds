import React, { useState, useRef, useEffect, useCallback, useMemo, useLayoutEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useParams, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { 
    CloudFog, AlertCircle, ArrowLeft, Activity, Copy, Check, ExternalLink, Sparkles, Globe,
    Search, Send, ShieldCheck, Calendar as CalendarIcon, Camera, X, TrendingUp, Zap, Link as LinkIcon, ChevronRight,
    Bot, Filter, MessageSquare, PlusCircle, Plus, BookOpen, FileText, FileSpreadsheet, Lock, Clock, User as UserIcon, Mic,
    ArrowDown, Terminal, TerminalSquare, Code2
} from 'lucide-react'; 
import Markdown, { Components } from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence, useScroll, useSpring, useTransform } from 'framer-motion';

// Core Services & Types
import { AuraArtifact, AuraChatMessage, AuraHistoryMessage } from './types/aura';
import { initAuth, googleSignIn, logout } from './firebase';

// Component Ecosystem
import { SportsCalendar } from './components/SportsCalendar';
import { WinProbabilityChart } from './components/WinProbabilityChart';
import { PlayerPropProgress } from './components/PlayerPropProgress';
import { LiveSofaScoreWidget } from './components/LiveSofaScoreWidget';
import { CanonicalTeamCard } from './components/CanonicalTeamCard';
import { CanonicalPlayerCard } from './components/CanonicalPlayerCard';
import { CanonicalLeagueCard } from './components/CanonicalLeagueCard';
import { GithubConnectionBlueprint } from './components/GithubConnectionBlueprint';
import { FirebaseConnectionBlueprint } from './components/FirebaseConnectionBlueprint';
import { MarkdownChart } from './components/MarkdownChart';
import { BettingAnglesCarousel } from './components/BettingAnglesCarousel';
import { EditorialCarousel } from './components/EditorialCarousel';
import { AnalyticalMasterclass } from './components/AnalyticalMasterclass';
import { YoutubeMediaCard } from './components/YoutubeMediaCard';
import { SEO } from './components/SEO';
import { WorkspaceOrchestrationBlueprint } from './components/WorkspaceOrchestrationBlueprint';
import { EmailMimeViewer } from './components/EmailMimeViewer';
import { KalshiMcpBlueprint } from './components/KalshiMcpBlueprint';
import { WorkspaceMutationCard } from './components/WorkspaceMutationCard';
import { DriveDocumentViewer, DriveDocumentData } from './components/DriveDocumentViewer'; 
import { LiveQuantTerminal } from './components/LiveQuantTerminal';

import { Navigation } from './components/Navigation';
import { MessageCopyButton, CopyButton } from './components/MessageCopyButton';

// ============================================================================
// Core Interfaces
// ============================================================================
export interface FeedCard {
    id: string; slug?: string; type: 'EDITORIAL' | 'PREDICTION_MARKET' | 'EXTERNAL_NEWS'; 
    priority: string; category?: string;
    headline: string; summary: string; image_url?: string; source?: string; source_url?: string;
    publishedAt: number | string; metadata?: Record<string, any>;
    editorial_copy?: string; ai_analysis?: string; betting_angle?: string;
    factual_claims?: { claim: string; source_entity: string }[];
    live_game_id?: string;
}

export type SubdomainTab = 'sports' | 'workspace' | 'kalshi';

const SPRING_TRANSITION = { type: "spring" as const, stiffness: 400, damping: 30 };
const EASE_TRANSITION: [number, number, number, number] = [0.16, 1, 0.3, 1];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB limit for image uploads

const generateId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// ============================================================================
// Institutional Image Loader (Vignette & Grayscale Scoping)
// ============================================================================
const SafeImage = React.memo(({ src, alt, containerClassName, imageClassName, priority = false, kenBurns = false }: { src: string; alt: string; containerClassName?: string; imageClassName?: string; priority?: boolean; kenBurns?: boolean; }) => {
    const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

    if (status === 'error' || !src) {
        return (
            <div className={`bg-[#050505] flex flex-col items-center justify-center border border-white/[0.04] ${containerClassName || ''}`} aria-hidden="true">
                <CloudFog className="w-5 h-5 text-neutral-800 mb-1.5" />
                <span className="text-[9px] font-mono uppercase tracking-widest text-neutral-600 font-bold">Asset Offline</span>
            </div>
        );
    }

    return (
        <div className={`relative overflow-hidden bg-[#0A0A0C] border border-white/[0.04] ${containerClassName || ''}`} aria-busy={status === 'loading'}>
            {status === 'loading' && (
                <div className="absolute inset-0 bg-[#050505] overflow-hidden pointer-events-none z-10" aria-hidden="true">
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
                animate={kenBurns && status === 'loaded' ? { scale: [1, 1.05] } : {}}
                transition={kenBurns ? { duration: 25, repeat: Infinity, repeatType: "reverse", ease: "linear" } : {}}
                className={`w-full h-full object-cover transform-gpu will-change-[transform,opacity] transition-all duration-1000 ease-[0.16,1,0.3,1] ${status === 'loaded' ? 'opacity-100 scale-100' : 'opacity-0 scale-[1.03]'} ${imageClassName || ''}`}
                onLoad={() => setStatus('loaded')} 
                onError={() => setStatus('error')}
                loading={priority ? "eager" : "lazy"} 
                decoding="async"
            />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.6)_100%)] pointer-events-none mix-blend-multiply opacity-60 z-[5]" />
        </div>
    );
});
SafeImage.displayName = 'SafeImage';



// ============================================================================
// IDE-Grade Code Block Renderer (Enhanced)
// ============================================================================
const CodeBlock = React.memo(({ lang, content, fileName, ...props }: { lang: string; content: string; fileName?: string; [key: string]: any }) => {
    const [copied, setCopied] = useState(false);
    const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleCopy = () => {
        navigator.clipboard.writeText(content);
        setCopied(true);
        if (copyTimeoutRef.current) {
            clearTimeout(copyTimeoutRef.current);
        }
        copyTimeoutRef.current = setTimeout(() => {
            setCopied(false);
            copyTimeoutRef.current = null;
        }, 2500); // Increased timeout for better feedback
    };

    useEffect(() => {
        // Cleanup timeout on unmount
        return () => {
            if (copyTimeoutRef.current) {
                clearTimeout(copyTimeoutRef.current);
            }
        };
    }, []);

    const displayLang = lang === 'bash' ? 'Shell' : lang === 'ts' ? 'TypeScript' : lang === 'js' ? 'JavaScript' : lang === 'py' ? 'Python' : lang;
    const langColor = useMemo(() => {
        switch (lang) {
            case 'js':
            case 'javascript': return 'text-[#F7DF1E]'; // Yellow
            case 'ts':
            case 'typescript': return 'text-[#3178C6]'; // Blue
            case 'py':
            case 'python': return 'text-[#306998]'; // Darker Blue
            case 'bash':
            case 'sh': return 'text-[#89E051]'; // Green
            case 'json': return 'text-[#FFD700]'; // Gold
            case 'go': return 'text-[#00ADD8]'; // Cyan
            default: return 'text-neutral-400';
        }
    }, [lang]);

    return (
        <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} // Framer Motion for smooth entry/exit
            className="relative group my-8 rounded-[16px] overflow-hidden border border-white/[0.05] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8),0_0_20px_rgba(255,255,255,0.02)] bg-neutral-950/70 backdrop-blur-xl transform-gpu"
            aria-live="polite" // Announce changes for screen readers
        >
            {/* Header: Refined with subtle gradients and dynamic content */}
            <div className="flex items-center justify-between bg-neutral-900/60 px-5 py-3 border-b border-white/[0.03] relative z-10">
                <div className="flex items-center gap-3">
                    <Code2 className={`w-4 h-4 ${langColor}`} strokeWidth={1.5} />
                    <span className={`text-[10px] font-mono uppercase tracking-widest font-bold ${langColor}`}>
                        {displayLang}
                    </span>
                    {fileName && (
                        <>
                            <span className="text-neutral-700">•</span>
                            <span className="text-[10px] font-mono text-neutral-500 tracking-wide">{fileName}</span>
                        </>
                    )}
                </div>
                <motion.button 
                    onClick={handleCopy} 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.05] hover:bg-white/[0.1] text-neutral-400 hover:text-white transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                    aria-label={copied ? 'Code copied to clipboard' : 'Copy code to clipboard'}
                >
                    <AnimatePresence mode="wait" initial={false}>
                        {copied ? (
                            <motion.div
                                key="check"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                transition={{ duration: 0.15 }}
                                className="flex items-center gap-1.5"
                            >
                                <Check className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2} />
                                <span className="text-[9px] font-mono uppercase tracking-widest font-bold text-emerald-400">Copied</span>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="copy"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                transition={{ duration: 0.15 }}
                                className="flex items-center gap-1.5"
                            >
                                <Copy className="w-3.5 h-3.5 text-neutral-500" strokeWidth={1.5} />
                                <span className="text-[9px] font-mono uppercase tracking-widest font-bold text-neutral-500">Copy</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.button>
            </div>
            
            {/* Syntax Highlighted Content */}
            <div className="relative">
                <SyntaxHighlighter 
                    style={vscDarkPlus as any} 
                    language={lang} 
                    PreTag="div" 
                    customStyle={{ 
                        margin: 0, 
                        padding: '1.75rem 1.5rem', // Slightly more vertical padding
                        background: 'transparent', 
                        fontSize: '13px', 
                        lineHeight: '1.7', // Increased line height for readability
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', // System monospace fonts
                        overflowX: 'auto', // Ensure horizontal scrolling for long lines
                        scrollbarWidth: 'none', // Hide scrollbar for aesthetics (Firefox)
                        WebkitOverflowScrolling: 'touch', // Smooth scrolling on iOS
                        paddingBottom: '1.5rem', // Add padding to bottom for scrollbar space
                    }} 
                    codeTagProps={{
                        style: {
                            fontFamily: 'inherit', // Inherit from parent customStyle
                            lineHeight: 'inherit',
                            fontSize: 'inherit',
                        }
                    }}
                    {...props}
                >
                    {content}
                </SyntaxHighlighter>
                {/* Subtle gradient overlay at bottom for scroll indication */}
                <div className="absolute bottom-0 left-0 w-full h-10 bg-gradient-to-t from-neutral-950/80 to-transparent pointer-events-none" aria-hidden="true" />
            </div>
        </motion.div>
    );
});
CodeBlock.displayName = 'CodeBlock';

// ============================================================================
// Markdown Components (Institutional Chat Rendering)
// ============================================================================
const CHAT_REMARK_PLUGINS = [remarkGfm];

const CHAT_MARKDOWN_COMPONENTS: Components = {
    p: ({node, ...props}) => <p className="mb-5 last:mb-0 text-[#D4D4D4] leading-[1.75] text-[15px] font-serif antialiased tracking-[-0.01em]" {...props} />,
    h1: ({node, ...props}) => <h1 className="text-[20px] font-medium tracking-tight text-white/95 mt-6 mb-4 font-sans" {...props} />,
    h2: ({node, ...props}) => <h2 className="text-[18px] font-medium tracking-tight text-white/95 mt-6 mb-3 font-sans" {...props} />,
    h3: ({node, ...props}) => <h3 className="text-[11px] font-mono font-bold tracking-widest uppercase text-[#4285F4] mt-5 mb-2 select-none" {...props} />,
    ul: ({node, ...props}) => <ul className="list-none space-y-2 mt-3 mb-5 text-[#D4D4D4] font-serif text-[15px] pl-1" {...props} />,
    ol: ({node, ...props}) => <ol className="list-decimal pl-5 mt-3 mb-5 space-y-2 text-[#D4D4D4] marker:text-neutral-500 tabular-nums font-serif text-[15px]" {...props} />,
    li: ({node, ...props}) => <li className="relative pl-6 before:absolute before:left-0 before:top-[0.6em] before:w-[4px] before:h-[1px] before:bg-[#4285F4] leading-[1.75]" {...props} />,
    strong: ({node, ...props}) => <strong className="font-semibold text-white/95" {...props} />,
    a: ({node, ...props}) => <a className="text-[#4285F4] hover:text-[#5b96f5] underline underline-offset-4 decoration-[#4285F4]/30 hover:decoration-[#4285F4]/60 transition-colors" target="_blank" rel="noopener noreferrer" {...props} />,
    table: ({node, ...props}) => <div className="w-full overflow-x-auto my-6 rounded-[12px] border border-white/[0.04] bg-[#050505] shadow-inner"><table className="w-full text-left border-collapse text-[12px] tabular-nums font-mono" {...props} /></div>,
    thead: ({node, ...props}) => <thead className="bg-[#0A0A0C] border-b border-white/[0.04]" {...props} />,
    th: ({node, ...props}) => <th className="px-4 py-3 font-bold text-neutral-500 uppercase tracking-widest text-[9px] whitespace-nowrap" {...props} />,
    td: ({node, ...props}) => <td className="px-4 py-3 border-b border-white/[0.02] text-neutral-300" {...props} />,
    code: ({node, className, children, ...props}: any) => {
        const match = /language-(\w+)/.exec(className || '');
        const lang = match?.[1] || 'text';
        const content = String(children).replace(/\n$/, '');

        if (lang === 'chart') return <MarkdownChart data={content} />;
        if (lang === 'bettingangles') return <BettingAnglesCarousel data={content} />;
        if (lang === 'editorial') return <EditorialCarousel data={content} />;
        
        const isInline = !match && !content.includes('\n');
        if (!isInline) return <CodeBlock lang={lang} content={content} {...props} />;
        
        return <code className="text-[#4285F4] bg-[#4285F4]/10 px-1.5 py-0.5 rounded-[4px] text-[13px] font-mono border border-[#4285F4]/20" {...props}>{children}</code>;
    },
    pre: ({node, children, ...props}: any) => {
        const hasCustomComponent = node?.children?.some((child: any) => child.tagName === 'code');
        if (hasCustomComponent) return <div className="w-full">{children}</div>;
        return <pre className="bg-[#050505] p-6 rounded-[12px] overflow-x-auto border border-white/[0.04] text-[13px] leading-[1.65] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8),0_0_20px_rgba(255,255,255,0.02)] font-mono text-neutral-300 my-6" {...props}>{children}</pre>;
    }
};

const EDITORIAL_MARKDOWN_COMPONENTS: Components = {
    ...CHAT_MARKDOWN_COMPONENTS,
    p: ({node, ...props}) => <p className="mb-8 last:mb-0 text-[#E5E5E5] text-[19px] sm:text-[20px] font-serif leading-[1.85] tracking-[-0.01em] antialiased" {...props} />,
    h2: ({node, ...props}) => <h2 className="text-[32px] sm:text-[36px] font-sans font-medium tracking-tight text-white/95 mt-16 mb-6 leading-[1.2]" {...props} />,
    h3: ({node, ...props}) => <h3 className="text-[14px] font-mono font-bold tracking-widest uppercase text-[#4285F4] mt-12 mb-5 select-none m-0" {...props} />,
    blockquote: ({node, ...props}) => <blockquote className="border-l-[4px] border-[#4285F4] pl-6 sm:pl-8 my-12 py-5 italic text-[24px] sm:text-[26px] font-serif text-neutral-400 leading-[1.45] tracking-tight bg-gradient-to-r from-[#4285F4]/10 to-transparent rounded-r-3xl shadow-sm" {...props} />,
    ul: ({node, ...props}) => <ul className="list-none space-y-4 mt-6 mb-10 text-[#D4D4D4] font-serif text-[19px] sm:text-[20px]" {...props} />,
    ol: ({node, ...props}) => <ol className="list-decimal pl-6 mt-6 mb-10 space-y-4 text-[#D4D4D4] font-serif text-[19px] sm:text-[20px] tabular-nums lining-nums marker:text-neutral-500 marker:font-sans" {...props} />,
    li: ({node, ...props}) => <li className="relative pl-8 before:absolute before:left-0 before:top-[0.65em] before:w-[4px] before:h-[1px] before:bg-[#4285F4] leading-[1.85]" {...props} />,
    strong: ({node, ...props}) => <strong className="font-semibold text-white/95" {...props} />,
    hr: ({node, ...props}) => <hr className="my-16 border-t border-white/[0.04]" {...props} />,
};

// ============================================================================
// O(1) Global Cache Memory Layer (Prevents Routing Amnesia)
// ============================================================================
let globalFeedCache: FeedCard[] | null = null;
let feedFetchPromise: Promise<FeedCard[]> | null = null;

export const fetchGlobalFeed = async (): Promise<FeedCard[]> => {
    if (globalFeedCache) return globalFeedCache;
    if (feedFetchPromise) return feedFetchPromise;
    
    feedFetchPromise = fetch('/api/feed')
        .then(res => {
            if (!res.ok) throw new Error("Network feed unavailable");
            return res.json();
        })
        .then(data => {
            const arr = Array.isArray(data.feed) ? data.feed : (Array.isArray(data) ? data : []);
            globalFeedCache = arr;
            return arr;
        })
        .catch(err => {
            console.error("[AURA:NETWORK] Failed to hydrate institutional feed.", err);
            return [];
        });
        
    return feedFetchPromise;
};

// ============================================================================
// Production API Data Fetcher Hooks
// ============================================================================
const useFeedData = () => {
    const [loading, setLoading] = useState(!globalFeedCache);
    const [feed, setFeed] = useState<FeedCard[]>(globalFeedCache || []);
    const [error, setError] = useState<string | null>(null);

    const syncFeed = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchGlobalFeed();
            setFeed(data);
            if (data.length === 0) setError("No intelligence available from the node.");
        } catch (e: any) {
            setError(e.message || "Failed to sync.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!globalFeedCache) syncFeed();
    }, [syncFeed]);

    return { feed, loading, error, refetch: syncFeed };
};

const useStoryData = (id?: string) => {
    const [loading, setLoading] = useState(true);
    const [story, setStory] = useState<FeedCard | null>(null);

    useEffect(() => {
        if (!id) return;
        let isMounted = true;
        
        // Use global cache first for zero latency hydration
        if (globalFeedCache) {
            const found = globalFeedCache.find(c => c.id === id || c.slug === id);
            if (found) {
                setStory(found);
                setLoading(false);
                return;
            }
        }

        // Fallback to fetch if deep linked directly
        fetchGlobalFeed().then(data => {
            if (isMounted) {
                const found = data.find(c => c.id === id || c.slug === id);
                setStory(found || null);
                setLoading(false);
            }
        });

        return () => { isMounted = false; };
    }, [id]);

    return { story, loading };
};

// ============================================================================
// Feed Components
// ===========================================================================
const FeedItem = React.memo(({ item }: { item: FeedCard }) => {
    const navigate = useNavigate();
    const destinationUrl = `/story/${item.slug || item.id}`;

    const publishedDate = useMemo(() => {
        if (!item.publishedAt) return '';
        const d = new Date(item.publishedAt);
        const diffHrs = Math.floor((Date.now() - d.getTime()) / 3600000);
        if (diffHrs < 24) return `${diffHrs}h ago`;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }, [item.publishedAt]);

    const sourceStyling = { bg: 'bg-white', text: 'text-white', border: 'border-white/[0.04]', glow: 'group-hover:from-white/10', hoverBorder: 'group-hover:border-white/[0.04]' };
    const isExternalNews = item.type === 'EXTERNAL_NEWS';
    const isPredictionMarket = item.type === 'PREDICTION_MARKET';
    const isAuraEditorial = item.type === 'EDITORIAL';

    // Accessible Event Delegation: Prevents Link Nesting violations
    const handleCardClick = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('a') || target.closest('input')) {
            return;
        }
        navigate(destinationUrl);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            const target = e.target as HTMLElement;
            if (target.closest('button') || target.closest('a')) return;
            e.preventDefault();
            navigate(destinationUrl);
        }
    };

    return (
        <motion.div
           whileHover={{ y: -4, scale: 1.005 }}
           whileTap={{ scale: 0.98 }}
           transition={SPRING_TRANSITION}
           onClick={handleCardClick}
           onKeyDown={handleKeyDown}
           tabIndex={0}
           role="link"
           aria-label={`Read full analysis: ${item.headline}`}
           className="relative block w-full mb-10 group outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded-[32px] cursor-pointer"
        >
            <div className={`absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-transparent ${isExternalNews ? sourceStyling.glow : 'group-hover:from-[#4285F4]/10'} rounded-[32px] blur-2xl transition-all duration-700 pointer-events-none -z-10 transform-gpu opacity-40`} />
            
            <div className={`w-full relative bg-[#050505] border border-white/[0.04] rounded-[32px] overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.3)] transition-colors duration-500 transform-gpu group-hover:bg-[#0A0A0C] ${isExternalNews ? sourceStyling.hoverBorder : 'group-hover:border-[#4285F4]/50'}`}>
                
                {item.image_url && (
                    <div className="w-full aspect-[21/9] sm:aspect-[16/9] relative bg-[#0A0A0C] border-b border-white/[0.02] overflow-hidden pointer-events-none z-0">
                        <SafeImage 
                            src={item.image_url} alt={item.headline} containerClassName="absolute inset-0 border-none"
                            imageClassName={`opacity-80 group-hover:opacity-100 transition-all duration-700 scale-[1.01] group-hover:scale-[1.03] ${isAuraEditorial ? 'grayscale-[0.3] group-hover:grayscale-0' : 'grayscale-0'}`}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/30 to-transparent opacity-100" />
                    </div>
                )}

                <div className={`flex flex-col p-8 sm:p-10 relative z-20 ${item.image_url ? '-mt-24' : ''}`}>
                   <div className="flex items-center justify-between mb-6 select-none font-sans">
                       <div className="flex items-center gap-3">
                           <span className={`text-[10px] font-bold font-mono uppercase tracking-widest text-white/95 bg-[#000000]/80 backdrop-blur-[60px] saturate-[1.2] px-3 py-1.5 rounded-[8px] border border-white/[0.04] shadow-[0_4px_30px_rgba(0,0,0,0.5)] flex items-center gap-2`}>
                               {isExternalNews ? <Globe className={`w-3.5 h-3.5 ${sourceStyling.text}`} /> : <Activity className="w-3.5 h-3.5 text-[#4285F4]" />}
                               {item.category || 'Intelligence'}
                           </span>
                           {item.priority === 'high_live' && (
                               <span className="flex items-center gap-1.5 bg-[#FF3B30]/10 px-2.5 py-1.5 rounded-[6px] border border-[#FF3B30]/20">
                                   <span className="w-1.5 h-1.5 bg-[#FF3B30] rounded-full animate-pulse shadow-[0_0_8px_rgba(255,59,48,0.8)]" />
                                   <span className="text-[10px] font-bold text-[#FF3B30] uppercase tracking-widest font-mono">Live</span>
                               </span>
                           )}
                       </div>
                       
                       {/* Launch Matrix Button */}
                       {item.live_game_id && (
                           <button 
                               onClick={(e) => { 
                                   e.preventDefault(); 
                                   e.stopPropagation(); 
                                   navigate(`/live/${item.live_game_id}`); 
                               }}
                               className="hidden sm:flex items-center gap-2 bg-[#4285F4]/10 hover:bg-[#4285F4]/20 text-[#4285F4] border border-[#4285F4]/30 px-3 py-1.5 rounded-[8px] text-[10px] font-mono font-bold uppercase tracking-widest transition-colors shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-white/30 cursor-pointer"
                           >
                               <TerminalSquare className="w-3.5 h-3.5" /> Launch Matrix
                           </button>
                       )}
                   </div>
                   
                   <h4 className="text-[26px] sm:text-[32px] font-medium text-white/95 leading-[1.2] mb-4 tracking-tight group-hover:text-white transition-colors duration-500 drop-shadow-sm">{item.headline}</h4>
                   <p className="text-[15px] sm:text-[17px] text-neutral-400 leading-[1.75] line-clamp-3 mb-8 font-serif tracking-[-0.01em]">{item.summary}</p>

                   {/* Prediction Market Preview */}
                   {isPredictionMarket && item.metadata?.kalshi_market_injected && (
                       <div className="mt-2 mb-6 p-6 rounded-[24px] bg-[#0A0A0C] border border-white/[0.04] transition-colors relative overflow-hidden group-hover:bg-[#111113] font-sans shadow-inner">
                            <div className="flex items-center gap-2 mb-5 relative z-10 select-none">
                                <span className="text-[#34C759] text-[9px] font-bold font-mono uppercase tracking-widest inline-flex items-center gap-1.5 bg-[#34C759]/10 px-2.5 py-1 rounded-[6px] border border-[#34C759]/20">
                                    <Activity className="w-3.5 h-3.5 text-[#34C759]" /> Live Market
                                </span>
                                <span className="text-white/10 mx-1">•</span><span className="text-[9px] text-neutral-500 font-mono uppercase tracking-widest font-bold">Prediction Edge</span>
                            </div>
                            <h4 className="text-[15px] font-medium text-white/90 leading-snug mb-5 tracking-tight pr-4 relative z-10 line-clamp-2">{item.metadata.kalshi_title || 'Related Market Prediction'}</h4>
                            <div className="flex items-center justify-between gap-4 relative z-10 select-none">
                                <div className="flex-1 bg-[#050505] transition-colors duration-500 rounded-[16px] p-5 border border-white/[0.04] flex flex-col gap-1 shadow-sm relative overflow-hidden">
                                    <div className="absolute inset-y-0 left-0 bg-[#34C759]/5 transition-all" style={{ width: `${item.metadata.kalshi_yes_price || 0}%` }} />
                                    <div className="text-[10px] font-mono font-bold text-neutral-500 uppercase tracking-widest transition-colors relative z-10">Yes</div>
                                    <div className="text-[22px] font-medium text-white/95 tabular-nums lining-nums leading-none mt-1.5 font-sans relative z-10">{item.metadata.kalshi_yes_price}%</div>
                                </div>
                                <div className="flex-1 bg-[#050505] transition-colors duration-500 rounded-[16px] p-5 border border-white/[0.04] flex flex-col gap-1 shadow-sm">
                                    <div className="text-[10px] font-mono font-bold text-neutral-500 uppercase tracking-widest transition-colors">No</div>
                                    <div className="text-[22px] font-medium text-neutral-400 tabular-nums lining-nums leading-none mt-1.5 font-sans">{100 - (item.metadata.kalshi_yes_price || 0)}%</div>
                                </div>
                            </div>
                       </div>
                   )}
                   <div className="mt-2 flex items-center justify-between pt-6 border-t border-white/[0.04] font-sans">
                       <div className="flex items-center gap-2 text-[10px] font-mono font-bold text-neutral-500 uppercase tracking-widest select-none tabular-nums lining-nums">
                           <span>{item.source || 'Aura Protocol'}</span>
                           {publishedDate && <><span className="text-neutral-700">•</span><time dateTime={new Date(item.publishedAt).toISOString()}>{publishedDate}</time></>}
                       </div>
                   </div>
                </div>
            </div>
        </motion.div>
    );
});
FeedItem.displayName = 'FeedItem';

function FeedSkeleton() {
    return (
        <div className="w-full relative bg-[#050505] border border-white/[0.04] rounded-[32px] overflow-hidden mb-10 shadow-sm animate-pulse">
            <div className="w-full aspect-[21/9] sm:aspect-[16/9] bg-[#0A0A0C] border-b border-white/[0.02] relative overflow-hidden" />
            <div className="p-8 sm:p-10 -mt-24 relative z-10">
                <div className="h-4 w-32 bg-white/[0.04] rounded-[6px] mb-6 relative overflow-hidden" />
                <div className="h-8 w-3/4 bg-white/[0.04] rounded-[8px] mb-4 relative overflow-hidden" />
                <div className="h-6 w-full bg-white/[0.03] rounded-[6px] mb-3 relative overflow-hidden" />
            </div>
        </div>
    );
}

function HomeFeed() {
  const { feed, loading, error, refetch } = useFeedData();

  if (loading && feed.length === 0) return <div className="w-full max-w-[760px] px-2 sm:px-4 flex flex-col mt-8 mx-auto"><FeedSkeleton /><FeedSkeleton /></div>;
  
  if (error && feed.length === 0) return (
      <div className="w-full max-w-[760px] mx-auto mt-8 px-4 sm:px-6">
          <div className="bg-[#050505] border border-[#FF3B30]/30 rounded-[24px] p-8 text-center shadow-sm flex flex-col items-center">
              <AlertCircle className="w-6 h-6 text-[#FF3B30] mb-3" />
              <h3 className="text-[12px] font-mono font-bold tracking-widest text-[#FF3B30] uppercase mb-2">Telemetry Disconnected</h3>
              <p className="text-[14px] text-neutral-400 font-sans mb-6">{error}</p>
              <button onClick={refetch} className="px-6 py-2.5 bg-white/[0.04] hover:bg-white/[0.08] text-white text-[11px] font-mono uppercase tracking-widest font-bold rounded-[8px] transition-colors outline-none border border-white/[0.04] active:scale-95 focus-visible:ring-2 focus-visible:ring-white/20">Retry Connection</button>
          </div>
      </div>
  );

  if (feed.length === 0) return <div className="text-neutral-500 text-[12px] font-mono tracking-widest mt-16 text-center bg-[#050505] border border-white/[0.04] p-12 rounded-[32px] border-dashed select-none uppercase shadow-inner max-w-[760px] mx-auto font-bold">Data feed synchronized. No active events.</div>;

  return (
      <div className="w-full max-w-[760px] flex flex-col mx-auto mt-4 px-4 sm:px-6">
         <AnimatePresence mode="popLayout">
             {feed.map((item, i) => (
                 <motion.div key={item.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: Math.min(i * 0.1, 0.4), ease: EASE_TRANSITION }}>
                     <FeedItem item={item} />
                 </motion.div>
             ))}
         </AnimatePresence>
      </div>
  );
}

// ============================================================================
// Core Chat Interface (Production LLM Direct Routing)
// ============================================================================
function ChatInterface({ 
    user, token, onSignIn, loadingAuth, messages, setMessages 
}: { 
    user: any; token: string | null; onSignIn: () => void; loadingAuth: boolean;
    messages: AuraChatMessage[]; setMessages: React.Dispatch<React.SetStateAction<AuraChatMessage[]>>;
}) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingState, setLoadingState] = useState<'synthesizing' | 'analyzing'>('synthesizing');
  const endRef = useRef<HTMLDivElement>(null);
  
  // URL synced state
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSubdomain = (searchParams.get('tab') as SubdomainTab) || 'sports';
  const setActiveSubdomain = (tab: SubdomainTab) => { setSearchParams({ tab }); };

  // Attachment States
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedMime, setSelectedMime] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [viewedDocument, setViewedDocument] = useState<DriveDocumentData | null>(null); 

  // Sync viewed document via side effect rather than in-render phase
  useEffect(() => {
    if (messages.length === 0) {
      setViewedDocument(null);
      return;
    }
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.artifacts) {
      const driveArt = lastMsg.artifacts.find(a => a.type === ('DRIVE_DOC_ARTIFACT' as any));
      if (driveArt && driveArt.data) {
        setViewedDocument(driveArt.data);
      } else {
        const hasAuraMsg = lastMsg.artifacts.some(a => a.type === 'SYSTEM_MESSAGE' || a.type === 'WORK_ARTIFACT');
        if (hasAuraMsg) {
          setViewedDocument(null);
        }
      }
    }
  }, [messages]);

  const chatContainerRef = useRef<HTMLElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Speech Recognition
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const promptRef = useRef(prompt);
  useEffect(() => { promptRef.current = prompt; }, [prompt]);

  const toggleListening = async () => {
    if (isListening) {
        if (recognitionRef.current) recognitionRef.current.stop();
        setIsListening(false);
        return;
    }

    try {
        // Pre-flight permission request. This helps trigger the native permission prompt
        // correctly on iOS and inside iframes before we initialize SpeechRecognition.
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
             const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
             // Immediately stop the tracks since we only wanted to trigger the permission prompt.
             // The SpeechRecognition will manage its own audio streams.
             stream.getTracks().forEach(track => track.stop());
             // Give the system a moment to release the microphone before starting SpeechRecognition
             await new Promise(r => setTimeout(r, 200));
        }
    } catch (err) {
        console.error('Microphone permission denied or failed:', err);
        alert('Microphone permission is required for voice dictation. Please allow in your browser settings.');
        return;
    }

    const w = window as any;
    const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert('Speech recognition is not supported in this browser.');
        return;
    }

    try {
        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.lang = 'en-US';
        recognition.interimResults = true;
        recognition.continuous = false;

        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onerror = (e: any) => {
            if (e.error !== 'aborted') {
                console.error('Speech recognition error:', e.error);
                if (e.error === 'not-allowed' || e.error === 'audio-capture') {
                     alert(`Microphone error: ${e.error}. Please check your system settings or device microphone.`);
                } else {
                     console.warn("Speech recognition stopped due to error:", e.error);
                }
            }
            setIsListening(false);
        };

        const startPrompt = promptRef.current;
        recognition.onresult = (e: any) => {
            let transcript = '';
            for (let i = 0; i < e.results.length; ++i) {
                transcript += e.results[i][0].transcript;
            }
            const space = startPrompt.trim().length > 0 ? ' ' : '';
            setPrompt(startPrompt + space + transcript);
        };
        recognition.start();
    } catch (err) {
        console.error("Failed to start SpeechRecognition:", err);
        alert("Failed to start speech recognition. Please try again.");
    }
  };

  // High-precision scroll tracking
  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setShowScrollButton(distanceFromBottom > 300);
  };

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    } else {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const getMessageText = (msg: AuraChatMessage) => {
    if (msg.content) return msg.content;
    const sysArt = msg.artifacts?.find(a => a.type === 'SYSTEM_MESSAGE' || a.type === 'WORK_ARTIFACT');
    return sysArt?.context_summary || '';
  };

  useEffect(() => {
      const timer = setTimeout(() => {
          if (chatContainerRef.current) {
              chatContainerRef.current.scrollTo({
                  top: chatContainerRef.current.scrollHeight,
                  behavior: 'smooth'
              });
          } else {
              endRef.current?.scrollIntoView({ behavior: 'smooth' });
          }
      }, 150);
      return () => clearTimeout(timer);
  }, [messages, loading]);

  useEffect(() => { return () => { if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl); }; }, [imagePreviewUrl]);

  const processFile = (file: File) => {
      if (!file.type.startsWith('image/')) { alert('Please upload an image file (PNG, JPG, etc).'); return; }
      if (file.size > MAX_IMAGE_SIZE_BYTES) { alert(`File exceeds maximum size of ${MAX_IMAGE_SIZE_BYTES / (1024*1024)}MB.`); return; }
      const reader = new FileReader();
      reader.onloadend = () => {
          setSelectedImage((reader.result as string).split(',')[1]);
          setSelectedMime(file.type);
          if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
          setImagePreviewUrl(URL.createObjectURL(file));
      };
      reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files?.[0]) processFile(e.target.files[0]); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => { setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]); };
  const clearAttachment = () => { setSelectedImage(null); setSelectedMime(null); if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl); setImagePreviewUrl(null); };

  const handleQuery = async (eOrPreset?: React.FormEvent | string, contextData?: DriveDocumentData) => {
    if (eOrPreset && typeof eOrPreset !== 'string' && 'preventDefault' in eOrPreset) {
        eOrPreset.preventDefault();
    }
    
    let rawPrompt = typeof eOrPreset === 'string' ? eOrPreset : prompt;

    // Sanitize tokenizer state leaks
    if (rawPrompt.toLowerCase().includes('intent:')) {
        const segments = rawPrompt.split(/intent:/i);
        rawPrompt = segments[segments.length - 1].trim(); 
    }

    const activePrompt = rawPrompt.trim();
    if ((!activePrompt && !selectedImage && !contextData) || loading) return;

    let routedDomain = activeSubdomain as string;
    setLoadingState('synthesizing');

    const userMessageImg = imagePreviewUrl || undefined;
    const sendImg = selectedImage; const sendMime = selectedMime;

    clearAttachment();
    setMessages(prev => [...prev, { id: generateId('usr'), role: 'user', content: activePrompt || (contextData ? `Analyze document: ${contextData.name}` : "Analyze asset"), image: userMessageImg }]);
    setLoading(true); setPrompt('');

    // System Routing
    let injectedPrompt = activePrompt;
    
    const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const localTime = new Date().toLocaleString("en-US", { timeZone: userTz });

    const history: AuraHistoryMessage[] = messages.reduce<AuraHistoryMessage[]>((acc, m) => {
       if (m.role === 'user' && m.content) acc.push({ role: 'user', content: m.content });
       else if (m.role === 'model' && m.artifacts) {
           const sysMsg = m.artifacts.find(a => a.type === 'SYSTEM_MESSAGE' || a.type === 'CODE_ANALYSIS_ARTIFACT' as any)?.context_summary;
           if (sysMsg) acc.push({ role: 'model', content: sysMsg });
       }
       return acc;
    }, []);

    const messagePayload: any = { 
        message: injectedPrompt, 
        history, 
        domain: routedDomain, 
        image: sendImg, 
        imageMime: sendMime,
        client_context: {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            local_time: new Date().toISOString()
        }
    };

    if (contextData) {
        messagePayload.context = { type: contextData.mimeType.includes('spreadsheet') || contextData.mimeType.includes('csv') ? 'csv_document' : 'html_document', id: contextData.id, name: contextData.name, content: contextData.csvContent || contextData.htmlContent };
    }
    
    try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        const response = await fetch('/api/chat', { method: 'POST', headers, body: JSON.stringify(messagePayload) });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        if (!response.body) throw new Error("ReadableStream not supported");
        
        const reader = response.body.getReader(); const decoder = new TextDecoder("utf-8");
        let currentText = ""; const modId = generateId('mod');
        setMessages(prev => [...prev, { id: modId, role: 'model', artifacts: [] }]);

        let doneReading = false; let buffer = "";
        while (!doneReading) {
            const { value, done } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n'); buffer = lines.pop() || "";
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.slice(6);
                    if (dataStr.trim() === '[DONE]') { doneReading = true; break; }
                    try {
                        const parsed = JSON.parse(dataStr);
                        if (parsed.type === 'chunk') {
                            currentText += parsed.text;
                            setMessages(prev => prev.map(m => m.id === modId ? { ...m, artifacts: [{ id: modId + '_sys', type: 'SYSTEM_MESSAGE', resolution_state: 'CONVERSATIONAL', context_summary: currentText }] } : m));
                        } else if (parsed.type === 'artifacts') {
                            setMessages(prev => prev.map(m => m.id === modId ? { ...m, artifacts: parsed.artifacts } : m));
                        }
                    } catch(e) {}
                }
            }
        }
    } catch(e) {
        setMessages(prev => [...prev, { id: generateId('err'), role: 'model', artifacts: [{ id: generateId('err_art'), type: 'SYSTEM_MESSAGE', resolution_state: 'GROUNDING_FAULT', context_summary: "Execution logic interrupted. Please try again." }] }]);
    } finally { setLoading(false); }
  };

  const renderArtifact = useCallback((artifact: AuraArtifact, index: number) => {
      // THE CODING AGENT RENDERER (Institutional IDE Implementation)
      let innerContent = null;
      if (artifact.type === 'CODE_ANALYSIS_ARTIFACT' as any) {
          const analysisData = artifact.data?.static_analysis;
          const errorCount = analysisData?.errors || 0;
          const warningCount = analysisData?.warnings || 0;
          const isClean = errorCount === 0;

          innerContent = (
              <div className="w-full mb-6 font-sans group relative text-left">
                  <div className="absolute top-0 right-0 sm:-mr-12 opacity-0 group-hover:opacity-100 transition-opacity z-10 hidden sm:block mt-2">
                      <MessageCopyButton text={artifact.context_summary || ''} />
                  </div>
                  
                  {/* Institutional Static Analysis Telemetry Banner */}
                  {analysisData && (
                      <div className="flex flex-wrap items-center gap-3 sm:gap-4 px-5 py-3.5 bg-[#0A0A0C] border border-white/[0.04] rounded-t-[16px] border-b-0 text-[10px] font-mono text-neutral-400 select-none shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                          <span className="flex items-center gap-2 font-bold uppercase tracking-widest text-white/90">
                              <TerminalSquare className="w-3.5 h-3.5 text-[#4285F4]" /> Static Analysis
                          </span>
                          <span className="text-white/[0.08] hidden sm:inline">|</span>
                          <span className={`flex items-center gap-1.5 font-bold uppercase tracking-widest ${!isClean ? 'text-[#FF3B30]' : 'text-[#34C759]'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${!isClean ? 'bg-[#FF3B30] shadow-[0_0_8px_rgba(255,59,48,0.8)] animate-pulse' : 'bg-[#34C759]'}`} />
                              Errors: {errorCount}
                          </span>
                          <span className="text-white/[0.08]">|</span>
                          <span className={`font-bold uppercase tracking-widest ${warningCount > 0 ? 'text-[#FF9500]' : ''}`}>
                              Warnings: {warningCount}
                          </span>
                          <span className="text-white/[0.08] hidden sm:inline">|</span>
                          <span className="font-bold uppercase tracking-widest hidden sm:inline">
                              Complexity: {analysisData.cognitive_complexity || 'Optimal'}
                          </span>
                      </div>
                  )}
                  
                  <div className={`bg-[#050505] p-6 sm:p-8 border border-white/[0.04] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8),0_0_20px_rgba(255,255,255,0.02)] text-[16px] text-white/95 leading-[1.65] font-sans antialiased font-normal max-w-none w-full ${analysisData ? 'rounded-b-[16px] rounded-t-none border-t-white/[0.02]' : 'rounded-[16px]'}`}>
                      <Markdown remarkPlugins={CHAT_REMARK_PLUGINS} components={CHAT_MARKDOWN_COMPONENTS}>
                          {artifact.context_summary || ''}
                      </Markdown>
                  </div>
              </div>
          );
      }
      else if (artifact.resolution_state === 'GROUNDING_FAULT') {
          innerContent = (
             <div className="bg-[#FF3B30]/10 border border-[#FF3B30]/20 rounded-[20px] p-6 mb-5 text-center backdrop-blur-[60px] saturate-[1.2] shadow-sm">
                 <AlertCircle className="h-6 w-6 text-[#FF3B30] mx-auto mb-3" strokeWidth={1.5} />
                 <div className="text-[10px] font-bold tracking-widest uppercase text-[#FF3B30] select-none font-mono">Execution Fault</div>
                 <div className="text-[13px] text-[#FF3B30]/80 mt-2 leading-relaxed font-mono">{artifact.context_summary}</div>
             </div>
          );
      }
      else if (artifact.resolution_state === 'NO_GAMES_SCHEDULED' || artifact.resolution_state === 'OFF_SEASON') {
           innerContent = (
             <div className="bg-white/[0.015] border border-white/[0.04] border-dashed rounded-[24px] p-10 mb-5 text-center backdrop-blur-sm">
                 {artifact.resolution_state === 'NO_GAMES_SCHEDULED' ? <CalendarIcon className="h-6 w-6 text-neutral-600 mx-auto mb-3" strokeWidth={1.5} /> : <CloudFog className="h-6 w-6 text-neutral-600 mx-auto mb-3" strokeWidth={1.5} />}
                 <div className="text-[10px] font-medium text-neutral-500 tracking-widest uppercase select-none">{artifact.context_summary}</div>
             </div>
          );
      }
      else if (artifact.type === 'GAME_SCHEDULE_ARTIFACT') innerContent = <GameScheduleMock />;
      else if (artifact.type === 'TEAM_PROFILE_ARTIFACT' as any) innerContent = <CanonicalTeamCard data={artifact.data} />;
      else if (artifact.type === 'PLAYER_PROFILE_ARTIFACT' as any) innerContent = <CanonicalPlayerCard data={artifact.data} />;
      else if (artifact.type === 'LEAGUE_PROFILE_ARTIFACT' as any) innerContent = <CanonicalLeagueCard data={artifact.data} />;
      else if (artifact.type === 'WORKSPACE_ORCHESTRATION_ARTIFACT' as any) innerContent = <WorkspaceOrchestrationBlueprint user={user} token={token} onSignIn={onSignIn} />;
      else if (artifact.type === 'GITHUB_CONNECTION_ARTIFACT' as any) innerContent = <GithubConnectionBlueprint />;
      else if (artifact.type === 'FIREBASE_CONNECTION_ARTIFACT' as any) innerContent = <FirebaseConnectionBlueprint />;
      else if (artifact.type === 'KALSHI_MCP_ARTIFACT' as any) innerContent = <KalshiMcpBlueprint />;
      else if (artifact.type === 'EMAIL_MIME_ARTIFACT' as any) innerContent = <EmailMimeViewer data={artifact.data} />;
      else if (artifact.type === 'WIN_PROBABILITY_ARTIFACT') innerContent = <WinProbabilityChart data={artifact.data} />;
      else if (artifact.type === 'PLAYER_PROP_ARTIFACT') innerContent = <PlayerPropProgress data={artifact.data} />;
      else if (artifact.type === 'BETTING_ANALYSIS' as any) innerContent = <AnalyticalMasterclass data={artifact.data} />;
      else if (artifact.type === 'WORKSPACE_MUTATION_ARTIFACT' as any) innerContent = <WorkspaceMutationCard data={artifact.data} summary={artifact.context_summary} />;
      else if (artifact.type === 'DRIVE_DOC_ARTIFACT' as any) innerContent = <DriveDocumentViewer data={artifact.data} />;
      else if (artifact.type === 'YOUTUBE_MEDIA' as any) innerContent = <YoutubeMediaCard data={artifact.data} />;
      else if ((artifact.type === 'SPORTS_ARTIFACT' || artifact.type === 'WAGERING_ARTIFACT') && artifact.resolution_state === 'LIVE_DATA') {
          const d = artifact.data; const gamesArr = Array.isArray(d) ? d : (d?.events || [d]);
          innerContent = <SportsCalendar games={gamesArr} leagueContext={d?.league_context} />;
      }
      else if (artifact.type === 'TRUST_GATE_RECEIPT' && artifact.resolution_state === 'DEPLOYED') {
           innerContent = (
              <div className="bg-[#050505] border border-white/[0.04] rounded-[16px] p-6 mb-5 font-mono text-[11px] text-neutral-400 tabular-nums select-none shadow-inner">
                  <div className="flex justify-between items-center mb-5 text-neutral-300 border-b border-white/[0.04] pb-3">
                      <span className="flex items-center gap-2 uppercase tracking-widest font-sans font-bold text-[10px]"><ShieldCheck className="h-4 w-4" /> System Receipt</span>
                      {artifact.data?.verified && <span className="bg-white/10 px-2 py-0.5 rounded-[4px] text-white font-bold">VERIFIED</span>}
                  </div>
                  <div className="space-y-4 mt-2">
                      <div className="flex justify-between items-center"><span>Status</span><span className="text-white">{artifact.data?.status || 'Active'}</span></div>
                      <div className="flex justify-between items-center"><span>Arch</span><span>Cloud Run</span></div>
                      <div className="flex justify-between items-center"><span>Endpoint</span><span className="truncate max-w-[150px] lowercase text-white">{artifact.data?.url || 'Internal'}</span></div>
                  </div>
              </div>
          );
      }
      else if ((artifact.type === 'SYSTEM_MESSAGE' || artifact.type === 'WORK_ARTIFACT') && (artifact.resolution_state === 'CONVERSATIONAL' || artifact.resolution_state === 'LIVE_DATA')) {
          innerContent = (
              <div className="bg-transparent mb-6 flex flex-col w-full text-left font-sans group relative" aria-live="polite">
                  <div className="text-[16px] text-white/95 leading-[1.65] font-sans antialiased font-normal max-w-none">
                      <Markdown remarkPlugins={CHAT_REMARK_PLUGINS} components={CHAT_MARKDOWN_COMPONENTS}>
                          {artifact.context_summary || ''}
                      </Markdown>
                  </div>
             </div>
          );
      } else {
          innerContent = <div className="bg-white/[0.02] p-5 rounded-[24px] mb-5 border border-white/[0.04] text-[14px] text-neutral-300 shadow-sm">{artifact.context_summary}</div>;
      }

      return (
          <motion.div 
             key={artifact.id} 
             initial={{ opacity: 0, y: 15 }} 
             animate={{ opacity: 1, y: 0 }} 
             transition={{ delay: 0.1 + (index * 0.1), duration: 0.6, ease: EASE_TRANSITION }}
             className="w-full max-w-full"
          >
             {innerContent}
          </motion.div>
      );
  }, []);

  const tabs: { id: SubdomainTab; label: string }[] = [ { id: 'sports', label: 'Sports' }, { id: 'workspace', label: 'Workspace' }, { id: 'kalshi', label: 'Odds' } ];

  return (
    <>
      <SEO title="Aura | Substrate Interface" canonicalPath="/" />
      <main 
        ref={chatContainerRef} 
        onScroll={handleScroll} 
        className={`flex-1 overflow-y-auto p-4 sm:p-6 ${activeSubdomain === 'kalshi' ? 'max-w-6xl' : 'max-w-[760px]'} mx-auto w-full flex flex-col pt-6 pb-[180px] sm:pb-[200px] relative z-10 scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
      >
          
          {/* APP LAUNCHER */}
          {messages.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center h-full mt-0 w-full animate-in fade-in duration-1000 ease-[0.16,1,0.3,1]">
                  <div className="hidden">
                      {tabs.map((tab) => {
                          const isActive = activeSubdomain === tab.id;
                          return (
                              <button 
                                 key={tab.id} type="button" onClick={() => setActiveSubdomain(tab.id)}
                                 className={`relative flex-1 py-2.5 px-3 rounded-full text-[11px] font-mono font-bold uppercase tracking-widest transition-colors duration-300 ease-[0.16,1,0.3,1] outline-none z-10 ${isActive ? 'text-black' : 'text-neutral-500 hover:text-neutral-300'}`}
                              >
                                  {isActive && <motion.div layoutId="activeSubdomainBg" className="absolute inset-0 bg-white rounded-full z-[-1] shadow-[0_2px_8px_rgba(255,255,255,0.12)]" transition={SPRING_TRANSITION} />}
                                  <span className="relative z-10">{tab.label}</span>
                              </button>
                          );
                      })}
                  </div>

                  <AnimatePresence mode="wait">
                      <motion.div key="sports" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3, ease: EASE_TRANSITION }} className="w-full flex flex-col items-center">
                              <div className="w-full max-w-full mb-8"><LiveSofaScoreWidget /></div>
                      </motion.div>
                  </AnimatePresence>
              </div>
          )}

          {/* CHAT THREAD */}
          {messages.length > 0 && (
              <div className="flex flex-col gap-8 relative max-w-[720px] mx-auto w-full" aria-live="polite">
                 <div className="w-full flex items-center mb-4 mt-[-10px]">
                     <button onClick={() => setMessages([])} className="flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-widest text-neutral-400 hover:text-white transition-all bg-[#050505] hover:bg-[#0A0A0C] px-5 py-2.5 rounded-[8px] border border-white/[0.04] outline-none shadow-sm focus-visible:ring-2 focus-visible:ring-white/20 active:scale-95">
                         <ArrowLeft className="w-3.5 h-3.5" /> Substrate Console
                     </button>
                 </div>
                 
                 <AnimatePresence initial={false}>
                     {messages.map((msg, idx) => (
                         <motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: Math.min((messages.length - 1 - idx) * 0.05, 0), duration: 0.5, ease: EASE_TRANSITION }} key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                             {msg.role === 'user' ? (
                                 <div className="flex flex-col items-end gap-3 max-w-[85%]">
                                     {msg.image && (
                                         <div className="overflow-hidden rounded-[20px] border border-white/[0.04] max-h-[220px] max-w-sm shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8),0_0_20px_rgba(255,255,255,0.02)] bg-[#050505]">
                                             <img src={msg.image} alt="User Context" className="object-cover max-h-[220px] w-auto h-auto rounded-[20px]" referrerPolicy="no-referrer" />
                                         </div>
                                     )}
                                     <div className="bg-[#111113] border border-white/[0.04] text-white/95 px-6 py-4 rounded-[24px] rounded-br-[8px] text-[16px] font-normal leading-[1.65] tracking-[-0.01em] shadow-sm backdrop-blur-[60px] saturate-[1.2]">
                                         {msg.content}
                                     </div>
                                 </div>
                             ) : (
                                  <div className="w-full flex flex-col items-start max-w-full group relative">
                                      {/* Render raw conversational text from the model properly */}
                                      {msg.content && !msg.artifacts?.length && (
                                           <div className="text-[16px] text-white/95 leading-[1.65] font-sans antialiased font-normal max-w-none w-full mb-4">
                                               <Markdown remarkPlugins={CHAT_REMARK_PLUGINS} components={CHAT_MARKDOWN_COMPONENTS}>
                                                   {msg.content}
                                               </Markdown>
                                           </div>
                                      )}
                                      
                                      {msg.artifacts?.map(renderArtifact)}

                                      {/* Elegant Copy-to-Clipboard Button at the footer of completed response */}
                                      {!loading && getMessageText(msg) && (
                                          <div className="w-full flex justify-end items-center mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                              <span className="text-[9px] font-mono tracking-widest text-neutral-600 mr-2 uppercase select-none font-bold">
                                                  Aura Substrate
                                              </span>
                                              <CopyButton textToCopy={getMessageText(msg)} />
                                          </div>
                                      )}
                                     
                                     {/* Contextual Action Chips */}
                                     {(idx === messages.length - 1 && !loading) && msg.artifacts?.some(a => a.type === 'BETTING_ANALYSIS' || a.type === 'SPORTS_ARTIFACT') && (
                                         <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5, ease: EASE_TRANSITION }} className="w-full max-w-full overflow-hidden mt-5 relative select-none">
                                            <div className="flex overflow-x-auto gap-2.5 pb-2.5 pt-1 -mx-4 px-4 snap-x hide-scrollbars scroll-smooth w-full">
                                                {["Execute Limit Order", "Generate Win Probabilities", "Evaluate Derivatives"].map((q, qIdx) => (
                                                    <motion.button key={q} type="button" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + (qIdx * 0.05), duration: 0.4, ease: EASE_TRANSITION }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => handleQuery(q, undefined)} className="snap-start shrink-0 px-5 h-9 flex items-center justify-center text-[10px] font-mono font-bold tracking-widest uppercase text-neutral-400 hover:text-white bg-[#0A0A0C] active:bg-[#111113] rounded-[6px] border border-white/[0.04] transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] transform-gpu outline-none shadow-sm focus-visible:ring-2 focus-visible:ring-white/20">
                                                        {q}
                                                    </motion.button>
                                                ))}
                                            </div>
                                         </motion.div>
                                     )}
                                 </div>
                             )}
                         </motion.div>
                     ))}
                 </AnimatePresence>
                 <div ref={endRef} className="h-4 w-full" />
              </div>
          )}
          
          {loading && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="flex items-center justify-center mt-8 mb-4 gap-3 text-neutral-500 text-[10px] font-mono tracking-widest uppercase select-none font-bold" aria-live="polite" aria-busy="true">
                 <motion.span animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }} className="w-2 h-2 bg-[#4285F4] rounded-full" />
                 <span className="tracking-widest">{loadingState === 'analyzing' ? 'Analyzing' : 'Synthesizing'}</span>
              </motion.div>
          )}
      </main>

      {/* Input Bar */}
      <div className="fixed bottom-0 w-full p-4 sm:p-6 pb-[calc(env(safe-area-inset-bottom,24px)+16px)] sm:pb-10 bg-gradient-to-t from-[#000000] via-[#000000]/95 to-transparent pointer-events-none z-50 transform-gpu">
         
         {/* Floating Scroll-to-Bottom (Jump) Button */}
         <div className="max-w-[760px] mx-auto relative h-0 w-full pointer-events-none">
             <AnimatePresence>
                 {showScrollButton && (
                     <motion.button
                         key="jump-to-bottom"
                         initial={{ opacity: 0, y: 10, scale: 0.95 }}
                         animate={{ opacity: 1, y: 0, scale: 1 }}
                         exit={{ opacity: 0, y: 10, scale: 0.95 }}
                         transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                         onClick={scrollToBottom}
                         className="absolute bottom-24 right-4 sm:right-8 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.04] bg-[#111111]/90 backdrop-blur-[60px] saturate-[1.2] text-neutral-400 shadow-[0_8px_30px_rgba(0,0,0,0.5),0_0_20px_rgba(255,255,255,0.02)] hover:bg-[#151515] hover:text-white active:scale-[0.98] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] transform-gpu focus:outline-none focus:ring-2 focus:ring-blue-500/40 pointer-events-auto cursor-pointer"
                         aria-label="Jump to latest message"
                     >
                         <ArrowDown size={16} strokeWidth={2.5} className="animate-bounce" style={{ animationDuration: '2s' }} />
                     </motion.button>
                 )}
             </AnimatePresence>
         </div>


         <form 
             onSubmit={(e) => handleQuery(e)} 
             onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
             className={`max-w-[760px] mx-auto relative flex flex-col bg-[#111111]/90 backdrop-blur-[60px] saturate-[1.2] rounded-[32px] shadow-[0_24px_80px_-12px_rgba(0,0,0,0.8),0_0_60px_rgba(255,255,255,0.02)] overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] transform-gpu pointer-events-auto supports-[backdrop-filter]:bg-[#111111]/70 group border border-white/[0.04] focus-within:border-white/[0.04] focus-within:bg-[#111111]/95 focus-within:shadow-[0_32px_100px_-10px_rgba(0,0,0,0.9),0_0_80px_rgba(255,255,255,0.04)] ${isDragging ? 'border-white/30 bg-[#222]/80 shadow-[0_0_80px_-20px_rgba(255,255,255,0.1)]' : ''}`}
         >
            {isDragging && <div className="absolute inset-0 bg-white/5 backdrop-blur-[2px] flex items-center justify-center text-[12px] font-mono tracking-widest uppercase text-white font-bold z-40 animate-pulse pointer-events-none">Drop Asset Here</div>}

            <AnimatePresence>
                {imagePreviewUrl && (
                    <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={SPRING_TRANSITION} className="flex items-center gap-3 px-6 pt-4 pb-2 border-b border-white/[0.04] relative z-10 select-none">
                        <div className="relative w-16 h-16 rounded-[12px] overflow-hidden border border-white/[0.04] shadow-sm">
                            <img src={imagePreviewUrl} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            <button type="button" onClick={clearAttachment} className="absolute top-1 right-1 bg-black/60 hover:bg-black/90 text-white rounded-full p-1 opacity-100 transition-all outline-none"><X className="h-3.5 w-3.5" /></button>
                        </div>
                        <div className="flex flex-col text-left">
                            <span className="text-white/95 text-[13px] font-medium leading-none">Context Asset Attached</span>
                            <span className="text-neutral-500 text-[10px] font-mono mt-1.5 uppercase font-bold tracking-widest">Ready to Analyze</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="flex items-end w-full relative z-10 p-2">
                <div className="pl-1 pr-2 flex items-end gap-0.5 relative z-10 pb-1">
                    <input id="image-upload-input" type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                    <button type="button" aria-label="Add attachment" title="Add attachment" onClick={() => document.getElementById('image-upload-input')?.click()} className={`p-2.5 rounded-full text-white/40 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08] active:scale-[0.98] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] transform-gpu outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${(selectedImage || loading) ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
                       <Plus className="h-[22px] w-[22px]" strokeWidth={2} />
                    </button>
                    <button type="button" aria-label="Dictate" title="Dictate" onClick={toggleListening} className={`p-2.5 rounded-full active:scale-[0.98] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] transform-gpu outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${isListening ? 'text-red-400 bg-red-400/10 hover:bg-red-400/20 shadow-[0_0_12px_rgba(248,113,113,0.3)] animate-pulse' : 'text-white/40 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08]'} ${loading ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
                       <Mic className="h-[20px] w-[20px]" strokeWidth={isListening ? 2.5 : 2} />
                    </button>
                </div>
                
                <textarea
                  aria-label="Substrate Query Input"
                  value={prompt}
                  onChange={(e) => { setPrompt(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`; }}
                  onKeyDown={(e) => { 
                      // Strictly prevent form default submission on Enter
                      if (e.key === 'Enter' && !e.shiftKey) { 
                          e.preventDefault(); 
                          handleQuery(); 
                      } 
                  }}
                  placeholder={isListening ? "Listening..." : imagePreviewUrl ? "Ask about this asset..." : "Message Aura..."}
                  className="flex-1 bg-transparent border-none outline-none py-3.5 text-[16px] text-white/95 placeholder:text-white/20 font-sans font-normal tracking-[-0.01em] disabled:opacity-50 disabled:cursor-not-allowed appearance-none animate-none relative z-10 resize-none min-h-[52px] leading-[24px] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  disabled={loading} rows={1}
                />
                
                <div className="pr-1 pl-2 relative z-10 pb-1 flex items-end">
                    <button 
                      disabled={loading || (!prompt.trim() && !selectedImage)} type="submit" 
                      className={`h-11 w-11 rounded-[16px] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] transform-gpu flex items-center justify-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${loading || (!prompt.trim() && !selectedImage) ? 'bg-white/5 text-white/20 cursor-not-allowed scale-100' : 'bg-white text-black shadow-[0_4px_24px_rgba(255,255,255,0.25)] hover:shadow-[0_8px_32px_rgba(255,255,255,0.4)] hover:scale-[1.03] active:scale-[0.98] cursor-pointer'}`}
                    >
                        {loading ? <div className="w-[18px] h-[18px] border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Send className="h-[18px] w-[18px] translate-x-[-1px] translate-y-[-0.5px]" strokeWidth={2} />}
                    </button>
                </div>
            </div>
            
            {viewedDocument && (
                <motion.div 
                    initial={{ opacity: 0, y: 20 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    exit={{ opacity: 0, y: 20 }} 
                    transition={SPRING_TRANSITION}
                    className="absolute -top-20 left-0 right-0 px-6 py-4 bg-[#0A0A0C]/90 backdrop-blur-[60px] saturate-[1.2] border border-white/[0.04] shadow-[0_4px_30px_rgba(0,0,0,0.5),0_0_20px_rgba(255,255,255,0.02)] flex items-center justify-between z-40 rounded-[16px] mx-4 mb-4"
                >
                    <div className="flex items-center gap-3">
                        {viewedDocument.mimeType.includes('spreadsheet') || viewedDocument.mimeType.includes('csv') ? (
                            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                        ) : (
                            <FileText className="w-5 h-5 text-blue-400" />
                        )}
                        <span className="text-[13px] font-medium text-white/95 truncate max-w-[150px] sm:max-w-[250px]">Context: {viewedDocument.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            type="button" 
                            onClick={() => handleQuery(`Summarize this file for a client.`, viewedDocument)} 
                            className="flex items-center gap-2 px-4 py-2 bg-white/[0.05] hover:bg-white/[0.1] rounded-full text-[12px] font-medium text-white transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                        >
                            <Sparkles className="w-3.5 h-3.5 text-blue-400" /> Summarize
                        </button>
                        <button 
                            type="button" 
                            onClick={() => handleQuery(`Extract key values from this file.`, viewedDocument)} 
                            className="flex items-center gap-2 px-4 py-2 bg-white/[0.05] hover:bg-white/[0.1] rounded-full text-[12px] font-medium text-white transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                        >
                            <Filter className="w-3.5 h-3.5 text-purple-400" /> Extract Values
                        </button>
                        <button 
                            type="button" 
                            onClick={() => setViewedDocument(null)} 
                            className="p-2 rounded-full text-neutral-500 hover:text-white hover:bg-white/[0.05] transition-colors outline-none"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </motion.div>
            )}
         </form>
      </div>
    </>
  );
}

// ============================================================================
// Canonical Pages 
// ============================================================================
function CanonicalEntityPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    
    // Dynamic Fetching (No Mock Arrays)
    const { story, loading } = useStoryData(id);

    const { scrollYProgress, scrollY } = useScroll();
    const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });
    const heroY = useTransform(scrollY, [0, 600], [0, 200]);
    const heroOpacity = useTransform(scrollY, [0, 400], [1, 0]);

    if (loading) return <div className="p-16 text-center text-neutral-500 text-[10px] font-mono tracking-widest uppercase font-bold mt-20 animate-pulse">Resolving Substrate Link...</div>;
    if (!story) return <div className="p-16 text-center text-neutral-500 text-[14px] mt-20 font-sans">Asset not found.</div>;

    const isExternalNews = story.type === 'EXTERNAL_NEWS';
    const isPrediction = story.type === 'PREDICTION_MARKET';
    const sourceStyling = { bg: 'bg-white', text: 'text-white', border: 'border-white/[0.04]', glow: 'group-hover:from-white/10', hoverBorder: 'group-hover:border-white/[0.04]' };

    return (
        <article className="w-full pb-40 text-left bg-[#000000] relative font-sans">
            <SEO title={`${story.headline} | Aura`} canonicalPath={`/story/${story.slug || story.id}`} />
            <motion.div style={{ scaleX }} className={`fixed top-0 left-0 right-0 h-[4px] origin-left z-50 shadow-[0_0_15px_rgba(255,255,255,0.4)] ${isExternalNews ? sourceStyling.bg : 'bg-[#4285F4]'}`} />

            <div className="w-full h-[65vh] sm:h-[80vh] relative bg-[#000000] overflow-hidden">
                <motion.div style={{ y: heroY, opacity: heroOpacity }} className="absolute inset-0 w-full h-full">
                    <SafeImage src={story.image_url!} alt={story.headline} containerClassName="w-full h-full border-none" imageClassName={`opacity-80 object-cover object-center ${isExternalNews ? 'grayscale-[0.05]' : 'grayscale-[0.3]'}`} kenBurns={true} priority />
                </motion.div>
                
                <div className="absolute inset-0 bg-gradient-to-t from-[#000000] via-[#000000]/60 to-transparent z-10" />
                <div className="absolute inset-0 bg-gradient-to-b from-[#000000]/30 via-transparent to-transparent z-10" />
                
                <div className="absolute inset-0 flex flex-col justify-end px-6 sm:px-12 pb-16 max-w-[840px] mx-auto w-full z-20">
                    <button onClick={() => navigate(-1)} className="absolute top-8 left-6 sm:left-12 inline-flex items-center gap-2 text-white/80 hover:text-white transition-all duration-300 active:scale-95 bg-black/40 backdrop-blur-[60px] saturate-[1.2] px-4 py-2 rounded-full border border-white/[0.04] text-[10px] font-mono uppercase tracking-widest font-bold outline-none shadow-sm focus-visible:ring-2 focus-visible:ring-white/20">
                       <ArrowLeft className="h-4 w-4" strokeWidth={2} /> Return
                    </button>

                    <div className="flex flex-wrap gap-3 items-center mb-6 select-none font-sans">
                        {isExternalNews ? (
                            <span className={`text-[12px] font-mono ${sourceStyling.text} uppercase tracking-widest font-bold bg-black/80 backdrop-blur-sm px-3 py-1.5 rounded-[6px] border ${sourceStyling.border} shadow-sm flex items-center gap-2`}>
                                <Globe className={`w-3.5 h-3.5 ${sourceStyling.text}`} /> {story.category || 'External Context'}
                            </span>
                        ) : (
                            <span className="text-[12px] font-mono text-[#4285F4] uppercase tracking-widest font-bold bg-[#4285F4]/10 px-3 py-1.5 rounded-[6px] border border-[#4285F4]/20 shadow-sm">{story.category || 'Intelligence'}</span>
                        )}
                    </div>
                    <h1 className="text-[38px] sm:text-[64px] font-medium tracking-tight text-white/95 leading-[1.05] mb-8 drop-shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8),0_0_20px_rgba(255,255,255,0.02)] max-w-3xl">
                        {story.headline}
                    </h1>
                    <div className="flex items-center gap-3 text-[12px] font-mono text-neutral-300 uppercase tracking-widest tabular-nums lining-nums font-bold drop-shadow">
                        {isExternalNews ? <span className="flex items-center gap-2 text-white"><span className={`w-2.5 h-2.5 rounded-full ${sourceStyling.bg}`} /> {story.source}</span> : <span>{story.source || 'Aura Protocol'}</span>}
                    </div>
                </div>
            </div>

            <div className={`max-w-[720px] mx-auto px-6 sm:px-0 relative z-30 pt-4`}>
                
                {isExternalNews && story.source_url && (
                    <a href={story.source_url} target="_blank" rel="noopener noreferrer" className={`flex items-center justify-between w-full p-6 bg-[#0A0A0C] border ${sourceStyling.border} rounded-[12px] mb-12 hover:bg-[#111113] transition-colors group outline-none focus-visible:ring-2 focus-visible:ring-white/20`}>
                        <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-[8px] ${sourceStyling.bg} flex items-center justify-center border border-white/[0.04] shrink-0`}><ExternalLink className={`w-4 h-4 text-white`} /></div>
                            <div className="flex flex-col"><span className="text-[15px] font-bold text-white">Read Original Article</span><span className="text-[12px] font-mono text-neutral-500 uppercase tracking-widest">via {story.source}</span></div>
                        </div>
                        <ChevronRight className={`w-5 h-5 text-neutral-500 group-hover:text-white transition-colors`} />
                    </a>
                )}

                {isPrediction ? (
                    <div className="bg-[#050505] rounded-[24px] p-8 sm:p-12 my-8 text-center border border-white/[0.04] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8),0_0_20px_rgba(255,255,255,0.02)] transform-gpu w-[calc(100%+32px)] -ml-4 sm:w-full sm:ml-0">
                        <div className="inline-flex items-center gap-2 text-[#34C759] text-[11px] font-bold uppercase tracking-widest mb-10 select-none font-sans bg-[#34C759]/10 px-4 py-2 rounded-full border border-[#34C759]/20"><Activity className="w-4 h-4" /> Kalshi Market Node</div>
                        <h2 className="text-[32px] sm:text-[40px] font-sans font-medium text-white/95 leading-[1.2] mb-12 tracking-tight max-w-2xl mx-auto">{story.headline}</h2>
                        <div className="flex flex-col sm:flex-row justify-center items-center gap-8 sm:gap-16 mb-12 select-none font-sans">
                            <div className="text-center flex-1">
                                <div className="text-[12px] text-neutral-500 font-mono uppercase tracking-widest mb-4 font-bold">Implied Yes</div>
                                <div className="text-[64px] sm:text-[80px] font-sans font-medium text-white/95 tabular-nums lining-nums leading-none tracking-tighter drop-shadow-md">{story.metadata?.kalshi_yes_price || 50}<span className="text-[32px] sm:text-[40px] text-neutral-600 font-normal ml-1">%</span></div>
                            </div>
                            <div className="w-full sm:w-px h-px sm:h-32 bg-white/[0.08]" />
                            <div className="text-center flex-1">
                                <div className="text-[12px] text-neutral-500 font-mono uppercase tracking-widest mb-4 font-bold">Implied No</div>
                                <div className="text-[64px] sm:text-[80px] font-sans font-medium text-neutral-500 tabular-nums lining-nums leading-none tracking-tighter drop-shadow-md">{100 - (story.metadata?.kalshi_yes_price || 50)}<span className="text-[32px] sm:text-[40px] text-neutral-700 font-normal ml-1">%</span></div>
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row justify-center gap-4 max-w-lg mx-auto font-sans">
                            <button className="flex-1 bg-white hover:bg-neutral-200 text-black min-w-[160px] text-[14px] font-bold uppercase tracking-widest py-4 rounded-[8px] transition-all duration-300 active:scale-[0.98] outline-none shadow-sm">Buy Yes</button>
                            <button className="flex-1 bg-[#111113] hover:bg-[#18181b] text-white border border-white/[0.04] min-w-[160px] text-[14px] font-bold uppercase tracking-widest py-4 rounded-[8px] transition-all duration-300 active:scale-[0.98] outline-none shadow-sm">Buy No</button>
                        </div>
                    </div>
                ) : (
                    <div className="w-full max-w-none text-left">
                        <Markdown remarkPlugins={CHAT_REMARK_PLUGINS} components={EDITORIAL_MARKDOWN_COMPONENTS}>
                            {story.editorial_copy || story.summary}
                        </Markdown>
                    </div>
                )}
                 
                {!isExternalNews && story.factual_claims && story.factual_claims.length > 0 && (
                     <footer className="text-[11px] font-mono text-neutral-600 pt-10 mt-16 border-t border-white/[0.04] uppercase tracking-widest leading-relaxed select-none font-bold text-center">
                         <span className="text-neutral-500">Provenance Validated via: </span> {Array.from(new Set(story.factual_claims.map((c: any) => c.source_entity))).join(', ')}
                     </footer>
                )}
            </div>
        </article>
    );
}

function CategoryHubPage() {
    const { category } = useParams<{ category: string }>();
    const { feed, loading } = useFeedData();
    const filteredFeed = useMemo(() => {
        if (!category) return [];
        const decoded = decodeURIComponent(category).toLowerCase();
        return feed.filter(c => c.category?.toLowerCase() === decoded);
    }, [feed, category]);

    const displayCategory = category ? decodeURIComponent(category).charAt(0).toUpperCase() + decodeURIComponent(category).slice(1) : "Hub";

    return (
        <div className="max-w-[760px] mx-auto w-full p-6 sm:p-8 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-[0.16,1,0.3,1] pt-10 pb-40 text-left font-sans">
           <Link to="/" className="inline-flex items-center gap-2 text-neutral-500 hover:text-white transition-all duration-300 active:scale-[0.98] mb-10 text-[10px] font-mono font-bold uppercase tracking-widest rounded-[8px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 px-4 py-2 bg-[#0A0A0C] border border-white/[0.04] shadow-sm">
               <ArrowLeft className="h-4 w-4" strokeWidth={1.5} /> Substrate Console
           </Link>
           <h1 className="text-[32px] font-medium tracking-tight mb-10 text-white/95">Latest in {displayCategory}</h1>
           
           {loading ? (
               <div className="space-y-6 animate-pulse" aria-busy="true">
                   {[1, 2, 3].map(i => <div key={i} className="h-32 bg-[#050505] rounded-[16px] border border-white/[0.04]" />)}
               </div>
           ) : filteredFeed.length === 0 ? (
               <div className="text-neutral-500 text-[11px] font-mono tracking-widest text-center bg-[#050505] border border-white/[0.04] p-10 rounded-[16px] border-dashed select-none uppercase font-bold">
                   No intelligence available in this sector.
               </div>
           ) : (
               <div className="space-y-6">
                   {filteredFeed.map(story => (
                       <Link key={story.id} to={`/story/${story.slug || story.id}`} className="block border border-white/[0.04] bg-[#050505]/60 p-6 sm:p-8 rounded-[16px] hover:bg-[#0A0A0C]/80 hover:border-white/[0.04] transition-all duration-300 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 font-sans cursor-pointer shadow-[0_12px_40px_rgba(0,0,0,0.4)] hover:shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8),0_0_20px_rgba(255,255,255,0.02)] backdrop-blur-[60px] saturate-[1.2]">
                           <h2 className="text-[20px] font-medium text-white/95 mb-3 tracking-tight leading-[1.3]">{story.headline}</h2>
                           <p className="text-[15px] text-neutral-400 line-clamp-2 leading-[1.65] font-serif tracking-[-0.01em]">{story.summary}</p>
                           <time dateTime={new Date(story.publishedAt).toISOString()} className="mt-6 block text-[10px] font-mono text-neutral-500 uppercase tracking-widest tabular-nums lining-nums font-bold">
                                {new Date(story.publishedAt).toLocaleDateString()}
                           </time>
                       </Link>
                   ))}
               </div>
           )}
        </div>
    );
}

function TeamCanonicalPage() {
    const { slug } = useParams<{ slug: string }>();
    return (
        <div className="max-w-[760px] mx-auto w-full p-6 sm:p-8 pt-10 animate-in fade-in text-left font-sans">
            <SEO title={`${(slug || '').toUpperCase()} | Team Data`} canonicalPath={`/team/${slug}`} />
            <Link to="/" className="inline-flex items-center gap-2 text-neutral-500 hover:text-white transition-all duration-300 active:scale-[0.98] mb-10 text-[10px] font-mono font-bold uppercase tracking-widest rounded-[8px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 px-4 py-2 bg-[#0A0A0C] border border-white/[0.04] shadow-sm">
               <ArrowLeft className="h-4 w-4" strokeWidth={1.5} /> Substrate Console
            </Link>
            <h1 className="text-[32px] font-medium text-white/95 mb-8 capitalize tracking-tight">{slug?.replace(/-/g, ' ')}</h1>
            <div className="bg-[#050505]/60 border border-white/[0.04] p-10 rounded-[16px] text-neutral-500 text-center text-[10px] font-mono uppercase tracking-widest border-dashed select-none font-bold shadow-[0_12px_40px_rgba(0,0,0,0.4)] backdrop-blur-[60px]">Team context synchronization pending...</div>
        </div>
    );
}

// ============================================================================
// Live Terminal Routing Wrapper
// ============================================================================
function LiveTerminalRoute() {
    const { gameId } = useParams<{ gameId: string }>();
    const { user, token } = useAuthContext(); // Assuming a context for auth
    return (
        <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-10 flex flex-col animate-in fade-in duration-700 min-h-[100dvh]">
            <div className="w-full mb-6 shrink-0">
                <button 
                    onClick={() => window.history.back()} // Go back to previous page
                    className="inline-flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-widest text-neutral-400 hover:text-white transition-all bg-[#050505] hover:bg-[#0A0A0C] px-5 py-2.5 rounded-[8px] border border-white/[0.04] outline-none shadow-sm focus-visible:ring-2 focus-visible:ring-white/20 active:scale-95"
                >
                    <ArrowLeft className="w-3.5 h-3.5" /> Return to Feed
                </button>
            </div>
            
            <div className="flex-1 w-full relative min-h-0">
                <LiveQuantTerminal gameId={gameId || "mlb_sd_phi"} accessToken={token || undefined} />
            </div>
        </main>
    );
}

// Dummy Auth Context for LiveTerminalRoute
const AuthContext = React.createContext<any>(null);
const useAuthContext = () => React.useContext(AuthContext);

// ============================================================================
// Main Application Wrapper 
// ============================================================================
export default function App() {
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  
  // Lifted Chat State (Prevents routing amnesia)
  const [messages, setMessages] = useState<AuraChatMessage[]>([]);

  useEffect(() => {
    const unsubscribe = initAuth((currentUser, currentToken) => {
        setUser(currentUser); setToken(currentToken); setLoadingAuth(false);
    }, () => {
        setUser(null); setToken(null); setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => { 
    setLoadingAuth(true); 
    try { 
      const res = await googleSignIn(); 
      if (res) { setUser(res.user); setToken(res.accessToken); } 
    } catch (err: any) { 
      console.error("Sign in failed:", err); 
      if (err.message && err.message.includes('auth/unauthorized-domain')) {
        alert(
          `Firebase Auth Error: Please add your app's domain to your Authorized Domains in the Firebase Console.\n\n` +
          `1. Go to Firebase Console -> Authentication -> Settings -> Authorized domains\n` +
          `2. Click 'Add domain'\n` +
          `3. Add this exact domain: ${window.location.hostname}`
        );
      } else {
        alert(`Sign in failed: ${err.message || 'Unknown error'}`);
      }
    } finally { 
      setLoadingAuth(false); 
    } 
  };
  const handleSignOut = async () => { setLoadingAuth(true); try { await logout(); setUser(null); setToken(null); } catch (err) { console.error("Sign out failed:", err); } finally { setLoadingAuth(false); } };

  return (
    <BrowserRouter>
      
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 to-black text-neutral-200 flex flex-col font-sans selection:bg-white/15 selection:text-white">
          <Navigation user={user} loadingAuth={loadingAuth} onSignIn={handleSignIn} onSignOut={handleSignOut} />
          <AuthContext.Provider value={{ user, token }}>
            <Routes>
                <Route path="/" element={<ChatInterface user={user} token={token} onSignIn={handleSignIn} loadingAuth={loadingAuth} messages={messages} setMessages={setMessages} />} />
                <Route path="/story/:id" element={<CanonicalEntityPage />} />
                <Route path="/team/:slug" element={<TeamCanonicalPage />} />
                <Route path="/category/:category" element={<CategoryHubPage />} />
                <Route path="/live/:gameId" element={<LiveTerminalRoute />} />
            </Routes>
          </AuthContext.Provider>
      </div>
    </BrowserRouter>
  );
}
