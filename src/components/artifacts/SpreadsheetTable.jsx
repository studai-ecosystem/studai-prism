// src/components/artifacts/SpreadsheetTable.jsx — Interactive Financial / Tabular Spreadsheet Primitive
import { useState } from 'react'

export default function SpreadsheetTable({ data = {} }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [rows, setRows] = useState(data.rows || [
    { id: 1, channel: 'Meta (IG / FB Reels)', spend: 450000, roas: 1.65, conversions: 450, cpa: 1000, margin: '22%' },
    { id: 2, channel: 'Google Search & PMax', spend: 250000, roas: 2.10, conversions: 310, cpa: 806, margin: '34%' },
    { id: 3, channel: 'TikTok Spark Ads', spend: 200000, roas: 0.95, conversions: 115, cpa: 1739, margin: '-8%' },
    { id: 4, channel: 'Klaviyo Email / Retention', spend: 40000, roas: 4.80, conversions: 240, cpa: 166, margin: '68%' },
    { id: 5, channel: 'Affiliate & Influencer', spend: 60000, roas: 1.40, conversions: 65, cpa: 923, margin: '12%' },
  ])

  const filteredRows = rows.filter((r) =>
    r.channel.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const totalSpend = filteredRows.reduce((acc, r) => acc + Number(r.spend || 0), 0)
  const totalConversions = filteredRows.reduce((acc, r) => acc + Number(r.conversions || 0), 0)
  const avgRoas = (filteredRows.reduce((acc, r) => acc + Number(r.roas || 0), 0) / (filteredRows.length || 1)).toFixed(2)

  return (
    <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 text-slate-200 shadow-xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h3 className="font-bold text-base text-white">{data.title || 'Channel Unit Economics Model'}</h3>
          <p className="text-xs text-slate-400">Interactive live spreadsheet ledger with calculated summaries</p>
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Filter by channel..."
          className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
            <tr>
              <th className="p-3">Channel Name</th>
              <th className="p-3 text-right">Spend (₹)</th>
              <th className="p-3 text-right">ROAS</th>
              <th className="p-3 text-right">Conversions</th>
              <th className="p-3 text-right">CPA (₹)</th>
              <th className="p-3 text-right">Net Margin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {filteredRows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="p-3 font-sans font-medium text-white">{r.channel}</td>
                <td className="p-3 text-right text-slate-300">₹{r.spend.toLocaleString()}</td>
                <td className={`p-3 text-right font-bold ${r.roas >= 2.0 ? 'text-emerald-400' : r.roas >= 1.5 ? 'text-amber-400' : 'text-rose-400'}`}>
                  {r.roas}x
                </td>
                <td className="p-3 text-right text-slate-300">{r.conversions}</td>
                <td className="p-3 text-right text-slate-300">₹{r.cpa}</td>
                <td className={`p-3 text-right font-bold ${r.margin.startsWith('-') ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {r.margin}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-950 font-bold border-t border-slate-700 text-white">
            <tr>
              <td className="p-3 font-sans">Summary Total / Weighted Avg</td>
              <td className="p-3 text-right font-mono text-indigo-400">₹{totalSpend.toLocaleString()}</td>
              <td className="p-3 text-right font-mono text-amber-400">{avgRoas}x</td>
              <td className="p-3 text-right font-mono text-emerald-400">{totalConversions}</td>
              <td className="p-3 text-right font-mono text-slate-400">—</td>
              <td className="p-3 text-right font-mono text-emerald-400">Blended</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
