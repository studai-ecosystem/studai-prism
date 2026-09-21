// src/components/artifacts/PolicyComplianceDoc.jsx — Regulatory & Policy Compliance Document Primitive
import { useState } from 'react'

export default function PolicyComplianceDoc({ data = {} }) {
  const [checkedItems, setCheckedItems] = useState({})

  const doc = {
    title: data.title || 'D2C Consumer Protection & Advertising Standard Policy (ASCI & DPDP)',
    reference: data.reference || 'REG-COMP-2026-V3',
    effectiveDate: data.effectiveDate || 'August 1, 2026',
    guidelines: data.guidelines || [
      {
        id: 'POL-01',
        title: 'Clear Substantiation of Dermatological Efficacy Claims',
        requirement: 'All paid advertisements claiming reduction in hyperpigmentation or acne must reference an independent validated lab study with minimum 30 human subjects.',
        riskLevel: 'HIGH'
      },
      {
        id: 'POL-02',
        title: 'Authenticity in Influencer Disclosures (ASCI Guidelines)',
        requirement: 'Every sponsored reel, short, or affiliate testimonial must prominently feature #ad or #sponsored in the first two lines of caption and verbally in the first 5 seconds.',
        riskLevel: 'CRITICAL'
      },
      {
        id: 'POL-03',
        title: 'Customer Data Privacy & Review Transparency',
        requirement: 'Reviews cannot be selectively deleted or suppressed based on negative ratings. Customer feedback must remain unedited under the DPDP Act transparency doctrine.',
        riskLevel: 'CRITICAL'
      }
    ]
  }

  const toggleCheck = (id) => {
    setCheckedItems((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="max-w-3xl mx-auto p-6 rounded-2xl bg-slate-900/90 border border-slate-800 text-slate-200 shadow-xl space-y-6">
      <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
        <div>
          <span className="text-[10px] font-mono uppercase text-amber-400 font-bold tracking-wider">
            Statutory & Advertising Compliance
          </span>
          <h2 className="text-lg font-black text-white mt-0.5">{doc.title}</h2>
        </div>
        <span className="text-xs font-mono px-2.5 py-1 rounded bg-slate-800 text-slate-400 border border-slate-700">
          {doc.reference}
        </span>
      </div>

      <div className="space-y-4">
        {doc.guidelines.map((g) => (
          <div
            key={g.id}
            onClick={() => toggleCheck(g.id)}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              checkedItems[g.id]
                ? 'bg-emerald-950/20 border-emerald-500/40'
                : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex justify-between items-center mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm">{checkedItems[g.id] ? '☑' : '☐'}</span>
                <span className="font-bold text-xs text-white">{g.title}</span>
              </div>
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                g.riskLevel === 'CRITICAL' ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'
              }`}>
                {g.riskLevel}
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed pl-5">{g.requirement}</p>
          </div>
        ))}
      </div>

      <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center text-xs">
        <span className="text-slate-400">Compliance Verification Status:</span>
        <span className="font-bold text-indigo-400">
          {Object.keys(checkedItems).filter(k => checkedItems[k]).length} of {doc.guidelines.length} Requirements Verified
        </span>
      </div>
    </div>
  )
}
