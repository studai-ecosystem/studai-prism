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
              One conversation.
              <br />
              Capability you can <em className="not-italic text-brand-green-ink">see inside</em>.
            </h1>
            <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-prism-ink-muted">
              Understand how you work. Practise what matters next. Thirty minutes in realistic
              workplace situations with AI colleagues; Prism observes what you do, ties every
              conclusion to the moment that earned it, and points to one useful next behaviour.
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
            aria-label="Sample of a scored moment"
            variants={reduced ? undefined : cardStagger}
            initial={reduced ? false : 'hidden'}
            animate="show"
            className="relative rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-surface p-6 shadow-sm md:p-8"
          >
            <span className="absolute right-3 top-3 rounded-full border border-prism-border px-2 py-0.5 font-mono text-xs uppercase tracking-widest text-prism-ink-subtle">
              Sample
            </span>
            <motion.p variants={reduced ? undefined : pieceIn} className="mb-4 font-mono text-xs uppercase tracking-widest text-prism-ink-subtle">
              How a Prism score is built
            </motion.p>
            <motion.div variants={reduced ? undefined : pieceIn}>
              <EvidenceThread
                id="hero-sample"
                claim={<span className="text-2xl tabular-nums">Critical thinking &middot; 74</span>}
                sourceLabel="Evidence · turn 3 of the conversation"
                source={<>&ldquo;Before we decide, what did usage actually look like last term? If the data
                  says students stopped coming, that changes my answer completely.&rdquo;</>}
              />
            </motion.div>
            <motion.div variants={reduced ? undefined : pieceIn} className="mt-6 grid gap-2 border-t border-prism-border pt-4">
              <EvidenceTick>scored by a panel of AI evaluators: median vote</EvidenceTick>
              <EvidenceTick>every dimension carries its own evidence quote</EvidenceTick>
              <EvidenceTick>verifiable by any employer at its public link</EvidenceTick>
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