import { motion, useReducedMotion } from 'framer-motion'
import { Gauge, Route, Repeat2 } from 'lucide-react'

// The loop in three beats, then the same loop at campus scale. Growth is only
// ever promised after a comparable reassessment, and practice is labelled as
// practice, so this section says nothing the product does not do.
const BEATS = [
  {
    Icon: Gauge,
    verb: 'Measure',
    text: 'Realistic workplace situations. Prism observes what you do and ties each score to the moment in the conversation that earned it.',
  },
  {
    Icon: Route,
    verb: 'Improve',
    text: 'Your report shows where to focus. Development missions are labelled as practice and may coach you; the formal assessment never does.',
  },
  {
    Icon: Repeat2,
    verb: 'Prove',
    text: 'Reassess under comparable conditions. Growth is shown only after a comparable reassessment, in a report you decide who sees.',
  },
]

export default function StoryLoop() {
  const reduced = useReducedMotion()
  return (
    <section id="improve" className="bg-prism-canvas py-20 md:py-28" aria-labelledby="loop-title">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-12 max-w-2xl">
          <p className="mb-3 font-mono text-xs uppercase tracking-widest text-prism-ink-subtle">From evidence to growth</p>
          <h2 id="loop-title" className="mb-4 text-3xl font-bold leading-tight tracking-tight text-prism-ink md:text-5xl">
            Measure. Improve. Prove.
          </h2>
          <p className="text-base leading-relaxed text-prism-ink-muted">
            A score is a starting point. Prism turns the evidence into a next step, and lets you come back to
            see whether it worked.
          </p>
        </div>

        <ol className="grid gap-4 md:grid-cols-3">
          {BEATS.map((b, i) => (
            <motion.li
              key={b.verb}
              initial={reduced ? false : { opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
              className="rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-surface p-6"
            >
              <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-brand-green-soft">
                <b.Icon size={18} aria-hidden="true" className="text-brand-green-ink" />
              </span>
              <h3 className="mb-2 text-lg font-semibold text-prism-ink">{b.verb}</h3>
              <p className="text-sm leading-relaxed text-prism-ink-muted">{b.text}</p>
            </motion.li>
          ))}
        </ol>

        <div className="mt-6 rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-subtle p-6">
          <p className="mb-1 font-mono text-xs uppercase tracking-widest text-prism-ink-subtle">On a campus</p>
          <p className="max-w-3xl text-sm leading-relaxed text-prism-ink">
            The same loop at cohort scale: where a cohort&rsquo;s capability evidence is thin, which development
            interventions to run, and what a comparable reassessment shows afterwards. Groups too small to
            protect individuals are never shown in aggregate reports.
          </p>
        </div>
      </div>
    </section>
  )
}