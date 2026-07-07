import { useRef } from 'react'
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion'

// ── Act II — The Problem ─────────────────────────────────────────────────────
// "Résumés say. Prism shows." A pinned viewport where the cliché résumé fades
// and strikes through while a real-feeling (SAMPLE-labeled) conversation
// fragment takes its place. Scroll is the only driver; reduced motion renders
// the finished state statically.

const RESUME_LINES = [
  'Excellent communication skills',
  'Strong team player',
  'Creative problem solver',
  'Works well under pressure',
]

export default function StoryProblem() {
  const ref = useRef(null)
  const reduced = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })

  const resumeOpacity = useTransform(scrollYProgress, [0.15, 0.45], [1, 0.28])
  const strike = useTransform(scrollYProgress, [0.18, 0.42], ['0%', '100%'])
  const convoOpacity = useTransform(scrollYProgress, [0.25, 0.5], [0.15, 1])
  const convoY = useTransform(scrollYProgress, [0.25, 0.5], [24, 0])

  return (
    <section ref={ref} className="relative bg-[var(--color-paper)] py-24 sm:py-32" aria-label="Résumés say. Prism shows.">
      <div className="max-w-6xl mx-auto px-6">
        <p className="font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--color-ink-muted)] mb-3">The problem</p>
        <h2 className="font-serif text-3xl sm:text-5xl text-[var(--color-ink)] leading-tight max-w-2xl mb-14">
          Résumés <em className="not-italic text-[var(--color-ink-muted)]">say</em>.
          {' '}Prism <em className="not-italic underline decoration-[var(--color-accent)] decoration-2 underline-offset-8">shows</em>.
        </h2>

        <div className="grid md:grid-cols-2 gap-6 md:gap-10 items-start">
          {/* The claim without evidence */}
          <motion.div
            style={reduced ? undefined : { opacity: resumeOpacity }}
            className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-lg)] p-7"
          >
            <p className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--color-ink-muted)] mb-5">
              Any résumé, anywhere
            </p>
            <ul className="flex flex-col gap-4">
              {RESUME_LINES.map((line) => (
                <li key={line} className="relative font-sans text-lg text-[var(--color-ink-muted)] w-fit">
                  {line}
                  <motion.span
                    aria-hidden="true"
                    style={reduced ? { width: '100%' } : { width: strike }}
                    className="absolute left-0 top-1/2 h-[1.5px] bg-[var(--color-ink-muted)]"
                  />
                </li>
              ))}
            </ul>
            <p className="mt-6 font-sans text-sm text-[var(--color-ink-muted)]">
              Words anyone can write. Nothing behind them to check.
            </p>
          </motion.div>

          {/* The behaviour with provenance */}
          <motion.div
            style={reduced ? undefined : { opacity: convoOpacity, y: convoY }}
            className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-lg)] p-7"
          >
            <p className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--color-accent)] mb-5">
              A Prism conversation · sample
            </p>
            <div className="pl-4 border-l-2 border-[var(--color-accent)]">
              <p className="font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--color-accent)] mb-1.5">Candidate</p>
              <p className="font-sans text-lg text-[var(--color-ink)] leading-relaxed">
                “Before I choose, I need to know which of the two features the client's
                revenue actually depends on — has anyone asked them that directly?”
              </p>
            </div>
            <p className="mt-6 font-sans text-sm text-[var(--color-ink-muted)]">
              A specific moment, in the candidate's own words — kept, quoted, and tied to
              the score it earned.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
