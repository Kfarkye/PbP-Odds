import React, { Component, ReactNode, ErrorInfo, useMemo, useState } from 'react';
import Markdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion } from 'framer-motion';
import { AlertTriangle, Code2, TerminalSquare, BarChart2, Crosshair } from 'lucide-react';
import { BettingAnglesCarousel } from './BettingAnglesCarousel';

// ============================================================================
// Type Definitions
// ============================================================================
export interface ChartLine {
  dataKey: string;
  color?: string;
  invertColors?: boolean; 
}

export interface ChartConfig {
  title: string;
  data: Record<string, string | number>[];
  lines: ChartLine[];
}

export interface ConsensusSplit {
  betType: string;
  selectionHome: string;
  selectionAway: string;
  homeTickets: number | string;
  homeMoney: number | string;
  awayTickets: number | string;
  awayMoney: number | string;
  sharpSignal?: string;
}

export interface ConsensusData {
  game_name: string;
  splits: ConsensusSplit[];
}

export interface BettingAngle {
  title: string;
  description: string;
  edge: string;
  odds: string;
  recommendation: string;
}

export interface AnalysisData {
  analysis_markdown: string;
  angles?: BettingAngle[];
  chart?: ChartConfig;
  consensus?: ConsensusData;
}

const EASE_TRANSITION = [0.16, 1, 0.3, 1];
const REMARK_PLUGINS = [remarkGfm];

const parseNumeric = (val: unknown): number => {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (typeof val === 'string') {
    const parsed = parseFloat(val.replace(/[^0-9.-]+/g, ""));
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

// ============================================================================
// Markdown Typography (Strict Financial Grade)
// ============================================================================
const MARKDOWN_COMPONENTS: Components = {
  p: ({ ...props }) => <p className="mb-6 last:mb-0 text-[#E5E5E5] text-[17px] sm:text-[18px] font-serif leading-[1.85] tracking-[-0.01em] antialiased" {...props} />,
  h1: ({ ...props }) => <h1 className="text-[24px] sm:text-[26px] font-sans font-medium tracking-tight text-white mt-10 mb-5 leading-[1.2]" {...props} />,
  h2: ({ ...props }) => <h2 className="text-[20px] sm:text-[22px] font-sans font-medium tracking-tight text-white/90 mt-8 mb-4 leading-[1.3]" {...props} />,
  h3: ({ ...props }) => <h3 className="text-[12px] font-mono font-semibold tracking-widest uppercase text-neutral-500 mt-8 mb-3 select-none m-0" {...props} />,
  ul: ({ ...props }) => <ul className="list-none space-y-3 mt-4 mb-8 text-[#D4D4D4] font-serif text-[17px] sm:text-[18px] pl-1" {...props} />,
  li: ({ ...props }) => <li className="relative pl-6 before:absolute before:left-0 before:top-[0.65em] before:w-[4px] before:h-[1px] before:bg-neutral-600 leading-[1.85]" {...props} />,
  strong: ({ ...props }) => <strong className="font-semibold text-white" {...props} />,
  blockquote: ({ ...props }) => <blockquote className="border-l-[2px] border-neutral-600 pl-5 py-2 my-8 text-neutral-400 italic font-serif text-[18px] sm:text-[19px] leading-relaxed" {...props} />
};

class MasterclassErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  public override state = { hasError: false };
  public static getDerivedStateFromError() { return { hasError: true }; }
  public override render() {
    if (this.state.hasError) return (
        <div className="w-full my-8 bg-[#050505] border border-[#FF3B30]/30 rounded-[12px] p-6 text-left shadow-sm">
          <h4 className="text-[11px] font-mono font-bold text-[#FF3B30] tracking-widest uppercase flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Structural Parsing Fault</h4>
        </div>
    );
    return this.props.children;
  }
}

// ============================================================================
// Market Liquidity Distribution (Raw, Institutional Look)
// ============================================================================
const LiveOrderFlow = React.memo(({ consensus }: { consensus: ConsensusData }) => {
  if (!consensus || !consensus.splits || consensus.splits.length === 0) return null;

  return (
    <div className="my-14" role="region">
      <div className="border-b border-white/[0.04] pb-4 mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h4 className="text-[16px] font-medium text-white tracking-tight flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-neutral-500" /> Market Liquidity Distribution
          </h4>
          <p className="text-[13px] text-neutral-500 mt-1.5 font-sans tracking-tight">
            Index volume vs capital splits — {consensus.game_name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-[10px] font-medium text-neutral-500 tracking-widest uppercase font-mono">Live</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {consensus.splits.map((split, idx) => {
          const homeT = parseNumeric(split.homeTickets); const awayT = parseNumeric(split.awayTickets);
          const homeM = parseNumeric(split.homeMoney); const awayM = parseNumeric(split.awayMoney);
          const totalT = Math.max(homeT + awayT, 1); const totalM = Math.max(homeM + awayM, 1);
          const hTPercent = Math.round((homeT / totalT) * 100); const aTPercent = 100 - hTPercent;
          const hMPercent = Math.round((homeM / totalM) * 100); const aMPercent = 100 - hMPercent;

          return (
            <motion.div
              key={`${split.betType}-${idx}`}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: idx * 0.05, ease: EASE_TRANSITION as any }}
              className="rounded-[16px] p-6 bg-[#050505] border border-white/[0.04] flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-center mb-5">
                  <span className="text-[10px] font-bold font-mono text-neutral-400 tracking-widest uppercase select-none">
                    {split.betType}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[14px] font-medium text-white mb-6 pb-4 border-b border-white/[0.04]">
                  <span className="truncate max-w-[40%] text-left">{split.selectionHome || 'Home'}</span>
                  <span className="text-neutral-600 text-[10px] uppercase tracking-widest select-none font-mono">VS</span>
                  <span className="truncate max-w-[40%] text-right">{split.selectionAway || 'Away'}</span>
                </div>

                <div className="space-y-5">
                  {/* Retail Tickets */}
                  <div>
                    <div className="flex justify-between items-center text-[10px] mb-2 font-mono select-none tracking-widest tabular-nums">
                      <span className="text-neutral-500 uppercase">Ticket Volume</span>
                      <span className="text-neutral-400">{hTPercent}% / {aTPercent}%</span>
                    </div>
                    <div className="w-full h-[2px] bg-[#111113] rounded-full overflow-hidden flex">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${hTPercent}%` }} transition={{ duration: 0.8, ease: EASE_TRANSITION as any }} className="h-full bg-neutral-600" />
                      <div className="flex-1 h-full bg-neutral-800" />
                    </div>
                  </div>

                  {/* Institutional Capital */}
                  <div>
                    <div className="flex justify-between items-center text-[10px] mb-2 font-mono select-none tracking-widest tabular-nums">
                      <span className="text-white uppercase font-bold">Capital Handle</span>
                      <span className="text-white font-bold">{hMPercent}% / {aMPercent}%</span>
                    </div>
                    <div className="w-full h-[3px] bg-[#111113] rounded-full overflow-hidden flex">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${hMPercent}%` }} transition={{ duration: 0.8, ease: EASE_TRANSITION as any }} className="h-full bg-[#8ab4f8]" />
                      <div className="flex-1 h-full bg-[#2A2A2C]" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Decrypted Terminal Signal - FIXED JSX SYNTAX */}
              {split.sharpSignal && (
                <div className="mt-6 pt-5 border-t border-white/[0.04]">
                  <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-mono font-semibold text-[#8ab4f8] uppercase tracking-widest">
                          &gt; INSTITUTIONAL_FLOW
                      </span>
                      <p className="text-[13px] leading-[1.6] text-neutral-400 font-sans tracking-tight">
                        {split.sharpSignal.replace(/^(Sharp Signal:|Signal:)/i, '').trim()}
                      </p>
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
});
LiveOrderFlow.displayName = 'LiveOrderFlow';

// ============================================================================
// Statistical Matrix (High-Fidelity Terminal Sheets)
// ============================================================================
const StatisticalTable = React.memo(({ chart }: { chart: ChartConfig }) => {
  if (!chart?.data || !chart?.lines || chart.data.length === 0 || chart.lines.length === 0) return null;

  const [hoveredCol, setHoveredCol] = useState<string | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  // Pre-calculate Min/Max/Avg to create the deterministic heatmap
  const minMaxValues = useMemo(() => {
    const result: Record<string, { min: number; max: number; avg: number }> = {};
    chart.lines.forEach(line => {
      const values = chart.data.map(d => parseNumeric(d[line.dataKey])).filter(n => !isNaN(n));
      const min = values.length > 0 ? Math.min(...values) : 0;
      const max = values.length > 0 ? Math.max(...values) : 0;
      const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      result[line.dataKey] = { min, max, avg };
    });
    return result;
  }, [chart.data, chart.lines]);

  return (
    <div className="mt-12 mb-14 border border-white/[0.04] rounded-[16px] overflow-hidden relative group font-sans">
      
      {chart.title && (
        <div className="px-6 py-5 border-b border-white/[0.04] bg-[#050505]">
          <h4 className="text-[15px] font-medium text-white/90 tracking-tight">{chart.title}</h4>
        </div>
      )}
      
      <div 
        className="w-full overflow-x-auto scrollbar-thin scrollbar-thumb-[#111113] scrollbar-track-transparent group/table bg-[#050505]"
        onMouseLeave={() => { setHoveredCol(null); setHoveredRow(null); }}
      >
        <table className="w-full text-left border-collapse tabular-nums lining-nums font-mono">
          <thead>
            <tr className="bg-[#0A0A0C] border-b border-white/[0.04]">
              <th className="sticky left-0 z-30 bg-[#0A0A0C] py-3.5 px-6 font-bold text-neutral-500 text-[10px] tracking-widest uppercase select-none border-r border-white/[0.04] shadow-[2px_0_8px_rgba(0,0,0,0.4)]">
                Dimension
              </th>
              {chart.lines.map((line) => (
                <th 
                  key={line.dataKey} 
                  onMouseEnter={() => setHoveredCol(line.dataKey)}
                  className={`py-3.5 px-5 font-bold text-[10px] tracking-widest uppercase whitespace-nowrap text-right select-none transition-colors duration-300 border-r border-white/[0.02] last:border-r-0 ${hoveredCol === line.dataKey ? 'text-white bg-white/[0.04]' : 'text-neutral-400'}`}
                >
                  {line.dataKey}
                </th>
              ))}
            </tr>
          </thead>
          
          <tbody className="divide-y divide-white/[0.02]">
            {chart.data.map((row, rowIdx) => {
              const rowKey = row.name ? String(row.name) : `row-${rowIdx}`;
              const isRowHovered = hoveredRow === rowKey;

              return (
                <tr 
                  key={rowKey} 
                  onMouseEnter={() => setHoveredRow(rowKey)}
                  className="transition-colors duration-200"
                >
                  <td className={`sticky left-0 z-20 py-3.5 px-6 text-[13px] font-medium whitespace-nowrap border-r border-white/[0.04] transition-all duration-300 shadow-[2px_0_8px_rgba(0,0,0,0.4)] font-sans ${isRowHovered ? 'bg-[#111113] text-white' : 'bg-[#050505] text-neutral-300 group-hover/table:opacity-40'}`}>
                    {row.name || `Profile ${rowIdx + 1}`}
                  </td>
                  
                  {chart.lines.map((line) => {
                    const rawVal = row[line.dataKey];
                    const numVal = parseNumeric(rawVal);
                    const { min, max, avg } = minMaxValues[line.dataKey];
                    
                    let bgStyle = {}; let textClass = 'text-neutral-300';
                    
                    if (typeof numVal === 'number' && !isNaN(numVal) && max > min) {
                      const normalized = (numVal - min) / (max - min);
                      const goodness = line.invertColors ? 1 - normalized : normalized;
                      const badness = line.invertColors ? normalized : 1 - normalized;
                      const isPositive = line.invertColors ? numVal < avg : numVal > avg;

                      if (isPositive) {
                        const alpha = 0.03 + (goodness * 0.15);
                        bgStyle = { backgroundColor: `rgba(52, 199, 89, ${alpha})` };
                        textClass = 'text-[#34C759] font-medium';
                      } else {
                        const alpha = 0.03 + (badness * 0.15);
                        bgStyle = { backgroundColor: `rgba(255, 59, 48, ${alpha})` };
                        textClass = 'text-[#FF3B30] font-medium';
                      }
                    }

                    const isColHovered = hoveredCol === line.dataKey;
                    const isFocus = isRowHovered || isColHovered;

                    return (
                      <td 
                        key={line.dataKey} 
                        onMouseEnter={() => setHoveredCol(line.dataKey)}
                        className={`py-2 px-3 relative font-mono text-[13px] text-right transition-all duration-300 border-r border-white/[0.02] last:border-r-0 ${isFocus ? 'opacity-100 z-10' : 'group-hover/table:opacity-30'} ${isColHovered ? 'bg-white/[0.02]' : ''}`}
                      >
                        <div style={bgStyle} className={`absolute inset-[3px] rounded-[4px] transition-all duration-300 ease-out`} />
                        <div className={`relative px-4 py-1.5 z-10 ${textClass}`}>{rawVal ?? '-'}</div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {/* Matrix Legend */}
      <div className="px-6 py-4 bg-[#0A0A0C] border-t border-white/[0.04] flex flex-wrap items-center justify-between gap-4 text-[10px] text-neutral-500 font-mono font-bold uppercase tracking-widest">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-[2px] bg-[#34C759]/20 border border-[#34C759]/30" /><span>Positive Variance</span></div>
          <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-[2px] bg-[#FF3B30]/20 border border-[#FF3B30]/30" /><span>Negative Variance</span></div>
        </div>
        <div className="flex items-center gap-1.5 opacity-60"><Crosshair className="w-3.5 h-3.5" /> Hover Crosshair</div>
      </div>
    </div>
  );
});
StatisticalTable.displayName = 'StatisticalTable';

// ============================================================================
// Primary Renderer (No Meta-Banners)
// ============================================================================
function MasterclassContent({ data }: { data: AnalysisData }) {
  if (!data || !data.analysis_markdown) return null;
  const stringifiedAngles = useMemo(() => data.angles ? JSON.stringify(data.angles) : '[]', [data.angles]);

  return (
    <div className="w-full mb-8 animate-in fade-in slide-in-from-bottom-4 duration-1000 relative text-left">
      <div className="w-full max-w-none">
        <Markdown remarkPlugins={REMARK_PLUGINS} components={MARKDOWN_COMPONENTS}>
          {data.analysis_markdown}
        </Markdown>
      </div>

      {data.chart && (
        <StatisticalTable chart={data.chart} />
      )}

      <LiveOrderFlow consensus={data.consensus as ConsensusData} />

      {data.angles && Array.isArray(data.angles) && data.angles.length > 0 && (
        <div className="my-12">
          <BettingAnglesCarousel data={stringifiedAngles} />
        </div>
      )}
    </div>
  );
}

export function AnalyticalMasterclass({ data }: { data: AnalysisData }) {
  return (
    <MasterclassErrorBoundary>
      <MasterclassContent data={data} />
    </MasterclassErrorBoundary>
  );
}