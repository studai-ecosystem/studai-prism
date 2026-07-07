import { useRef } from 'react'
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion'

// ── Act IV — The Panel ───────────────────────────────────────────────────────
// "Scored by a panel, not a person." Five independent evaluator chips cast
// their reads as you scroll; the median locks in the middle; the outlier stays
// visible — disagreement is recorded, never hidden. SAMPLE numbers, labeled.

const VOTES = [3, 4, 4, 4, 2] // sample rubric levels, one deliberately divergent
const MEDIAN = 4

export default function StoryPanel() {
  const ref = useRef(null)
  const reduced = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })

  const chipIn = VOTES.map((_, i) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks -- fixed-length map, stable order
    useTransform(scrollYProgress, [0.12 + i * 0.05, 0.2 + i * 0.05], [0, 1]),
  )
  const votesIn = useTransform(scrollYProgress, [0.42, 0.52], [0, 1])
  const medianIn = useTransform(scrollYProgress, [0.55, 0.65], [0, 1])
  const medianScale = useTransform(scrollYProgress, [0.55, 0.65], [0.8, 1])
  const noteIn = useTransform(scrollYProgress, [0.66, 0.74], [0, 1])

  return (
    <section ref={ref} className="relative bg-[var(--color-surface)] border-y border-[var(--color-line)] py-24 sm:py-32" aria-label="Scored by a panel">
      <div className="max-w-6xl mx-auto px-6">
        <div className="max-w-2xl mb-14">
          <p className="font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--color-ink-muted)] mb-3">The scoring</p>
          <h2 className="font-serif text-3xl sm:text-5xl text-[var(--color-ink)] leading-tight mb-4">
            A panel of AI evaluators. Independent reads. The median wins.
          </h2>
          <p className="font-sans text-base text-[var(--color-ink-muted)] leading-relaxed">
            Every scored turn goes to multiple evaluators who read it separately — the
            order of what they see is even swapped to fight position bias. Their
            agreement is measured and shown on your report.
          </p>
        </div>

        {/* The vote stage */}
        <div className="max-w-3xl mx-auto">
          <div className="grid grid-cols-5 gap-2 sm:gap-4 mb-10">
            {VOTES.map((v, i) => (
              <motion.div
                key={i}
                style={reduced ? undefined : { opacity: chipIn[i] }}
                className={`flex flex-col items-center gap-2 rounded-[var(--radius-md)] border p-3 sm:p-4 ${
                  v !== MEDIAN && i === 4
                    ? 'border-[var(--color-reliability-moderate)] bg-[var(--color-warn-surface)]'
                    : 'border-[var(--color-line)] bg-[var(--color-paper)]'
                }`}
              >
                <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--color-ink-muted)]">
                  Read {i + 1}
                </span>
                <motion.span
                  style={reduced ? undefined : { opacity: votesIn }}
                  className="font-mono text-2xl sm:text-3xl tabular-nums text-[var(--color-ink)]"
                >
                  {v}
                </motion.span>
              </motion.div>
            ))}
          </div>

          <div className="flex flex-col items-center gap-3">
            <motion.div
              style={reduced ? undefined : { opacity: medianIn, scale: medianScale }}
              className="flex items-baseline gap-3 rounded-[var(--radius-md)] border border-[var(--color-accent)] bg-[var(--color-paper)] px-6 py-4"
            >
              <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--color-accent)]">median</span>
              <span className="font-mono text-4xl tabular-nums text-[var(--color-ink)]">{MEDIAN}</span>
              <span className="font-mono text-[11px] text-[var(--color-ink-muted)]">· sample turn</span>
            </motion.div>
            <motion.p
              style={reduced ? undefined : { opacity: noteIn }}
              className="font-sans text-sm text-[var(--color-ink-muted)] text-center max-w-md"
            >
              The divergent read stays in the record. Low agreement lowers the
              reliability label on your report — and can route it to a person.
            </motion.p>
          </div>
        </div>
      </div>
    </section>
  )
}
