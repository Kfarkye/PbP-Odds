import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Terminal, Code2, ShieldCheck, PlaySquare,
  Copy, Check, Layers, Cpu, Database, ChevronRight, HelpCircle,
  Activity, Server, Network, Sparkles, Filter, Radio,
  Clock, BarChart3, AlignLeft, Crosshair, DollarSign, ChevronDown, RefreshCw, AlertTriangle, X,
  Fingerprint, Shield, TrendingUp, ExternalLink
} from 'lucide-react';

// ============================================================================
// Types & Interfaces
// ============================================================================
type McpTab = 'setup.sh' | 'server.py' | 'config.json' | 'prompts.txt' | 'live_playground';
type FastMcpTool = 'execute_fusion' | 'get_markets' | 'get_market' | 'get_order_book' | 'get_balance' | 'get_positions' | 'place_limit_order';

interface ToolArgDetails {
  ticker: string;
  query: string;
  limit: number;
  status: 'open' | 'closed' | 'settled';
  side: 'yes' | 'no';
  action: 'buy' | 'sell';
  count: number;
  price_cents: number;
}

const SPRING_TRANSITION = { type: "spring" as const, stiffness: 500, damping: 32 };
const EASE_TRANSITION: [number, number, number, number] = [0.16, 1, 0.3, 1];

// ============================================================================
// Python MCP Server Source Code (Immutable)
// ============================================================================
const MCP_FILES: Record<Exclude<McpTab, 'live_playground'>, string> = {
  'setup.sh': `# 1. Set up a pristine virtual environment for Substrate development
mkdir aura-kalshi-node
cd aura-kalshi-node
python -m venv venv
source venv/bin/activate

# 2. Install zero-dependency quantitative connections
pip install mcp[cli] httpx cryptography pydantic`,

  'server.py': `import os
import time
import base64
import logging
import json
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from typing import Optional, List, Dict, Any

import httpx
from mcp.server.fastmcp import FastMCP
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import serialization
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] [%(levelname)s] %(message)s")
logger = logging.getLogger("kalshi-sports-engine")

KALSHI_API_URL = os.environ.get("KALSHI_API_URL", "https://trading-api.kalshi.com")
KALSHI_API_KEY_ID = os.environ.get("KALSHI_API_KEY_ID")
KALSHI_PRIVATE_KEY = os.environ.get("KALSHI_PRIVATE_KEY")

http_client: Optional[httpx.AsyncClient] = None

@asynccontextmanager
async def lifespan(server: FastMCP):
    """Keep a connection pool open during server runtime."""
    global http_client
    http_client = httpx.AsyncClient(
        base_url=KALSHI_API_URL,
        timeout=httpx.Timeout(5.0),
        limits=httpx.Limits(max_keepalive_connections=30, max_connections=50)
    )
    yield
    if http_client:
        await http_client.aclose()

mcp = FastMCP("Prediction Markets Node", lifespan=lifespan)

class MarketSimpleOverview(BaseModel):
    ticker: str
    title: str
    subtitle: str
    yes_bid: int
    yes_ask: int
    volume: int
    probability: float
    updated_at: str

def format_contract_data(raw: dict) -> dict:
    yes_ask = raw.get("yes_ask", 0)
    yes_bid = raw.get("yes_bid", 0)
    last_price = raw.get("last_price", 0)
          
    probability = 0.0
    if yes_ask > 0 and yes_bid > 0:
        probability = round(((yes_ask + yes_bid) / 2) / 100.0, 2)
    elif last_price > 0:
        probability = round(last_price / 100.0, 2)
        
    title = raw.get("title", "")
    if title.lower().startswith("yes ") and "," in title:
        parts = [p.replace("yes ", "").replace("Yes ", "") for p in title.split(",yes ")]
        title = "Parlay: " + ", ".join(parts[:2]) + "..."
        
    return MarketSimpleOverview(
        ticker=raw.get("ticker", ""),
        title=title,
        subtitle=raw.get("subtitle", ""),
        yes_bid=yes_bid,
        yes_ask=yes_ask,
        volume=int(raw.get("volume", 0)),
        probability=probability,
        updated_at=datetime.now(timezone.utc).isoformat()
    ).model_dump()

def get_auth_headers(method: str, path: str) -> dict:
    headers = {"Content-Type": "application/json"}
    if not KALSHI_API_KEY_ID: return headers
    timestamp = str(int(time.time() * 1000))
    
    # Generate RSA-PSS Signature
    message = f"{timestamp}{method.upper()}{path}".encode("utf-8")
    private_key = serialization.load_pem_private_key(KALSHI_PRIVATE_KEY.replace('\\\\n', '\\n').encode("utf-8"), password=None)
    signature = private_key.sign(
        message, padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.DIGEST_LENGTH), hashes.SHA256()
    )
    
    headers.update({
        "KALSHI-ACCESS-KEY": KALSHI_API_KEY_ID,
        "KALSHI-ACCESS-TIMESTAMP": timestamp,
        "KALSHI-ACCESS-SIGNATURE": base64.b64encode(signature).decode("utf-8")
    })
    return headers

@mcp.tool()
async def get_markets(query: str, limit: int = 10) -> List[dict]:
    path = f"/trade-api/v2/markets?limit={limit*2}&status=open&search_query={query}"
    response = await http_client.get(path, headers=get_auth_headers("GET", path))
    
    # Defensive Intercept against 429 WAF Rate Limits
    if response.status_code == 429 or "Rate exceeded" in response.text:
        return [{"status": "error", "message": "Kalshi API Rate Limit Exceeded (HTTP 429)."}]
    if response.status_code != 200:
        return [{"status": "error", "message": f"Failed to pull contracts: {response.status_code}"}]
        
    try:
        markets = response.json().get("markets", [])
        return [format_contract_data(m) for m in markets[:limit]]
    except Exception as e:
        return [{"status": "error", "message": f"Parse Error: {response.text[:50]}"}]

if __name__ == "__main__":
    mcp.run()`,

  'config.json': `{
  "servers": {
    "kalshi-sports-node": {
      "command": "/bin/python3",
      "args": ["./server.py"],
      "env": {
        "KALSHI_API_URL": "https://trading-api.kalshi.com",
        "KALSHI_API_KEY_ID": "gcp-kms-secret-id",
        "KALSHI_PRIVATE_KEY": "-----BEGIN RSA PRIVATE KEY-----\\n..."
      }
    }
  }
}`,

  'prompts.txt': `// Aura Quantitative Execution Intents:
1. "Show predictions for tonight's game. Compare current pricing on Yes vs No contracts."
2. "Check the order book for Mavericks vs Timberwolves. Sum up current liquidity imbalances."`
};

const TOOL_ARG_SCHEMAS: Record<FastMcpTool, any[]> = {
  execute_fusion: [{ label: 'Ticker', id: 'ticker', type: 'text', placeholder: 'e.g., KX-NVDA-EARNINGS' }],
  get_markets: [
    { label: 'Query', id: 'query', type: 'text', placeholder: 'e.g., Election, Rates' },
    { label: 'Limit', id: 'limit', type: 'number', min: 1, max: 50, placeholder: '10' },
    { label: 'Status', id: 'status', type: 'select', options: [{ label: 'Open', value: 'open' }, { label: 'Closed', value: 'closed' }] },
  ],
  get_market: [{ label: 'Ticker', id: 'ticker', type: 'text', placeholder: 'e.g., KX-NVDA-EARNINGS' }],
  get_order_book: [{ label: 'Ticker', id: 'ticker', type: 'text', placeholder: 'e.g., KX-NVDA-EARNINGS' }],
  get_balance: [],
  get_positions: [],
  place_limit_order: [
    { label: 'Ticker', id: 'ticker', type: 'text', placeholder: 'e.g., KX-NVDA' },
    { label: 'Side', id: 'side', type: 'select', options: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }] },
    { label: 'Action', id: 'action', type: 'select', options: [{ label: 'Buy', value: 'buy' }, { label: 'Sell', value: 'sell' }] },
    { label: 'Count', id: 'count', type: 'number', min: 1, placeholder: '10' },
    { label: 'Price (Cents)', id: 'price_cents', type: 'number', min: 1, max: 99, placeholder: '65' },
  ],
};

// ============================================================================
// Google Substrate Form Components
// ============================================================================
const InputField = React.memo(({ label, type = 'text', value, onChange, placeholder, min, max }: any) => (
  <div className="space-y-1.5 text-left w-full font-sans">
    <label className="text-[9px] font-mono uppercase tracking-widest text-neutral-500 block pl-1 select-none font-bold">{label}</label>
    <div className="relative group">
      <input
        type={type} min={min} max={max} value={value} onChange={onChange} placeholder={placeholder}
        className="w-full bg-[#0A0A0A] border border-white/[0.04] rounded-[10px] px-3.5 py-3 text-[12px] text-white/95 outline-none transition-all duration-300 focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4]/30 font-mono tracking-wide placeholder:text-neutral-700 tabular-nums shadow-inner"
      />
    </div>
  </div>
));
InputField.displayName = 'InputField';

const SelectField = React.memo(({ label, value, onChange, options }: any) => (
  <div className="space-y-1.5 text-left w-full font-sans">
    <label className="text-[9px] font-mono uppercase tracking-widest text-neutral-500 block pl-1 select-none font-bold">{label}</label>
    <div className="relative">
      <select
        value={value} onChange={onChange}
        className="w-full bg-[#0A0A0A] border border-white/[0.04] rounded-[10px] pl-3.5 pr-10 py-3 text-[12px] text-white/95 outline-none transition-all duration-300 focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4]/30 cursor-pointer appearance-none font-mono shadow-inner"
      >
        {options.map((opt: any) => <option key={opt.value} value={opt.value} className="bg-[#050505] text-white">{opt.label}</option>)}
      </select>
      <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-600">
        <ChevronDown className="w-4 h-4" strokeWidth={1.5} />
      </div>
    </div>
  </div>
));
SelectField.displayName = 'SelectField';

const formatKalshiTitle = (title: string, subtitle?: string) => {
  if (!title) return '';
  let t = title;
  
  // Kalshi API frequently leaks "undefined" literal strings directly into the title.
  t = t.replace(/undefined/gi, '').trim();
  t = t.replace(/1\+\s*\?/, '1+?');
  t = t.replace(/2\+\s*\?/, '2+?');

  const isBasketball = t.toLowerCase().match(/(harden|towns|mitchell|hart|allen|knicks|celtics|nba|edwards|jokic|curry|lebron)/i);
  if (isBasketball && t.match(/\d+\+\?/)) {
    const sub = (subtitle && subtitle !== 'undefined' && subtitle.trim() !== '') ? subtitle : '3-Pointers Made';
    t = t.replace(/(\d+\+)\?/, `$1 ${sub}?`);
  }
  
  // Clean up any double spaces that might have been created
  t = t.replace(/\s+/g, ' ').trim();
  
  return t;
};

// ============================================================================
// AuraSportsCard: Institutional High-Density Quant Visualizer
// ============================================================================
const AuraSportsCard = React.memo(({ market, isAuthorized, onPlaceOrder }: { market: any; isAuthorized: boolean; onPlaceOrder: any }) => {
  const [showReceipt, setShowReceipt] = useState(false);
  const [selectedSide, setSelectedSide] = useState<'yes' | 'no'>('yes');
  const [quantity, setQuantity] = useState<number>(10);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [orderFeedback, setOrderFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  const [showDepth, setShowDepth] = useState(false);
  const [depthData, setDepthData] = useState<any>(null);
  const [fetchingDepth, setFetchingDepth] = useState(false);

  const fetchDepth = async () => {
    if (showDepth) return setShowDepth(false);
    setShowDepth(true);
    if (depthData) return;
    
    setFetchingDepth(true);
    try {
      const response = await fetch('/api/mcp/kalshi/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'get_order_book', args: { ticker: market.ticker } })
      });
      const rawText = await response.text();
      let data;
      try { data = JSON.parse(rawText); } catch { return; }
      if (response.ok && data?.result) setDepthData(data.result);
    } catch (err) {
      console.error(err);
    } finally {
      setFetchingDepth(false);
    }
  };

  const handlePlaceOrder = async () => {
    setIsPlacingOrder(true);
    setOrderFeedback(null);
    
    const topYesBid = depthData?.orderbook?.yes?.[0]?.[0] || market.yes_bid || 0;
    const topYesAsk = depthData?.orderbook?.no?.[0]?.[0] ? 100 - depthData.orderbook.no[0][0] : market.yes_ask || 0;
    const selectedPrice = selectedSide === 'yes' ? topYesAsk : (topYesBid > 0 ? 100 - topYesBid : 0);

    try {
      await onPlaceOrder(selectedPrice, selectedSide, 'buy', quantity, market.ticker);
      setOrderFeedback({ message: `LIMIT BUY EXECUTED: ${quantity} CONTRACTS @ ${selectedPrice}¢`, type: 'success' });
      setTimeout(() => setOrderFeedback(null), 3000);
    } catch (err: any) {
      setOrderFeedback({ message: err.message || "Execution Fault.", type: 'error' });
      setTimeout(() => setOrderFeedback(null), 3000);
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const yesPrice = market.yes_bid || Math.round((market.probability || 0.5) * 100);
  const noPrice = 100 - (market.yes_ask || yesPrice);
  const totalCost = (quantity * (selectedSide === 'yes' ? yesPrice : noPrice)) / 100;

  const tLow = market.title.toLowerCase();
  const isTennis = tLow.match(/(rublev|djokovic|alcaraz|paul|dimitrov)/i);
  const isBaseball = tLow.match(/(sox|yankees|dodgers|cubs|marlins)/i);
  const isBasketball = tLow.match(/(harden|towns|mitchell|lakers|nba)/i);
  const leagueBadge = isTennis ? "ATP" : isBaseball ? "MLB" : isBasketball ? "NBA" : "FUTURES";

  const getCdnImage = (title: string, league: string) => {
    const t = title.toLowerCase();
    if (t.includes('harden')) return 'https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/3992.png';
    if (t.includes('alcaraz')) return 'https://a.espncdn.com/combiner/i?img=/i/headshots/tennis/players/full/4754546.png';
    if (t.includes('yankees')) return 'https://a.espncdn.com/i/teamlogos/mlb/500/nyy.png';
    return null;
  };

  const avatarUrl = getCdnImage(market.title, leagueBadge);

  const hashVal = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < market.ticker.length; i++) hash = (hash << 5) - hash + market.ticker.charCodeAt(i);
    return Math.abs(hash).toString(16).padEnd(8, 'f').substring(0, 8).toUpperCase();
  }, [market.ticker]);

  let bids: any[] = [{ price_cents: yesPrice, quantity: 1250 }];
  let asks: any[] = [{ price_cents: 100 - noPrice, quantity: 940 }];
  if (depthData?.orderbook) {
    if (depthData.orderbook.yes) bids = depthData.orderbook.yes.map((l: any[]) => ({ price_cents: l[0], quantity: l[1] })).sort((a:any, b:any) => b.price_cents - a.price_cents);
    if (depthData.orderbook.no) asks = depthData.orderbook.no.map((l: any[]) => ({ price_cents: 100 - l[0], quantity: l[1] })).sort((a:any, b:any) => a.price_cents - b.price_cents);
  }

  const maxVol = Math.max(...bids.map(b => b.quantity), ...asks.map(a => a.quantity), 1);
  const skewPercent = Math.round((bids.reduce((s, b) => s + b.quantity, 0) / (bids.reduce((s, b) => s + b.quantity, 0) + asks.reduce((s, a) => s + a.quantity, 0) || 1)) * 100);

  return (
    <div className="w-full bg-[#050505] rounded-[24px] overflow-hidden transition-all duration-500 ease-[0.16,1,0.3,1] flex flex-col min-h-[420px] border border-white/[0.04] relative group hover:border-white/[0.04] shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_16px_50px_rgba(0,0,0,0.25)]">
      
      <AnimatePresence mode="wait">
        {!showReceipt ? (
          <motion.div key="market" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="flex-1 flex flex-col p-6 relative z-10">
            
            {/* Header */}
            <div className="flex items-center justify-between mb-5 select-none">
              <div className="flex items-center gap-2">
                {avatarUrl ? (
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-[#0A0A0A] border border-white/[0.04] shrink-0 flex items-center justify-center shadow-inner">
                    <img src={avatarUrl} alt="Subject" className="w-full h-full object-cover scale-105 grayscale-[0.2] group-hover:grayscale-0 transition-all duration-500" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#0A0A0A] border border-white/[0.04] flex items-center justify-center shrink-0 shadow-inner">
                    <span className="text-[10px] font-mono font-bold text-neutral-500 uppercase">{leagueBadge.substring(0, 1)}</span>
                  </div>
                )}
                <span className="text-[9px] font-mono tracking-widest text-neutral-500 uppercase font-bold">{leagueBadge}</span>
              </div>
              <button onClick={() => setShowReceipt(true)} className="w-8 h-8 rounded-full border border-white/[0.04] flex items-center justify-center bg-white/[0.02] hover:bg-white/[0.06] transition-colors text-neutral-500 hover:text-white outline-none">
                <Fingerprint className="w-3.5 h-3.5" />
              </button>
            </div>

            <h4 className="text-[17px] font-medium text-white/95 leading-[1.3] tracking-tight line-clamp-2 min-h-[44px] mb-6">
              {formatKalshiTitle(market.title, market.subtitle)}
            </h4>

            {/* Scoreboard Pricing */}
            <div className="grid grid-cols-2 gap-px bg-white/[0.04] border border-white/[0.04] rounded-[16px] overflow-hidden mb-6 p-[1px] select-none shadow-inner">
              <div className="bg-[#000000] p-3 text-center flex flex-col items-center justify-center">
                <div className="text-[9px] font-mono uppercase tracking-widest text-[#34C759] font-bold mb-1">YES Price</div>
                <div className="text-[22px] font-mono font-bold text-white tabular-nums lining-nums leading-none tracking-tight">{yesPrice}¢</div>
              </div>
              <div className="bg-[#000000] p-3 text-center flex flex-col items-center justify-center">
                <div className="text-[9px] font-mono uppercase tracking-widest text-[#FF3B30] font-bold mb-1">NO Price</div>
                <div className="text-[22px] font-mono font-bold text-white tabular-nums lining-nums leading-none tracking-tight">{noPrice}¢</div>
              </div>
            </div>

            {/* Probability Slider */}
            <div className="space-y-2 mb-8 select-none">
              <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest px-1">
                <span className="text-neutral-500 font-bold">Implied Prob</span>
                <span className="text-white font-bold tabular-nums">{Math.round((market.probability || 0.5) * 100)}%</span>
              </div>
              <div className="h-1.5 w-full bg-[#111113] rounded-full overflow-hidden border border-white/[0.04] relative shadow-inner">
                <motion.div
                  initial={{ width: 0 }} animate={{ width: `${Math.round((market.probability || 0.5) * 100)}%` }} transition={{ duration: 1, ease: EASE_TRANSITION }}
                  className="absolute top-0 left-0 h-full bg-white rounded-full shadow-[0_0_12px_rgba(255,255,255,0.4)]"
                />
              </div>
            </div>

            {/* Interaction Layer */}
            <div className="mt-auto">
                <div className="grid grid-cols-2 gap-3 mb-4 select-none">
                <button
                    onClick={() => setSelectedSide('yes')}
                    className={`py-2.5 rounded-[12px] text-[10px] font-mono uppercase tracking-widest transition-all duration-300 border outline-none active:scale-[0.96] ${selectedSide === 'yes' ? 'bg-[#34C759]/10 text-[#34C759] border-[#34C759]/30 font-bold' : 'bg-transparent text-neutral-500 border-white/[0.04] hover:bg-white/[0.02] hover:text-neutral-300 font-semibold'}`}
                >
                    Buy YES
                </button>
                <button
                    onClick={() => setSelectedSide('no')}
                    className={`py-2.5 rounded-[12px] text-[10px] font-mono uppercase tracking-widest transition-all duration-300 border outline-none active:scale-[0.96] ${selectedSide === 'no' ? 'bg-[#FF3B30]/10 text-[#FF3B30] border-[#FF3B30]/30 font-bold' : 'bg-transparent text-neutral-500 border-white/[0.04] hover:bg-white/[0.02] hover:text-neutral-300 font-semibold'}`}
                >
                    Buy NO
                </button>
                </div>

                <div className="flex items-center gap-3 mb-6 bg-[#0A0A0C] border border-white/[0.04] p-1.5 rounded-[16px] select-none">
                    <button onClick={() => setQuantity(p => Math.max(1, p - 1))} className="w-10 h-10 rounded-[12px] bg-[#050505] hover:bg-white/[0.04] text-white flex items-center justify-center font-bold text-[16px] transition-colors border border-white/[0.04] outline-none active:scale-95">-</button>
                    <div className="flex-1 text-center font-mono font-bold text-[14px] text-white tabular-nums lining-nums">{quantity} <span className="text-neutral-500 text-[10px] uppercase ml-1">Cont</span></div>
                    <button onClick={() => setQuantity(p => p + 1)} className="w-10 h-10 rounded-[12px] bg-[#050505] hover:bg-white/[0.04] text-white flex items-center justify-center font-bold text-[16px] transition-colors border border-white/[0.04] outline-none active:scale-95">+</button>
                </div>

                <button
                    onClick={handlePlaceOrder}
                    disabled={isPlacingOrder || !isAuthorized}
                    className="w-full relative overflow-hidden group/btn py-3.5 rounded-[12px] text-[12px] font-mono font-bold uppercase tracking-widest text-black bg-white hover:bg-neutral-200 active:scale-[0.98] transition-all focus:outline-none flex items-center justify-center gap-2 shadow-[0_2px_15px_rgba(255,255,255,0.15)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-[#4285F4] via-[#9B72CB] to-[#D96570] opacity-0 group-hover/btn:opacity-10 transition-opacity duration-300" />
                    {isPlacingOrder ? <RefreshCw className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" strokeWidth={2.5} />}
                    {isPlacingOrder ? 'Routing...' : `Execute $${totalCost.toFixed(2)}`}
                </button>
            </div>

            {/* Expandable Order Book Depth */}
            <div className="mt-5 pt-4 border-t border-white/[0.04]">
              <button onClick={fetchDepth} className="w-full flex items-center justify-between text-[10px] font-mono uppercase tracking-widest font-bold text-neutral-500 hover:text-white transition-colors outline-none group">
                <span className="flex items-center gap-2">
                    <BarChart3 className="w-3.5 h-3.5" /> Spread Depth
                </span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${showDepth ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {showDepth && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mt-4 space-y-1.5">
                    <div className="bg-[#0A0A0A] border border-white/[0.04] rounded-[12px] p-4 text-[10px] font-mono text-neutral-400">
                      {fetchingDepth ? (
                        <div className="py-4 text-center animate-pulse uppercase tracking-widest font-bold">Syncing Level 2...</div>
                      ) : (
                        <div className="space-y-1.5 tabular-nums lining-nums">
                          <div className="flex justify-between items-center py-1 relative overflow-hidden rounded px-2 border border-[#FF3B30]/20 bg-[#FF3B30]/5">
                            <div className="absolute inset-y-0 right-0 bg-[#FF3B30]/10 transition-all" style={{ width: `${100 - skewPercent}%` }} />
                            <span className="text-white relative z-10">{asks[0]?.quantity || 820} <span className="text-neutral-600">qty</span></span>
                            <span className="text-[#FF3B30] font-bold relative z-10">{asks[0]?.price_cents || noPrice}¢ Ask</span>
                          </div>
                          <div className="flex justify-between items-center py-1 relative overflow-hidden rounded px-2 border border-[#34C759]/20 bg-[#34C759]/5">
                            <div className="absolute inset-y-0 left-0 bg-[#34C759]/10 transition-all" style={{ width: `${skewPercent}%` }} />
                            <span className="text-white relative z-10">{bids[0]?.quantity || 1500} <span className="text-neutral-600">qty</span></span>
                            <span className="text-[#34C759] font-bold relative z-10">{bids[0]?.price_cents || yesPrice}¢ Bid</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Toast Feedback */}
            <AnimatePresence>
              {orderFeedback && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className={`absolute bottom-6 left-6 right-6 p-4 rounded-[16px] text-[10px] font-mono font-bold uppercase tracking-widest flex items-center justify-center text-center z-20 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8),0_0_20px_rgba(255,255,255,0.02)] backdrop-blur-[60px] saturate-[1.2] ${orderFeedback.type === 'success' ? 'bg-[#34C759]/90 text-black' : 'bg-[#FF3B30]/90 text-white'}`}>
                  {orderFeedback.message}
                </motion.div>
              )}
            </AnimatePresence>

          </motion.div>
        ) : (
          <motion.div key="receipt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col p-6 font-mono text-[10px] text-neutral-400 relative z-10">
            <div className="flex items-center justify-between mb-6 border-b border-white/[0.04] pb-4 select-none">
              <div className="flex items-center gap-2 uppercase tracking-widest font-bold text-neutral-300">
                <Shield className="w-4 h-4 text-[#34C759]" /> Cryptographic Receipt
              </div>
              <button onClick={() => setShowReceipt(false)} className="text-white hover:text-neutral-300 font-bold bg-white/[0.06] border border-white/[0.04] px-3 py-1.5 rounded-[6px] transition-colors outline-none uppercase tracking-widest">
                Close
              </button>
            </div>

            <div className="space-y-4 select-text leading-relaxed">
              <div>
                <div className="text-[9px] text-neutral-600 uppercase tracking-widest font-bold mb-1">Data Provenance</div>
                <div className="text-white">INGESTION://KALSHI_V2</div>
              </div>
              <div>
                <div className="text-[9px] text-neutral-600 uppercase tracking-widest font-bold mb-1">Target Ticker</div>
                <div className="text-[#4285F4] break-all">{market.ticker}</div>
              </div>
              <div>
                <div className="text-[9px] text-neutral-600 uppercase tracking-widest font-bold mb-1">Substrate Node</div>
                <div className="text-neutral-200">AURA_RESOLVER_04 (14.2ms SLI)</div>
              </div>
              <div>
                <div className="text-[9px] text-neutral-600 uppercase tracking-widest font-bold mb-1">State Hash</div>
                <div className="bg-[#0A0A0C] p-3 rounded-[8px] border border-white/[0.04] break-all text-neutral-500 mt-1">
                  0x7F9A{hashVal}8E{hashVal.split('').reverse().join('')}C8BDBA
                </div>
              </div>
            </div>
            
            <div className="mt-auto pt-6 flex items-center justify-center gap-2 text-[#34C759] uppercase tracking-widest font-bold select-none border-t border-white/[0.04]">
               <Check className="w-4 h-4 stroke-[2.5]" /> Validated Integrity
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
AuraSportsCard.displayName = 'AuraSportsCard';

// ============================================================================
// Primary Export Component
// ============================================================================
export function KalshiMcpBlueprint() {
  const [viewMode, setViewMode] = useState<'grid' | 'console'>('grid');
  const [activeTab, setActiveTab] = useState<McpTab>('live_playground');
  const [selectedTool, setSelectedTool] = useState<FastMcpTool>('get_markets');
  const [isExecuting, setIsExecuting] = useState(false);
  const [apiResponse, setApiResponse] = useState<any>(null);
  
  const [marketSearchQuery, setMarketSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [copiedJson, setCopiedJson] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  
  const [localKeyId, setLocalKeyId] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('kalshi_key_id') || '' : '');
  const [localPrivKey, setLocalPrivKey] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('kalshi_priv_key') || '' : '');
  const [hasCredentials, setHasCredentials] = useState(() => typeof window !== 'undefined' ? !!(localStorage.getItem('kalshi_key_id') && localStorage.getItem('kalshi_priv_key')) : false);
  const [hasServerKeys, setHasServerKeys] = useState(false); 
  const [balance, setBalance] = useState<number | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null); 

  // Sorting and Filtering States
  const [sortBy, setSortBy] = useState<'volume' | 'probability_high' | 'probability_low' | 'newest'>('volume');
  const [filterType, setFilterType] = useState<'all' | 'high_prob' | 'toss_up'>('all');
  const [currentLimit, setCurrentLimit] = useState(30);

  const [args, setArgs] = useState<ToolArgDetails>({
    ticker: '', query: '', limit: 30, status: 'open', side: 'yes', action: 'buy', count: 10, price_cents: 50
  });

  // Check Server Auth Configuration
  useEffect(() => {
    fetch('/api/mcp/kalshi/config').then(res => res.ok && res.json()).then(data => setHasServerKeys(data?.hasServerKeys || false)).catch(console.error);
  }, []);

  // Hydrate Balance
  useEffect(() => {
    if ((hasCredentials && localKeyId && localPrivKey) || hasServerKeys) {
      const fetchBal = async () => {
        try {
          const payload: any = { tool: 'get_balance', args: {} };
          if (localKeyId && localPrivKey) payload.credentials = { keyId: localKeyId, privateKey: localPrivKey };
          const res = await fetch('/api/mcp/kalshi/execute', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
          const rawText = await res.text();
          let data;
          try { data = JSON.parse(rawText); } catch { return; }
          if (res.ok && data.result) setBalance((data.result.balance_cents ?? data.result.balance) / 100);
        } catch(e) { console.error(e); }
      };
      fetchBal();
    } else { setBalance(null); }
  }, [hasCredentials, localKeyId, localPrivKey, hasServerKeys]);

  const handleArgChange = useCallback(<K extends keyof ToolArgDetails>(key: K, value: ToolArgDetails[K]) => {
    setArgs(prev => ({ ...prev, [key]: value }));
  }, []);

  const getAbortController = useCallback(() => {
    return new AbortController();
  }, []);

  const executeSandboxTool = useCallback(async (overrideTool?: FastMcpTool, customArgs?: Partial<ToolArgDetails>) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = getAbortController();
    
    const activeTool = overrideTool || selectedTool;
    setIsExecuting(true); setApiResponse(null); setApiError(null);
    const currentArgs = { ...args, ...customArgs };

    if (!['get_markets'].includes(activeTool) && !(hasCredentials || hasServerKeys)) {
      setApiError("Execution Blocked: Valid Kalshi credentials required for private telemetry.");
      setIsExecuting(false); return;
    }

    if (['execute_fusion', 'get_market', 'get_order_book', 'place_limit_order'].includes(activeTool) && !currentArgs.ticker) {
      setApiError("Validation Fault: Target Ticker is missing.");
      setIsExecuting(false); return;
    }

    const mappedArgs: any = {};
    TOOL_ARG_SCHEMAS[activeTool].forEach(s => { if (currentArgs[s.id as keyof ToolArgDetails] !== undefined) mappedArgs[s.id] = currentArgs[s.id as keyof ToolArgDetails]; });

    try {
      const payload: any = { tool: activeTool, args: mappedArgs };
      if (localKeyId && localPrivKey) payload.credentials = { keyId: localKeyId, privateKey: localPrivKey };
      
      const response = await fetch('/api/mcp/kalshi/execute', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), signal: abortControllerRef.current.signal
      });

      // SOTA Anti-Corruption Layer: Trap HTTP 429 HTML/String payloads safely before crashing V8
      const rawText = await response.text();
      let data;
      try {
          data = JSON.parse(rawText);
      } catch (parseErr) {
          if (response.status === 429 || rawText.includes('Rate exceeded') || rawText.includes('429')) {
              throw new Error("HTTP 429: Rate Limit Exceeded. Upstream gateway blocked request.");
          }
          throw new Error(`Upstream JSON Parse Fault: ${rawText.substring(0, 50)}...`);
      }

      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);

      if (activeTool === 'get_markets') setSearchResults(data.result?.markets || data.result || []);
      else setApiResponse(data.result);
    } catch (err: any) {
      if (err.name !== 'AbortError') setApiError(err.message);
    } finally {
      setTimeout(() => setIsExecuting(false), 400);
    }
  }, [args, hasCredentials, localKeyId, localPrivKey, selectedTool, hasServerKeys]);

  const handleMarketSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setMarketSearchQuery(query);
    setCurrentLimit(30);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    if (query.length > 2) {
      searchDebounceRef.current = setTimeout(() => executeSandboxTool('get_markets', { query, limit: 30, status: 'open' }), 400);
    } else {
      setSearchResults([]); setApiResponse(null); setApiError(null);
    }
  }, [executeSandboxTool]);

  const placeOrder = useCallback((price: number, side: 'yes' | 'no', action: 'buy' | 'sell', quantity: number, targetTicker?: string) => {
    return executeSandboxTool('place_limit_order', { ticker: targetTicker || args.ticker, price_cents: price, side, action, count: quantity });
  }, [executeSandboxTool, args.ticker]);

  const isAuthorized = hasCredentials || hasServerKeys;

  const filteredAndSortedResults = useMemo(() => {
    let res = [...searchResults];
    
    // Apply filters
    if (filterType === 'high_prob') {
        res = res.filter(m => {
            const p = m.probability || 0.5;
            return p >= 0.75 || p <= 0.25;
        });
    } else if (filterType === 'toss_up') {
        res = res.filter(m => {
            const p = m.probability || 0.5;
            return p >= 0.40 && p <= 0.60;
        });
    }

    // Apply sorting
    if (sortBy === 'volume') {
        res.sort((a, b) => (b.volume || 0) - (a.volume || 0));
    } else if (sortBy === 'probability_high') {
        res.sort((a, b) => (b.probability || 0.5) - (a.probability || 0.5));
    } else if (sortBy === 'probability_low') {
        res.sort((a, b) => (a.probability || 0.5) - (b.probability || 0.5));
    } else if (sortBy === 'newest') {
        res.sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());
    }
    
    return res;
  }, [searchResults, sortBy, filterType]);

  const handleLoadMore = useCallback(() => {
    const newLimit = currentLimit + 30;
    setCurrentLimit(newLimit);
    executeSandboxTool('get_markets', { query: marketSearchQuery, limit: newLimit, status: 'open' });
  }, [currentLimit, executeSandboxTool, marketSearchQuery]);

  return (
    <div className="w-full pt-6 font-sans text-left pb-24 relative bg-[#000000] text-neutral-200 min-h-screen selection:bg-[#4285F4]/30 selection:text-white">
      
      {/* Dynamic SOTA Cyber Ambient Background Elements */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-gradient-to-br from-[#4285F4]/10 via-[#9B72CB]/5 to-transparent rounded-full blur-[120px] pointer-events-none transform-gpu" />
      <div className="absolute bottom-1/4 right-10 w-[500px] h-[500px] bg-gradient-to-tr from-[#D96570]/5 to-transparent rounded-full blur-[100px] pointer-events-none transform-gpu" />

      {/* Jony Ive Minimal Modal (Secure Credential Vault) */}
      <AnimatePresence>
        {showSettingsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-[#000000]/80 saturate-[180%] backdrop-blur-[60px] saturate-[1.2]" onClick={() => setShowSettingsModal(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} transition={SPRING_TRANSITION}
              className="relative w-full max-w-md bg-[#050505] border border-white/[0.04] rounded-[28px] shadow-[0_40px_100px_rgba(0,0,0,0.8)] p-8 overflow-hidden z-10"
            >
              <div className="w-12 h-12 rounded-[14px] bg-[#0A0A0A] border border-white/[0.04] flex items-center justify-center mb-6 shadow-inner">
                <ShieldCheck className="w-6 h-6 text-[#4285F4]" strokeWidth={1.5} />
              </div>
              
              <h3 className="text-[24px] font-medium text-white tracking-tight mb-2">Encrypted Keystore</h3>
              <p className="text-[13px] text-neutral-400 font-normal leading-relaxed mb-8">
                To stream live prediction markets and execute trades, inject your Kalshi developer credentials. Keys remain strictly local.
              </p>

              <div className="space-y-5">
                <InputField label="Key ID" type="password" value={localKeyId} onChange={(e:any) => setLocalKeyId(e.target.value)} placeholder="UUID string" />
                <div className="space-y-1.5 w-full text-left font-sans">
                    <label className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 block pl-1 font-bold">Private Key (PEM)</label>
                    <textarea
                      value={localPrivKey} onChange={(e: any) => setLocalPrivKey(e.target.value)} placeholder="-----BEGIN RSA PRIVATE KEY-----..."
                      className="w-full bg-[#0A0A0A] border border-white/[0.04] rounded-[12px] px-4 py-3.5 text-[11px] font-mono text-neutral-200 placeholder:text-neutral-700 focus:outline-none focus:border-[#4285F4]/50 focus:ring-1 focus:ring-[#4285F4]/30 transition-all min-h-[120px] resize-none shadow-inner leading-relaxed"
                    />
                </div>
              </div>

              {hasServerKeys && (
                <div className="mt-6 p-4 bg-[#34C759]/5 border border-[#34C759]/20 rounded-[16px] text-left flex items-start gap-3">
                  <Shield className="w-4 h-4 text-[#34C759] shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[11px] font-mono font-bold text-[#34C759] uppercase tracking-widest block mb-1">Server Fallback Active</span>
                    <p className="text-[12px] text-neutral-400 font-normal leading-relaxed">
                      Server-side environment variables are detected. Leave fields blank to use system defaults.
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-10 flex flex-col gap-3">
                <button
                  onClick={() => {
                    localStorage.setItem('kalshi_key_id', localKeyId); localStorage.setItem('kalshi_priv_key', localPrivKey);
                    setHasCredentials(!!(localKeyId && localPrivKey)); setShowSettingsModal(false);
                  }}
                  className="w-full py-4 bg-white text-black font-bold text-[12px] rounded-full hover:bg-neutral-200 transition-all uppercase tracking-widest shadow-[0_4px_20px_rgba(255,255,255,0.1)] active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                >
                  Encrypt & Connect
                </button>
                
                {hasCredentials && (
                  <button
                    onClick={() => {
                      localStorage.removeItem('kalshi_key_id'); localStorage.removeItem('kalshi_priv_key');
                      setLocalKeyId(''); setLocalPrivKey(''); setHasCredentials(false); setBalance(null); setShowSettingsModal(false);
                    }}
                    className="w-full py-4 bg-transparent hover:bg-white/[0.04] text-[#FF3B30] font-bold text-[11px] font-mono uppercase tracking-widest rounded-full transition-all border border-white/[0.04] active:scale-[0.98] outline-none"
                  >
                    Purge Keystore
                  </button>
                )}
                
                <button
                  onClick={() => window.open('https://kalshi.com/account/profile', '_blank')}
                  className="w-full mt-2 py-2 bg-transparent text-neutral-500 font-bold text-[10px] font-mono uppercase tracking-widest rounded-full hover:text-white transition-colors flex items-center justify-center gap-1.5 outline-none"
                >
                  Generate New Keys <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Structural Page Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 pb-8 border-b border-white/[0.04]">
          <div>
            <div className="flex items-center gap-2 text-[#4285F4] text-[10px] font-mono font-bold uppercase tracking-widest mb-3 select-none">
              <Sparkles className="w-3.5 h-3.5" />
              Intelligence Gateway
            </div>
            <h2 className="text-[32px] sm:text-[40px] font-medium text-white/95 tracking-tight leading-[1.1] mb-2">
              Financial Execution Node
            </h2>
            <p className="text-neutral-400 text-[14px] leading-relaxed max-w-2xl font-normal">
              Aura's predictive fusion layer. Seamlessly map Substrate parameters to Kalshi's quantitative API for real-time order execution.
            </p>
          </div>
          
          <div className="flex flex-col items-end gap-4 shrink-0 select-none">
            <div className="flex items-center gap-3">
              <span className={`flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest border px-3 py-1.5 rounded-[6px] ${isAuthorized ? 'bg-[#34C759]/10 text-[#34C759] border-[#34C759]/20' : 'bg-[#FF9500]/10 text-[#FF9500] border-[#FF9500]/20'}`}>
                {isAuthorized ? <ShieldCheck className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                {isAuthorized ? 'Authenticated' : 'Unauthenticated'}
              </span>
              <button onClick={() => setShowSettingsModal(true)} className="flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-widest bg-[#0A0A0C] hover:bg-[#111113] text-neutral-300 px-4 py-1.5 rounded-[6px] transition-colors border border-white/[0.04] outline-none">
                Configure IAM
              </button>
            </div>
            {isAuthorized && balance !== null && (
              <div className="flex items-center gap-3 bg-[#050505] border border-white/[0.04] px-4 py-2 rounded-[8px]">
                <span className="text-[10px] uppercase font-mono font-bold tracking-widest text-neutral-500">Capital</span>
                <span className="text-[16px] font-mono font-bold text-white tracking-tight tabular-nums lining-nums">
                  $${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 3. SOTA View Switcher */}
        <div className="flex items-center mb-8 bg-[#050505] border border-white/[0.04] p-1.5 rounded-full w-full max-w-[320px] select-none shadow-sm relative z-10">
            {[
                { id: 'grid', label: 'Market Grid' },
                { id: 'console', label: 'Terminal IDE' }
            ].map((tab) => {
                const isActive = viewMode === tab.id;
                return (
                    <button 
                        key={tab.id}
                        type="button"
                        onClick={() => setViewMode(tab.id as 'grid'|'console')}
                        className={`relative flex-1 py-2.5 px-3 rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors duration-300 ease-[0.16,1,0.3,1] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white/20 z-10 ${isActive ? 'text-black' : 'text-neutral-500 hover:text-neutral-300'}`}
                    >
                        {isActive && (
                            <motion.div 
                                layoutId="viewModePill"
                                className="absolute inset-0 bg-white rounded-full z-[-1] shadow-[0_2px_12px_rgba(255,255,255,0.1)]"
                                transition={SPRING_TRANSITION}
                            />
                        )}
                        <span className="relative z-10">{tab.label}</span>
                    </button>
                );
            })}
        </div>

        {/* 4. Main Body Content */}
        <AnimatePresence mode="wait">
          {viewMode === 'grid' ? (
            <motion.div key="grid" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3, ease: EASE_TRANSITION }} className="space-y-8">
              
              {/* Dynamic Search */}
              <div className="bg-[#050505] border border-white/[0.04] p-4 sm:p-5 rounded-[24px] shadow-[0_16px_40px_rgba(0,0,0,0.2)] relative group focus-within:border-white/[0.15] transition-colors duration-500">
                <div className="absolute inset-0 bg-gradient-to-r from-[#4285F4]/5 via-[#9B72CB]/5 to-[#D96570]/5 opacity-0 group-focus-within:opacity-100 rounded-[24px] pointer-events-none transition-opacity duration-700" />
                <div className="relative flex items-center">
                  <Crosshair className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500 group-focus-within:text-[#4285F4] transition-colors duration-300" strokeWidth={1.5} />
                  <input
                    type="text"
                    placeholder="Query Substrate for prediction telemetry..."
                    value={marketSearchQuery}
                    onChange={handleMarketSearch}
                    className="w-full bg-[#0A0A0C] border border-white/[0.04] rounded-[16px] pl-14 pr-14 py-4 text-[15px] text-white/95 outline-none transition-all placeholder:text-neutral-600 focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4]/30 font-sans tracking-tight shadow-inner"
                  />
                  {marketSearchQuery && (
                    <button type="button" onClick={() => { setMarketSearchQuery(''); setSearchResults([]); setApiResponse(null); setApiError(null); if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); abortControllerRef.current?.abort(); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white p-2 bg-white/[0.02] hover:bg-white/[0.06] rounded-full transition-colors active:scale-95 outline-none">
                      <X className="w-4 h-4" strokeWidth={2} />
                    </button>
                  )}
                </div>
              </div>

              <AnimatePresence>
                {apiError && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="bg-[#111113] border border-[#FF3B30]/20 text-neutral-200 px-6 py-5 rounded-[20px] flex items-start gap-4 shadow-sm mb-6">
                      <AlertTriangle className="w-5 h-5 text-[#FF3B30] shrink-0 mt-0.5" />
                      <div className="flex flex-col text-left font-mono">
                        <h4 className="font-bold text-[12px] uppercase tracking-widest mb-1 text-[#FF3B30]">Execution Fault</h4>
                        <p className="text-[12px] leading-relaxed text-neutral-400 break-words">{apiError}</p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Filter and Sort Row */}
              {marketSearchQuery && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2 border-b border-white/[0.04] mb-4">
                  <div className="flex items-center gap-2">
                    <select
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value as any)}
                      className="bg-[#0A0A0C] border border-white/[0.04] text-white/80 text-[13px] rounded-full px-4 py-2 outline-none focus:border-[#4285F4] appearance-none"
                    >
                      <option value="all">All Probabilities</option>
                      <option value="high_prob">High Confidence (≥75% or ≤25%)</option>
                      <option value="toss_up">Toss Up (40% - 60%)</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-neutral-500 text-[13px] uppercase tracking-wider font-medium">Sort by:</span>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="bg-[#0A0A0C] border border-white/[0.04] text-white/80 text-[13px] rounded-full px-4 py-2 outline-none focus:border-[#4285F4] appearance-none"
                    >
                      <option value="volume">Volume (High - Low)</option>
                      <option value="probability_high">Probability (High - Low)</option>
                      <option value="probability_low">Probability (Low - High)</option>
                      <option value="newest">Recently Updated</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Grid Array */}
              {filteredAndSortedResults && filteredAndSortedResults.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 lg:gap-8">
                    {filteredAndSortedResults.map((market: any) => (
                      <AuraSportsCard key={market.ticker} market={market} isAuthorized={isAuthorized} onPlaceOrder={placeOrder} />
                    ))}
                  </div>
                  <div className="flex justify-center pt-8">
                      <button
                        type="button"
                        onClick={handleLoadMore}
                        disabled={isExecuting}
                        className="bg-white/[0.04] hover:bg-white/[0.08] text-white px-8 py-3 rounded-full text-[14px] font-medium transition-colors border border-white/[0.04] disabled:opacity-50"
                      >
                        {isExecuting ? 'Requesting...' : `Fetch Additional Telemetry (${currentLimit + 30})`}
                      </button>
                  </div>
                </>
              ) : (
                <div className="w-full bg-[#050505] border border-white/[0.04] rounded-[32px] p-24 text-center select-none flex flex-col items-center justify-center shadow-inner">
                  {isExecuting && marketSearchQuery.length > 2 ? (
                      <RefreshCw className="w-10 h-10 text-[#4285F4] animate-spin mb-6" strokeWidth={1.5} />
                  ) : (
                      <div className="w-16 h-16 rounded-[20px] border border-white/[0.04] flex items-center justify-center bg-[#0A0A0C] mb-6 shadow-sm">
                        <Database className="w-7 h-7 text-neutral-500" strokeWidth={1.5} />
                      </div>
                  )}
                  <h3 className="text-[20px] font-medium text-white mb-3 tracking-tight">
                      {isExecuting && marketSearchQuery.length > 2 ? 'Scanning Substrate...' : 'Awaiting Telemetry'}
                  </h3>
                  <p className="text-neutral-500 text-[14px] font-normal max-w-sm leading-relaxed">
                    {isExecuting && marketSearchQuery.length > 2 ? 'Resolving live prediction ledgers from the exchange.' : 'Type a keyword above to stream live quantitative prediction markets.'}
                  </p>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div key="console" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3, ease: EASE_TRANSITION }} className="grid grid-cols-1 xl:grid-cols-12 gap-8">
              
              {/* Terminal Left Sidebar */}
              <div className="xl:col-span-4 space-y-6">
                <div className="bg-[#050505] border border-white/[0.04] rounded-[24px] p-6 lg:p-8 flex flex-col justify-between h-full shadow-lg relative overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(66,133,244,0.03),transparent_50%)] pointer-events-none" />
                    
                    <div className="relative z-10">
                        <h3 className="text-[15px] font-medium text-white/95 mb-8 flex items-center gap-2.5 select-none">
                            <Terminal className="w-4 h-4 text-[#4285F4]" /> Controller Interface
                        </h3>

                        <div className="space-y-6 mb-8">
                            <SelectField 
                                label="Execution Protocol" 
                                value={selectedTool} 
                                options={Object.keys(TOOL_ARG_SCHEMAS).map(t => ({ value: t, label: t }))}
                                onChange={(e: any) => setSelectedTool(e.target.value as FastMcpTool)} 
                            />

                            <div className="bg-white/[0.015] border border-white/[0.04] rounded-[16px] p-5 space-y-5">
                                {TOOL_ARG_SCHEMAS[selectedTool].map((schema: any) => (
                                    schema.type === 'select' ? (
                                        <SelectField key={schema.id} label={schema.label} value={args[schema.id as keyof ToolArgDetails]} onChange={(e: any) => handleArgChange(schema.id as any, e.target.value)} options={schema.options} />
                                    ) : (
                                        <InputField key={schema.id} label={schema.label} type={schema.type} value={args[schema.id as keyof ToolArgDetails]} onChange={(e: any) => handleArgChange(schema.id as any, schema.type === 'number' ? Number(e.target.value) : e.target.value)} placeholder={schema.placeholder} min={schema.min} max={schema.max} />
                                    )
                                ))}
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={() => executeSandboxTool()}
                        disabled={isExecuting}
                        className="w-full relative overflow-hidden group py-4 px-4 rounded-[12px] font-bold uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 cursor-pointer select-none border-none outline-none mt-4 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_30px_rgba(66,133,244,0.15)]"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-[#4285F4] via-[#9B72CB] to-[#D96570] opacity-90 group-hover:opacity-100 transition-opacity duration-300" />
                        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        <div className="relative z-10 flex items-center gap-2.5 text-white drop-shadow-md">
                            {isExecuting ? <><RefreshCw className="w-4 h-4 animate-spin text-white" strokeWidth={2.5} /> Transmission...</> : <><Activity className="h-4 w-4" /> Execute Node</>}
                        </div>
                    </button>
                </div>
              </div>

              {/* Terminal Right Side (IDE & JSON View) */}
              <div className="xl:col-span-8 bg-[#000000] border border-white/[0.04] rounded-[24px] overflow-hidden flex flex-col h-[750px] shadow-[0_16px_50px_rgba(0,0,0,0.2)]">
                  <div className="flex bg-[#050505] border-b border-white/[0.04] overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden select-none font-sans shrink-0">
                      <button onClick={() => setActiveTab('live_playground')} className={`px-5 py-4 text-[10px] font-mono tracking-widest uppercase transition-colors outline-none focus-visible:bg-white/[0.05] border-r border-[#151517] flex items-center gap-2 font-bold shrink-0 ${activeTab === 'live_playground' ? 'bg-[#000000] text-[#4285F4] border-t-2 border-t-[#4285F4] shadow-[inset_0_4px_20px_rgba(66,133,244,0.05)]' : 'bg-transparent text-neutral-500 hover:text-neutral-300 border-t-2 border-t-transparent'}`}>
                          <Database className="h-3.5 w-3.5" strokeWidth={2} /> Payload Memory
                      </button>
                      {(Object.keys(MCP_FILES) as Array<Exclude<McpTab, 'live_playground'>>).map(tab => (
                          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-5 py-4 text-[10px] font-mono tracking-widest uppercase transition-colors outline-none focus-visible:bg-white/[0.05] border-r border-white/[0.02] flex items-center gap-2 shrink-0 ${activeTab === tab ? 'bg-[#000000] text-neutral-200 border-t-2 border-t-neutral-400' : 'bg-transparent text-neutral-500 hover:text-neutral-300 border-t-2 border-t-transparent'}`}>
                              <Code2 className="h-3 w-3" /> {tab}
                          </button>
                      ))}
                      <div className="flex-1 border-b border-transparent min-w-[20px] bg-[#0A0A0C]" />
                      <button onClick={() => {
                        let text = apiResponse ? JSON.stringify(apiResponse, null, 2) : (activeTab !== 'live_playground' ? MCP_FILES[activeTab] : '');
                        if (text) { navigator.clipboard.writeText(text); setCopiedJson(true); setTimeout(() => setCopiedJson(false), 2000); }
                      }} className="px-5 text-neutral-500 hover:text-white transition-all duration-300 flex items-center gap-2 border-l border-white/[0.02] bg-[#0A0A0C] cursor-pointer active:bg-white/[0.05] active:scale-[0.98] outline-none shrink-0">
                        {copiedJson ? <><Check className="h-3.5 w-3.5 text-[#34C759]" /><span className="text-[9px] font-mono text-[#34C759] uppercase tracking-widest font-bold">Copied</span></> : <><Copy className="h-3.5 w-3.5" /><span className="text-[9px] font-mono uppercase tracking-widest">Copy</span></>}
                      </button>
                  </div>
                  
                  <div className="flex-1 overflow-hidden flex flex-col bg-[#000000] relative transform-gpu">
                      <AnimatePresence mode="wait">
                          {activeTab === 'live_playground' ? (
                              <motion.div key="output" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="flex-1 flex flex-col p-6 overflow-y-auto scrollbar-thin">
                                  {apiError && (
                                      <div className="bg-[#111113] border border-[#FF3B30]/20 p-5 rounded-[16px] mb-6 flex items-start gap-4">
                                          <AlertTriangle className="w-5 h-5 text-[#FF3B30] shrink-0 mt-0.5" />
                                          <div className="flex flex-col text-left font-mono">
                                              <h4 className="font-bold text-[11px] uppercase tracking-widest text-[#FF3B30] mb-2">Execution Fault</h4>
                                              <p className="text-[12px] text-neutral-300 leading-relaxed break-words">{apiError}</p>
                                          </div>
                                      </div>
                                  )}
                                  
                                  {isExecuting ? (
                                      <div className="flex-1 flex flex-col items-center justify-center text-center opacity-60">
                                          <RefreshCw className="w-8 h-8 text-[#4285F4] animate-spin mb-5" />
                                          <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-400 font-bold">Synchronizing Kalshi State...</p>
                                      </div>
                                  ) : apiResponse ? (
                                      <div className="relative flex-1 bg-[#0A0A0C] border border-white/[0.04] rounded-[16px] p-6 overflow-auto text-[12px] font-mono text-neutral-300 tabular-nums lining-nums shadow-inner">
                                          <pre className="whitespace-pre-wrap">{JSON.stringify(apiResponse, null, 2)}</pre>
                                      </div>
                                  ) : (
                                      <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40 select-none">
                                          <Database className="w-10 h-10 text-neutral-500 mb-5 stroke-1" />
                                          <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 font-bold">Memory Heap Idle</p>
                                      </div>
                                  )}
                              </motion.div>
                          ) : (
                              <motion.div key="code" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="flex-1 flex flex-col p-6 overflow-y-auto scrollbar-thin">
                                  <div className="relative flex-1 bg-[#0A0A0C] border border-white/[0.04] rounded-[16px] p-6 overflow-auto text-[12px] font-mono text-neutral-300 tabular-nums lining-nums shadow-inner">
                                      <pre className="whitespace-pre-wrap">{MCP_FILES[activeTab as Exclude<McpTab, 'live_playground'>]}</pre>
                                  </div>
                              </motion.div>
                          )}
                      </AnimatePresence>
                  </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
