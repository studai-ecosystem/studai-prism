import { useRef, useEffect, useState } from 'react'
import { useInView, useMotionValue, useSpring, motion } from 'framer-motion'
import { Linkedin } from 'lucide-react'

const dimensions = [
  { label: 'Critical Thinking', score: 88 },
  { label: 'Collaboration',     score: 79 },
  { label: 'Communication',     score: 91 },
  { label: 'Problem Solving',   score: 85 },
  { label: 'AI & Digital Fluency', score: 77 },
]

function AnimatedNumber({ target }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })
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

export default function ScoreMockup({ scores = {} }) {
  const dims = dimensions.map((d) => ({
    ...d,
    score: scores[d.label] ?? d.score,
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
      className="relative w-full max-w-sm mx-auto rounded-2xl bg-white border border-[#C9A84C]/30 shadow-[0_8px_40px_rgba(201,168,76,0.15)] p-8 flex flex-col gap-6"
    >
      {/* Glow */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#C9A84C]/5 to-transparent pointer-events-none" />

      {/* Score */}
      <div className="text-center">
        <p className="font-sans text-xs font-semibold tracking-[0.2em] text-[#C9A84C] uppercase mb-2">Prism Score</p>
        <div className="flex items-end justify-center gap-1">
          <span className="font-sans text-7xl font-bold text-[#1A1A2E] tabular-nums leading-none">>
            <AnimatedNumber target={overall} />
          </span>
          <span className="font-sans text-2xl text-[#64687A] mb-2 tabular-nums">/100</span>
        </div>
      </div>

      {/* Dimension bars */}
      <div className="flex flex-col gap-3">
        {dims.map((d) => (
          <div key={d.label}>
            <div className="flex justify-between items-center mb-1">
              <span className="font-sans text-xs text-[#64687A]">{d.label}</span>
              <span className="font-sans text-xs font-semibold text-[#1A1A2E] tabular-nums">{d.score}</span>
            </div>
            <div className="h-1.5 rounded-full bg-[#EEEEF4] overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-[#C9A84C] to-[#E8C96A]"
                initial={{ width: 0 }}
                animate={isInView ? { width: `${d.score}%` } : {}}
                transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-[#E0E0E8]">
        <p className="font-sans text-xs text-[#64687A]">Certified · Verified · Shareable</p>
        <a
          href="https://linkedin.com"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Share on LinkedIn"
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#EEEEF4] text-[#64687A] hover:text-[#C9A84C] transition-colors"
        >
          <Linkedin size={14} />
        </a>
      </div>
    </motion.div>
  )
}
