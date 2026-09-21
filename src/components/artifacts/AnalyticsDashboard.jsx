// src/components/artifacts/AnalyticsDashboard.jsx — Paid Media & Unit Economics Dashboard
import { useState } from 'react'

export default function AnalyticsDashboard({ data = {} }) {
  const [selectedChannel, setSelectedChannel] = useState('ALL')
  const channels = data.channels || []
  const filteredChannels = selectedChannel === 'ALL' 
    ? channels 
    : channels.filter((c) => c.name.toLowerCase().includes(selectedChannel.toLowerCase()))

  return (
    <div className="space-y-6 text-slate-200">
      {/* Top Banner & Context */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-inner">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-rose-400">Critical Growth Warning</span>
          <h3 className="text-lg font-bold text-white">Paid Media & Acquisition Unit Economics (Last 90 Days)</h3>
          <p className="text-xs text-slate-400 mt-0.5">Live Shopify & Ads Manager Attribution Integration</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            CAC +48% Over Baseline
          </span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            ROAS Below Break-Even
          </span>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
          <span className="text-xs text-slate-400 font-medium">Blended CAC (Current)</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black text-rose-400">₹{data.blendedCac?.toLocaleString() || '1,640'}</span>
            <span className="text-xs text-slate-500 line-through">Target ₹1,100</span>
          </div>
          <p className="text-xs text-slate-400 mt-2">Unit loss: -₹540 per customer acquired</p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
          <span className="text-xs text-slate-400 font-medium">Blended ROAS</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-400">{data.blendedRoas || '1.38'}x</span>
            <span className="text-xs text-slate-500">Break-even 1.70x</span>
          </div>
          <p className="text-xs text-slate-400 mt-2">Gross margin compressed to 18%</p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
          <span className="text-xs text-slate-400 font-medium">Total 90-Day Ad Spend</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black text-indigo-300">₹10,00,000</span>
            <span className="text-xs text-emerald-400">₹13.8L Rev</span>
          </div>
          <p className="text-xs text-slate-400 mt-2">Paid channels drive 72% of total store revenue</p>
        </div>
      </div>

      {/* Channel Performance Table */}
      <div className="rounded-xl bg-slate-900/90 border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h4 className="font-semibold text-sm text-white">Channel Efficiency Breakdown</h4>
          <div className="flex gap-2">
            {['ALL', 'Meta', 'Search', 'TikTok'].map((ch) => (
              <button
                key={ch}
                onClick={() => setSelectedChannel(ch)}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                  selectedChannel === ch
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {ch}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/60 text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="p-3">Acquisition Channel</th>
                <th className="p-3">Ad Spend</th>
                <th className="p-3">Acquisition CAC</th>
                <th className="p-3">ROAS</th>
                <th className="p-3">CTR</th>
                <th className="p-3">CVR</th>
                <th className="p-3">Efficiency Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredChannels.map((c, i) => (
                <tr key={i} className="hover:bg-slate-800/40 transition-colors">
                  <td className="p-3 font-medium text-white">{c.name}</td>
                  <td className="p-3 font-mono">₹{c.spend?.toLocaleString()}</td>
                  <td className={`p-3 font-mono font-bold ${c.cac > 1500 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    ₹{c.cac?.toLocaleString()}
                  </td>
                  <td className={`p-3 font-mono font-bold ${c.roas < 1.5 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {c.roas}x
                  </td>
                  <td className="p-3 font-mono">{c.ctr}%</td>
                  <td className="p-3 font-mono">{c.cvr}%</td>
                  <td className="p-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold ${
                      c.status.includes('Profitable')
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : c.status.includes('Burning')
                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}>
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Analytical Diagnostic Insight */}
      <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-500/30 text-xs leading-relaxed text-indigo-200">
        <p className="font-semibold text-indigo-300 mb-1">💡 Growth Diagnostic Clue</p>
        Google Search maintains a 2.45x ROAS with strong intent, but is capped at only ₹2.2L spend. Meanwhile, Meta ad fatigue and uncurbed TikTok experimentation are dragging blended return into cash burn territory. Inspect the Customer Tickets tab to see whether conversion collapse is marketing fatigue or product dissatisfaction.
      </div>
    </div>
  )
}
