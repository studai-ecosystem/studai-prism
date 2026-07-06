import { useRef, useEffect, useState } from 'react'
import { useInView, motion } from 'framer-motion'
import PrismLogo from './PrismLogo.jsx'

const dimensions = [
  { key: 'criticalThinking', label: 'Critical Thinking', score: 88 },
  { key: 'collaboration',    label: 'Collaboration',     score: 79 },
  { key: 'communication',    label: 'Communication',     score: 91 },
  { key: 'problemSolving',   label: 'Problem Solving',   score: 85 },
  { key: 'aiDigitalFluency', label: 'AI & Digital Fluency', score: 77 },
]

function Gauge({ score, max = 100 }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!inView) return
    let start = null
    const duration = 1100
    function step(ts) {
      if (!start) start = ts
      const p = Math.min((ts - start) / duration, 1)
      setProgress(1 - Math.pow(1 - p, 3))
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [inView])

  const W = 200
  const H = 120
  const cx = W / 2
  const cy = 110
  const r = 84
  const frac = Math.max(0, Math.min(score / max, 1))
  const animFrac = frac * progress

  function arc(fromT, toT) {
    const steps = 64
    let d = ''
    for (let i = 0; i <= steps; i++) {
      const t = fromT + (toT - fromT) * (i / steps)
      const theta = Math.PI - t * Math.PI
      const x = cx + r * Math.cos(theta)
      const y = cy - r * Math.sin(theta)
      d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2)
    }
    return d
  }

  return (
    <div ref={ref} className="relative mx-auto" style={{ width: W }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-[200px]" aria-label={`Overall score ${score} of ${max}`}>
        <defs>
          <linearGradient id="mockGaugeGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--color-accent)" />
            <stop offset="100%" stopColor="var(--color-accent-bright)" />
          </linearGradient>
        </defs>
        <path d={arc(0, 1)} fill="none" stroke="var(--color-paper)" strokeWidth={13} strokeLinecap="round" />
        {animFrac > 0 && (
          <path d={arc(0, animFrac)} fill="none" stroke="url(#mockGaugeGrad)" strokeWidth={13} strokeLinecap="round" />
        )}
      </svg>
      <div className="absolute inset-x-0 bottom-6 flex items-end justify-center">
        <span className="font-sans text-4xl font-bold text-[var(--color-ink)] tabular-nums leading-none">
          {Math.round(score * progress)}
        </span>
      </div>
      <div className="flex justify-between px-2 -mt-1">
        <span className="font-sans text-[10px] text-[var(--color-ink-muted)] tabular-nums">0</span>
        <span className="font-sans text-[10px] text-[var(--color-ink-muted)] tabular-nums">{max}</span>
      </div>
    </div>
  )
}

export default function ScoreMockup({ scores = {} }) {
  const dims = dimensions.map((d) => ({
    ...d,
    score: scores[d.label] ?? scores[d.key] ?? d.score,
  }))
  const overall = scores.overall ?? 84

  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full max-w-sm mx-auto rounded-2xl bg-white border border-[var(--color-line)] shadow-[0_8px_40px_rgba(201,168,76,0.15)] overflow-hidden"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-paper)]">
        <PrismLogo size={28} wordmarkColor="var(--color-ink)" subtitleColor="var(--color-ink-muted)" />
        <span className="font-sans text-[10px] font-semibold tracking-[0.18em] text-[var(--color-ink-muted)] uppercase">
          Official Score Report
        </span>
      </div>

      {/* Gauge */}
      <div className="px-5 pt-5 pb-2 text-center">
        <p className="font-sans text-[10px] font-semibold tracking-[0.2em] text-[var(--color-accent)] uppercase mb-1">Prism Score</p>
        <Gauge score={overall} max={100} />
        <p className="font-serif text-base text-[var(--color-ink)] mt-1">
          Strong Performer: <span className="text-[var(--color-accent)]">Band II</span>
        </p>
      </div>

      {/* Dimension subscores */}
      <div className="px-5 py-4 border-t border-[var(--color-paper)]">
        <div className="flex flex-col gap-2.5">
          {dims.map((d) => (
            <div key={d.label} className="flex items-center justify-between">
              <span className="font-sans text-xs text-[var(--color-ink-muted)]">{d.label}</span>
              <span className="font-sans text-sm font-bold text-[var(--color-ink)] tabular-nums">{d.score}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 bg-[var(--color-paper)] border-t border-[var(--color-paper)] text-center">
        <p className="font-sans text-[11px] text-[var(--color-ink-muted)]">Verified · Evidence-backed · Shareable</p>
      </div>
    </motion.div>
  )
}
