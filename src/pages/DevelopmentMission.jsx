// src/pages/DevelopmentMission.jsx — 20-Minute Deliberate Practice Mission Player (Phase 9)
import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'

export default function DevelopmentMission() {
  const { missionId = 'MIS-MKT-EXP-01' } = useParams()
  const navigate = useNavigate()
  const [mission, setMission] = useState(null)
  const [loading, setLoading] = useState(true)
  const [timeLeft, setTimeLeft] = useState(1200) // 20 minutes in seconds
  const [hypothesis, setHypothesis] = useState('')
  const [isolatedVariable, setIsolatedVariable] = useState('CREATIVE_HOOK')
  const [sampleSize, setSampleSize] = useState(5000)
  const [budget, setBudget] = useState(25000)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    async function loadMission() {
      try {
        const res = await fetch(`/api/missions/${missionId}`)
        const data = await res.json()
        setMission(data.mission)
        setLoading(false)
      } catch (err) {
        console.error('Mission load failed', err)
        setLoading(false)
      }
    }
    loadMission()
  }, [missionId])

  useEffect(() => {
    if (timeLeft <= 0) return
    const timer = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000)
    return () => clearInterval(timer)
  }, [timeLeft])

  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60

  const handleSubmit = async (e) => {
    e?.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch(`/api/missions/${missionId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateInputs: {
            hypothesis,
            isolatedVariable,
            sampleSize,
            budgetAllocated: budget
          },
          artifactDeltas: [
            { type: 'A_B_TEST_DEPLOYMENT', variable: isolatedVariable, budget }
          ]
        })
      })
      const data = await res.json()
      setResult(data)
      setSubmitting(false)
    } catch (err) {
      alert('Failed to submit mission')
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold tracking-wide text-slate-400">Loading Development Mission...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 pb-20">
      {/* Top Bar */}
      <header className="border-b border-slate-800 bg-slate-900/90 sticky top-0 z-30 px-6 py-4">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                PRISM NEXT · 20-MINUTE DEVELOPMENT MISSION
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/20">
                {mission?.scaffolding_tier || 'GUIDED_PRACTICE'}
              </span>
            </div>
            <h1 className="text-base font-bold text-white mt-0.5">
              {mission?.title || 'Deliberate Practice Mission'}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="px-3.5 py-1.5 rounded-xl bg-slate-800 border border-slate-700 font-mono text-sm font-bold text-amber-400">
              ⏱️ {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </div>
            <Link
              to="/"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              Exit Mission
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {result ? (
          /* Mission Evaluation Outcome Card */
          <div className="p-8 rounded-2xl bg-slate-900 border border-emerald-500/40 shadow-2xl space-y-6 animate-in fade-in">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  Mission Evaluation Complete
                </span>
                <h2 className="text-2xl font-black text-white mt-1">
                  Rubric Level {result.levelAchieved} Achieved!
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Attempt ID: {result.attemptId} · Recorded in Behavioral Evidence Ledger
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {result.status}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-300 leading-relaxed">
              <span className="font-bold text-white block mb-1">Feedback from Expert Rater Model:</span>
              {result.feedback}
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-400">Observable Behaviors Logged:</span>
              <ul className="space-y-1.5 text-xs text-slate-300">
                {result.observableBehaviors.map((b, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> {b}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex gap-4 pt-4 border-t border-slate-800">
              <button
                onClick={() => setResult(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all"
              >
                Retry Mission
              </button>
              <button
                onClick={() => navigate(-1)}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow transition-all"
              >
                Return to Report
              </button>
            </div>
          </div>
        ) : (
          /* Mission Challenge & Workspace */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Briefing & Criteria */}
            <div className="lg:col-span-1 space-y-6">
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                  Mission Scenario
                </span>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {mission?.challenge_briefing?.scenario ||
                    'An active Meta ad set with ₹1,20,000 monthly spend has seen CTR fall from 1.8% to 0.7%. Marcus argues we must increase bids, but creative exhaustion is suspected.'}
                </p>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300">
                  <span className="font-bold text-amber-300 block mb-1">Your Objective:</span>
                  {mission?.challenge_briefing?.objective ||
                    'Formulate a precise test hypothesis, isolate one creative variable, set sample size, and allocate testing budget.'}
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  Level 4 Rubric Anchors
                </span>
                <ul className="text-xs text-slate-400 space-y-1.5 list-disc pl-4">
                  <li>Explicitly states direction and reasoning for expected lift</li>
                  <li>Isolates exactly ONE independent variable</li>
                  <li>Validates sample size for statistical power before deploying budget</li>
                </ul>
              </div>
            </div>

            {/* Right: Interactive Workspace Form */}
            <form onSubmit={handleSubmit} className="lg:col-span-2 p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
              <h2 className="text-lg font-bold text-white">Interactive Experiment Designer</h2>

              {/* Variable Isolation */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 block">
                  1. Select Isolated Independent Variable:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'CREATIVE_HOOK', label: 'First 3-Sec Video Hook' },
                    { id: 'AUDIENCE_EXPANSION', label: 'Lookalike Audience Tier' },
                    { id: 'OFFER_DISCOUNT', label: 'Offer / Promo Angle' }
                  ].map((v) => (
                    <button
                      type="button"
                      key={v.id}
                      onClick={() => setIsolatedVariable(v.id)}
                      className={`p-3 rounded-xl text-xs font-semibold text-center border transition-all ${
                        isolatedVariable === v.id
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hypothesis Formulation */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">
                  2. Formulate Testable Commercial Hypothesis:
                </label>
                <textarea
                  rows={4}
                  value={hypothesis}
                  onChange={(e) => setHypothesis(e.target.value)}
                  placeholder="If we replace the lifestyle product shot with an immediate 3-second dermatologist texture test in the hook, then CTR will increase by ≥35% because customers question ingredient authenticity..."
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              {/* Parameter Sliders */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span className="text-slate-300">Sample Size (Impressions)</span>
                    <span className="font-mono text-indigo-400">{sampleSize.toLocaleString()}</span>
                  </div>
                  <input
                    type="range"
                    min="1000"
                    max="20000"
                    step="500"
                    value={sampleSize}
                    onChange={(e) => setSampleSize(Number(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                  <p className="text-[11px] text-slate-500">Min 3,000 required for 80% power at 0.5% MDE</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span className="text-slate-300">Testing Budget Ceiling</span>
                    <span className="font-mono text-emerald-400">₹{budget.toLocaleString()}</span>
                  </div>
                  <input
                    type="range"
                    min="5000"
                    max="50000"
                    step="2500"
                    value={budget}
                    onChange={(e) => setBudget(Number(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                  <p className="text-[11px] text-slate-500">Capped test allocation with automated stop-loss</p>
                </div>
              </div>

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={submitting || !hypothesis.trim()}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg transition-all"
              >
                {submitting ? 'Submitting & Evaluating Deliberate Practice...' : 'Deploy Experiment & Submit Mission'}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  )
}
