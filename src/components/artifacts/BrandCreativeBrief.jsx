// src/components/artifacts/BrandCreativeBrief.jsx — Brand & Creative Strategy Brief Primitive
import { useState } from 'react'

export default function BrandCreativeBrief({ data = {} }) {
  const [approved, setApproved] = useState(false)

  const brief = {
    campaign: data.campaign || 'Lumina C-Radiance: Transparency & Skin Barrier Recovery',
    objective: data.objective || 'Rebuild consumer confidence after packaging defect while shifting narrative from pure miracle claims to clinical efficacy and sustainable organic sourcing.',
    targetPersona: data.targetPersona || 'Tier-1 Metro Women & Men aged 24–36 with sensitive skin concerns who prioritize EWG-verified clean formulations over viral TikTok fads.',
    valueProp: data.valueProp || 'Pure 15% L-Ascorbic Acid stabilized with Ferulic Acid in airless, pharmaceutical-grade dark amber vials.',
    dos: [
      'Highlight third-party dermatological patch-test results (98% non-irritating).',
      'Feature real customer routine transitions and ingredient provenance transparency.',
      'Emphasize our 100% money-back satisfaction and no-questions replacement guarantee.'
    ],
    donts: [
      'Do NOT make overnight miracle transformation promises or exaggerated claim hooks.',
      'Avoid high-contrast artificial lighting filters that look like generic dropshipping videos.',
      'Do not mention rival brand lawsuits or unverified competitor chemical controversies.'
    ]
  }

  return (
    <div className="max-w-3xl mx-auto p-6 rounded-2xl bg-slate-900/90 border border-slate-800 text-slate-200 shadow-xl space-y-6">
      <div className="border-b border-slate-800 pb-3">
        <span className="text-[10px] font-mono uppercase text-indigo-400 font-bold tracking-wider">
          Creative Direction · Briefing Document
        </span>
        <h2 className="text-xl font-black text-white mt-1">{brief.campaign}</h2>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Campaign Objective</h4>
        <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3.5 rounded-xl border border-slate-800">
          {brief.objective}
        </p>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Target Demographic Persona</h4>
        <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3.5 rounded-xl border border-slate-800">
          {brief.targetPersona}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Do's */}
        <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-2">
          <h5 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">✓ Creative Must-Haves (Do's)</h5>
          <ul className="space-y-1.5 text-xs text-emerald-200/90">
            {brief.dos.map((d, i) => (
              <li key={i} className="flex gap-2">
                <span>•</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Don'ts */}
        <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 space-y-2">
          <h5 className="text-xs font-bold text-rose-400 uppercase tracking-wider">✗ Prohibited Angles (Don'ts)</h5>
          <ul className="space-y-1.5 text-xs text-rose-200/90">
            {brief.donts.map((d, i) => (
              <li key={i} className="flex gap-2">
                <span>•</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
        <button
          onClick={() => setApproved(!approved)}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            approved ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          {approved ? '✓ Brief Approved by Candidate' : 'Approve Creative Angle'}
        </button>
      </div>
    </div>
  )
}
