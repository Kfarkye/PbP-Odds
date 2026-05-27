import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export const CopyButton = ({ textToCopy }: { textToCopy: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering parent card click handlers
    if (!textToCopy) return;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // Reset state after 2 seconds
    } catch (err) {
      console.error('[AURA:CLIPBOARD] Copy failed:', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] border border-white/[0.04] bg-neutral-950 text-neutral-500 hover:border-white/[0.04] hover:bg-neutral-900 hover:text-neutral-300 transition-all duration-200 active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500/40 shrink-0"
      title="Copy response to clipboard"
      type="button"
    >
      {copied ? (
        <Check size={13} strokeWidth={3} className="text-emerald-400 animate-scale-up" />
      ) : (
        <Copy size={13} strokeWidth={2.5} />
      )}
    </button>
  );
};

// Backward-compatible wrapper for MessageCopyButton
export function MessageCopyButton({ text }: { text: string }) {
  return <CopyButton textToCopy={text} />;
}
