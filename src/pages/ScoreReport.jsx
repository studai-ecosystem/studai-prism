import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { motion, useMotionValue, useSpring, useInView } from 'framer-motion'
import { Check, Linkedin, Share2, RotateCcw, AlertTriangle } from 'lucide-react'

const DIMENSION_LABELS = {
  criticalThinking: 'Critical Thinking',
  collaboration:    'Collaboration',
  communication:    'Communication',
  problemSolving:   'Problem Solving',
  aiDigitalFluency: 'AI & Digital Fluency',
}

const DIMENSION_KEYS = Object.keys(DIMENSION_LABELS)

// ── Radar / Spider chart ──────────────────────────────────────────────────────
const CX = 150
const CY = 150
const R  = 110 // max radius

function angleFor(i) {
  // 5 axes, first point at top (-90°)
  return (-Math.PI / 2) + (i * 2 * Math.PI) / 5
}

function point(r, i) {
  const a = angleFor(i)
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) }
}

function toPolygon(pts) {
  return pts.map((p) => `${p.x},${p.y}`).join(' ')
}

function RadarChart({ scores }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true })
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!inView) return
    let start = null
    const duration = 900
    function step(ts) {
      if (!start) start = ts
      const p = Math.min((ts - start) / duration, 1)
      // ease-out cubic
      setProgress(1 - Math.pow(1 - p, 3))
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [inView])

  const gridLevels = [0.33, 0.66, 1]
  const scorePts = DIMENSION_KEYS.map((k, i) => {
    const pct = ((scores[k] ?? 0) / 100) * progress
    return point(pct * R, i)
  })
  const gridPts = (frac) => DIMENSION_KEYS.map((_, i) => point(frac * R, i))

  // Label positions — push outward for readability
  const labelPts = DIMENSION_KEYS.map((_, i) => {
    const a = angleFor(i)
    const r = R + 26
    return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a), angle: a }
  })

  const labelText = [
    'Critical\nThinking',
    'Collaboration',
    'Communication',
    'Problem\nSolving',
    'AI & Digital\nFluency',
  ]

  return (
    <div ref={ref} className="flex items-center justify-center">
      <svg viewBox="0 0 300 300" className="w-full max-w-[280px]" aria-label="Skill radar chart">
        {/* Grid rings */}
        {gridLevels.map((frac, gi) => (
          <polygon
            key={gi}
            points={toPolygon(gridPts(frac))}
            fill="none"
            stroke="#E0E0E8"
            strokeWidth={1}
          />
        ))}

        {/* Axis spokes */}
        {DIMENSION_KEYS.map((_, i) => {
          const p = point(R, i)
          return (
            <line
              key={i}
              x1={CX} y1={CY}
              x2={p.x} y2={p.y}
              stroke="#E0E0E8"
              strokeWidth={1}
            />
          )
        })}

        {/* Score polygon */}
        <polygon
          points={toPolygon(scorePts)}
          fill="rgba(201,168,76,0.18)"
          stroke="#C9A84C"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {/* Score dots */}
        {scorePts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={4} fill="#C9A84C" />
        ))}

        {/* Labels */}
        {labelPts.map((lp, i) => {
          const lines = labelText[i].split('\n')
          const anchor = lp.x < CX - 5 ? 'end' : lp.x > CX + 5 ? 'start' : 'middle'
          return (
            <text
              key={i}
              x={lp.x}
              y={lp.y - (lines.length - 1) * 6}
              textAnchor={anchor}
              dominantBaseline="middle"
              fontSize={9.5}
              fontFamily="sans-serif"
              fill="#64687A"
            >
              {lines.map((line, li) => (
                <tspan key={li} x={lp.x} dy={li === 0 ? 0 : 13}>{line}</tspan>
              ))}
            </text>
          )
        })}

        {/* Score values at dots */}
        {scorePts.map((p, i) => {
          const raw = scores[DIMENSION_KEYS[i]] ?? 0
          const a = angleFor(i)
          const offset = 14
          return (
            <text
              key={i}
              x={p.x + offset * Math.cos(a)}
              y={p.y + offset * Math.sin(a)}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={9}
              fontFamily="sans-serif"
              fontWeight="600"
              fill="#C9A84C"
            >
              {Math.round(raw * progress)}
            </text>
          )
        })}
      </svg>
    </div>
  )
}

function AnimatedScore({ target }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })
  const motionVal = useMotionValue(0)
  const spring = useSpring(motionVal, { stiffness: 50, damping: 20 })
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (isInView) motionVal.set(target)
  }, [isInView, target, motionVal])

  useEffect(() => {
    const unsub = spring.on('change', (v) => setDisplay(Math.round(v)))
    return unsub
  }, [spring])

  return <span ref={ref}>{display}</span>
}

function ScoreBar({ label, score, isInView }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="font-sans text-sm text-[#8A8FA0]">{label}</span>
        <span className="font-sans text-sm font-semibold text-[#F0EDE6] tabular-nums">{score}</span>
      </div>
      <div className="h-2 rounded-full bg-[#1A1F2E] overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-[#C9A84C] to-[#E8C96A]"
          initial={{ width: 0 }}
          animate={isInView ? { width: `${score}%` } : {}}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
        />
      </div>
    </div>
  )
}

export default function ScoreReport() {
  const location = useLocation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const sessionId = params.get('session')

  const report = location.state?.report
  const barsRef = useRef(null)
  const barsInView = useInView(barsRef, { once: true })

  // If arrived without report state (e.g. direct URL), show error
  if (!report) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-6 p-6 text-center">
        <AlertTriangle size={40} className="text-[#E05252]" />
        <h1 className="font-serif text-3xl text-[#1A1A2E]">Score not found</h1>
        <p className="font-sans text-[#64687A] max-w-sm">
          This report link has expired or was accessed directly. Please complete an assessment first.
        </p>
        <button
          onClick={() => navigate('/')}
          className="font-sans text-sm text-[#C9A84C] underline"
        >
          Back to home
        </button>
      </div>
    )
  }

  const { scores, feedback, highlights, growthAreas } = report

  const shareText = `I just got my Prism Score: ${scores.overall}/100 on the AI Skills Assessment by StudAI One. Check it out:`
  const shareUrl = `https://prism.studaione.com/verify/${sessionId}`

  const handleLinkedInShare = () => {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}&summary=${encodeURIComponent(shareText)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="min-h-screen bg-white py-16 px-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="text-center"
        >
          <span className="inline-block font-sans text-xs font-semibold tracking-[0.22em] text-[#C9A84C] uppercase mb-4">
            Assessment Complete
          </span>
          <h1 className="font-serif text-5xl text-[#1A1A2E] mb-2">Your Prism Score</h1>
          <p className="font-sans text-[#64687A]">Certified · Verified · Valid for 18 months</p>
        </motion.div>

        {/* Score card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="relative rounded-2xl bg-white border border-[#C9A84C]/40 shadow-[0_8px_60px_rgba(201,168,76,0.12)] p-10 text-center"
        >
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#C9A84C]/5 to-transparent pointer-events-none" />

          <p className="font-sans text-xs font-semibold tracking-[0.2em] text-[#C9A84C] uppercase mb-2">
            Overall Prism Score
          </p>
          <div className="flex items-end justify-center gap-2 mb-4">
            <span className="font-sans text-8xl font-bold text-[#1A1A2E] tabular-nums leading-none">
              <AnimatedScore target={scores.overall} />
            </span>
            <span className="font-sans text-3xl text-[#64687A] mb-3">/100</span>
          </div>

          <p className="font-sans text-sm text-[#64687A] max-w-md mx-auto leading-relaxed">
            {feedback.summary}
          </p>
        </motion.div>

        {/* Radar chart */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.28 }}
          className="rounded-2xl bg-white border border-[#E0E0E8] p-8"
        >
          <h2 className="font-sans font-semibold text-[#1A1A2E] text-base mb-6 text-center">
            Skill Shape
          </h2>
          <RadarChart scores={scores} />
        </motion.div>

        {/* Dimension bars */}
        <motion.div
          ref={barsRef}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="rounded-2xl bg-white border border-[#E0E0E8] p-8 flex flex-col gap-5"
        >
          <h2 className="font-sans font-semibold text-[#1A1A2E] text-base mb-1">
            Dimension Breakdown
          </h2>
          {Object.entries(DIMENSION_LABELS).map(([key, label]) => (
            <div key={key} className="flex flex-col gap-1.5">
              <ScoreBar label={label} score={scores[key] ?? 0} isInView={barsInView} />
              {feedback[key] && (
                <p className="font-sans text-xs text-[#64687A] leading-relaxed">
                  {feedback[key]}
                </p>
              )}
              {report.evidence?.[key] && (
                <div className="mt-1 px-3 py-2 rounded-lg bg-[#F5F5FA] border-l-2 border-[#C9A84C]/50">
                  <p className="font-sans text-[11px] text-[#64687A] leading-relaxed">
                    <span className="font-semibold text-[#C9A84C]">Evidence: </span>
                    {report.evidence[key]}
                  </p>
                </div>
              )}
            </div>
          ))}
        </motion.div>

        {/* Highlights & Growth */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          <div className="rounded-2xl bg-white border border-[#E0E0E8] p-6">
            <h2 className="font-sans font-semibold text-[#1A1A2E] text-sm mb-4">Strengths</h2>
            <ul className="flex flex-col gap-3">
              {highlights.map((h, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <div className="mt-0.5 flex items-center justify-center w-4 h-4 rounded-full bg-[#3CB97A]/20 shrink-0">
                    <Check size={10} className="text-[#3CB97A]" />
                  </div>
                  <span className="font-sans text-sm text-[#1A1A2E]/80">{h}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl bg-white border border-[#E0E0E8] p-6">
            <h2 className="font-sans font-semibold text-[#1A1A2E] text-sm mb-4">Growth Areas</h2>
            <ul className="flex flex-col gap-3">
              {growthAreas.map((g, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <div className="mt-0.5 w-4 h-4 rounded-full border border-[#C9A84C]/40 shrink-0" />
                  <span className="font-sans text-sm text-[#1A1A2E]/80">{g}</span>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.65 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <button
            onClick={handleLinkedInShare}
            className="flex items-center gap-2 px-6 py-3 rounded-lg shimmer-btn font-sans font-semibold text-sm text-[#1A1A2E] cursor-pointer"
          >
            <Linkedin size={16} />
            Share on LinkedIn
          </button>

          <button
            onClick={() => navigator.clipboard.writeText(shareUrl).then(() => alert('Link copied!'))}
            className="flex items-center gap-2 px-6 py-3 rounded-lg border border-[#E0E0E8] font-sans font-semibold text-sm text-[#1A1A2E] hover:border-[#C9A84C]/40 transition-colors cursor-pointer"
          >
            <Share2 size={16} />
            Copy verification link
          </button>

          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-6 py-3 rounded-lg font-sans text-sm text-[#64687A] hover:text-[#1A1A2E] transition-colors cursor-pointer"
          >
            <RotateCcw size={14} />
            Back to home
          </button>
        </motion.div>

        {/* Footer note */}
        <p className="text-center font-sans text-xs text-[#64687A]">
          Verification ID: {sessionId} · Issued by Prism, Studai Edutech Private Limited
        </p>
      </div>
    </div>
  )
}
