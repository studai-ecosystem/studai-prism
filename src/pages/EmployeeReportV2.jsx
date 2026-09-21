// src/pages/EmployeeReportV2.jsx — PRISM Next Employee Mobility & Growth Report (Grow Mode)
import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'

export default function EmployeeReportV2() {
  const { sessionId } = useParams()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchReport() {
      try {
        const token = localStorage.getItem('token')
        const headers = {}
        if (token) headers['Authorization'] = `Bearer ${token}`

        const res = await fetch(`/api/assessment/report/${sessionId}/employee`, { headers })
        const data = await res.json()
        setReport(data)
        setLoading(false)
      } catch (err) {
        console.error('Failed to load Employee Report', err)
        setLoading(false)
      }
    }

    if (sessionId) {
      fetchReport()
    }
  }, [sessionId])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold tracking-wide text-slate-400">
          Generating Internal Mobility & Growth Pathway Intelligence...
        </p>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-6">
        <h2 className="text-xl font-bold text-rose-400 mb-2">Report Unavailable</h2>
        <Link to="/" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold">
          Return Home
        </Link>
      </div>
    )
  }

  const {
    candidate,
    currentRole,
    targetRoleEvaluation: targetRole,
    internalMobilityPathways: pathways,
    section3_layer1TransferableCapabilities: layer1,
    section11_developmentMissions: missions
  } = report

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 pb-20">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-30 px-6 py-4">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white font-black text-sm shadow-md">
              G
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  PRISM NEXT · INTERNAL MOBILITY & TALENT INTELLIGENCE
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Grow Mode
                </span>
              </div>
              <h1 className="text-base font-bold text-white">
                {candidate.name} — Employee Career Mobility Diagnostic
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to={`/report/${sessionId}/v2`}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              ← Back to Student Report V2
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-10">
        {/* Current vs Target Role Banner */}
        <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900/90 to-emerald-950/40 border border-slate-800 shadow-xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                Internal Promotion & Lateral Readiness
              </span>
              <h2 className="text-2xl font-black text-white mt-1">
                {currentRole?.title || 'Current Role'} → {targetRole?.targetRoleTitle || 'Target Role'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Tenure: {currentRole?.tenure || '12+ Months'}</p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400 block">Mobility Readiness</span>
              <span className="text-xl font-black text-emerald-400 font-sans tracking-wide">
                {targetRole?.readinessLabel || (targetRole?.readinessScore ? `${targetRole.readinessScore}%` : 'High Promotion Readiness')}
              </span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300">
            <span className="font-bold text-emerald-400 block mb-1">Transferable Capability Carryover:</span>
            {targetRole?.transferableCapabilityCarryover}
          </div>
        </div>

        {/* Capability Gap Analysis */}
        <section className="space-y-4">
          <div>
            <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
              Diagnostic Gap Analysis
            </span>
            <h3 className="text-xl font-bold text-white mt-0.5">Competency Comparison Against Target Role</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {targetRole?.capabilityGaps?.map((gap, i) => (
              <div key={i} className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-sm text-white">{gap.capability}</h4>
                  <div className="flex items-center gap-2 text-xs font-mono font-bold">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">Current: L{gap.currentLevel}</span>
                    <span className="text-slate-500">→</span>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">Target: L{gap.requiredLevel}</span>
                  </div>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3 rounded-xl border border-slate-800">
                  {gap.gapDescription}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Internal Mobility Pathways */}
        <section className="space-y-4">
          <div>
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
              Lateral & Upward Opportunities
            </span>
            <h3 className="text-xl font-bold text-white mt-0.5">Recommended Internal Mobility Pathways</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pathways?.map((p, idx) => (
              <div key={idx} className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-base text-white">{p.role}</h4>
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 font-mono">
                    {p.matchTier || (p.matchPercent ? `${p.matchPercent}% Match` : 'High Transferability')}
                  </span>
                </div>
                <div className="text-xs text-slate-400">
                  <span>Estimated Ramp: </span>
                  <span className="text-indigo-400 font-semibold">{p.transitionTimeframe}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 text-xs text-slate-300 border border-slate-800">
                  <span className="font-semibold text-white block mb-0.5">Recommended Action:</span>
                  {p.recommendedNextStep}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Recommended Development Missions */}
        <section className="space-y-4">
          <div>
            <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">
              Promotion Deliberate Practice
            </span>
            <h3 className="text-xl font-bold text-white mt-0.5">Assigned Practice Missions</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {missions?.map((m) => (
              <div key={m.missionId} className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-indigo-400">{m.missionId}</span>
                    <span className="text-[11px] font-bold text-slate-400">⏱️ {m.estimatedDuration}</span>
                  </div>
                  <h4 className="font-bold text-sm text-white mt-1">{m.title}</h4>
                  <p className="text-xs text-slate-400 mt-1">{m.description}</p>
                </div>

                <Link
                  to={`/missions/${m.missionId}`}
                  className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs text-center shadow transition-all block"
                >
                  Launch Stretch Mission →
                </Link>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
