import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Sparkles, Zap, AlertTriangle, ChevronRight, Clock, 
    Crosshair, Loader2, CheckCircle, Activity, Lock,
    TerminalSquare, Server, Database, ArrowBigRight, WifiOff
} from 'lucide-react';

const EASE_TRANSITION = [0.16, 1, 0.3, 1];
const SPRING = { type: 'spring' as const, stiffness: 400, damping: 30 };

export interface PlayByPlayEvent { id: string; clock: string; description: string; teamAbbr: string; wpa: number; homeScore: number; awayScore: number; isHighLeverage: boolean; timestamp: number; }
export interface QuantInsight { severity: "INFO" | "EDGE_DETECTED" | "CRITICAL_EXECUTION"; headline: string; quantitative_analysis: string; recommended_action: { market: string; action: "BUY_YES" | "BUY_NO" | "HOLD"; target_price_cents: number; expected_value_delta: number; }; }
type ExecutionState = 'IDLE' | 'AUTHORIZING' | 'ROUTING' | 'MATCHING' | 'FILLED' | 'FAILED';
type EngineState = 'IDLE' | 'SYNTHESIZING';
type ConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED';

const Typewriter = React.memo(({ text, speed = 8 }: { text: string, speed?: number }) => {
    const [displayed, setDisplayed] = useState('');
    useEffect(() => {
        setDisplayed(''); let i = 0;
        const interval = setInterval(() => { setDisplayed(text.substring(0, i)); i++; if (i > text.length) clearInterval(interval); }, speed);
        return () => clearInterval(interval);
    }, [text, speed]);
    return <span>{displayed}{displayed.length < text.length && <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-[#4285F4] animate-pulse align-middle" />}</span>;
});
Typewriter.displayName = 'Typewriter';

const WpaMomentumMatrix = React.memo(({ feed }: { feed: PlayByPlayEvent[] }) => {
    const netWPA = useMemo(() => {
        if (!feed.length) return 0;
        return Math.max(-1, Math.min(1, feed.slice(0, 15).reduce((acc, play) => acc + play.wpa, 0))); 
    }, [feed]);

    const shiftPercent = 50 + (netWPA * 50);

    return (
        <div className="w-full bg-[#050505] p-5 border-b border-white/[0.04] flex flex-col gap-3 shrink-0 z-20 shadow-sm relative">
            <div className="flex justify-between items-center text-[9px] font-mono uppercase tracking-widest text-neutral-500 font-bold">
                <span className={netWPA < 0 ? 'text-[#FF3B30]' : 'text-neutral-500 transition-colors'}>Away Momentum</span>
                <span className={netWPA > 0 ? 'text-[#34C759]' : 'text-neutral-500 transition-colors'}>Home Momentum</span>
            </div>
            <div className="h-2 w-full bg-[#111113] rounded-full overflow-hidden relative shadow-inner flex border border-white/[0.02]">
                <motion.div className="h-full bg-[#FF3B30]/80 shadow-[0_0_12px_rgba(255,59,48,0.6)]" animate={{ width: `${100 - shiftPercent}%` }} transition={{ type: 'spring', bounce: 0.2, duration: 0.8 }} />
                <motion.div className="h-full bg-[#34C759]/80 shadow-[0_0_12px_rgba(52,199,89,0.6)]" animate={{ width: `${shiftPercent}%` }} transition={{ type: 'spring', bounce: 0.2, duration: 0.8 }} />
                <div className="absolute top-0 bottom-0 left-1/2 w-[2px] bg-white/20 -translate-x-1/2 z-10" />
            </div>
            <div className="flex justify-between text-[10px] font-mono font-bold">
                <span className="text-[#FF3B30]">{netWPA < 0 ? `+${(Math.abs(netWPA) * 100).toFixed(1)}% WPA` : ''}</span>
                <span className="text-[#34C759]">{netWPA > 0 ? `+${(netWPA * 100).toFixed(1)}% WPA` : ''}</span>
            </div>
        </div>
    );
});
WpaMomentumMatrix.displayName = 'WpaMomentumMatrix';

export function LiveQuantTerminal({ gameId = "mlb_sd_phi", accessToken }: { gameId?: string; accessToken?: string; }) {
    const [pbpFeed, setPbpFeed] = useState<PlayByPlayEvent[]>([]);
    const [insights, setInsights] = useState<QuantInsight[]>([]);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('CONNECTING'); 
    const [executionState, setExecutionState] = useState<ExecutionState>('IDLE');
    const [engineState, setEngineState] = useState<EngineState>('IDLE');
    const [ping, setPing] = useState(0); 
    
    const connected = connectionStatus === 'CONNECTED';
    const pbpScrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (pbpScrollRef.current) requestAnimationFrame(() => pbpScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }));
    }, [pbpFeed]);

    useEffect(() => {
        if (!gameId) return;

        let eventSource: EventSource | null = null;
        let reconnectTimeoutId: NodeJS.Timeout | null = null;
        let retryCount = 0;
        
        const lastEventIdKey = `last_event_id_${gameId}`;
        let lastEventId = typeof window !== 'undefined' ? localStorage.getItem(lastEventIdKey) || undefined : undefined;

        const connect = () => {
            if (eventSource) eventSource.close();
            setConnectionStatus('CONNECTING'); 

            try {
                const params = new URLSearchParams();
                if (accessToken) params.append('token', accessToken);
                if (lastEventId) params.append('last_event_id', lastEventId);
                
                const queryStr = params.toString() ? `?${params.toString()}` : '';
                eventSource = new EventSource(`/api/stream/${gameId}${queryStr}`);

                const handleMessage = (event: MessageEvent) => {
                    try {
                        const parsed = JSON.parse(event.data);
                        if (parsed.type === 'HEARTBEAT') {
                            if (parsed.timestamp) setPing(Math.max(1, Date.now() - parsed.timestamp));
                            return;
                        }
                        if (parsed.type === 'PBP_TICK') {
                            setPbpFeed(prev => {
                                if (prev.some(p => p.id === parsed.data.id)) return prev;
                                return [parsed.data, ...prev].slice(0, 50);
                            });
                            if (parsed.data.isHighLeverage) setEngineState('SYNTHESIZING');
                        } else if (parsed.type === 'ALPHA_SIGNAL') {
                            setInsights(prev => [parsed.data, ...prev].slice(0, 5));
                            setEngineState('IDLE');
                        } else if (parsed.type === 'SYSTEM_RESTART') {
                            eventSource?.close(); 
                            setConnectionStatus('CONNECTING');
                            reconnectTimeoutId = setTimeout(connect, 1000); 
                            return;
                        }
                        
                        if (typeof window !== 'undefined' && event.lastEventId) {
                            lastEventId = event.lastEventId;
                            localStorage.setItem(lastEventIdKey, event.lastEventId);
                        }
                    } catch (err) { }
                };

                eventSource.addEventListener('message', handleMessage);
                eventSource.onopen = () => { setConnectionStatus('CONNECTED'); retryCount = 0; };
                eventSource.onerror = () => {
                    setConnectionStatus('DISCONNECTED'); setPing(0); 
                    if (eventSource) eventSource.close();
                    const delay = Math.min(1000 * Math.pow(2, retryCount), 15000);
                    retryCount++;
                    reconnectTimeoutId = setTimeout(connect, delay);
                };
            } catch (e) {
                setConnectionStatus('DISCONNECTED');
                reconnectTimeoutId = setTimeout(connect, 5000); 
            }
        };

        connect(); 
        return () => { if (eventSource) eventSource.close(); if (reconnectTimeoutId) clearTimeout(reconnectTimeoutId); };
    }, [gameId, accessToken]); 

    const handleExecuteOrder = useCallback(async (insight: QuantInsight) => {
        if (executionState !== 'IDLE') return;
        const target = insight.recommended_action;
        if (target.action === 'HOLD') { setExecutionState('IDLE'); return; }

        setExecutionState('AUTHORIZING');
        try {
            if (typeof window === 'undefined') return;
            const keyId = localStorage.getItem('kalshi_key_id');
            const privKey = localStorage.getItem('kalshi_priv_key');
            if (!keyId || !privKey) throw new Error("API credentials not found in secure storage.");

            const payload: any = {
                tool: 'place_limit_order',
                args: { ticker: target.market, side: target.action === 'BUY_YES' ? 'yes' : 'no', action: 'buy', count: 10, price_cents: target.target_price_cents },
                credentials: { keyId, privateKey: privKey } 
            };

            setExecutionState('ROUTING');
            const res = await fetch('/api/mcp/kalshi/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

            setExecutionState('MATCHING');
            const data = await res.json();
            if (!res.ok || data.error || data.result?.status === 'error') throw new Error(data.error || data.result?.message || "Execution rejected by exchange.");

            setExecutionState('FILLED');
        } catch (err: any) {
            setExecutionState('FAILED');
        } finally {
            setTimeout(() => setExecutionState('IDLE'), 4000);
        }
    }, [executionState]);

    const currentScores = pbpFeed.length > 0 ? pbpFeed[0] : { homeScore: 0, awayScore: 0 };
    const awayTeamName = gameId.split('_')[1]?.toUpperCase() || 'AWAY';
    const homeTeamName = gameId.split('_')[2]?.toUpperCase() || 'HOME';

    return (
        <div className="w-full max-w-[1400px] mx-auto bg-[#000000] border border-white/[0.04] rounded-[24px] sm:rounded-[32px] overflow-hidden flex flex-col lg:flex-row shadow-[0_24px_80px_rgba(0,0,0,0.8),inset_0_1px_2px_rgba(255,255,255,0.02)] h-[80vh] min-h-[700px] font-sans relative z-10">
            
            {/* LEFT COLUMN: Fast Path (The Telemetry Sieve) */}
            <div className="w-full lg:w-[35%] xl:w-[30%] border-b lg:border-b-0 lg:border-r border-white/[0.04] bg-[#0A0A0C] flex flex-col relative overflow-hidden shrink-0 h-[40%] lg:h-full">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(66,133,244,0.05),transparent_50%)] pointer-events-none" />
                
                <div className="p-5 border-b border-white/[0.04] flex items-center justify-between bg-[#0A0A0C]/80 backdrop-blur-[60px] saturate-[1.2] relative z-20 shadow-sm shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="relative flex h-2 w-2">
                            {connectionStatus === 'CONNECTED' ? (
                                <><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#34C759] opacity-50" /><span className="relative inline-flex rounded-full h-2 w-2 bg-[#34C759]" /></>
                            ) : connectionStatus === 'CONNECTING' ? (
                                <><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF9500] opacity-50" /><span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF9500]" /></>
                            ) : (
                                <><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF3B30] opacity-50" /><span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF3B30]" /></>
                            )}
                        </div>
                        <h2 className="text-[11px] font-mono font-bold text-white tracking-widest uppercase">Telemetry Stream</h2>
                    </div>
                    
                    <div className={`text-[9px] font-mono uppercase tracking-widest px-2 py-1 rounded-[4px] border flex items-center gap-1.5 shadow-inner transition-colors duration-300 ${
                        connectionStatus === 'CONNECTED' ? 'bg-white/[0.03] text-neutral-400 border-white/[0.04]' : 
                        connectionStatus === 'CONNECTING' ? 'bg-[#FF9500]/10 text-[#FF9500] border-[#FF9500]/20' : 
                        'bg-[#FF3B30]/10 text-[#FF3B30] border-[#FF3B30]/20'
                    }`}>
                        {connectionStatus === 'CONNECTED' && <><Server className="w-3 h-3" /> {ping}ms SLI</>}
                        {connectionStatus === 'CONNECTING' && <><Activity className="w-3 h-3 animate-pulse" /> Reconnecting</>}
                        {connectionStatus === 'DISCONNECTED' && <><WifiOff className="w-3 h-3" /> Offline</>}
                    </div>
                </div>

                <div className="px-5 py-4 border-b border-white/[0.04] flex justify-between items-center bg-[#050505] z-20 relative shadow-sm select-none shrink-0">
                    <div className="flex items-center gap-4 text-[20px] font-medium tracking-tight text-white/95 font-sans">
                        <span className="text-neutral-500 text-[14px] font-bold">{awayTeamName}</span> 
                        <span className="tabular-nums lining-nums">{currentScores.awayScore ?? 0}</span>
                    </div>
                    <div className="text-[9px] font-mono text-neutral-600 tracking-widest uppercase font-bold flex items-center gap-1.5">
                        <Activity className="w-3 h-3" /> Live Event
                    </div>
                    <div className="flex items-center gap-4 text-[20px] font-medium tracking-tight text-white/95 font-sans">
                        <span className="tabular-nums lining-nums">{currentScores.homeScore ?? 0}</span>
                        <span className="text-neutral-500 text-[14px] font-bold">{homeTeamName}</span>
                    </div>
                </div>

                <WpaMomentumMatrix feed={pbpFeed} />

                <div ref={pbpScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden relative z-10 flex flex-col justify-start">
                    <AnimatePresence initial={false}>
                        {pbpFeed.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center opacity-30 p-8 h-full">
                                <Database className={`w-8 h-8 mb-3 stroke-[1.5] ${connectionStatus === 'CONNECTED' ? 'text-neutral-500 animate-pulse' : connectionStatus === 'CONNECTING' ? 'text-[#FF9500] animate-pulse' : 'text-[#FF3B30]'}`} />
                                <p className="text-[11px] font-mono font-bold tracking-widest uppercase text-neutral-400">
                                    {connectionStatus === 'CONNECTED' ? 'Awaiting upstream telemetry...' : connectionStatus === 'CONNECTING' ? 'Establishing secure link...' : 'Socket disconnected. Polling gateway...'}
                                </p>
                            </div>
                        ) : (
                            pbpFeed.map((play, idx) => (
                                <motion.div
                                    key={play.id}
                                    layout
                                    initial={{ opacity: 0, y: -20, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    transition={SPRING}
                                    className={`flex flex-col gap-2 p-4 rounded-[16px] border transition-colors duration-500 relative overflow-hidden ${
                                        play.isHighLeverage 
                                        ? 'bg-[#FF3B30]/[0.08] border-[#FF3B30]/30 shadow-[inset_0_0_20px_rgba(255,59,48,0.1)]' 
                                        : idx === 0 ? 'bg-[#111113] border-white/[0.04] shadow-sm' : 'bg-transparent border-transparent opacity-60'
                                    }`}
                                >
                                    {play.isHighLeverage && <div className="absolute top-0 left-0 w-1 h-full bg-[#FF3B30] shadow-[0_0_10px_rgba(255,59,48,0.8)]" />}
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2 text-[10px] font-mono font-bold text-neutral-500 uppercase">
                                            <Clock className="w-3 h-3 text-neutral-600" /> {play.clock}
                                        </div>
                                        <div className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-[4px] uppercase tracking-widest flex items-center gap-1.5 ${play.wpa > 0 ? 'bg-[#34C759]/10 text-[#34C759]' : 'bg-[#FF3B30]/10 text-[#FF3B30]'}`}>
                                            <Activity className="w-2.5 h-2.5" /> WPA {play.wpa > 0 ? '+' : ''}{(play.wpa * 100).toFixed(1)}%
                                        </div>
                                    </div>
                                    <div className={`text-[13px] leading-[1.65] tracking-tight ${play.isHighLeverage ? 'text-white/95 font-medium' : 'text-neutral-300'}`}>
                                        <span className={`font-bold mr-1.5 ${play.isHighLeverage ? 'text-[#FF3B30]' : 'text-white/95'}`}>{play.teamAbbr}</span>
                                        {play.description}
                                    </div>
                                </motion.div>
                            ))
                        )}
                    </AnimatePresence>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#0A0A0C] to-transparent pointer-events-none z-20" />
            </div>

            {/* RIGHT COLUMN: Slow Path (Gemini 3.5 Quant Node) */}
            <div className="flex-1 bg-[#050505] flex flex-col relative overflow-hidden h-[60%] lg:h-full">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(66,133,244,0.03),transparent_60%)] pointer-events-none z-0" />

                <div className="p-5 border-b border-white/[0.04] flex items-center justify-between bg-[#050505]/90 backdrop-blur-[60px] saturate-[1.2] relative z-20 shadow-sm shrink-0">
                    <div className="flex items-center gap-3">
                        <Sparkles className={`w-4 h-4 ${engineState === 'SYNTHESIZING' ? 'text-[#FF3B30] animate-spin' : 'text-[#4285F4]'}`} strokeWidth={2.5} />
                        <h2 className="text-[11px] font-mono font-bold text-[#E5E5E5] tracking-widest uppercase">
                            Quantitative Analysis Engine
                        </h2>
                    </div>
                    <span className={`text-[9px] font-mono font-bold uppercase tracking-widest px-2.5 py-1 rounded-[4px] border transition-colors duration-500 ${
                        engineState === 'SYNTHESIZING' 
                            ? 'bg-[#FF3B30]/10 text-[#FF3B30] border-[#FF3B30]/30'
                            : 'bg-[#4285F4]/10 text-[#4285F4] border-[#4285F4]/20'
                    }`}>
                        {engineState === 'SYNTHESIZING' ? 'Synthesizing Edge...' : 'Engine Online'}
                    </span>
                </div>

                <div className="flex-1 p-6 sm:p-10 flex flex-col justify-center relative z-10 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <AnimatePresence mode="wait">
                        {engineState === 'SYNTHESIZING' ? (
                            <motion.div 
                                key="synthesizing" 
                                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }}
                                transition={{ duration: 0.4 }}
                                className="flex-1 flex flex-col items-center justify-center text-center select-none"
                            >
                                <div className="relative w-16 h-16 mb-8 flex items-center justify-center">
                                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} className="absolute inset-0 rounded-full border-t-2 border-r-2 border-[#4285F4] opacity-80" />
                                    <motion.div animate={{ rotate: -360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} className="absolute inset-2 rounded-full border-b-2 border-l-2 border-[#FF3B30] opacity-80" />
                                    <Sparkles className="w-6 h-6 text-white" />
                                </div>
                                <div className="text-[12px] font-mono uppercase tracking-widest font-bold text-white/90 mb-3">Volatility Spike Detected</div>
                                <p className="text-[14px] text-neutral-500 max-w-sm leading-relaxed font-sans">Evaluating Order Book Dislocation via Multi-Modal Context Window...</p>
                            </motion.div>
                        ) : insights.length === 0 ? (
                            <motion.div 
                                key="idle" 
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="flex-1 flex flex-col items-center justify-center text-center opacity-40 select-none"
                            >
                                <Crosshair className="w-12 h-12 text-neutral-500 mb-6 stroke-[1.5]" />
                                <div className="text-[11px] font-mono uppercase tracking-widest font-bold text-neutral-400 mb-2">Algorithm Idle</div>
                                <p className="text-[14px] text-neutral-500 max-w-sm leading-relaxed font-sans">
                                    Awaiting dynamic variance trigger from the telemetry feed to synthesize market execution logic.
                                </p>
                            </motion.div>
                        ) : (
                            insights.map((insight, idx) => (
                                <motion.div 
                                    key={`insight-${idx}`}
                                    initial={{ opacity: 0, y: 30, scale: 0.95 }} 
                                    animate={{ opacity: 1, y: 0, scale: 1 }} 
                                    exit={{ opacity: 0, y: -30, scale: 0.95 }}
                                    transition={SPRING}
                                    className={`w-full relative bg-[#0A0A0C] border rounded-[24px] p-6 sm:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.4)] overflow-hidden group mb-8 last:mb-0 ${idx === 0 ? 'border-[#4285F4]/30' : 'border-white/[0.04] opacity-50'}`}
                                >
                                    {idx === 0 && (
                                        <div className="absolute -inset-10 bg-gradient-to-r from-[#4285F4]/10 to-[#FF3B30]/10 blur-3xl opacity-50 pointer-events-none -z-10 animate-pulse" />
                                    )}
                                    
                                    <div className="flex items-center justify-between mb-6 sm:mb-8 relative z-10">
                                        <div className="flex items-center gap-4">
                                            {insight.severity === 'CRITICAL_EXECUTION' ? (
                                                <div className="w-10 h-10 rounded-full bg-[#FF3B30]/10 flex items-center justify-center border border-[#FF3B30]/20 shadow-[0_0_15px_rgba(255,59,48,0.3)] shrink-0">
                                                    <AlertTriangle className="w-5 h-5 text-[#FF3B30]" />
                                                </div>
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-[#4285F4]/10 flex items-center justify-center border border-[#4285F4]/20 shadow-[0_0_15px_rgba(66,133,244,0.3)] shrink-0">
                                                    <Zap className="w-5 h-5 text-[#4285F4]" />
                                                </div>
                                            )}
                                            <div>
                                                <div className="text-[10px] font-mono font-bold text-white/90 uppercase tracking-widest">{insight.severity.replace('_', ' ')}</div>
                                                <div className="text-[10px] font-mono text-neutral-500 mt-1 uppercase tracking-widest flex items-center gap-1.5">
                                                    Signal Derived <ArrowBigRight className="w-3 h-3" /> Live Matrix
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest font-bold">Real-Time</div>
                                    </div>

                                    <h3 className="text-[24px] sm:text-[28px] font-medium text-white/95 leading-[1.25] tracking-tight mb-5 relative z-10">
                                        {idx === 0 ? <Typewriter text={insight.headline} speed={12} /> : insight.headline}
                                    </h3>
                                    
                                    <div className="text-[16px] sm:text-[17px] font-serif text-neutral-300 leading-[1.7] mb-8 relative z-10 tracking-[-0.01em] whitespace-pre-wrap">
                                        {idx === 0 ? <Typewriter text={insight.quantitative_analysis} speed={5} /> : insight.quantitative_analysis}
                                    </div>

                                    <div className="bg-[#050505] border border-white/[0.04] rounded-[20px] p-5 sm:p-6 relative z-10 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-inner">
                                        <div className="flex-1 w-full text-left border-b sm:border-b-0 sm:border-r border-white/[0.04] pb-5 sm:pb-0 sm:pr-6">
                                            <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-1.5 font-bold">Target Market</div>
                                            <div className="text-[16px] sm:text-[18px] font-medium text-white/95">{insight.recommended_action.market}</div>
                                            <div className="text-[11px] sm:text-[12px] font-mono text-[#4285F4] mt-2 uppercase tracking-widest font-bold">
                                                Action: {insight.recommended_action.action.replace('_', ' ')}
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center justify-between sm:justify-start gap-8 w-full sm:w-auto shrink-0 tabular-nums lining-nums">
                                            <div className="text-center">
                                                <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-1.5 font-bold">Liquidity Target</div>
                                                <div className="text-[26px] sm:text-[28px] font-sans font-medium text-white/95 tracking-tighter leading-none">{insight.recommended_action.target_price_cents}¢</div>
                                            </div>
                                            <div className="text-center">
                                                <div className="text-[10px] font-mono text-[#34C759] uppercase tracking-widest mb-1.5 font-bold">EV Delta</div>
                                                <div className="text-[26px] sm:text-[28px] font-sans font-medium text-[#34C759] tracking-tighter leading-none">+{insight.recommended_action.expected_value_delta}%</div>
                                            </div>
                                        </div>
                                    </div>

                                    <button 
                                        onClick={() => handleExecuteOrder(insight)}
                                        disabled={executionState !== 'IDLE' || idx !== 0 || insight.recommended_action.action === 'HOLD'}
                                        className={`mt-6 w-full py-4 rounded-full text-[12px] sm:text-[13px] font-bold uppercase tracking-widest transition-all duration-300 outline-none flex items-center justify-center gap-2 relative z-10 ${
                                            idx !== 0 
                                            ? 'hidden'
                                            : insight.recommended_action.action === 'HOLD'
                                            ? 'bg-[#111113] text-neutral-500 border border-white/[0.04] cursor-not-allowed'
                                            : executionState === 'IDLE' 
                                            ? 'bg-[#4285F4] hover:bg-[#5b96f5] text-white shadow-[0_4px_20px_rgba(66,133,244,0.35)] active:scale-[0.98] cursor-pointer'
                                            : executionState === 'AUTHORIZING'
                                            ? 'bg-[#111113] text-white border border-white/[0.1] shadow-none cursor-not-allowed'
                                            : executionState === 'ROUTING' || executionState === 'MATCHING'
                                            ? 'bg-[#0A0A0C] text-[#4285F4] border border-[#4285F4]/30 shadow-none cursor-not-allowed'
                                            : executionState === 'FAILED'
                                            ? 'bg-[#FF3B30]/10 text-[#FF3B30] border border-[#FF3B30]/30 cursor-not-allowed'
                                            : 'bg-[#34C759]/10 text-[#34C759] border border-[#34C759]/30 cursor-not-allowed shadow-[0_0_20px_rgba(52,199,89,0.2)]'
                                        }`}
                                    >
                                        <AnimatePresence mode="wait">
                                            {insight.recommended_action.action === 'HOLD' && (
                                                <motion.div key="hold" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                                                    <Lock className="w-4 h-4" /> Market Hold Recommended
                                                </motion.div>
                                            )}
                                            {insight.recommended_action.action !== 'HOLD' && executionState === 'IDLE' && (
                                                <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                                                    Execute Limit Order <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
                                                </motion.div>
                                            )}
                                            {executionState === 'AUTHORIZING' && (
                                                <motion.div key="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 font-mono">
                                                    <Lock className="w-4 h-4" /> Authenticating Keys...
                                                </motion.div>
                                            )}
                                            {executionState === 'ROUTING' && (
                                                <motion.div key="route" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 font-mono">
                                                    <TerminalSquare className="w-4 h-4" /> Routing to Gateway...
                                                </motion.div>
                                            )}
                                            {executionState === 'MATCHING' && (
                                                <motion.div key="match" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 font-mono">
                                                    <Loader2 className="w-4 h-4 animate-spin" /> Matching Liquidity...
                                                </motion.div>
                                            )}
                                            {executionState === 'FILLED' && (
                                                <motion.div key="fill" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 font-mono">
                                                    <CheckCircle className="w-4 h-4 text-[#34C759]" /> Executed @ {insight.recommended_action.target_price_cents}¢
                                                </motion.div>
                                            )}
                                            {executionState === 'FAILED' && (
                                                <motion.div key="failed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 font-mono">
                                                    <AlertTriangle className="w-4 h-4 text-[#FF3B30]" /> Execution Rejected
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </button>
                                </motion.div>
                            ))
                        )}
                    </AnimatePresence>
                </div>
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_10%,transparent_100%)] pointer-events-none z-0 opacity-40" />
            </div>
        </div>
    );
}
