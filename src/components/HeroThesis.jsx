// Homepage hero — UI rebuild Part C1, on the design system.
//
// "The hero is a thesis, and Prism's thesis is the glass box." Leads with a
// clearly-sample-labeled fragment of the evidence thread — the product's
// soul above the fold — and two paths: candidate and institution.
// LAW 1: the only statistics on this surface come from useClaims(); with an
// empty registry it renders the standing claim and designed pending copy,
// never a number.

import { ArrowRight, ShieldCheck } from 'lucide-react'
import '../design/tokens.css'
import { EvidenceThread, EvidenceTick, evidenceThreadStyles } from './ui/EvidenceThread.jsx'
import { useClaims } from './ui/measurement.jsx'

export default function HeroThesis({ onGetAssessed, onSeeHow }) {
  const claims = useClaims()
  const assessed = claims?.stats?.assessedRealSessions

  return (
    <section
      aria-label="Prism — measurement you can see inside"
      style={{
        background: 'var(--color-paper)',
        color: 'var(--color-ink)',
        fontFamily: 'var(--font-body)',
        borderBottom: '1px solid var(--color-line)',
      }}
    >
      <style>{evidenceThreadStyles}</style>
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: 'var(--space-16) var(--space-4) var(--space-12)' }}>
        <div style={{ display: 'grid', gap: 'var(--space-12)', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignItems: 'center' }}>
          {/* The thesis */}
          <div>
            <p style={{ fontFamily: 'var(--font-utility)', fontSize: 'var(--text-xs)', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--color-accent)', marginBottom: 'var(--space-3)' }}>
              AI skills assessment · glass box
            </p>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.25rem, 5vw, var(--text-3xl))', lineHeight: 'var(--leading-tight)', margin: 0 }}>
              One conversation.
              <br />
              Measurement you can <em>see inside</em>.
            </h1>
            <p style={{ fontSize: 'var(--text-md)', color: 'var(--color-ink-muted)', maxWidth: '46ch', marginTop: 'var(--space-4)', lineHeight: 'var(--leading-base)' }}>
              Thirty minutes with three AI colleagues. Five skill dimensions, scored by a panel of
              AI evaluators — and every number on your report stays tied to the exact moment in the
              conversation that earned it.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', marginTop: 'var(--space-8)' }}>
              <button
                onClick={onGetAssessed}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
                  background: 'var(--color-ink)', color: 'var(--color-paper)',
                  border: 'none', borderRadius: 'var(--radius-sm)',
                  padding: 'var(--space-3) var(--space-6)',
                  fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)', fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'transform var(--duration-fast) var(--ease-standard)',
                }}
              >
                Take the assessment <ArrowRight size={16} aria-hidden="true" />
              </button>
              <a
                href="mailto:institutions@studaione.com?subject=Prism%20for%20our%20institution"
                style={{
                  display: 'inline-flex', alignItems: 'center',
                  background: 'transparent', color: 'var(--color-ink)',
                  border: '1.5px solid var(--color-ink)', borderRadius: 'var(--radius-sm)',
                  padding: 'var(--space-3) var(--space-6)',
                  fontSize: 'var(--text-base)', fontWeight: 600, textDecoration: 'none',
                }}
              >
                Bring Prism to your institution
              </a>
            </div>
            <button
              onClick={onSeeHow}
              style={{ background: 'none', border: 'none', color: 'var(--color-accent)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', cursor: 'pointer', padding: 0, marginTop: 'var(--space-4)', textDecoration: 'underline', textUnderlineOffset: 3 }}
            >
              See exactly how scoring works
            </button>

            {/* LAW 1: statistics only from the registry; the standing claim otherwise. */}
            <div style={{ marginTop: 'var(--space-8)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-6)', alignItems: 'center' }}>
              <EvidenceTick>
                <ShieldCheck size={13} aria-hidden="true" style={{ color: 'var(--thread-color)' }} />
                cryptographically verifiable evidence chain
              </EvidenceTick>
              {typeof assessed === 'number' && assessed > 0 && (
                <EvidenceTick>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{assessed.toLocaleString()}</span>&nbsp;assessments completed
                </EvidenceTick>
              )}
            </div>
          </div>

          {/* The fragment — the evidence thread above the fold, sample-labeled */}
          <div
            aria-label="Sample of a scored moment"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-line)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--elevation-raised)',
              padding: 'var(--space-8)',
              position: 'relative',
            }}
          >
            <span style={{
              position: 'absolute', top: 'var(--space-3)', right: 'var(--space-3)',
              fontFamily: 'var(--font-utility)', fontSize: 'var(--text-xs)',
              letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase',
              color: 'var(--color-ink-muted)', border: '1px solid var(--color-line)',
              borderRadius: 'var(--radius-full)', padding: '2px var(--space-2)',
            }}>
              Sample
            </span>
            <p style={{ fontFamily: 'var(--font-utility)', fontSize: 'var(--text-xs)', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--color-ink-muted)', marginBottom: 'var(--space-4)' }}>
              How a Prism score is built
            </p>
            <EvidenceThread
              id="hero-sample"
              claim={<span style={{ fontSize: 'var(--text-xl)', fontVariantNumeric: 'tabular-nums' }}>Critical thinking · 74</span>}
              sourceLabel="Evidence · turn 3 of the conversation"
              source={<>“Before we decide, what did usage actually look like last term? If the data
                says students stopped coming, that changes my answer completely.”</>}
            />
            <div style={{ marginTop: 'var(--space-6)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--color-line)', display: 'grid', gap: 'var(--space-2)' }}>
              <EvidenceTick>scored by a panel of AI evaluators — median vote</EvidenceTick>
              <EvidenceTick>every dimension carries its own evidence quote</EvidenceTick>
              <EvidenceTick>verifiable by any employer at its public link</EvidenceTick>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
