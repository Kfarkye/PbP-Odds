import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity } from 'lucide-react';

interface MarkdownChartProps {
  data: string;
}

export function MarkdownChart({ data }: MarkdownChartProps) {
  let parsedData: any = null;
  
  try {
    parsedData = JSON.parse(data);
  } catch (e) {
    return (
        <div className="bg-red-900/20 text-red-400 p-4 rounded-xl border border-red-900/50 my-4 text-xs font-mono">
            Error parsing chart data: Invalid JSON.
        </div>
    );
  }

  if (!parsedData || !Array.isArray(parsedData.data)) {
     return (
        <div className="bg-neutral-800 text-neutral-400 p-4 rounded-xl border border-neutral-700 my-4 text-xs font-mono">
           Expected JSON with a 'data' array property.
        </div>
     );
  }

  const { type = 'bar', data: chartData, xKey, yKey, title } = parsedData;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-neutral-900 border border-neutral-800 p-3 rounded-lg shadow-[0_16px_40px_-8px_rgba(0,0,0,0.6),0_0_15px_rgba(255,255,255,0.015)]">
          <p className="text-neutral-400 text-xs mb-1 font-mono uppercase">{label}</p>
          {parsedData?.data && payload.map((entry: any, index: number) => (
             <p key={index} className="text-white font-medium text-sm">
                {entry.name}: {entry.value}
             </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-[0_16px_40px_-8px_rgba(0,0,0,0.6),0_0_15px_rgba(255,255,255,0.015)] my-6">
       {(title || type) && (
           <div className="flex items-center justify-between mb-6">
               <div className="flex items-center gap-2">
                   <Activity className="h-4 w-4 text-neutral-400" />
                   <h4 className="text-sm font-semibold text-neutral-200">{title || 'Data Visualization'}</h4>
               </div>
               <span className="text-[10px] uppercase font-mono text-neutral-500 tracking-wider bg-neutral-950 px-2 py-1 rounded-md border border-neutral-800">
                   {type} chart
               </span>
           </div>
       )}
       <div className="h-64 w-full">
         <ResponsiveContainer width="100%" height="100%">
           {type === 'line' ? (
             <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
               <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
               <XAxis 
                 dataKey={xKey || Object.keys(chartData[0] || {})[0]} 
                 stroke="#525252" 
                 fontSize={11} 
                 tickLine={false} 
                 axisLine={false} 
                 dy={10}
               />
               <YAxis 
                 stroke="#525252" 
                 fontSize={11} 
                 tickLine={false} 
                 axisLine={false}
                 tickFormatter={(value) => `${value}`}
               />
               <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#262626', strokeWidth: 1 }} />
               <Line 
                 type="monotone" 
                 dataKey={yKey || Object.keys(chartData[0] || {})[1]} 
                 stroke="#e5e5e5" 
                 strokeWidth={2}
                 dot={{ fill: '#0a0a0a', stroke: '#e5e5e5', strokeWidth: 2, r: 4 }}
                 activeDot={{ r: 6, fill: '#e5e5e5' }}
               />
             </LineChart>
           ) : (
             <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }} barSize={32}>
               <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
               <XAxis 
                 dataKey={xKey || Object.keys(chartData[0] || {})[0]} 
                 stroke="#525252" 
                 fontSize={11} 
                 tickLine={false} 
                 axisLine={false} 
                 dy={10}
               />
               <YAxis 
                 stroke="#525252" 
                 fontSize={11} 
                 tickLine={false} 
                 axisLine={false}
               />
               <Tooltip content={<CustomTooltip />} cursor={{fill: '#171717'}} />
               <Bar 
                 dataKey={yKey || Object.keys(chartData[0] || {})[1]} 
                 fill="#e5e5e5" 
                 radius={[4, 4, 0, 0]} 
               />
             </BarChart>
           )}
         </ResponsiveContainer>
       </div>
    </div>
  );
}
