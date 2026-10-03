// Homepage hero. The thesis is the glass box: the first thing a visitor sees is
// a clearly labelled sample of the evidence thread, and two doors in (a person
// who wants to be assessed, an institution that wants capability intelligence).
// Statistics come only from useClaims(); with an empty registry the hero shows
// the standing claim, never a number.

import { ArrowRight, ShieldCheck, ChevronDown } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import '../design/tokens.css'
import { EvidenceThread, EvidenceTick, evidenceThreadStyles } from './ui/EvidenceThread.jsx'
import { useClaims } from './ui/measurement.jsx'
import { Button, LinkButton } from './ui/Button.jsx'

// The sample builds itself once (label, claim and thread, then the ticks).
// Reduced motion renders everything at once.
const cardStagger = { hidden: {}, show: { transition: { staggerChildren: 0.18, delayChildren: 0.2 } } }
const pieceIn = { hidden: { y: 8 }, show: { y: 0, transition: { duration: 0.4 } } }

export default function HeroThesis({ onGetAssessed, onSeeHow }) {
  const claims = useClaims()
  const reduced = useReducedMotion()
  const assessed = claims?.stats?.assessedRealSessions

  return (
    <section aria-label="Prism: work-readiness and capability intelligence" className="border-b border-prism-border bg-prism-canvas text-prism-ink">
      <style>{evidenceThreadStyles}</style>
      <div className="mx-auto max-w-6xl px-6 pb-12 pt-16 md:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="mb-3 font-mono text-xs uppercase tracking-widest text-brand-green-ink">
              Work-readiness and capability intelligence
            </p>
            <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-5xl">
              Understand how you work.
              <br />
              Practise what <em className="not-italic text-brand-green-ink">matters next</em>.
            </h1>
            <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-prism-ink-muted">
              Realistic workplace situations, the actual evidence of what you did, one useful next
              behaviour and short practice to try it. Prism ties every conclusion to the moment that
              earned it and says so when the evidence is not there.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton size="lg" variant="primary" to="/try">
                Try a short situation <ArrowRight size={16} aria-hidden="true" />
              </LinkButton>
              <Button size="lg" variant="secondary" onClick={onSeeHow}>
                See how Prism works
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <button
                type="button"
                onClick={onGetAssessed}
                className="inline-flex min-h-6 items-center text-brand-green-ink underline underline-offset-4 hover:text-prism-ink"
              >
                Take the assessment
              </button>
              <a
                href="mailto:institutions@studaione.com?subject=Prism%20for%20our%20institution"
                className="inline-flex min-h-6 items-center text-prism-ink-muted underline underline-offset-4 hover:text-prism-ink"
              >
                Bring Prism to your institution
              </a>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <EvidenceTick>
                <ShieldCheck size={13} aria-hidden="true" style={{ color: 'var(--thread-color)' }} />
                cryptographically verifiable evidence chain
              </EvidenceTick>
              {typeof assessed === 'number' && assessed > 0 && (
                <EvidenceTick>
                  <span className="tabular-nums">{assessed.toLocaleString()}</span>&nbsp;assessments completed
                </EvidenceTick>
              )}
            </div>
          </div>

          <motion.div
            aria-label="Illustration of an observed moment, not a real result"
            variants={reduced ? undefined : cardStagger}
            initial={reduced ? false : 'hidden'}
            animate="show"
            className="relative rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-surface p-6 shadow-sm md:p-8"
            data-testid="hero-illustration"
          >
            <span className="mb-3 inline-block rounded-full border border-prism-border px-2 py-0.5 font-mono text-xs uppercase tracking-widest text-prism-ink-subtle sm:absolute sm:right-3 sm:top-3 sm:mb-0">
              Illustration, not a real result
            </span>
            <motion.p variants={reduced ? undefined : pieceIn} className="mb-4 font-mono text-xs uppercase tracking-widest text-prism-ink-subtle sm:pr-56">
              How a Prism observation is built
            </motion.p>
            <motion.div variants={reduced ? undefined : pieceIn}>
              <EvidenceThread
                id="hero-sample"
                claim={<span className="block max-w-[16ch] text-lg leading-snug">Checked the facts before deciding<br /><span className="text-brand-green-ink">Observed</span></span>}
                sourceLabel="Evidence · the learner's own words, turn 3 (illustrative)"
                source={<>&ldquo;Before we decide, what did usage actually look like last term? If the data
                  says students stopped coming, that changes my answer completely.&rdquo;</>}
              />
            </motion.div>
            <motion.div variants={reduced ? undefined : pieceIn} className="mt-6 grid gap-2 border-t border-prism-border pt-4">
              <EvidenceTick>observed action, then the behaviour it shows, then the capability</EvidenceTick>
              <EvidenceTick>every conclusion carries its own evidence quote</EvidenceTick>
              <EvidenceTick>where evidence is missing, the report says so instead of guessing</EvidenceTick>
            </motion.div>
          </motion.div>
        </div>

        <div className="mt-12 flex justify-center">
          <button
            type="button"
            onClick={onSeeHow}
            aria-label="Scroll to how it works"
            className="flex flex-col items-center gap-1 font-mono text-xs uppercase tracking-widest text-prism-ink-subtle hover:text-prism-ink"
          >
            the story
            <ChevronDown size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  )
}