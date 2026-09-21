// src/pages/StudentReportV2.jsx — PRISM Next 12-Section Evidence-Grounded Student Report
import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'

export default function StudentReportV2() {
  const { sessionId } = useParams()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('summary')

  useEffect(() => {
    async function fetchReport() {
      try {
        const token = localStorage.getItem('token')
        const headers = {}
        if (token) headers['Authorization'] = `Bearer ${token}`

        const res = await fetch(`/api/assessment/report/${sessionId}/v2`, { headers })
        if (!res.ok) throw new Error('Failed to load Report V2')
        const data = await res.json()
        setReport(data)
        setLoading(false)
      } catch (err) {
        console.error('Report fetch error', err)
        setError(err.message)
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
          Synthesizing 12-Section Capability Intelligence Report...
        </p>
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-6">
        <h2 className="text-xl font-bold text-rose-400 mb-2">Report Generation Error</h2>
        <p className="text-sm text-slate-400 mb-4">{error || 'No report found for this session.'}</p>
        <Link to="/" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold">
          Return Home
        </Link>
      </div>
    )
  }

  const {
    candidate,
    section1_executiveSummary: sec1,
    section2_methodologicalIntegrity: sec2,
    section3_layer1TransferableCapabilities: sec3,
    section4_layer2RoleCapabilities: sec4,
    section5_appliedWorkDemonstration: sec5,
    section6_behavioralPatterns: sec6,
    section7_careerExploration: sec7,
    section8_roleNeighborhood: sec8,
    section9_strengthsAndGrowth: sec9,
    section10_developmentPlan: sec10,
    section11_developmentMissions: sec11,
    section12_employerInterpretation: sec12
  } = report

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 pb-20">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-30 px-6 py-4">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white font-black text-sm shadow-md">
              P
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                  PRISM NEXT · CAPABILITY INTELLIGENCE V2
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {candidate.verificationStatus}
                </span>
              </div>
              <h1 className="text-base font-bold text-white">
                {candidate.name} — Comprehensive Capability Report
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to={`/report/${sessionId}/employee`}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              Switch to Employee Mobility View →
            </Link>
            <Link
              to={candidate.shareUrl || `/verify/${candidate.credentialId}`}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow transition-colors"
            >
              Public Verification Link
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-12">
        {/* SECTION 1: Executive Summary */}
        <section className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900/90 to-indigo-950/40 border border-slate-800 shadow-xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
            <div>
              <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                Section 1 · Executive Summary
              </span>
              <h2 className="text-2xl font-black text-white mt-1">{sec1.archetype}</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Assessed across Transferable Core & Role Capabilities · Standard Error {sec2.sem}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400 block">Overall Readiness Level</span>
              <span className="inline-flex px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 mt-1">
                {sec1.readinessLevel}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">🌟 Key Distinctive Strength</span>
              <p className="text-slate-200 leading-relaxed">{sec1.keyStrength}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">🎯 Primary Growth Focus</span>
              <p className="text-slate-200 leading-relaxed">{sec1.primaryGrowthFocus}</p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 flex items-center gap-3 text-xs text-slate-400">
            <span className="text-indigo-400 text-base">🛡️</span>
            <span>{sec1.assessmentIntegrityBadge}</span>
          </div>
        </section>

        {/* SECTION 2: Methodological Integrity & Trust */}
        <section className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Section 2 · Methodological Integrity & Trust
            </span>
            <h3 className="text-lg font-bold text-white mt-0.5">Psychometric Precision & Evidence Floor Declarations</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-400 block font-medium">Standard Error (SEM)</span>
              <span className="text-lg font-bold text-white font-mono mt-1 block">{sec2.sem}</span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-400 block font-medium">95% Confidence Interval</span>
              <span className="text-lg font-bold text-indigo-400 font-mono mt-1 block">{sec2.confidenceInterval95}</span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 sm:col-span-2">
              <span className="text-slate-400 block font-medium">Evidence Sufficiency</span>
              <span className="text-xs font-bold text-emerald-400 mt-1 block">{sec2.evidenceSufficiency.coreTransferable}</span>
              <span className="text-xs text-slate-400 block mt-0.5">{sec2.evidenceSufficiency.roleCapabilities}</span>
            </div>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed bg-slate-950/40 p-3 rounded-xl border border-slate-800/80">
            ℹ️ {sec2.proctoringDeclaration}. {sec2.alternateAdministration}.
          </p>
        </section>

        {/* SECTION 3: Layer 1 — Core Transferable Capabilities */}
        <section className="space-y-4">
          <div>
            <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
              Section 3 · Layer 1 Core Transferable Capabilities
            </span>
            <h3 className="text-xl font-bold text-white mt-0.5">Foundational Work Capabilities (5-Level Rubric Anchors)</h3>
            <p className="text-xs text-slate-400 mt-1">
              Cross-occupational competencies evaluated from direct interactive behavioral dialogue.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {sec3.map((cap) => (
              <div key={cap.id} className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-base text-white">{cap.name}</h4>
                    <p className="text-xs text-slate-400">{cap.definition}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      Rubric Level {cap.rubricLevel} / 5
                    </span>
                    <span className="text-sm font-bold font-mono text-white">Score: {cap.score}/100</span>
                  </div>
                </div>

                <p className="text-xs text-slate-300 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  <span className="font-bold text-slate-400 block mb-1">Observed Descriptor:</span>
                  {cap.levelDescriptor}
                </p>

                <div className="p-3 rounded-xl bg-indigo-950/20 border border-indigo-900/30 text-xs text-indigo-200">
                  <span className="font-bold text-indigo-300 block mb-1">Direct Behavioral Citation:</span>
                  <span className="italic">{cap.observedEvidence.quote}</span>
                  <span className="block text-[11px] text-indigo-400 mt-1">({cap.observedEvidence.context})</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 4: Layer 2 — Role-Specific Capabilities */}
        <section className="space-y-4">
          <div>
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
              Section 4 · Layer 2 Role-Specific Capabilities
            </span>
            <h3 className="text-xl font-bold text-white mt-0.5">Marketing & Growth Specialty Rubrics</h3>
            <p className="text-xs text-slate-400 mt-1">
              Evaluated through hands-on manipulation of live campaign dashboards, customer tickets, and financial models.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sec4.map((cap) => (
              <div key={cap.id} className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-bold text-sm text-white">{cap.name}</h4>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Level {cap.rubricLevel}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{cap.definition}</p>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300">
                  <span className="font-semibold text-slate-400 block mb-0.5">Observed Proficiency:</span>
                  {cap.levelDescriptor}
                </div>

                <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-900/30 text-xs text-emerald-200">
                  <span className="font-semibold text-emerald-400 block mb-0.5">Artifact Demonstration:</span>
                  <span className="italic">{cap.observedEvidence.quote}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 5: Applied Work Demonstration */}
        <section className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
          <div>
            <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
              Section 5 · Applied Work Demonstration
            </span>
            <h3 className="text-xl font-bold text-white mt-0.5">{sec5.scenarioTitle}</h3>
            <p className="text-xs text-slate-400 mt-0.5">Job Family: {sec5.jobFamily}</p>
          </div>

          <p className="text-sm text-slate-300 leading-relaxed">{sec5.summary}</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {sec5.artifactHighlights.map((item, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="text-xs font-bold text-indigo-400 block">{item.artifact}</span>
                <p className="text-xs text-slate-300 leading-relaxed">{item.finding}</p>
              </div>
            ))}
          </div>

          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300">
            <span className="font-bold text-white block mb-1">⚖️ Strategic Trade-offs Defended:</span>
            {sec5.strategicTradeoffs}
          </div>
        </section>

        {/* SECTION 6: Behavioral Patterns & Work Style */}
        <section className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Section 6 · Behavioral Patterns & Working Style
            </span>
            <h3 className="text-lg font-bold text-white mt-0.5">Evidence-Grounded Work Style Indicators</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="font-bold text-indigo-300">Analytical Rigor</span>
              <p className="text-slate-300 leading-relaxed">{sec6.analyticalRigor}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="font-bold text-emerald-300">Stakeholder Alignment</span>
              <p className="text-slate-300 leading-relaxed">{sec6.stakeholderDeEscalation}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="font-bold text-amber-300">Ambiguity Tolerance</span>
              <p className="text-slate-300 leading-relaxed">{sec6.ambiguityTolerance}</p>
            </div>
          </div>
        </section>

        {/* SECTION 7: Explainable Career Exploration */}
        <section className="space-y-4">
          <div>
            <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">
              Section 7 · Explainable Career Exploration
            </span>
            <h3 className="text-xl font-bold text-white mt-0.5">Three-Tier Role Guidance & Dual-Sided Explanations</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Why each career pathway matches your demonstrated evidence, and what skills you would need to build.
            </p>
          </div>

          <div className="space-y-4">
            {/* Tier 1 */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                🟢 Tier 1: Strong Match (Demonstrated Mastery)
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(sec7?.tier1_strongMatch || []).map((r, i) => (
                  <div key={i} className="p-4 rounded-xl bg-slate-900/90 border border-emerald-500/30 space-y-2">
                    <div className="flex justify-between items-center">
                      <h4 className="font-bold text-sm text-white">{r.role}</h4>
                      <span className="text-xs font-bold text-emerald-400 font-mono px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">{r.matchTier || 'Demonstrated Mastery'}</span>
                    </div>
                    <p className="text-xs text-emerald-200/90 bg-emerald-950/20 p-2.5 rounded-lg border border-emerald-900/30">
                      <strong>Why Matched:</strong> {r.whyMatched}
                    </p>
                    <p className="text-xs text-slate-400">
                      <strong>Growth Requirement:</strong> {r.growthPath}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Tier 2 */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                🔵 Tier 2: High Growth Potential
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(sec7?.tier2_growthPotential || []).map((r, i) => (
                  <div key={i} className="p-4 rounded-xl bg-slate-900/90 border border-indigo-500/30 space-y-2">
                    <div className="flex justify-between items-center">
                      <h4 className="font-bold text-sm text-white">{r.role}</h4>
                      <span className="text-xs font-bold text-indigo-400 font-mono px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">{r.matchTier || 'High Growth Potential'}</span>
                    </div>
                    <p className="text-xs text-indigo-200/90 bg-indigo-950/20 p-2.5 rounded-lg border border-indigo-900/30">
                      <strong>Why Matched:</strong> {r.whyMatched}
                    </p>
                    <p className="text-xs text-slate-400">
                      <strong>Growth Requirement:</strong> {r.growthPath}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Tier 3 */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                🟡 Tier 3: Adjacent Exploration
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(sec7?.tier3_adjacentExploration || []).map((r, i) => (
                  <div key={i} className="p-4 rounded-xl bg-slate-900/90 border border-amber-500/30 space-y-2">
                    <div className="flex justify-between items-center">
                      <h4 className="font-bold text-sm text-white">{r.role}</h4>
                      <span className="text-xs font-bold text-amber-400 font-mono px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">{r.matchTier || 'Adjacent Exploration'}</span>
                    </div>
                    <p className="text-xs text-amber-200/90 bg-amber-950/20 p-2.5 rounded-lg border border-amber-900/30">
                      <strong>Why Matched:</strong> {r.whyMatched}
                    </p>
                    <p className="text-xs text-slate-400">
                      <strong>Growth Requirement:</strong> {r.growthPath}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 8: Role Neighborhood & Mobility Pathways */}
        <section className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Section 8 · Role Neighborhood & Mobility Graph
            </span>
            <h3 className="text-lg font-bold text-white mt-0.5">Occupational Capability Graph Neighbors</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Focal Role: {sec8?.focalRole}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {(sec8?.edges || []).map((edge, i) => (
              <div key={i} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-white">{edge.target_role}</span>
                  <span className="text-[10px] font-mono text-indigo-400">{edge.edge_type}</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  <span>Capability Overlap: </span>
                  <span className="text-emerald-400 font-semibold">{Math.round(edge.weight * 100)}%</span>
                </div>
                <div className="text-[11px] text-slate-300">
                  <span className="text-slate-500 block">Bridge Competency:</span>
                  {edge.bridge_competency}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 9: Strengths & Growth Areas */}
        <section className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Section 9 · Strengths & Targeted Growth Areas
            </span>
            <h3 className="text-lg font-bold text-white mt-0.5">High-ROI Development Opportunities</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            <div className="space-y-2">
              <span className="font-bold text-emerald-400 uppercase tracking-wider">Top 3 Distinctive Strengths</span>
              <ul className="space-y-2">
                {sec9.strengths.map((s, i) => (
                  <li key={i} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-200">
                    ✓ {s}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <span className="font-bold text-indigo-400 uppercase tracking-wider">Targeted Growth Areas</span>
              <ul className="space-y-2">
                {sec9.growthOpportunities.map((g, i) => (
                  <li key={i} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-200">
                    → {g}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* SECTION 10: 30 / 60 / 90 Day Development Plan */}
        <section className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
          <div>
            <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
              Section 10 · 30 / 60 / 90 Day Actionable Roadmap
            </span>
            <h3 className="text-lg font-bold text-white mt-0.5">Deliberate Practice Milestone Schedule</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="font-bold text-indigo-400 uppercase tracking-wider block">Days 1–30</span>
              <p className="text-slate-300 leading-relaxed">{sec10.days1_30}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="font-bold text-purple-400 uppercase tracking-wider block">Days 31–60</span>
              <p className="text-slate-300 leading-relaxed">{sec10.days31_60}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="font-bold text-emerald-400 uppercase tracking-wider block">Days 61–90</span>
              <p className="text-slate-300 leading-relaxed">{sec10.days61_90}</p>
            </div>
          </div>
        </section>

        {/* SECTION 11: Recommended Development Missions */}
        <section className="space-y-4">
          <div>
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
              Section 11 · Recommended Development Missions
            </span>
            <h3 className="text-xl font-bold text-white mt-0.5">20-Minute Deliberate Practice Simulations</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Launch targeted scenario missions to practice specific capabilities with interactive scaffolding.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sec11.map((m) => (
              <div key={m.missionId} className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono font-bold text-indigo-400">{m.missionId}</span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-800 text-slate-300">
                      ⏱️ {m.estimatedDuration}
                    </span>
                  </div>
                  <h4 className="font-bold text-base text-white mt-1">{m.title}</h4>
                  <p className="text-xs text-slate-400 mt-1">{m.description}</p>
                </div>

                <Link
                  to={`/missions/${m.missionId}`}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs text-center shadow transition-all block"
                >
                  Start Mission →
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 12: Employer Interpretation Guide & Verification */}
        <section className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Section 12 · Employer Interpretation Guide & Verification
            </span>
            <h3 className="text-lg font-bold text-white mt-0.5">Hiring Manager Decision Framework</h3>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-4 rounded-xl border border-slate-800">
            {sec12.guidanceForRecruiters}
          </p>

          <div className="space-y-2">
            <span className="text-xs font-bold text-white">Recommended Follow-up Interview Questions:</span>
            <ul className="space-y-2 text-xs text-slate-300">
              {sec12.interviewFollowups.map((q, i) => (
                <li key={i} className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  💬 {q}
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>Cryptographic Verification Link:</span>
            <span className="font-mono text-indigo-400">{sec12.credentialVerificationUrl}</span>
          </div>
        </section>
      </main>
    </div>
  )
}
