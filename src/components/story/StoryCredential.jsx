import { useRef } from 'react'
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion'
import { ShieldCheck, FileSignature, Globe } from 'lucide-react'
import { useClaims } from '../ui/measurement.jsx'

// ── Act VII — The Proof ──────────────────────────────────────────────────────
// The credential: conversation → signed bundle → a public page anyone can
// check. The standing claim renders from the claims API (LAW 1) — this
// section cannot invent a stronger sentence than the registry backs.

const CHAIN = [
  { Icon: ShieldCheck, title: 'The conversation', text: 'Your turns, the panel’s reads, and the integrity record — kept together as one evidence bundle.' },
  { Icon: FileSignature, title: 'The signature', text: 'The bundle is hashed and signed by Prism. Change one character anywhere and the signature stops matching.' },
  { Icon: Globe, title: 'The public page', text: 'Every credential has a verification URL. An employer sees the verdict, the reliability, and — if you choose — the evidence.' },
]

export default function StoryCredential() {
  const ref = useRef(null)
  const reduced = useReducedMotion()
  const claims = useClaims()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const tilt = useTransform(scrollYProgress, [0.1, 0.4], [4, 0])
  const rise = useTransform(scrollYProgress, [0.1, 0.4], [30, 0])

  const standing = claims?.standingClaim || 'cryptographically verifiable evidence chain'

  return (
    <section ref={ref} className="relative bg-[var(--color-paper)] py-24 sm:py-32" aria-label="The verifiable credential">
      <div className="max-w-6xl mx-auto px-6">
        <div className="max-w-2xl mb-12">
          <p className="font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--color-ink-muted)] mb-3">The proof</p>
          <h2 className="font-serif text-3xl sm:text-5xl text-[var(--color-ink)] leading-tight mb-4">
            A result you can hand to anyone — and they can check it.
          </h2>
          <p className="font-sans text-base text-[var(--color-ink-muted)] leading-relaxed">
            Prism issues every score with a {standing}: the report, the quotes behind it
            and the signature travel together.
          </p>
        </div>

        <div className="grid lg:grid-cols-5 gap-10 items-center">
          {/* The credential card */}
          <motion.div
            style={reduced ? undefined : { rotate: tilt, y: rise }}
            className="lg:col-span-2 bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-lg)] overflow-hidden shadow-xl"
          >
            <div className="h-1.5 bg-[var(--color-success)]" aria-hidden="true" />
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--color-success)]">
                  ✓ valid credential
                </span>
                <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">sample</span>
              </div>
              <p className="font-serif text-2xl text-[var(--color-ink)] mb-1">Prism Score</p>
              <p className="font-mono text-5xl tabular-nums text-[var(--color-ink)] mb-4">78</p>
              <div className="flex flex-col gap-1.5 font-mono text-[11px] text-[var(--color-ink-muted)]">
                <span>signature — verifies</span>
                <span>reliability — shown, never hidden</span>
                <span>evidence — disclosed on the holder's terms</span>
              </div>
            </div>
          </motion.div>

          {/* The chain */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            {CHAIN.map((step, i) => (
              <motion.div
                key={step.title}
                initial={reduced ? false : { opacity: 0, x: 16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ delay: i * 0.12 }}
                className="flex gap-4 items-start bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-5"
              >
                <span className="shrink-0 w-9 h-9 rounded-full bg-[var(--color-paper)] border border-[var(--color-line)] flex items-center justify-center">
                  <step.Icon size={16} className="text-[var(--color-accent)]" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-sans text-sm font-semibold text-[var(--color-ink)] mb-1">{step.title}</h3>
                  <p className="font-sans text-sm text-[var(--color-ink-muted)] leading-relaxed">{step.text}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
