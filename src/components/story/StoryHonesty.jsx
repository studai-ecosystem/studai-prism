import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

// ── Act VIII — What we don't claim yet ───────────────────────────────────────
// The twist that IS the pitch: instead of inventing validation, Prism
// preregistered its studies — hypotheses, thresholds and analysis written
// down before the data exists. The adversarial benchmark card renders its
// status LIVE from the public registry endpoint; the day it has a result,
// this page changes on its own.

const PREREGISTERED = [
  { key: 'steering_ab', title: 'Does adaptive steering raise the quality of evidence per conversation?' },
  { key: 'human_llm_agreement', title: 'Do the AI panels agree with trained human raters — dimension by dimension?' },
  { key: 'test_retest', title: 'Is the score stable when the same person takes it twice?' },
]

export default function StoryHonesty() {
  const reduced = useReducedMotion()
  const [bench, setBench] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/evidence/adversarial')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setBench(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const cards = [
    ...PREREGISTERED.map((s) => ({ ...s, status: 'preregistered', live: false })),
    {
      key: 'adversarial_benchmark',
      title: bench?.protocol?.hypothesis || 'Can coached, LLM-assisted candidates be told apart from honest ones?',
      status: bench?.status || 'preregistered — not yet run',
      live: Boolean(bench),
    },
  ]

  return (
    <section className="relative bg-[var(--color-surface)] border-y border-[var(--color-line)] py-24 sm:py-32" aria-label="What we do not claim yet">
      <div className="max-w-6xl mx-auto px-6">
        <div className="max-w-2xl mb-12">
          <p className="font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--color-ink-muted)] mb-3">The honesty</p>
          <h2 className="font-serif text-3xl sm:text-5xl text-[var(--color-ink)] leading-tight mb-4">
            What we don't claim. Yet.
          </h2>
          <p className="font-sans text-base text-[var(--color-ink-muted)] leading-relaxed">
            Assessment companies usually claim first and validate later — if ever.
            We preregistered instead. Nothing on this site states a validation result
            that the study registry doesn't hold; the benchmark card below reads its
            status straight from that registry.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {cards.map((s, i) => (
            <motion.div
              key={s.key}
              initial={reduced ? false : { opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ delay: (i % 2) * 0.08 }}
              className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-5"
            >
              <div className="flex items-center justify-between gap-3 mb-2.5">
                <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--color-ink-muted)]">
                  {s.key}
                </span>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded-[var(--radius-full)] border border-[var(--color-reliability-moderate)] text-[var(--color-reliability-moderate)]">
                  {s.status}{s.live && ' · live'}
                </span>
              </div>
              <p className="font-sans text-sm text-[var(--color-ink)] leading-relaxed">{s.title}</p>
            </motion.div>
          ))}
        </div>

        <p className="mt-8 font-sans text-sm text-[var(--color-ink-muted)] max-w-2xl">
          Results publish here either way they come out. Red-team researchers are
          invited under the preregistered protocol — responsible-disclosure contact:{' '}
          <a href="mailto:security@studai.one" className="text-[var(--color-accent)] underline underline-offset-4">
            security@studai.one
          </a>
        </p>
      </div>
    </section>
  )
}
