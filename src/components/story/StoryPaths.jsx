import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Building2 } from 'lucide-react'
import { ASSESSMENT_MINUTES, SCORE_VALIDITY_MONTHS } from '../../../server/lib/sharedConstants.js'

// ── Act IX — Two Paths ───────────────────────────────────────────────────────
// The story ends where the two buyers diverge: the candidate walks into the
// room; the institution brings the room to a cohort. Durations and validity
// come from the shared constants — the same numbers the scoring code enforces.

export default function StoryPaths({ onGetAssessed }) {
  const reduced = useReducedMotion()

  return (
    <section className="relative bg-[var(--color-paper)] py-24 sm:py-32" aria-label="Choose your path">
      <div className="max-w-6xl mx-auto px-6">
        <div className="max-w-2xl mb-12">
          <p className="font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--color-ink-muted)] mb-3">Two paths</p>
          <h2 className="font-serif text-3xl sm:text-5xl text-[var(--color-ink)] leading-tight">
            One room. Two doors in.
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {/* The candidate */}
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            className="group bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-lg)] p-8 flex flex-col"
          >
            <p className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--color-ink-muted)] mb-4">
              For candidates
            </p>
            <h3 className="font-serif text-2xl text-[var(--color-ink)] mb-3">
              Walk in with a claim. Walk out with evidence.
            </h3>
            <p className="font-sans text-sm text-[var(--color-ink-muted)] leading-relaxed mb-8">
              {ASSESSMENT_MINUTES} minutes, browser or the Prism app. A report where every
              number carries its moment, and a credential valid for {SCORE_VALIDITY_MONTHS} months.
            </p>
            <button
              onClick={onGetAssessed}
              className="mt-auto inline-flex items-center gap-2 w-fit px-5 py-3 rounded-[var(--radius-md)] bg-[var(--color-ink)] font-sans text-sm font-semibold text-[var(--color-paper)] hover:opacity-90 transition-opacity cursor-pointer"
            >
              Take the assessment
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </button>
          </motion.div>

          {/* The institution */}
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ delay: 0.1 }}
            className="room-dark group bg-[var(--color-room)] border border-[var(--color-room-line)] rounded-[var(--radius-lg)] p-8 flex flex-col"
          >
            <p className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--color-ink-muted)] mb-4">
              For institutions
            </p>
            <h3 className="font-serif text-2xl text-[var(--color-ink)] mb-3">
              See a cohort the way you wish transcripts worked.
            </h3>
            <p className="font-sans text-sm text-[var(--color-ink-muted)] leading-relaxed mb-8">
              Placement cells and teams run Prism on real cohorts — with the same
              glass-box reports, a study registry your DPO can read, and a pilot
              programme that starts small on purpose.
            </p>
            <a
              href="mailto:institutions@studaione.com?subject=Prism%20for%20our%20institution"
              className="mt-auto inline-flex items-center gap-2 w-fit px-5 py-3 rounded-[var(--radius-md)] border border-[var(--color-accent-bright)] font-sans text-sm font-semibold text-[var(--color-accent-bright)] hover:bg-[var(--color-accent-bright)]/10 transition-colors"
            >
              <Building2 size={15} aria-hidden="true" />
              Bring Prism to your institution
            </a>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
