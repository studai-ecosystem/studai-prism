import { useRef } from 'react'
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion'

// ── Act V — The Thread ───────────────────────────────────────────────────────
// The signature, writ large: a viewport-tall evidence thread that draws itself
// from the claim down to the exact moment that earned it. SAMPLE-labeled.

export default function StoryThread() {
  const ref = useRef(null)
  const reduced = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })

  const draw = useTransform(scrollYProgress, [0.2, 0.6], [0, 1])
  const quoteIn = useTransform(scrollYProgress, [0.5, 0.62], [0, 1])
  const tickIn = useTransform(scrollYProgress, [0.62, 0.7], [0, 1])

  return (
    <section ref={ref} className="relative bg-[var(--color-paper)] py-24 sm:py-36 overflow-hidden" aria-label="The evidence thread">
      <div className="max-w-5xl mx-auto px-6">
        <div className="max-w-2xl mb-16">
          <p className="font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--color-ink-muted)] mb-3">The thread</p>
          <h2 className="font-serif text-3xl sm:text-5xl text-[var(--color-ink)] leading-tight">
            Every number stays tied to the moment that earned it.
          </h2>
        </div>

        <div className="relative">
          {/* The claim */}
          <div className="inline-flex items-baseline gap-3 bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-md)] px-5 py-3.5">
            <span className="font-sans text-sm font-semibold text-[var(--color-ink)]">Critical thinking</span>
            <span className="font-mono text-2xl tabular-nums text-[var(--color-ink)]">74</span>
            <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--color-ink-muted)]">sample</span>
          </div>

          {/* The thread — an SVG line that draws with scroll */}
          <div className="relative h-40 sm:h-56 ml-8" aria-hidden="true">
            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
              <motion.path
                d="M 2 0 L 2 62 Q 2 72 12 72 L 55 72 Q 65 72 65 82 L 65 100"
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="1.2"
                vectorEffect="non-scaling-stroke"
                style={reduced ? { pathLength: 1 } : { pathLength: draw }}
              />
            </svg>
          </div>

          {/* The source */}
          <motion.div
            style={reduced ? undefined : { opacity: quoteIn }}
            className="ml-8 sm:ml-32 max-w-xl bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6"
          >
            <p className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--color-accent)] mb-2">
              The moment · exchange 4 · sample
            </p>
            <p className="font-sans text-lg text-[var(--color-ink)] leading-relaxed">
              “Before we choose, what did the last cohort actually do at this step —
              do we have that number, or are we guessing?”
            </p>
            <motion.p
              style={reduced ? undefined : { opacity: tickIn }}
              className="mt-4 font-mono text-[11px] text-[var(--color-ink-muted)]"
            >
              ✓ quoted on the report · ✓ readable by anyone you share it with
            </motion.p>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
