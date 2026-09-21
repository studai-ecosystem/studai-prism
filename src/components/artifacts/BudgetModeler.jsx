// src/components/artifacts/BudgetModeler.jsx — 30-Day Budget Reallocation Model
import { useState } from 'react'
import { useArtifactStore } from '../../lib/artifactStore.js'

export default function BudgetModeler({ data = {}, sessionId }) {
  const { updateLocalArtifact, persistArtifact, isSaving } = useArtifactStore()
  const initialAllocations = data.allocations || {
    metaSpend: 200000,
    searchSpend: 180000,
    retentionSpend: 80000,
    experimentationSpend: 40000
  }

  const [allocations, setAllocations] = useState(initialAllocations)
  const [notes, setNotes] = useState('')
  const [saveStatus, setSaveStatus] = useState(null)

  const totalBudget = data.totalBudget || 500000
  const currentTotal = 
    Number(allocations.metaSpend || 0) +
    Number(allocations.searchSpend || 0) +
    Number(allocations.retentionSpend || 0) +
    Number(allocations.experimentationSpend || 0)

  const remaining = totalBudget - currentTotal
  const isOverBudget = currentTotal > totalBudget
  const isRetentionViolated = Number(allocations.retentionSpend || 0) < 50000

  const handleSlider = (field, val) => {
    const next = { ...allocations, [field]: Number(val) }
    setAllocations(next)
    updateLocalArtifact('ART-BUDGET-03', { allocations: next })
  }

  // Model projection heuristics
  const projectedCac = Math.round(
    1640 - 
    ((Number(allocations.searchSpend) - 100000) / 100000) * 140 - 
    ((Number(allocations.retentionSpend) - 40000) / 40000) * 180 +
    ((Number(allocations.metaSpend) - 200000) / 100000) * 90
  )
  const projectedRoas = (
    1.38 + 
    ((Number(allocations.searchSpend) - 100000) / 200000) * 0.45 +
    ((Number(allocations.retentionSpend) - 50000) / 100000) * 0.35 -
    ((Number(allocations.experimentationSpend) - 30000) / 100000) * 0.15
  ).toFixed(2)

  const handleDeploy = async () => {
    if (isOverBudget) {
      alert('Total budget cannot exceed ₹5,00,000.')
      return
    }
    try {
      await persistArtifact(sessionId, 'ART-BUDGET-03', notes)
      setSaveStatus('deployed')
      setTimeout(() => setSaveStatus(null), 4000)
    } catch (err) {
      alert('Failed to deploy budget updates')
    }
  }

  return (
    <div className="space-y-6 text-slate-200">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-inner">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Resource Allocation & Commercial Modeler</span>
          <h3 className="text-lg font-bold text-white">30-Day Growth & Retention Budget Reallocation</h3>
          <p className="text-xs text-slate-400 mt-0.5">₹5,00,000 Maximum Deployment Ceiling · Strict Breakeven Threshold</p>
        </div>
        <div className="text-right">
          <span className="text-xs text-slate-400">Budget Deployed:</span>
          <div className="text-xl font-black text-white font-mono">
            ₹{currentTotal.toLocaleString()} <span className="text-xs font-normal text-slate-400">/ ₹5,00,000</span>
          </div>
        </div>
      </div>

      {/* Budget Meter */}
      <div>
        <div className="flex justify-between text-xs font-medium mb-1.5">
          <span className={isOverBudget ? 'text-rose-400 font-bold' : 'text-slate-300'}>
            {isOverBudget ? `⚠️ Over budget by ₹${Math.abs(remaining).toLocaleString()}` : `Remaining to deploy: ₹${remaining.toLocaleString()}`}
          </span>
          <span className="text-slate-400">{Math.min(100, Math.round((currentTotal / totalBudget) * 100))}%</span>
        </div>
        <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-0.5">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isOverBudget ? 'bg-rose-500' : 'bg-gradient-to-r from-indigo-500 to-emerald-400'
            }`}
            style={{ width: `${Math.min(100, (currentTotal / totalBudget) * 100)}%` }}
          />
        </div>
      </div>

      {/* Allocation Sliders */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Meta Ad Spend */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
          <div className="flex justify-between items-center text-sm font-semibold text-white">
            <span>Meta Ads (FB/IG)</span>
            <span className="font-mono text-indigo-400">₹{allocations.metaSpend?.toLocaleString()}</span>
          </div>
          <input
            type="range"
            min="50000"
            max="350000"
            step="10000"
            value={allocations.metaSpend}
            onChange={(e) => handleSlider('metaSpend', e.target.value)}
            className="w-full accent-indigo-500 cursor-pointer"
          />
          <p className="text-[11px] text-slate-400">Broad top-of-funnel acquisition. High fatigue risk.</p>
        </div>

        {/* Google Search Spend */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
          <div className="flex justify-between items-center text-sm font-semibold text-white">
            <span>Google Search (PPC)</span>
            <span className="font-mono text-emerald-400">₹{allocations.searchSpend?.toLocaleString()}</span>
          </div>
          <input
            type="range"
            min="50000"
            max="300000"
            step="10000"
            value={allocations.searchSpend}
            onChange={(e) => handleSlider('searchSpend', e.target.value)}
            className="w-full accent-emerald-500 cursor-pointer"
          />
          <p className="text-[11px] text-slate-400">High-intent non-brand queries. Currently 2.45x ROAS.</p>
        </div>

        {/* Retention & Win-back Spend */}
        <div className={`p-4 rounded-xl border space-y-2 ${isRetentionViolated ? 'bg-rose-950/20 border-rose-800/40' : 'bg-slate-900/90 border-slate-800'}`}>
          <div className="flex justify-between items-center text-sm font-semibold text-white">
            <span>Retention & Churn Triage</span>
            <span className="font-mono text-cyan-400">₹{allocations.retentionSpend?.toLocaleString()}</span>
          </div>
          <input
            type="range"
            min="20000"
            max="200000"
            step="5000"
            value={allocations.retentionSpend}
            onChange={(e) => handleSlider('retentionSpend', e.target.value)}
            className="w-full accent-cyan-500 cursor-pointer"
          />
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-400">Loyalty, email, SMS, formula support</span>
            {isRetentionViolated && <span className="text-rose-400 font-bold">⚠️ Min ₹50k recommended</span>}
          </div>
        </div>

        {/* Experimentation Spend */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
          <div className="flex justify-between items-center text-sm font-semibold text-white">
            <span>Creative Testing & TikTok</span>
            <span className="font-mono text-purple-400">₹{allocations.experimentationSpend?.toLocaleString()}</span>
          </div>
          <input
            type="range"
            min="10000"
            max="140000"
            step="5000"
            value={allocations.experimentationSpend}
            onChange={(e) => handleSlider('experimentationSpend', e.target.value)}
            className="w-full accent-purple-500 cursor-pointer"
          />
          <p className="text-[11px] text-slate-400">Short-form video hooks & exploratory influencer trials.</p>
        </div>
      </div>

      {/* Impact Projections */}
      <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-950/40 to-slate-900 border border-indigo-500/30 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs uppercase font-semibold tracking-wider text-indigo-400">Projected Turnaround Model</span>
          <div className="flex items-center gap-6 mt-1">
            <div>
              <span className="text-xs text-slate-400">Projected CAC:</span>
              <div className="text-xl font-black text-emerald-400 font-mono">₹{projectedCac.toLocaleString()}</div>
            </div>
            <div>
              <span className="text-xs text-slate-400">Projected ROAS:</span>
              <div className="text-xl font-black text-emerald-400 font-mono">{projectedRoas}x</div>
            </div>
            <div>
              <span className="text-xs text-slate-400">Commercial Health:</span>
              <div className="text-sm font-bold text-indigo-300">
                {projectedRoas >= 1.70 ? '✅ Profitable & Cash-flow Positive' : '⚠️ Marginal / Sub-breakeven'}
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={handleDeploy}
          disabled={isSaving || isOverBudget}
          className={`px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg transition-all ${
            isOverBudget
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
              : saveStatus === 'deployed'
              ? 'bg-emerald-600 text-white shadow-emerald-900/30'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/30'
          }`}
        >
          {isSaving ? 'Deploying Model...' : saveStatus === 'deployed' ? '✓ Model Deployed to Session' : 'Save & Deploy 30-Day Plan'}
        </button>
      </div>

      {/* Trade-off Rationale Textarea */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-300">
          Candidate Commercial Rationale (Shared with CEO & Performance Lead in simulation dialogue):
        </label>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g., We capped Meta spend because ad fatigue is accelerating CAC inflation, and shifted ₹80,000 to retention to resolve the formula reformulation churn before scaling TikTok ads..."
          className="w-full px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
        />
      </div>
    </div>
  )
}
