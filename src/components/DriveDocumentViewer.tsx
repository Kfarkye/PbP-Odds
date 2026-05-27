import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // Using framer-motion for consistency
import { 
    FileText, FileSpreadsheet, Lock, Clock, ExternalLink, Search, Sparkles, MessageSquare, Check, Copy, MoreHorizontal, Bot, Filter,
    AlertTriangle, Loader2, X // Added X for clear search in CSV
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================
export interface DriveDocumentData {
    id: string;
    name: string;
    mimeType: string;
    webContentLink?: string;
    webViewLink?: string;
    htmlContent?: string;
    csvContent?: string;
    owner?: string;
    lastModifyingUser?: string;
    updatedAt?: string;
    sizeBytes?: number;
}

// ============================================================================
// Utilities (Optimized & Hardened)
// ============================================================================
const formatBytes = (bytes: number | undefined): string => {
    if (bytes === undefined || bytes === null || isNaN(bytes)) return 'N/A';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = 2; // Decimal places
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const parseCsvContent = (csvString: string, searchQuery: string): string[][] => {
    if (!csvString) return [];
    const rows = csvString.split('\n').map(row => row.split(','));
    if (searchQuery.trim() === '' || rows.length <= 1) return rows;

    const headerRow = rows[0];
    const dataRows = rows.slice(1).filter(r => r.join(' ').toLowerCase().includes(searchQuery.toLowerCase()));
    return [headerRow, ...dataRows];
};

const sanitizeHtmlContent = (html: string): string => {
    // Basic sanitization and style normalization for dark theme
    if (!html) return '';
    // Remove inline black/white colors, ensure links are readable
    return html
        .replace(/color:\s*#000000/g, 'color: inherit')
        .replace(/background-color:\s*#ffffff/g, 'background-color: transparent')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove style tags
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script tags
        .replace(/on(click|mouseover|mouseout|submit|load)=/gi, 'data-on$1='); // Neutralize event handlers
};

// ============================================================================
// Sub-Components
// ============================================================================

// Message Copy Button (from App.tsx, for consistency)
const MessageCopyButton = ({ text, className = "" }: { text: string, className?: string }) => {
    const [copied, setCopied] = useState(false);
    return (
        <button 
            onClick={() => {
                navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }}
             className={`p-2 rounded-[8px] transition-all duration-300 ${copied ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-neutral-800 text-neutral-400 border border-white/[0.04] hover:text-white hover:bg-white/[0.04]'} ${className}`}
            title="Copy"
            aria-label="Copy"
        >
             {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
    );
};

// ============================================================================
// Primary Document Viewer Component (Production-Grade)
// ============================================================================
export function DriveDocumentViewer({ data }: { data: DriveDocumentData }) {
    const isSheet = data.mimeType.includes('spreadsheet') || data.mimeType.includes('csv');
    const isDoc = data.mimeType.includes('document') || data.mimeType.includes('text/plain') || data.mimeType.includes('html'); // Added html for direct HTML content
    const [copied, setCopied] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showActions, setShowActions] = useState(false);
    const [loadingContent, setLoadingContent] = useState(true); // New state for content loading
    const contentRef = useRef<HTMLDivElement>(null); // Ref for HTML content

    // Debounce search query for performance on large CSVs
    const debouncedSearchQuery = useDebounce(searchQuery, 300);

    // Parse and filter CSV - Optimized with useCallback and useMemo
    const parsedCsv = useMemo(() => {
        setLoadingContent(true); // Indicate loading when CSV content or search changes
        const result = parseCsvContent(data.csvContent || '', debouncedSearchQuery);
        setLoadingContent(false);
        return result;
    }, [data.csvContent, debouncedSearchQuery]);

    // Sanitize HTML content once
    const sanitizedHtml = useMemo(() => {
        setLoadingContent(true);
        const result = sanitizeHtmlContent(data.htmlContent || '');
        setLoadingContent(false);
        return result;
    }, [data.htmlContent]);

    // Determine if content is ready
    const isContentReady = (isDoc && sanitizedHtml) || (isSheet && data.csvContent && parsedCsv.length > 0) || (data.webViewLink && (data.mimeType.includes('pdf') || data.mimeType.includes('image') || data.mimeType.includes('video')));

    // Reset loading state when data changes
    useEffect(() => {
        setLoadingContent(true);
        const timer = setTimeout(() => setLoadingContent(false), 300); // Small delay for smoother transition
        return () => clearTimeout(timer);
    }, [data.id, data.mimeType, data.htmlContent, data.csvContent]);


    // Handle copy content
    const handleCopyContent = useCallback(() => {
        let copyText = '';
        if (data.csvContent) {
            copyText = data.csvContent;
        } else if (data.htmlContent) {
            // Use a temporary div to get innerText from sanitized HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = sanitizedHtml;
            copyText = tempDiv.innerText;
        }
        if (copyText) {
            navigator.clipboard.writeText(copyText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }, [data.csvContent, data.htmlContent, sanitizedHtml]);

    return (
        <div className="w-full bg-neutral-950 border border-white/[0.04] rounded-[24px] overflow-hidden flex flex-col text-left font-sans mb-8 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8),0_0_20px_rgba(255,255,255,0.02)]">
            {/* Header */}
            <div className="p-6 border-b border-white/[0.04] bg-neutral-900 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-neutral-800 rounded-lg border border-white/[0.04]">
                        {isSheet ? (
                            <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
                        ) : (
                            <FileText className="w-6 h-6 text-blue-400" />
                        )}
                    </div>
                    <div>
                        <h2 className="text-[18px] font-medium text-white tracking-tight break-words">{data.name}</h2>
                        <div className="flex items-center gap-3 mt-1.5 text-[11px] font-mono text-neutral-500 uppercase tracking-widest">
                            <span className="flex items-center gap-1.5"><Clock className="w-3 h-3 text-neutral-600" /> {new Date(data.updatedAt || Date.now()).toLocaleDateString()}</span>
                            {data.owner && <span className="flex items-center gap-1.5"><Lock className="w-3 h-3 text-neutral-600" /> {data.owner}</span>}
                            <span className="bg-white/[0.04] px-2 py-0.5 rounded-[4px] border border-white/[0.04]">{data.mimeType.split('.').pop() || data.mimeType}</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 relative">
                    {(data.htmlContent || data.csvContent) && (
                        <button
                            onClick={handleCopyContent}
                            className="flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] px-4 py-2 rounded-full text-[12px] font-medium text-white transition-colors border border-white/[0.04] shadow-sm"
                        >
                            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            {copied ? 'Copied!' : 'Copy Content'}
                        </button>
                    )}
                    {data.webViewLink && (
                        <a href={data.webViewLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] px-4 py-2 rounded-full text-[12px] font-medium text-white transition-colors border border-white/[0.04] shadow-sm">
                            <ExternalLink className="w-3.5 h-3.5" />
                            Open in Drive
                        </a>
                    )}
                    <div className="relative">
                        <button
                            onClick={() => setShowActions(prev => !prev)}
                            className="p-2 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-white transition-colors border border-white/[0.04] shadow-sm"
                        >
                            <MoreHorizontal className="w-4 h-4" />
                        </button>
                        <AnimatePresence>
                            {showActions && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    className="absolute right-0 mt-2 w-48 bg-neutral-900 border border-white/[0.04] rounded-xl shadow-lg py-2 z-20"
                                >
                                    <button className="block w-full text-left px-4 py-2 text-[13px] text-white hover:bg-white/[0.05]">
                                        Share
                                    </button>
                                    <button className="block w-full text-left px-4 py-2 text-[13px] text-white hover:bg-white/[0.05]">
                                        Download
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="relative w-full overflow-hidden bg-neutral-900" style={{ minHeight: '400px', maxHeight: '70vh' }}>
                {loadingContent && (
                    <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/80 backdrop-blur-sm z-20">
                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                    </div>
                )}

                {isDoc && sanitizedHtml && (
                    <div ref={contentRef} className="w-full h-full overflow-y-auto px-6 py-8 md:px-12 bg-neutral-900 text-neutral-300">
                        <div 
                           className="max-w-[800px] mx-auto prose prose-invert prose-sm md:prose-base font-serif [&_a]:text-blue-400 [&_span]:text-inherit [&_p]:text-inherit [&_div]:text-inherit" 
                           dangerouslySetInnerHTML={{ __html: sanitizedHtml }} 
                        />
                    </div>
                )}
                
                {isSheet && data.csvContent && (
                    <div className="w-full h-full flex flex-col bg-neutral-900">
                        <div className="p-3 border-b border-white/[0.04] bg-neutral-950 flex items-center gap-3">
                            <div className="relative flex-1 max-w-sm">
                                <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    placeholder="Filter rows..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full bg-neutral-800 border border-white/[0.04] rounded-full pl-9 pr-4 py-1.5 text-[12px] text-white outline-none focus:border-neutral-600 transition-colors"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                            <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">{parsedCsv.length - 1} rows</span>
                        </div>
                        <div className="flex-1 overflow-auto text-[12px] font-mono relative">
                            <table className="w-full text-left border-collapse whitespace-nowrap">
                                <thead className="sticky top-0 z-10 shadow-sm">
                                    {parsedCsv.length > 0 && (
                                        <tr className="bg-neutral-900 border-b border-white/[0.04]">
                                            {parsedCsv[0].map((header, i) => (
                                                <th key={i} className="px-4 py-3 font-semibold text-neutral-400 uppercase tracking-widest text-[10px] border-r border-white/[0.04] last:border-r-0 max-w-[200px] truncate backdrop-blur-sm bg-neutral-900/90">{header}</th>
                                            ))}
                                        </tr>
                                    )}
                                </thead>
                                <tbody className="divide-y divide-white/[0.02]">
                                    {parsedCsv.slice(1).map((row, rowIndex) => (
                                        <tr key={rowIndex} className="hover:bg-white/[0.03] transition-colors">
                                            {row.map((cell, cellIndex) => (
                                                <td key={cellIndex} className="px-4 py-3 text-neutral-300 border-r border-white/[0.02] last:border-r-0 max-w-[300px] truncate">{cell}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {(data.mimeType.includes('pdf') || data.mimeType.includes('image') || data.mimeType.includes('video')) && data.webViewLink && (
                    <iframe 
                        src={data.webViewLink.replace(/\/view.*$/, '/preview')} 
                        className="w-full h-full border-0 absolute inset-0"
                        title="File Viewer"
                    />
                )}

                {!isContentReady && !(data.mimeType.includes('pdf') || data.mimeType.includes('image') || data.mimeType.includes('video')) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm p-6 text-center z-10">
                         <div className="max-w-md bg-neutral-900 border border-white/[0.04] p-8 rounded-2xl shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8),0_0_20px_rgba(255,255,255,0.02)]">
                             <Lock className="w-8 h-8 text-neutral-500 mx-auto mb-4" />
                             <h3 className="text-white font-medium text-[15px] mb-2">Restricted Access Payload</h3>
                             <p className="text-neutral-400 text-[13px] leading-relaxed mb-6 font-mono">
                                 The active token does not have deep export privileges for this MIME type, or the document is too large to render securely inline.
                             </p>
                             <a href={data.webViewLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-white text-black px-5 py-2.5 rounded-full text-[13px] font-medium transition-transform hover:scale-105">
                                 View Source in Google Drive
                             </a>
                         </div>
                    </div>
                )}
            </div>
            
            {/* Aura Contextual Actions */}
            <div className="bg-neutral-900 border-t border-white/[0.04] px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
                 <div className="flex items-center gap-2 text-neutral-400">
                     <Bot className="w-4 h-4 text-emerald-400" />
                     <span className="text-[12px] font-medium text-white tracking-tight">Ask Aura about this document</span>
                 </div>
                 <div className="flex flex-wrap items-center gap-2">
                     <button className="flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.04] px-3 py-1.5 rounded-lg text-[11px] font-medium text-white transition-colors shadow-sm">
                         <Sparkles className="w-3 h-3 text-blue-400" /> Summarize
                     </button>
                     {isSheet ? (
                         <button className="flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.04] px-3 py-1.5 rounded-lg text-[11px] font-medium text-white transition-colors shadow-sm">
                             <Filter className="w-3 h-3 text-purple-400" /> Extract Key Values
                         </button>
                     ) : (
                         <button className="flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.04] px-3 py-1.5 rounded-lg text-[11px] font-medium text-white transition-colors shadow-sm">
                             <Check className="w-3 h-3 text-emerald-400" /> Extract Action Items
                         </button>
                     )}
                 </div>
            </div>

            {/* Footer */}
            <div className="bg-neutral-950 border-t border-white/[0.04] px-6 py-3 flex items-center justify-between select-none">
                 <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                     <span>Aura Render Engine</span>
                     <span className="w-1 h-1 bg-neutral-700 rounded-full"></span>
                     <span>MIME Extrapolator Active</span>
                 </div>
                 {data.sizeBytes && <span className="text-[10px] font-mono text-neutral-500 tabular-nums">{formatBytes(data.sizeBytes)}</span>}
            </div>
        </div>
    );
}

// Custom hook for debouncing a value
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);

    return debouncedValue;
}

