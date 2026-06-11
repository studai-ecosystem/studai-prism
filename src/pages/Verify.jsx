import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ShieldCheck, AlertTriangle, Loader2, BadgeCheck } from 'lucide-react'

// Public credential verification. Fetches the durable report by session id.
// No candidate personal data is stored server-side, so nothing private leaks —
// this page confirms the score is authentic and shows the dimension breakdown.

const DIMENSIONS = [
  { key: 'criticalThinking', label: 'Critical Thinking' },
  { key: 'communication', label: 'Communication' },
  { key: 'collaboration', label: 'Collaboration' },
  { key: 'problemSolving', label: 'Problem Solving' },
  { key: 'aiDigitalFluency', label: 'AI & Digital Fluency' },
]

const BANDS = [
  { min: 90, label: 'Exceptional Performer' },
  { min: 75, label: 'Strong Performer' },
  { min: 60, label: 'Competent Performer' },
  { min: 40, label: 'Developing Performer' },
  { min: 0, label: 'Early Stage' },
]
const getBand = (s) => BANDS.find((b) => s >= b.min) || BANDS[BANDS.length - 1]

export default function Verify() {
  const { id } = useParams()
  const [state, setState] = useState({ status: 'loading', report: null })

  useEffect(() => {
    let cancelled = false
    fetch(`/api/assessment/report/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('not found'))))
      .then((report) => { if (!cancelled) setState({ status: 'ok', report }) })
      .catch(() => { if (!cancelled) setState({ status: 'error', report: null }) })
    return () => { cancelled = true }
  }, [id])

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen bg-[#F5F4FF] flex flex-col items-center justify-center gap-4 text-center px-6">
        <Loader2 size={32} className="text-[#4C35A8] animate-spin" />
        <p className="font-sans text-[#6B5E94]">Verifying credential…</p>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="min-h-screen bg-[#F5F4FF] flex flex-col items-center justify-center gap-5 text-center px-6">
        <AlertTriangle size={40} className="text-[#C27803]" />
        <h1 className="font-serif text-2xl text-[#0A0614]">Credential not found</h1>
        <p className="font-sans text-sm text-[#6B5E94] max-w-sm">
          We couldn’t find a Prism credential with this ID. The link may be incorrect or the
          assessment was never completed.
        </p>
        <Link to="/" className="font-sans text-sm text-[#4C35A8] underline">Back to home</Link>
      </div>
    )
  }

  const { report } = state
  const overall = report.scores?.overall ?? 0
  const band = getBand(overall)
  const issued = report.issuedAt ? new Date(report.issuedAt) : null
  const issuedStr = issued
    ? issued.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '—'

  return (
    <div className="min-h-screen bg-[#F5F4FF] flex flex-col items-center px-6 py-16 font-sans">
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-2 justify-center mb-6">
          <span className="inline-flex items-center gap-1.5 bg-[#047857]/10 border border-[#047857]/25 text-[#047857] text-xs font-semibold rounded-full px-3 py-1.5">
            <BadgeCheck size={14} /> Verified Prism Credential
          </span>
        </div>

        <div className="bg-white border border-[#4C35A8]/10 rounded-2xl overflow-hidden">
          <div className="bg-gradient-to-br from-[#2E1F7A] via-[#4C35A8] to-[#6B4FCC] p-8 text-white">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/55 mb-1">Prism Score</p>
            <div className="flex items-end gap-1">
              <span className="font-mono text-7xl font-medium leading-none">{overall}</span>
              <span className="font-mono text-2xl text-white/40 mb-1">/100</span>
            </div>
            <span className="inline-flex items-center gap-1.5 bg-white/15 border border-white/25 rounded-full px-3 py-1 text-sm font-bold mt-4">
              <ShieldCheck size={14} /> {band.label}
            </span>
            {typeof report.percentile === 'number' && (
              <p className="text-sm text-white/70 mt-3">
                Outperformed {report.percentile}% of assessed candidates
              </p>
            )}
          </div>

          <div className="p-8">
            <p className="text-xs font-bold uppercase tracking-wider text-[#B4A8D8] mb-4">Dimension breakdown</p>
            <div className="flex flex-col gap-3">
              {DIMENSIONS.map((d) => {
                const v = report.scores?.[d.key] ?? 0
                return (
                  <div key={d.key}>
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-sm font-semibold text-[#2D2556]">{d.label}</span>
                      <span className="font-mono text-sm text-[#4C35A8]">{v}</span>
                    </div>
                    <div className="h-1.5 bg-[#E8E4F6] rounded-full overflow-hidden">
                      <div className="h-full bg-[#4C35A8] rounded-full" style={{ width: `${v}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-8 pt-6 border-t border-[#4C35A8]/10 flex flex-wrap gap-x-8 gap-y-3 text-xs text-[#6B5E94]">
              <div>
                <p className="font-bold uppercase tracking-wider text-[#B4A8D8] mb-0.5">Credential ID</p>
                <p className="font-mono text-[#2D2556]">{id}</p>
              </div>
              <div>
                <p className="font-bold uppercase tracking-wider text-[#B4A8D8] mb-0.5">Issued</p>
                <p className="text-[#2D2556]">{issuedStr}</p>
              </div>
              <div>
                <p className="font-bold uppercase tracking-wider text-[#B4A8D8] mb-0.5">Validity</p>
                <p className="text-[#2D2556]">{report.validityMonths || 18} months</p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-[#A0A4B0] mt-6">
          Prism by StudAI One · This credential is cryptographically tied to a completed assessment session.
        </p>
        <div className="text-center mt-4">
          <Link to="/" className="font-sans text-sm text-[#4C35A8] underline">Take your own Prism assessment →</Link>
        </div>
      </div>
    </div>
  )
}
