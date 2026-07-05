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
            <stop offset="0%" stopColor="#C9A84C" />
            <stop offset="100%" stopColor="#E8C96A" />
          </linearGradient>
        </defs>
        <path d={arc(0, 1)} fill="none" stroke="#EEEEF4" strokeWidth={13} strokeLinecap="round" />
        {animFrac > 0 && (
          <path d={arc(0, animFrac)} fill="none" stroke="url(#mockGaugeGrad)" strokeWidth={13} strokeLinecap="round" />
        )}
      </svg>
      <div className="absolute inset-x-0 bottom-6 flex items-end justify-center">
        <span className="font-sans text-4xl font-bold text-[#1A1A2E] tabular-nums leading-none">
          {Math.round(score * progress)}
        </span>
      </div>
      <div className="flex justify-between px-2 -mt-1">
        <span className="font-sans text-[10px] text-[#8A8FA0] tabular-nums">0</span>
        <span className="font-sans text-[10px] text-[#8A8FA0] tabular-nums">{max}</span>
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
      className="relative w-full max-w-sm mx-auto rounded-2xl bg-white border border-[#E0E0E8] shadow-[0_8px_40px_rgba(201,168,76,0.15)] overflow-hidden"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#EEEEF4]">
        <PrismLogo size={28} wordmarkColor="#0A0D14" subtitleColor="#8A8FA0" />
        <span className="font-sans text-[10px] font-semibold tracking-[0.18em] text-[#8A8FA0] uppercase">
          Official Score Report
        </span>
      </div>

      {/* Gauge */}
      <div className="px-5 pt-5 pb-2 text-center">
        <p className="font-sans text-[10px] font-semibold tracking-[0.2em] text-[#C9A84C] uppercase mb-1">Prism Score</p>
        <Gauge score={overall} max={100} />
        <p className="font-serif text-base text-[#1A1A2E] mt-1">
          Strong Performer: <span className="text-[#C9A84C]">Band II</span>
        </p>
      </div>

      {/* Dimension subscores */}
      <div className="px-5 py-4 border-t border-[#EEEEF4]">
        <div className="flex flex-col gap-2.5">
          {dims.map((d) => (
            <div key={d.label} className="flex items-center justify-between">
              <span className="font-sans text-xs text-[#64687A]">{d.label}</span>
              <span className="font-sans text-sm font-bold text-[#1A1A2E] tabular-nums">{d.score}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 bg-[#FAFAFC] border-t border-[#EEEEF4] text-center">
        <p className="font-sans text-[11px] text-[#64687A]">Verified · Evidence-backed · Shareable</p>
      </div>
    </motion.div>
  )
}
