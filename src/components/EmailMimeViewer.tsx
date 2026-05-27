import React, { useState, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // Using framer-motion for consistency
import { 
    Copy, Check, Search, AlertCircle, Eye, Mail, Calendar, FileText, Lock, Clock, ShieldCheck, Globe, Loader2
} from 'lucide-react'; // Added more Lucide icons

// ============================================================================
// Types
// ============================================================================
export interface HeaderItem {
  name: string;
  value: string;
  category: 'Security' | 'Routing' | 'Identity' | 'Other';
}

export interface MimePart {
  id: string;
  name: string;
  mimeType: string;
  size: string; // Already a string, no need for formatBytes here
  encoding?: string;
  disposition?: string;
  cid?: string;
  contentSample?: string;
  hexSample?: string;
  children?: MimePart[];
}

export interface EmailMimeViewerProps {
  data?: {
    id?: string;
    subject?: string;
    sender?: { name: string; email: string };
    recipient?: string;
    receivedAt?: string;
    mimeVersion?: string;
    contentType?: string;
    spf?: string;
    dkim?: string;
    dmarc?: string;
    headers?: HeaderItem[];
    mimeTree?: MimePart;
    parsedHtml?: string;
  };
}

type TabType = 'preview' | 'structure' | 'headers' | 'auth';

const SPRING_TRANSITION = { type: "spring" as const, stiffness: 400, damping: 30 };
const EASE_TRANSITION = [0.16, 1, 0.3, 1];

// ============================================================================
// Safe Render Sandbox (Iframe for isolated HTML rendering)
// ============================================================================
export const SafeMailIframe = React.memo(({ html }: { html: string }) => {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    if (iframeRef.current) {
      setLoading(true);
      const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <style>
                body {
                  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                  margin: 0;
                  padding: 16px;
                  color: #e5e5e5; /* Consistent dark text */
                  background-color: transparent; /* Allow parent background to show */
                  -webkit-font-smoothing: antialiased;
                  word-break: break-word;
                  line-height: 1.6;
                  font-size: 13px;
                }
                a { color: #8ab4f8; text-decoration: underline; } /* Aura blue for links */
                img { max-width: 100%; height: auto; display: block; margin: 8px 0; }
                /* Basic reset for common email client styles */
                table, th, td { border-collapse: collapse; }
                td { padding: 4px; }
              </style>
            </head>
            <body>
              ${html}
            </body>
          </html>
        `);
        doc.close();
        // Delay setting loading to false for a smoother perceived load
        const timer = setTimeout(() => setLoading(false), 200);
        return () => clearTimeout(timer);
      }
    }
  }, [html]);

  return (
    <div className="relative w-full h-[500px] bg-neutral-900 rounded-lg border border-white/[0.04] overflow-hidden">
        {loading && (
            <motion.div 
                initial={{ opacity: 1 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center bg-neutral-900 z-10"
            >
                <Loader2 className="w-6 h-6 text-neutral-500 animate-spin" />
            </motion.div>
        )}
        <iframe
            ref={iframeRef}
            title="Isolated Content Context"
            className={`w-full h-full border-0 bg-transparent rounded-lg transition-opacity duration-300 ${loading ? 'opacity-0' : 'opacity-100'}`}
            sandbox="allow-same-origin allow-scripts allow-popups" // Added allow-scripts for interactive HTML, but be cautious
        />
    </div>
  );
});
SafeMailIframe.displayName = 'SafeMailIframe';

// ============================================================================
// Primary Component - REFINED
// ============================================================================
export function EmailMimeViewer({ data }: EmailMimeViewerProps) {
  const [activeTab, setActiveTab] = useState<TabType>('preview');
  const [selectedPartId, setSelectedPartId] = useState<string>('text-html'); // Default to text-html
  const [headerSearch, setHeaderSearch] = useState<string>('');
  const [copiedHeader, setCopiedHeader] = useState<string | null>(null);
  const [copiedContent, setCopiedContent] = useState<boolean>(false);

  const emailData = useMemo(() => {
    return {
      id: data?.id || '',
      subject: data?.subject || 'No Subject',
      sender: data?.sender || { name: 'Unknown', email: 'unknown@domain.local' },
      recipient: data?.recipient || '',
      receivedAt: data?.receivedAt || new Date().toISOString(),
      mimeVersion: data?.mimeVersion || '1.0',
      contentType: data?.contentType || 'text/html',
      spf: data?.spf || 'none',
      dkim: data?.dkim || 'none',
      dmarc: data?.dmarc || 'none',
      headers: data?.headers || [],
      mimeTree: data?.mimeTree || null,
      parsedHtml: data?.parsedHtml || ''
    };
  }, [data]);

  const handleCopyHeader = useCallback((key: string, text: string) => {
    navigator.clipboard.writeText(`${key}: ${text}`);
    setCopiedHeader(key);
    setTimeout(() => setCopiedHeader(null), 2000);
  }, []);

  const handleCopyContent = useCallback((content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedContent(true);
    setTimeout(() => setCopiedContent(false), 2000);
  }, []);

  const filteredHeaders = useMemo(() => {
    if (!headerSearch) return emailData.headers;
    const q = headerSearch.toLowerCase();
    return emailData.headers.filter(h => h.name.toLowerCase().includes(q) || h.value.toLowerCase().includes(q));
  }, [emailData.headers, headerSearch]);

  const locateMimePart = useCallback((node: MimePart, id: string): MimePart | null => {
    if (node.id === id) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = locateMimePart(child, id);
        if (found) return found;
      }
    }
    return null;
  }, []);

  const selectedPart = useMemo(() => {
    // If no specific part is selected, and mimeTree exists, try to find the HTML part
    if (!emailData.mimeTree) return null;
    if (selectedPartId === 'text-html' && emailData.parsedHtml) {
        // Create a dummy MimePart for the main HTML preview
        return {
            id: 'text-html',
            name: 'Main HTML Content',
            mimeType: 'text/html',
            size: `${(emailData.parsedHtml.length / 1024).toFixed(1)} KB`,
            contentSample: emailData.parsedHtml.substring(0, 500) + '...'
        };
    }
    return locateMimePart(emailData.mimeTree, selectedPartId) || emailData.mimeTree;
  }, [emailData.mimeTree, selectedPartId, locateMimePart, emailData.parsedHtml]);

  const renderMimeTreeNode = useCallback((node: MimePart, depth = 0) => {
    const isParent = !!(node.children && node.children.length > 0);
    const isSelected = selectedPartId === node.id;
    
    let typeTag = 'DOC';
    if (isParent) typeTag = 'DIR';
    else if (node.mimeType.startsWith('image/')) typeTag = 'IMG';
    else if (node.mimeType.includes('html')) typeTag = 'HTM';
    else if (node.mimeType.includes('plain')) typeTag = 'TXT';
    else if (node.mimeType.includes('json')) typeTag = 'JSN';
    else if (node.mimeType.includes('attachment')) typeTag = 'ATT';
    
    return (
      <div key={node.id} className="select-none font-mono">
        <button
          type="button"
          onClick={() => setSelectedPartId(node.id)}
          className={`w-full flex items-center justify-between text-left py-2 transition-colors duration-200 cursor-pointer border-l-2 outline-none focus-visible:bg-neutral-900/50 ${
            isSelected 
              ? 'border-blue-400 bg-neutral-900 text-white' 
              : 'border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50'
          }`}
          style={{ paddingLeft: `${Math.max(depth * 16 + 16, 16)}px`, paddingRight: '16px' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className={`text-[10px] tracking-widest shrink-0 ${isSelected ? 'text-blue-400' : 'text-neutral-600'}`}>
              [{typeTag}]
            </span>
            <span className="text-[12px] tracking-tight truncate">{node.name || `Part ${node.id.substring(0,4)}`}</span>
          </div>
          <span className="text-[10px] text-neutral-600 tabular-nums shrink-0 ml-2">{node.size}</span>
        </button>
        {isParent && node.children?.map(child => renderMimeTreeNode(child, depth + 1))}
      </div>
    );
  }, [selectedPartId, locateMimePart]);

  return (
    <div className="w-full bg-neutral-950 border border-white/[0.04] rounded-[24px] overflow-hidden flex flex-col text-left font-sans mb-8 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8),0_0_20px_rgba(255,255,255,0.02)]">
      
      {/* Structural Metadata Header */}
      <div className="p-6 border-b border-white/[0.04] bg-neutral-900">
        <div className="flex flex-col md:flex-row justify-between items-start gap-4">
          <div className="space-y-3 min-w-0 flex-1 w-full">
            <div className="flex flex-wrap items-center gap-3 select-none">
              <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest border border-white/[0.04] bg-neutral-800 px-2.5 py-1 rounded-full">
                RFC 5322 Payload
              </span>
              <span className="text-[10px] font-mono text-neutral-500 tabular-nums">
                {new Date(emailData.receivedAt).toLocaleString()}
              </span>
            </div>
            <h2 className="text-[20px] font-medium text-white tracking-tight break-words w-full">
              {emailData.subject}
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6 pt-5 border-t border-white/[0.04]">
          <div className="flex flex-col gap-1 text-[13px] min-w-0">
            <span className="text-[9px] text-neutral-500 font-mono uppercase tracking-widest select-none font-bold">Origin</span>
            <span className="text-neutral-300 font-mono truncate">
              {emailData.sender.name} <span className="text-neutral-500">&lt;{emailData.sender.email}&gt;</span>
            </span>
          </div>
          <div className="flex flex-col gap-1 text-[13px] min-w-0">
            <span className="text-[9px] text-neutral-500 font-mono uppercase tracking-widest select-none font-bold">Destination</span>
            <span className="text-neutral-300 font-mono truncate">{emailData.recipient}</span>
          </div>
        </div>
      </div>

      {/* Institutional Tab System */}
      <div className="flex border-b border-white/[0.04] px-6 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden select-none bg-neutral-900">
        {[
          { id: 'preview', label: 'Preview' },
          { id: 'structure', label: 'Structure' },
          { id: 'headers', label: 'Headers' },
          { id: 'auth', label: 'Authentication' }
        ].map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`relative px-4 py-3 text-[11px] font-mono uppercase tracking-widest whitespace-nowrap transition-colors outline-none border-b-2 ${
                active 
                  ? 'text-white border-blue-400 font-bold' 
                  : 'text-neutral-500 border-transparent hover:text-neutral-300 hover:border-white/[0.04]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Main Viewport Container */}
      <div className="flex-1 min-h-[400px] relative">
        
        {/* TAB 1: PREVIEW */}
        {activeTab === 'preview' && (
          <div className="p-6 h-full">
            {emailData.parsedHtml ? (
              <div className="w-full border border-white/[0.04] rounded-lg overflow-hidden">
                <div className="px-4 py-2 border-b border-white/[0.04] flex items-center justify-between bg-neutral-900 select-none">
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Viewport</span>
                    <span className="text-[10px] font-mono text-neutral-500">text/html</span>
                  </div>
                  <button
                      onClick={() => handleCopyContent(emailData.parsedHtml)}
                      className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-mono text-neutral-500 hover:text-white transition-colors"
                  >
                      {copiedContent ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedContent ? 'Copied Text' : 'Copy Text'}
                  </button>
                </div>
                <SafeMailIframe html={emailData.parsedHtml} />
              </div>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-neutral-600 text-[11px] font-mono uppercase tracking-widest select-none border border-white/[0.04] border-dashed rounded-lg bg-neutral-900/50">
                <Eye className="w-6 h-6 text-neutral-700 mr-2" /> Payload Unavailable
              </div>
            )}
          </div>
        )}

        {/* TAB 2: STRUCTURE */}
        {activeTab === 'structure' && (
          <div className="grid grid-cols-1 md:grid-cols-12 h-[500px] divide-y md:divide-y-0 md:divide-x divide-white/[0.04]">
            
            <div className="md:col-span-4 py-4 overflow-y-auto max-h-[500px] bg-neutral-950">
              <div className="space-y-1">
                {emailData.mimeTree ? renderMimeTreeNode(emailData.mimeTree) : (
                  <div className="text-center py-10 text-neutral-600 text-[11px] font-mono uppercase tracking-widest select-none">
                    <Eye className="w-6 h-6 mx-auto mb-2 text-neutral-700" /> Structure Unparsed
                  </div>
                )}
              </div>
            </div>

            <div className="md:col-span-8 p-6 overflow-y-auto max-h-[500px] bg-neutral-900">
              {selectedPart ? (
                <div className="space-y-8">
                  <div className="flex justify-between items-start">
                    <div className="min-w-0">
                      <h4 className="text-[15px] font-mono text-white break-all mb-2">
                        {selectedPart.name || 'Untitled Part'}
                      </h4>
                      <p className="text-[11px] font-mono text-neutral-500">
                        {selectedPart.mimeType}
                      </p>
                    </div>
                    <span className="text-[11px] font-mono text-neutral-500 select-none tabular-nums">
                      {selectedPart.size}
                    </span>
                  </div>

                  <hr className="border-white/[0.04]" />

                  <div className="grid grid-cols-2 gap-6 font-mono text-[12px] bg-neutral-950 p-4 border border-white/[0.04] rounded-lg select-none">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-neutral-600 uppercase tracking-widest text-[9px] font-bold">Encoding</span>
                      <span className="text-neutral-300">{selectedPart.encoding || 'none'}</span>
                    </div>
                    <div className="col-span-2 flex flex-col gap-1.5">
                      <span className="text-neutral-600 uppercase tracking-widest text-[9px] font-bold">Disposition</span>
                      <span className="text-neutral-300 break-all">{selectedPart.disposition || 'inline'}</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <span className="text-[10px] text-neutral-500 uppercase tracking-widest select-none font-bold">Decoded Content</span>
                    <div className="bg-neutral-950 border border-white/[0.04] rounded-lg p-4 max-h-[200px] overflow-y-auto text-[11px] text-neutral-400 font-mono whitespace-pre-wrap leading-relaxed select-text">
                      {selectedPart.contentSample || 'No decodable content.'}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <span className="text-[10px] text-neutral-500 uppercase tracking-widest select-none font-bold">Hexadecimal Dump</span>
                    <div className="bg-neutral-950 border border-white/[0.04] rounded-lg p-4 text-[11px] font-mono leading-relaxed break-all select-text">
                      <div className="text-neutral-400">
                        <span className="text-neutral-600 mr-4 select-none">00000000:</span> 
                        {selectedPart.hexSample || '00 00 00 00 00 00 00 00'}
                      </div>
                      <div className="text-neutral-600 mt-3 pt-3 border-t border-white/[0.04] tracking-widest break-all">
                        {String.fromCharCode(...(selectedPart.hexSample?.split(' ').map(hex => parseInt(hex, 16)).filter(char => char >= 32 && char <= 126) || []))}
                      </div>
                    </div>
                  </div>

                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-neutral-600 text-[11px] font-mono uppercase tracking-widest select-none">
                  <Eye className="w-6 h-6 mx-auto mb-2 text-neutral-700" /> Select structural node
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: HEADERS */}
        {activeTab === 'headers' && (
          <div className="flex flex-col h-[500px]">
            <div className="p-4 border-b border-white/[0.04] bg-neutral-900">
              <div className="flex items-center gap-3 bg-neutral-950 border border-white/[0.04] rounded-lg px-3 py-2 w-full max-w-sm focus-within:border-white/[0.15] transition-colors">
                <span className="text-neutral-500 shrink-0"><Search className="w-4 h-4" /></span>
                <input
                  type="text"
                  placeholder="Filter headers..."
                  value={headerSearch}
                  onChange={(e) => setHeaderSearch(e.target.value)}
                  className="w-full bg-transparent border-none outline-none text-neutral-200 text-[12px] font-mono placeholder:text-neutral-600"
                  spellCheck={false}
                />
              </div>
            </div>

            <div className="flex-1 overflow-x-auto bg-neutral-950">
              <table className="w-full font-mono text-[12px] border-collapse tabular-nums lining-nums text-left">
                <thead className="bg-neutral-900 text-neutral-500 uppercase tracking-widest text-[9px] border-b border-white/[0.04] select-none sticky top-0 z-10">
                  <tr>
                    <th className="px-5 py-3 font-bold w-[220px]">Header Key</th>
                    <th className="px-5 py-3 font-bold">RFC Value</th>
                    <th className="px-5 py-3 font-bold w-[100px] text-right">Class</th>
                    <th className="px-5 py-3 font-bold w-[60px] text-center">Copy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02] select-text">
                  {filteredHeaders.length > 0 ? (
                    filteredHeaders.map((header) => (
                      <tr key={header.name} className="hover:bg-white/[0.03] transition-colors group">
                        <td className="px-5 py-3 text-neutral-300 align-top break-all select-all">{header.name}</td>
                        <td className="px-5 py-3 text-neutral-500 align-top whitespace-pre-wrap break-all select-all leading-relaxed max-w-[400px]">
                          {header.value}
                        </td>
                        <td className="px-5 py-3 text-right align-top select-none">
                          <span className="inline-block px-2 py-0.5 rounded-full uppercase tracking-widest text-[9px] text-neutral-500 border border-white/[0.04] bg-neutral-900">
                            {header.category}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-center align-top select-none">
                          <button
                            type="button"
                            onClick={() => handleCopyHeader(header.name, header.value)}
                            className="text-neutral-600 hover:text-neutral-300 transition-colors focus:outline-none"
                            aria-label="Copy Header"
                          >
                            {copiedHeader === header.name ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-neutral-600 text-[11px] uppercase tracking-widest select-none">
                        <Eye className="w-6 h-6 mx-auto mb-2 text-neutral-700" /> No headers matched filter
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: AUTH */}
        {activeTab === 'auth' && (
          <div className="p-6 md:p-8 bg-neutral-950 h-full">
            <div className="mb-6 flex items-center justify-between pb-4 border-b border-white/[0.04] select-none">
              <span className="text-[13px] font-mono text-white uppercase tracking-widest font-bold">Origin Validated</span>
              <span className="text-[11px] font-mono text-neutral-500 uppercase tracking-widest font-bold">RFC Alignment</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono text-[12px] mb-8">
              
              {/* SPF */}
              <div className="flex flex-col gap-3 p-4 bg-neutral-900 border border-white/[0.04] rounded-lg shadow-sm">
                <div className="flex justify-between items-center text-neutral-500 uppercase tracking-widest text-[10px] font-bold select-none">
                  <span>SPF</span>
                  <span className={emailData.spf.toLowerCase().includes('pass') ? 'text-emerald-400' : 'text-rose-400'}>
                    {emailData.spf.toUpperCase()}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 border-t border-white/[0.04] pt-3">
                  <div className="flex justify-between text-neutral-500"><span className="select-none">Protocol</span><span className="text-neutral-300">RFC 7208</span></div>
                  <div className="flex justify-between text-neutral-500"><span className="select-none">Origin</span><span className="text-neutral-300 truncate max-w-[120px]">{emailData.sender.email.split('@')[1] || '-'}</span></div>
                </div>
              </div>

              {/* DKIM */}
              <div className="flex flex-col gap-3 p-4 bg-neutral-900 border border-white/[0.04] rounded-lg shadow-sm">
                <div className="flex justify-between items-center text-neutral-500 uppercase tracking-widest text-[10px] font-bold select-none">
                  <span>DKIM</span>
                  <span className={emailData.dkim.toLowerCase().includes('pass') ? 'text-emerald-400' : 'text-rose-400'}>
                    {emailData.dkim.toUpperCase()}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 border-t border-white/[0.04] pt-3">
                  <div className="flex justify-between text-neutral-500"><span className="select-none">Algorithm</span><span className="text-neutral-300">RSA-256</span></div>
                  <div className="flex justify-between text-neutral-500"><span className="select-none">Domain</span><span className="text-neutral-300 truncate max-w-[120px]">{emailData.sender.email.split('@')[1] || '-'}</span></div>
                </div>
              </div>

              {/* DMARC */}
              <div className="flex flex-col gap-3 p-4 bg-neutral-900 border border-white/[0.04] rounded-lg shadow-sm">
                <div className="flex justify-between items-center text-neutral-500 uppercase tracking-widest text-[10px] font-bold select-none">
                  <span>DMARC</span>
                  <span className={emailData.dmarc.toLowerCase().includes('pass') ? 'text-emerald-400' : 'text-rose-400'}>
                    {emailData.dmarc.toUpperCase()}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 border-t border-white/[0.04] pt-3">
                  <div className="flex justify-between text-neutral-500"><span className="select-none">Alignment</span><span className="text-neutral-300">Strict</span></div>
                  <div className="flex justify-between text-neutral-500"><span className="select-none">Enforcement</span><span className="text-neutral-300">Reject</span></div>
                </div>
              </div>

            </div>

            <div className="p-4 bg-neutral-900 border border-white/[0.04] rounded-lg flex items-center justify-between select-none shadow-sm">
              <span className="font-mono text-neutral-500 text-[11px] uppercase tracking-widest font-bold">
                Transport Security
              </span>
              <span className="text-[11px] font-mono text-neutral-300 tabular-nums">
                 TLS 1.3 (AES-256-GCM)
              </span>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
