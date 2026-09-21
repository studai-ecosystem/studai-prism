// src/components/artifacts/ExecutiveMemo.jsx — Formal Strategy & Decision Memorandum Primitive
import { useState } from 'react'

export default function ExecutiveMemo({ data = {} }) {
  const [signedOff, setSignedOff] = useState(false)

  const memo = {
    to: data.to || 'Board of Directors, Lumina Botanicals',
    from: data.from || 'Elena Vance (CEO) & Growth Steering Committee',
    date: data.date || 'September 4, 2026',
    subject: data.subject || 'Q3 Turnaround Strategy: Growth Spend Re-allocation & Unit Economics Recovery',
    classification: data.classification || 'CONFIDENTIAL // INTERNAL USE ONLY',
    execSummary: data.execSummary || 'Over the last 90 days, customer acquisition costs expanded 48% due to creative exhaustion in top-of-funnel paid channels and packaging defects in Batch B-409. This memorandum outlines the proposed budget reallocation and immediate operational triage.',
    keyDecisions: data.keyDecisions || [
      'Reduce top-of-funnel TikTok ad spend by 40% until Batch B-409 pipette replacements are fulfilled.',
      'Reallocate ₹1,20,000 into automated CRM email/SMS win-back flows targeting high-LTV 60-day dormant cohorts.',
      'Pause influencer gifting campaigns until quality assurance verification clears the new packaging line.'
    ],
    financialImpact: data.financialImpact || 'Expected to reduce blended CAC from ₹1,640 to ₹1,180 within 30 days, lifting gross unit margin back above 28%.'
  }

  return (
    <div className="max-w-3xl mx-auto p-6 rounded-2xl bg-slate-900/90 border border-slate-800 text-slate-200 shadow-xl space-y-6">
      {/* Header */}
      <div className="border-b border-slate-800 pb-4 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-mono tracking-widest uppercase text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
            {memo.classification}
          </span>
          <span className="text-xs text-slate-500 font-mono">DOC-ID: MEMO-2026-09</span>
        </div>
        <h2 className="text-xl font-black text-white">{memo.subject}</h2>
        
        <div className="grid grid-cols-2 gap-2 text-xs pt-2">
          <div><strong className="text-slate-400">TO:</strong> <span className="text-white">{memo.to}</span></div>
          <div><strong className="text-slate-400">DATE:</strong> <span className="text-white">{memo.date}</span></div>
          <div><strong className="text-slate-400">FROM:</strong> <span className="text-white">{memo.from}</span></div>
          <div><strong className="text-slate-400">STATUS:</strong> <span className="text-emerald-400 font-semibold">Ready for Review</span></div>
        </div>
      </div>

      {/* Executive Summary */}
      <div className="space-y-2">
        <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">1. Executive Summary</h4>
        <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3.5 rounded-xl border border-slate-800">
          {memo.execSummary}
        </p>
      </div>

      {/* Key Strategic Decisions */}
      <div className="space-y-2">
        <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">2. Core Recommendations & Action Items</h4>
        <ul className="space-y-2">
          {memo.keyDecisions.map((dec, idx) => (
            <li key={idx} className="flex gap-2.5 text-xs text-slate-300 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
              <span className="text-indigo-400 font-bold">2.{idx + 1}</span>
              <span>{dec}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Projected Impact */}
      <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-xs text-emerald-200">
        <strong className="font-bold text-emerald-300 block mb-1">3. Projected Financial & Operational Outcome:</strong>
        {memo.financialImpact}
      </div>

      {/* Review Sign-off */}
      <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="memo-sign"
            checked={signedOff}
            onChange={(e) => setSignedOff(e.target.checked)}
            className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-0"
          />
          <label htmlFor="memo-sign" className="text-xs text-slate-300 cursor-pointer">
            Acknowledge & endorse strategic recommendations
          </label>
        </div>
        {signedOff && (
          <span className="text-xs font-bold text-emerald-400 animate-pulse">
            ✓ Signed off by Candidate
          </span>
        )}
      </div>
    </div>
  )
}
