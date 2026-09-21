// src/pages/ExploreMode.jsx — Mode A: Career Discovery & Role Affinity Engine
import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import PrismLogo from '../components/ui/PrismLogo.jsx'

const RIASEC_DIMENSIONS = [
  {
    key: 'E',
    name: 'Enterprising',
    icon: '🚀',
    color: 'emerald',
    description: 'Leading, persuading, commercial decision-making, and taking calculated risks.'
  },
  {
    key: 'I',
    name: 'Investigative',
    icon: '🔬',
    color: 'indigo',
    description: 'Analyzing data, discovering root causes, and testing empirical hypotheses.'
  },
  {
    key: 'A',
    name: 'Artistic',
    icon: '🎨',
    color: 'purple',
    description: 'Positioning, creative storytelling, design, and non-conventional ideation.'
  },
  {
    key: 'S',
    name: 'Social',
    icon: '🤝',
    color: 'blue',
    description: 'Mentoring, collaborating, customer advocacy, and stakeholder de-escalation.'
  },
  {
    key: 'C',
    name: 'Conventional',
    icon: '📋',
    color: 'cyan',
    description: 'Systematic workflows, budget reconciliation, precision metrics, and compliance.'
  },
  {
    key: 'R',
    name: 'Realistic',
    icon: '⚙️',
    color: 'amber',
    description: 'Hands-on execution, practical tooling, infrastructure, and technical implementation.'
  }
]

const WORK_PREFERENCES = [
  { id: 'pref_analytics', label: 'Auditing CAC, ROAS & Performance Dashboards' },
  { id: 'pref_customer', label: 'Synthesizing Qualitative Churn & Customer Feedback' },
  { id: 'pref_budget', label: 'Reallocating Budgets Under Financial Constraints' },
  { id: 'pref_experiments', label: 'Designing A/B Split Tests & Scientific Hypotheses' },
  { id: 'pref_stakeholders', label: 'Aligning Conflicting Stakeholder Opinions' },
  { id: 'pref_workflows', label: 'Standardizing Operations & Cross-Team SLAs' }
]

export default function ExploreMode() {
  const navigate = useNavigate()
  const [riasecScores, setRiasecScores] = useState({
    E: 0.6,
    I: 0.5,
    A: 0.4,
    S: 0.3,
    C: 0.3,
    R: 0.2
  })
  const [selectedPrefs, setSelectedPrefs] = useState(['pref_analytics', 'pref_budget', 'pref_customer'])
  const [recommendations, setRecommendations] = useState([])
  const [loading, setLoading] = useState(false)
  const [evaluated, setEvaluated] = useState(false)

  const handleSliderChange = (key, val) => {
    setRiasecScores(prev => ({
      ...prev,
      [key]: parseFloat(val)
    }))
  }

  const togglePref = (id) => {
    setSelectedPrefs(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    )
  }

  const runAffinityEvaluation = async () => {
    setLoading(true)
    try {
      // Normalize vector
      const total = Object.values(riasecScores).reduce((a, b) => a + b, 0) || 1
      const normalized = {}
      for (const [k, v] of Object.entries(riasecScores)) {
        normalized[k] = +(v / total).toFixed(3)
      }

      const res = await fetch('/api/job-families/explore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateInterests: normalized
        })
      })
      const data = await res.json()
      if (data.recommendations) {
        setRecommendations(data.recommendations)
      }
    } catch (err) {
      console.error('Affinity evaluation failed', err)
    } finally {
      setLoading(false)
      setEvaluated(true)
    }
  }

  useEffect(() => {
    runAffinityEvaluation()
  }, [])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Navigation Header */}
      <header className="h-16 px-6 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2">
            <PrismLogo size={28} />
          </Link>
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20">
            Mode A · Explore Mode
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/register"
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md"
          >
            Start Assessment →
          </Link>
        </div>
      </header>

      {/* Hero Explainer */}
      <section className="px-6 pt-10 pb-8 max-w-5xl mx-auto text-center space-y-4">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
          Discover Your Occupational Affinity
        </h1>
        <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Prism Next replaces deceptive percentages with deterministic interest vector matching and authentic simulation evidence. Calibrate your interests below to discover role families and where your capabilities match.
        </p>
      </section>

      {/* Main Interactive Grid */}
      <main className="max-w-6xl mx-auto px-6 pb-20 w-full grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">
        {/* Left Column: RIASEC & Preferences Intake (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-6">
            <div className="border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Holland RIASEC Profile</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Adjust your natural affinities across the 6 core vocational dimensions:
              </p>
            </div>

            <div className="space-y-4">
              {RIASEC_DIMENSIONS.map(d => (
                <div key={d.key} className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                      <span>{d.icon}</span>
                      <span>{d.name}</span>
                    </span>
                    <span className="font-mono text-indigo-400 font-bold">
                      {Math.round(riasecScores[d.key] * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={riasecScores[d.key]}
                    onChange={(e) => handleSliderChange(d.key, e.target.value)}
                    className="w-full accent-indigo-500 bg-slate-800 rounded-lg cursor-pointer h-1.5"
                  />
                  <p className="text-[11px] text-slate-500">{d.description}</p>
                </div>
              ))}
            </div>

            {/* Work Preferences Checklist */}
            <div className="pt-4 border-t border-slate-800 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Work Activity Preferences
              </h3>
              <div className="space-y-2">
                {WORK_PREFERENCES.map(pref => (
                  <button
                    key={pref.id}
                    type="button"
                    onClick={() => togglePref(pref.id)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-all border flex items-center justify-between ${
                      selectedPrefs.includes(pref.id)
                        ? 'bg-indigo-950/50 border-indigo-500/50 text-indigo-200 font-semibold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span>{pref.label}</span>
                    <span className={`w-4 h-4 rounded-md flex items-center justify-center text-[10px] ${
                      selectedPrefs.includes(pref.id) ? 'bg-indigo-600 text-white' : 'border border-slate-700'
                    }`}>
                      {selectedPrefs.includes(pref.id) ? '✓' : ''}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={runAffinityEvaluation}
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-2"
            >
              {loading ? 'Evaluating Vectors...' : 'Recalibrate Role Recommendations ⚡'}
            </button>
          </div>
        </div>

        {/* Right Column: Recommended Role Families & Explainability (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Deterministic Guidance
              </span>
              <h2 className="text-xl font-black text-white mt-0.5">
                Recommended Role Families
              </h2>
            </div>
            <span className="text-xs text-slate-400 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
              {recommendations.length} Families Evaluated
            </span>
          </div>

          <div className="space-y-4">
            {recommendations.map((rec, index) => {
              const isHigh = rec.exploration_tier === 'HIGH_EXPLORATION_RELEVANCE'
              const isMod = rec.exploration_tier === 'MODERATE_EXPLORATION_RELEVANCE'
              const tierBadge = isHigh ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  🟢 Tier 1: Strong Affinity
                </span>
              ) : isMod ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  🔵 Tier 2: High Growth Potential
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  🟡 Tier 3: Adjacent Pathway
                </span>
              )

              return (
                <div
                  key={rec.job_family_id || index}
                  className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md space-y-4 hover:border-slate-700 transition-all"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                    <div>
                      <span className="text-[11px] font-mono text-slate-500 uppercase">
                        {rec.job_family_id} · {rec.track}
                      </span>
                      <h3 className="text-lg font-bold text-white mt-0.5">{rec.title}</h3>
                    </div>
                    {tierBadge}
                  </div>

                  {/* Why this role appeared */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-slate-300 block">
                      💡 Why this role appeared:
                    </span>
                    <div className="space-y-1">
                      {rec.why_this_role_appeared && rec.why_this_role_appeared.length > 0 ? (
                        rec.why_this_role_appeared.map((why, i) => (
                          <div key={i} className="text-xs text-slate-400 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                            {why.statement}
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-slate-400 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                          Strong alignment between your stated enterprising/analytical preferences and the primary tasks of this role.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* What remains unknown */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-amber-400/90 block">
                      ❓ Key unknowns (requires simulation evidence):
                    </span>
                    <div className="text-xs text-slate-400 bg-amber-950/20 border border-amber-900/30 p-2.5 rounded-lg">
                      {rec.what_remains_unknown && rec.what_remains_unknown.length > 0 ? (
                        <span>Needs verification of practical performance on {rec.what_remains_unknown.map(u => u.name || u.capability_id).join(', ')}.</span>
                      ) : (
                        <span>Requires direct simulation telemetry to calibrate real-time judgment under pressure.</span>
                      )}
                    </div>
                  </div>

                  {/* Next Step Action CTAs */}
                  <div className="pt-2 flex flex-wrap items-center gap-3">
                    {rec.suggested_next_step && (
                      <Link
                        to={`/missions/${rec.suggested_next_step.mission_id}`}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow"
                      >
                        ⚡ Practice 20-Min Mission ({rec.suggested_next_step.title})
                      </Link>
                    )}
                    <button
                      onClick={() => navigate('/briefing')}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-all border border-slate-700"
                    >
                      Enter Full Simulation Workspace →
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
