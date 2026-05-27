import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Cloud, Mail, Calendar, FileText, CheckSquare, 
  ChevronRight, ArrowRight, Activity, Eye, Code, Fingerprint, ShieldCheck,
  RefreshCw, ExternalLink, Lock, Play, Terminal, Check, AlertTriangle
} from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

// ============================================================================
// Types & Interfaces
// ============================================================================
interface WorkspaceBlueprintProps {
  user?: { email?: string; name?: string };
  token?: string | null;
  onSignIn?: () => void;
  onSignOut?: () => void;
}

type TabType = 'overview' | 'sources' | 'logic' | 'publish';
type NormalizerTarget = 'GMAIL' | 'CALENDAR' | 'DRIVE' | 'TASKS';

// ============================================================================
// Internal Minimalist UI Components
// ============================================================================
const MinimalToggle = ({ checked, onChange, label }: { checked: boolean, onChange: () => void, label: string }) => (
  <button 
    onClick={onChange}
    className="group flex items-center justify-between w-full p-4 rounded-3xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.04] transition-all duration-500 outline-none"
  >
    <div className="flex items-center gap-4">
      <div className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors duration-500 ${checked ? 'bg-white text-black' : 'bg-white/[0.05] text-white/40'}`}>
        <Fingerprint className="w-5 h-5" strokeWidth={1.5} />
      </div>
      <span className="text-[15px] font-medium text-white/90 tracking-tight">{label}</span>
    </div>
    <div className={`w-12 h-6 rounded-full p-1 transition-colors duration-500 ease-in-out flex ${checked ? 'bg-white justify-end' : 'bg-white/10 justify-start'}`}>
      <motion.div layout className={`w-4 h-4 rounded-full shadow-sm ${checked ? 'bg-black' : 'bg-white/40'}`} />
    </div>
  </button>
);

// ============================================================================
// Primary Component
// ============================================================================
export function WorkspaceOrchestrationBlueprint({ user, token, onSignIn, onSignOut }: WorkspaceBlueprintProps) {
  const [activeTab, setActiveTab] = useState<'architecture' | 'execution' | 'trust_gate' | 'live_sandbox'>('architecture');
  const [interactiveApproved, setInteractiveApproved] = useState<boolean>(false);
  const [isCompiling, setIsCompiling] = useState<boolean>(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [deployUrl, setDeployUrl] = useState<string | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Live Sandbox Feed state
  const [liveSource, setLiveSource] = useState<'GMAIL' | 'CALENDAR' | 'DRIVE' | 'TASKS'>('GMAIL');
  const [liveData, setLiveData] = useState<any[]>([]);
  const [isLoadingLive, setIsLoadingLive] = useState<boolean>(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  const fetchLiveData = async (source: 'GMAIL' | 'CALENDAR' | 'DRIVE' | 'TASKS') => {
    if (!token) return;
    setIsLoadingLive(true);
    setLiveError(null);
    try {
      const res = await fetch('/api/workspace/normalize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ source })
      });
      if (!res.ok) {
        throw new Error(`Workspace normalization error: ${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      setLiveData(data.sampleCanonicalRecords || []);
    } catch (err: any) {
      setLiveError(err.message || "Failed to sync connection.");
    } finally {
      setIsLoadingLive(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'live_sandbox' && token) {
      fetchLiveData(liveSource);
    }
  }, [liveSource, activeTab, token]);

  const triggerLivePipeline = async () => {
    if (isCompiling || !interactiveApproved) return;
    setIsCompiling(true);
    setDeployUrl(null);
    setCurrentJobId(null);
    setErrorMsg(null);
    setLogs([`Authenticating...`, `Synthesizing logic...`]);

    if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
    }

    try {
      const response = await fetch('/api/mcp/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({ target: 'workspace-bridge', authorized: interactiveApproved })
      });
      if (!response.ok) throw new Error("Deployment paused.");
      const data = await response.json();

      if (data.jobId) {
        const jobId = data.jobId;
        setCurrentJobId(jobId);
        setLogs(prev => [...prev, `GCP build pipeline queued successfully with job ID: ${jobId}`, `Connecting to real-time build stream...`]);

        // Firestore Real-Time Listener
        const jobRef = doc(db, 'mcp_deployments', jobId);
        unsubscribeRef.current = onSnapshot(jobRef, (snapshot) => {
            if (snapshot.exists()) {
                const statusData = snapshot.data();
                
                if (statusData.logs) {
                    setLogs(statusData.logs);
                }

                if (statusData.status === 'success') {
                    setIsCompiling(false);
                    if (statusData.url) setDeployUrl(statusData.url);
                    if (unsubscribeRef.current) {
                        unsubscribeRef.current();
                        unsubscribeRef.current = null;
                    }
                } else if (statusData.status === 'deployment_error' || statusData.status === 'failed') {
                    setIsCompiling(false);
                    setErrorMsg(statusData.error || 'Unknown Cloud Run error');
                    setLogs(prev => [...prev, `Deployment failed: ${statusData.error || 'Unknown Cloud Run error'}`]);
                    if (unsubscribeRef.current) {
                        unsubscribeRef.current();
                        unsubscribeRef.current = null;
                    }
                }
            }
        }, (error) => {
            console.error("Firestore onSnapshot error:", error);
            setIsCompiling(false);
            setErrorMsg("Lost connection to build stream.");
            if (unsubscribeRef.current) unsubscribeRef.current();
        });

      } else {
        setLogs(prev => [...prev, ...(data.logs || [`Verified. Server active.`])]);
        if (data.url) setDeployUrl(data.url);
        setIsCompiling(false);
      }
    } catch (error: any) {
      setErrorMsg(error.message);
      setLogs(prev => [...prev, `Notice: ${error.message}`]);
      setIsCompiling(false);
    }
  };

  // Smart Auto-Scroll Logic
  useEffect(() => {
      if (logEndRef.current) {
          const parent = logEndRef.current.parentElement;
          if (parent) {
              const isNearBottom = parent.scrollHeight - parent.scrollTop - parent.clientHeight < 100;
              if (isNearBottom) {
                  logEndRef.current.scrollIntoView({ behavior: 'smooth' });
              }
          } else {
              logEndRef.current.scrollIntoView({ behavior: 'smooth' });
          }
      }
  }, [logs]);

  return (
    <div className="w-full pt-8 pb-24 font-sans text-left max-w-4xl mx-auto selection:bg-white/20 selection:text-white">
      
      {/* Structural Header */}
      <div className="mb-12 flex flex-col items-start border-b border-white/[0.04] pb-8">
        <h2 className="text-[24px] font-medium text-white tracking-tight leading-tight mb-4 flex items-center gap-3">
          <Activity className="w-5 h-5 text-white/50" />
          Agentic Workspace Routing
        </h2>
        <p className="text-white/60 text-[14px] max-w-2xl font-normal leading-relaxed tracking-tight">
          Aura resolves Google workspace interactions not by executing simple API lookups, but by spawning high-density orchestrating agents. These agents run inside sandboxed execution frames and construct strict, deterministic Server-Driven UI (SDUI) artifacts on demand.
        </p>
      </div>

      {/* Structural Tabs */}
      <div className="flex border-b border-white/[0.04] mb-8 gap-8">
        {[
          { id: 'architecture', label: 'Architecture & Modules' },
          { id: 'trust_gate', label: 'Trust Gate' },
          { id: 'execution', label: 'Execution Specs' },
          { id: 'live_sandbox', label: 'Live Sandbox Feed' },
        ].map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-4 text-[13px] font-medium transition-colors outline-none tracking-tight border-b-2 ${
                isActive ? 'text-white border-white' : 'text-white/40 border-transparent hover:text-white/80'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-[400px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.2 }}
            className="w-full"
          >
            {activeTab === 'architecture' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-[#050505] border border-white/[0.04] rounded-xl p-8 shadow-inner">
                  <div className="flex items-center gap-3 mb-6 border-b border-white/[0.04] pb-4">
                    <Cloud className="w-4 h-4 text-white/50" />
                    <h3 className="text-[14px] font-medium text-white uppercase tracking-widest">Module A</h3>
                  </div>
                  <h4 className="text-[16px] font-medium text-white mb-2 tracking-tight">Scatter-Gather Routing</h4>
                  <p className="text-[13px] text-white/50 leading-relaxed font-sans">
                    Pulls metadata across threads and normalizes content to build secure context summaries.
                  </p>
                </div>

                <div className="bg-[#050505] border border-white/[0.04] rounded-xl p-8 shadow-inner">
                  <div className="flex items-center gap-3 mb-6 border-b border-white/[0.04] pb-4">
                    <Calendar className="w-4 h-4 text-white/50" />
                    <h3 className="text-[14px] font-medium text-white uppercase tracking-widest">Module B</h3>
                  </div>
                  <h4 className="text-[16px] font-medium text-white mb-2 tracking-tight">Intent Scheduling</h4>
                  <p className="text-[13px] text-white/50 leading-relaxed font-sans">
                    Extractions temporal variables and maps them to pristine appointments with zero conflicts.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'trust_gate' && (
              <div className="space-y-6">
                <div className="bg-[#050505] border border-white/[0.04] rounded-xl p-8 shadow-inner">
                  <div className="flex items-center gap-3 mb-6 border-b border-white/[0.04] pb-4">
                    <ShieldCheck className="w-4 h-4 text-white/50" />
                    <h3 className="text-[14px] font-medium text-white uppercase tracking-widest">Trust Gate Invariant Guard</h3>
                  </div>
                  <p className="text-[14px] text-white/60 leading-relaxed font-sans mb-8">
                    Mutating operations (drafting an email, creating tasks) are held in a pending execution lock until receiving interactive approval from the user.
                  </p>
                  
                  <MinimalToggle 
                    checked={interactiveApproved} 
                    onChange={() => setInteractiveApproved(!interactiveApproved)} 
                    label="Authorize Pending Execution Lock" 
                  />
                  
                  {interactiveApproved && (
                     <div className="mt-8 pt-8 border-t border-white/[0.04]">
                        <button
                          disabled={isCompiling}
                          onClick={triggerLivePipeline}
                          className={`px-8 py-3 rounded-lg text-[13px] font-medium tracking-tight transition-all flex items-center justify-center gap-3 ${
                            isCompiling ? 'bg-white/10 text-white/40' : 'bg-white text-black hover:bg-neutral-200'
                          }`}
                        >
                          {isCompiling ? (
                             <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                Deploying Service...
                             </>
                          ) : (
                             <>
                                <Play className="w-4 h-4" />
                                Deploy Authorized Service
                             </>
                          )}
                        </button>
                        
                        {logs.length > 0 && (
                          <div className="mt-6 bg-[#050505] border border-white/[0.04] rounded-lg p-5 overflow-hidden flex flex-col shadow-inner">
                            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/[0.04]">
                                <Terminal className="w-4 h-4 text-white/50" />
                                <span className="text-[11px] font-mono uppercase tracking-widest text-white/40 font-bold">Build Stream Console</span>
                                {isCompiling && <span className="ml-auto flex h-2 w-2 relative">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </span>}
                            </div>
                            <div className="max-h-[250px] overflow-y-auto pr-2 font-mono text-[12px] text-white/60 leading-relaxed scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent flex flex-col gap-1">
                                {logs.map((log, index) => (
                                  <div key={index} className="flex gap-3">
                                      <span className="text-white/20 select-none">{(index + 1).toString().padStart(3, '0')}</span>
                                      <span className={`${log.toLowerCase().includes('error') || log.toLowerCase().includes('fail') ? 'text-red-400' : log.toLowerCase().includes('success') ? 'text-emerald-400' : 'text-white/70'}`}>{log}</span>
                                  </div>
                                ))}
                                <div ref={logEndRef} />
                            </div>

                            {/* Success Badge */}
                            {deployUrl && !isCompiling && (
                                <div className="mt-4 pt-4 border-t border-emerald-500/10 flex flex-col items-start gap-2">
                                   <div className="flex items-center gap-2 px-3 py-1 rounded bg-[#34C759]/5 border border-[#34C759]/20 text-[#34C759]">
                                      <Check className="w-3.5 h-3.5" />
                                      <span className="text-[11px] font-bold uppercase tracking-wider">Service Online</span>
                                   </div>
                                   <a href={deployUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[12px] text-white hover:text-emerald-400 transition-colors group px-1">
                                      <span className="font-mono group-hover:underline">{deployUrl}</span>
                                      <ExternalLink className="w-3.5 h-3.5" />
                                   </a>
                                </div>
                            )}

                            {/* Error Badge */}
                            {errorMsg && !isCompiling && (
                                <div className="mt-4 pt-4 border-t border-red-500/10 flex items-center gap-3">
                                   <div className="flex items-center gap-2 px-3 py-1 rounded bg-[#FF3B30]/5 border border-[#FF3B30]/20 text-[#FF3B30]">
                                      <AlertTriangle className="w-3.5 h-3.5" />
                                      <span className="text-[11px] font-bold uppercase tracking-wider">Deployment Error</span>
                                   </div>
                                   <span className="text-[12px] text-red-400 font-mono truncate">{errorMsg}</span>
                                </div>
                            )}
                          </div>
                        )}
                     </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'execution' && (
              <div className="bg-[#050505] border border-white/[0.04] rounded-xl p-8 shadow-inner">
                  <div className="flex items-center gap-3 mb-8 border-b border-white/[0.04] pb-4">
                    <Code className="w-4 h-4 text-white/50" />
                    <h3 className="text-[14px] font-medium text-white uppercase tracking-widest">Execution Specs</h3>
                  </div>
                  
                  <div className="space-y-8">
                    <div>
                      <h4 className="text-[14px] font-medium text-white mb-2 tracking-tight">OAuth Integration</h4>
                      <p className="text-[13px] text-white/50 leading-relaxed">
                        Standard scopes stored securely in memory. No persistence of active access tokens.
                      </p>
                    </div>
                    <div>
                      <h4 className="text-[14px] font-medium text-white mb-2 tracking-tight">Deterministic Normalization</h4>
                      <p className="text-[13px] text-white/50 leading-relaxed">
                        Converts raw API payloads to immutable structures before LLM evaluation.
                      </p>
                    </div>
                    <div>
                      <h4 className="text-[14px] font-medium text-white mb-2 tracking-tight">Multi-Agent Router</h4>
                      <p className="text-[13px] text-white/50 leading-relaxed">
                        Recognizes semantic intent, extracts contextual parameters, and delegates.
                      </p>
                    </div>
                  </div>
              </div>
            )}

            {activeTab === 'live_sandbox' && !token && (
              <div className="bg-[#050505] border border-white/[0.04] rounded-xl p-12 text-center shadow-inner flex flex-col items-center justify-center">
                <div className="p-4 bg-white/[0.02] border border-white/[0.04] rounded-full mb-6">
                  <Lock className="w-8 h-8 text-white/40" />
                </div>
                <h3 className="text-[18px] font-medium text-white mb-2 tracking-tight">Live Workspace Sandbox Locked</h3>
                <p className="text-[13px] text-white/50 max-w-sm leading-relaxed mb-8">
                  Connect your Google Account to authorize sync operations, inspect live email structures, and render documents inline.
                </p>
                <button
                  onClick={onSignIn}
                  className="px-6 py-2.5 rounded-full bg-white text-black text-[13px] font-semibold hover:bg-neutral-200 transition-all select-none cursor-pointer flex items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Connect Google Workspace
                </button>
              </div>
            )}

            {activeTab === 'live_sandbox' && token && (
              <div className="space-y-6">
                {/* Connection Status Label */}
                <div className="flex items-center justify-between bg-emerald-500/5 border border-emerald-500/10 rounded-xl px-5 py-3 select-none">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-xs font-semibold text-emerald-400 font-mono uppercase tracking-wider">Live Sync connection established</span>
                  </div>
                  <button 
                    onClick={() => fetchLiveData(liveSource)}
                    disabled={isLoadingLive}
                    className="flex items-center gap-2 text-[11px] text-white/50 hover:text-white transition-colors cursor-pointer outline-none focus-visible:underline"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLive ? 'animate-spin text-white' : ''}`} />
                    Refresh
                  </button>
                </div>

                {/* Sub source capsule tabs */}
                <div className="flex bg-white/[0.01] border border-white/[0.04] p-1.5 rounded-xl gap-2 max-w-md select-none">
                  {([
                    { id: 'GMAIL', label: 'Gmail', icon: Mail },
                    { id: 'DRIVE', label: 'Drive', icon: FileText },
                    { id: 'CALENDAR', label: 'Calendar', icon: Calendar },
                    { id: 'TASKS', label: 'Tasks', icon: CheckSquare }
                  ] as const).map(src => {
                    const isSelected = liveSource === src.id;
                    const Icon = src.icon;
                    return (
                      <button
                        key={src.id}
                        onClick={() => setLiveSource(src.id)}
                        className={`flex-1 py-1.5 px-3 rounded-lg text-[12px] font-medium transition-all flex items-center justify-center gap-2 outline-none cursor-pointer ${
                          isSelected ? 'bg-white text-black shadow-sm font-semibold' : 'text-white/60 hover:text-white hover:bg-white/[0.02]'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        {src.label}
                      </button>
                    );
                  })}
                </div>

                {/* Loading State */}
                {isLoadingLive ? (
                  <div className="bg-[#050505] border border-white/[0.04] rounded-xl p-24 shadow-inner flex flex-col items-center justify-center select-none">
                    <RefreshCw className="w-6 h-6 text-white/30 animate-spin mb-4" />
                    <span className="text-[12px] font-mono text-white/40 uppercase tracking-widest">Querying Secure API...</span>
                  </div>
                ) : liveError ? (
                  <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-8 text-center">
                    <p className="text-red-400 text-sm mb-4">Error sync: {liveError}</p>
                    <button 
                      onClick={() => fetchLiveData(liveSource)}
                      className="text-xs text-white underline hover:text-white/80"
                    >
                      Retry sync lookup
                    </button>
                  </div>
                ) : liveData.length === 0 ? (
                  <div className="bg-[#050505] border border-white/[0.04] rounded-xl p-16 text-center shadow-inner text-white/40 text-[13px] select-none">
                    No immediate items found on your Google Account matching this category.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {liveSource === 'GMAIL' && (
                      <div className="grid grid-cols-1 gap-4">
                        {liveData.map((e: any, idx) => (
                          <div key={e.id || idx} className="bg-neutral-900/40 border border-white/[0.04] rounded-xl p-5 hover:border-white/[0.04] transition-all flex flex-col gap-2">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2">
                                <div className="h-6 w-6 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-semibold text-white uppercase">
                                  {e.sender?.name?.charAt(0) || 'S'}
                                </div>
                                <div className="text-left">
                                  <span className="text-xs font-semibold text-white block">{e.sender?.name || 'Sender'}</span>
                                  <span className="text-[10px] text-white/40 block leading-none mt-0.5">{e.sender?.email || ''}</span>
                                </div>
                              </div>
                              <span className="text-[10px] font-mono text-white/30">{e.receivedAt ? new Date(e.receivedAt).toLocaleDateString() : ''}</span>
                            </div>
                            <h4 className="text-[14px] font-medium text-white/90 tracking-tight mt-1 text-left">{e.subject || 'No Subject'}</h4>
                            {e.snippet && (
                              <p className="text-xs text-white/50 text-left line-clamp-2 leading-relaxed mt-0.5">{e.snippet}</p>
                            )}
                            {e.extractedEntities?.action_items?.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-white/[0.04] flex items-center gap-2">
                                <span className="text-[9px] font-mono tracking-wider uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold shrink-0">Action Suggested</span>
                                <span className="text-xs text-amber-300/85 truncate">{e.extractedEntities.action_items[0]}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {liveSource === 'DRIVE' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {liveData.map((f: any, idx) => (
                          <a 
                            key={f.id || idx} 
                            href={f.viewUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="bg-neutral-900/30 border border-white/[0.04] rounded-xl p-5 hover:border-white/[0.04] hover:bg-white/[0.01] transition-all flex flex-col justify-between group h-[130px] outline-none focus-visible:border-white/30"
                          >
                            <div>
                              <div className="flex items-start justify-between">
                                <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04] text-white/60">
                                  <FileText className="w-4 h-4" />
                                </div>
                                <ExternalLink className="w-3.5 h-3.5 text-white/20 group-hover:text-white/60 transition-colors" />
                              </div>
                              <h4 className="text-[14px] font-medium text-white/90 group-hover:text-white truncate mt-3 pr-2 text-left" title={f.name}>
                                {f.name}
                              </h4>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-white/40 pt-2 border-t border-white/[0.03] mt-2 font-sans">
                              <span>{f.owner || 'Me'}</span>
                              <span className="font-mono text-[10px]">{(f.sizeBytes / 1048576).toFixed(2)} MB</span>
                            </div>
                          </a>
                        ))}
                      </div>
                    )}

                    {liveSource === 'CALENDAR' && (
                      <div className="grid grid-cols-1 gap-4">
                        {liveData.map((ev: any, idx) => (
                          <div key={ev.id || idx} className="bg-neutral-900/40 border border-white/[0.04] rounded-xl p-5 hover:border-white/[0.04] transition-all flex items-start gap-4">
                            <div className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/5 flex flex-col items-center justify-center shrink-0 min-w-[64px] select-none">
                              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-white/40 leading-none mb-1">
                                {ev.startTime ? new Date(ev.startTime).toLocaleDateString([], {month: 'short'}) : ''}
                              </span>
                              <span className="text-[18px] font-medium text-white leading-none">
                                {ev.startTime ? new Date(ev.startTime).toLocaleDateString([], {day: 'numeric'}) : ''}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0 text-left">
                              <h4 className="text-[14px] font-medium text-white/90 truncate">{ev.summary}</h4>
                              <p className="text-xs text-white/40 mt-1 flex items-center gap-2">
                                <span>{ev.startTime ? new Date(ev.startTime).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}) : ''}</span>
                                {ev.location && (
                                  <>
                                    <span className="w-1 h-1 bg-white/20 rounded-full"></span>
                                    <span className="truncate">{ev.location}</span>
                                  </>
                                )}
                              </p>
                              {ev.attendees && ev.attendees.length > 0 && (
                                <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                                  {ev.attendees.slice(0, 3).map((att: any, attIdx: number) => (
                                    <span key={attIdx} className="text-[9px] px-2 py-0.5 bg-white/[0.03] border border-white/[0.04] text-white/60 rounded-full truncate max-w-[120px]" title={att.email}>
                                      {att.name || att.email?.split('@')[0]}
                                    </span>
                                  ))}
                                  {ev.attendees.length > 3 && (
                                    <span className="text-[9px] text-white/40 shrink-0">+{ev.attendees.length - 3}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {liveSource === 'TASKS' && (
                      <div className="bg-neutral-900/40 border border-white/[0.04] rounded-xl divide-y divide-white/[0.04] shadow-inner overflow-hidden">
                        {liveData.map((t: any, idx) => {
                          const isCompleted = t.status === 'COMPLETED';
                          return (
                            <div key={t.id || idx} className="p-4 flex items-start gap-4 hover:bg-white/[0.005] transition-colors">
                              <div className={`mt-0.5 w-[18px] h-[18px] rounded border flex items-center justify-center transition-colors shrink-0 ${
                                isCompleted ? 'bg-white border-white text-black' : 'border-white/30 bg-transparent'
                              }`}>
                                {isCompleted && (
                                  <svg className="w-3 h-3 stroke-[3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                              <div className="flex-1 min-w-0 text-left">
                                <span className={`text-[13px] font-medium tracking-tight block ${isCompleted ? 'text-white/30 line-through' : 'text-white/80'}`}>
                                  {t.title}
                                </span>
                                {t.dueDate && (
                                  <span className="text-[10px] font-mono text-neutral-500 mt-1 block">
                                    Due: {new Date(t.dueDate).toLocaleDateString([], {year: 'numeric', month: 'short', day: 'numeric'})}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
