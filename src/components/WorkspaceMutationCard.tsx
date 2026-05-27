import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldAlert, Check, X, Code, Send } from 'lucide-react';

export function WorkspaceMutationCard({ data, summary }: { data: any, summary?: string }) {
    const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');

    const handleApprove = () => setStatus('approved');
    const handleReject = () => setStatus('rejected');

    let payloadBeautified = data?.payload || '';
    try {
        if (typeof data?.payload === 'string') {
            payloadBeautified = JSON.stringify(JSON.parse(data.payload), null, 2);
        } else if (typeof data?.payload === 'object') {
            payloadBeautified = JSON.stringify(data.payload, null, 2);
        }
    } catch { }

    return (
        <div className="bg-[#050505] border border-[#ff3333]/20 rounded-[24px] overflow-hidden mb-6 w-full max-w-2xl font-sans text-left shadow-[0_4px_30px_rgba(255,51,51,0.05)]">
            <div className="bg-[#110000] border-b border-[#ff3333]/10 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3 text-[#ff4444]">
                    <ShieldAlert className="w-5 h-5" />
                    <span className="text-[12px] font-mono font-bold uppercase tracking-widest text-[#ff4444]">Trust Gate Invariant Guard</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">{data?.domain}</span>
                    <span className="w-1 h-1 rounded-full bg-neutral-600"></span>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">{data?.actionType?.replace(/_/g, ' ')}</span>
                </div>
            </div>

            <div className="p-6">
                <div className="text-[14px] text-white/80 leading-relaxed max-w-prose mb-6">
                    Aura requires explicit authorization to execute this mutating operation within your Workspace.
                </div>

                <div className="bg-black/50 border border-white/[0.04] rounded-xl overflow-hidden mb-6">
                    <div className="bg-white/[0.02] px-4 py-2 flex items-center justify-between border-b border-white/[0.04] select-none">
                        <div className="flex items-center gap-2 text-neutral-500">
                            <Code className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-mono uppercase tracking-widest">Mutation Payload</span>
                        </div>
                    </div>
                    <pre className="p-4 text-[11px] font-mono text-neutral-400 overflow-x-auto leading-relaxed">
                        {payloadBeautified || 'No payload preview available.'}
                    </pre>
                </div>

                <AnimatePresence mode="wait">
                    {status === 'pending' ? (
                        <motion.div
                            key="pending"
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            className="flex flex-wrap items-center gap-3"
                        >
                            <button
                                onClick={handleApprove}
                                className="flex items-center gap-2 bg-white text-black px-6 py-3 rounded-full text-[13px] font-medium transition-all hover:scale-105 active:scale-95"
                            >
                                <Check className="w-4 h-4" />
                                Approve Execution
                            </button>
                            <button
                                onClick={handleReject}
                                className="flex items-center gap-2 bg-white/5 border border-white/[0.04] text-white px-6 py-3 rounded-full text-[13px] font-medium transition-all hover:bg-white/10 active:scale-95"
                            >
                                <X className="w-4 h-4" />
                                Reject
                            </button>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="resolved"
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center gap-3"
                        >
                            {status === 'approved' ? (
                                <div className="flex items-center gap-2 text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-4 py-2 rounded-full text-[12px] font-mono font-bold uppercase tracking-widest">
                                    <Check className="w-4 h-4" /> Mutating Operation Executed
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 text-neutral-400 bg-white/5 border border-white/[0.04] px-4 py-2 rounded-full text-[12px] font-mono font-bold uppercase tracking-widest">
                                    <X className="w-4 h-4" /> Operation Rejected
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
