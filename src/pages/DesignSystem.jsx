// /design-system — the living style guide (Part A.4). Admin-gated.
//
// Renders every token, type style (with Latin + Devanagari + Tamil test
// strings), the evidence-thread device in its three canonical contexts, and
// the usage rules. Human screenshot review of THIS route is the Part A gate.
//
// Gate: the page asks for the admin token once and validates it against the
// pilot API (the client never knows the secret); marketing never links here.

import { useEffect, useState } from 'react'
import tokens, { color, font, typeScale, space, radius, elevation, motion } from '../design/tokens.js'
import '../design/tokens.css'
import { EvidenceThread, EvidenceTick, evidenceThreadStyles } from '../components/ui/EvidenceThread.jsx'
import { ReliabilityLabel, ConfidenceBand, PendingStat } from '../components/ui/measurement.jsx'

const TYPE_TESTS = [
  { lang: 'Latin', text: 'Measurement you can see inside — every score carries its evidence.' },
  { lang: 'Devanagari (hi)', text: 'हर स्कोर के साथ उसका प्रमाण जुड़ा होता है — माप जिसे आप अंदर से देख सकते हैं।' },
  { lang: 'Tamil (ta)', text: 'ஒவ்வொரு மதிப்பெண்ணும் அதன் சான்றுடன் இணைந்துள்ளது — உள்ளே பார்க்கக்கூடிய அளவீடு.' },
]

function TokenSwatch({ name, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      <span style={{ width: 44, height: 44, borderRadius: 'var(--radius-sm)', background: value, border: '1px solid var(--color-line)' }} />
      <span style={{ fontFamily: 'var(--font-utility)', fontSize: 'var(--text-sm)' }}>
        {name}
        <span style={{ color: 'var(--color-ink-muted)', marginLeft: 8 }}>{value}</span>
      </span>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 'var(--space-16)' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', marginBottom: 'var(--space-6)', borderBottom: '1px solid var(--color-line)', paddingBottom: 'var(--space-3)' }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

export default function DesignSystem() {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem('prismDsUnlocked') === '1')
  const [token, setToken] = useState('')
  const [error, setError] = useState('')

  const tryUnlock = async () => {
    setError('')
    const res = await fetch('/api/pilot/dashboard', { headers: { 'x-admin-token': token } }).catch(() => null)
    if (res && res.ok) {
      sessionStorage.setItem('prismDsUnlocked', '1')
      setUnlocked(true)
    } else {
      setError('That token was not accepted.')
    }
  }

  useEffect(() => { document.title = 'Prism — Design System' }, [])

  if (!unlocked) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-paper)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-body)' }}>
        <style>{evidenceThreadStyles}</style>
        <div style={{ width: 340, padding: 'var(--space-8)', background: 'var(--color-surface)', border: '1px solid var(--color-line)', borderRadius: 'var(--radius-md)' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', marginBottom: 'var(--space-4)' }}>Design system</h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-muted)', marginBottom: 'var(--space-4)' }}>
            Internal style guide. Enter the admin token to continue.
          </p>
          <input
            type="password" value={token} onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && tryUnlock()}
            aria-label="Admin token"
            style={{ width: '100%', padding: 'var(--space-3)', border: '1px solid var(--color-line)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-utility)', marginBottom: 'var(--space-3)' }}
          />
          {error && <p role="alert" style={{ color: 'var(--color-danger)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>{error}</p>}
          <button onClick={tryUnlock} style={{ width: '100%', padding: 'var(--space-3)', background: 'var(--color-ink)', color: 'var(--color-paper)', border: 0, borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-body)', cursor: 'pointer' }}>
            Unlock the style guide
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-paper)', color: 'var(--color-ink)', fontFamily: 'var(--font-body)', lineHeight: 'var(--leading-base)' }}>
      <style>{evidenceThreadStyles}</style>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: 'var(--space-12) var(--space-6)' }}>
        <header style={{ marginBottom: 'var(--space-16)' }}>
          <p style={{ fontFamily: 'var(--font-utility)', fontSize: 'var(--text-xs)', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--color-accent)' }}>
            Prism design system · Part A
          </p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', lineHeight: 'var(--leading-tight)', margin: 'var(--space-2) 0' }}>
            Instrument, not oracle.
          </h1>
          <p style={{ maxWidth: '58ch', color: 'var(--color-ink-muted)' }}>
            Prism looks like a precision measuring device that shows its workings. The accent means
            measurement — it appears only where a number meets its evidence. Uncertainty is rendered
            honestly; pending states are designed as carefully as filled ones.
          </p>
        </header>

        <Section title="Palette">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
            {Object.entries(color).map(([name, value]) => <TokenSwatch key={name} name={name} value={value} />)}
          </div>
          <p style={{ marginTop: 'var(--space-6)', fontSize: 'var(--text-sm)', color: 'var(--color-ink-muted)', maxWidth: '64ch' }}>
            Usage rules: <strong>accent is reserved for measurement moments</strong> (evidence threads,
            confidence bands, live speaking state). Reliability colors never appear without their icon
            and label — status is never conveyed by color alone.
          </p>
        </Section>

        <Section title="Type — three faces, three scripts">
          <div style={{ display: 'grid', gap: 'var(--space-8)' }}>
            <div>
              <p style={{ fontFamily: 'var(--font-utility)', fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>Display — Fraunces</p>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', lineHeight: 'var(--leading-tight)' }}>
                Measurement you can see inside.
              </p>
            </div>
            <div>
              <p style={{ fontFamily: 'var(--font-utility)', fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>Body — Noto Sans (+ Devanagari + Tamil companions)</p>
              {TYPE_TESTS.map((t) => (
                <p key={t.lang} style={{ marginTop: 'var(--space-2)' }}>
                  <span style={{ fontFamily: 'var(--font-utility)', fontSize: 'var(--text-xs)', color: 'var(--color-accent)', marginRight: 'var(--space-3)' }}>{t.lang}</span>
                  {t.text}
                </p>
              ))}
            </div>
            <div>
              <p style={{ fontFamily: 'var(--font-utility)', fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>Utility — IBM Plex Mono (tabular numerals)</p>
              <p style={{ fontFamily: 'var(--font-utility)', fontSize: 'var(--text-lg)', fontVariantNumeric: 'tabular-nums' }}>
                72 · 68–76 · 28:41 · κ pending · n=0
              </p>
            </div>
            <div>
              <p style={{ fontFamily: 'var(--font-utility)', fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>Scale — 8 steps</p>
              {Object.entries(typeScale).map(([step, size]) => (
                <p key={step} style={{ fontSize: size, lineHeight: 'var(--leading-tight)', margin: 'var(--space-1) 0' }}>
                  {step} · {size}
                </p>
              ))}
            </div>
          </div>
        </Section>

        <Section title="The evidence thread — one device, three contexts">
          <div style={{ display: 'grid', gap: 'var(--space-12)' }}>
            <EvidenceThread
              id="ds-report"
              claim={<span style={{ fontSize: 'var(--text-2xl)', fontVariantNumeric: 'tabular-nums' }}>Critical thinking · 74</span>}
              sourceLabel="Evidence · turn 3"
              source={<>“Before deciding I want the usage data from last term — the answer changes everything.”</>}
            />
            <EvidenceThread
              id="ds-ci"
              claim={<span style={{ fontSize: 'var(--text-lg)', fontVariantNumeric: 'tabular-nums' }}>68–76 · confidence band</span>}
              sourceLabel="Calibration"
              source={<>Provisional band. A validated 90%-coverage interval replaces this after the first frozen conformal calibration — the report will say which one you are seeing.</>}
            />
            <EvidenceThread
              id="ds-claim"
              claim={<span style={{ fontSize: 'var(--text-lg)' }}>“AI–human agreement: pending”</span>}
              sourceLabel="Study registry · S2"
              source={<>No agreement statistic is claimed until the preregistered human–LLM study reports. This pending state is the claim.</>}
            />
          </div>
          <p style={{ marginTop: 'var(--space-8)', fontSize: 'var(--text-sm)', color: 'var(--color-ink-muted)', maxWidth: '64ch' }}>
            Rules: the thread always runs claim → source; a claim with no available source gets the
            honest pending state, never a bare number; the thread’s color is the accent, and the
            accent means measurement. Inline variant: <EvidenceTick>calibration stamp v1 · pending</EvidenceTick>
          </p>
        </Section>

        <Section title="Space · radius · elevation · motion">
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-end', marginBottom: 'var(--space-8)' }}>
            {Object.entries(space).filter(([k]) => k !== '0').map(([step, value]) => (
              <div key={step} style={{ textAlign: 'center' }}>
                <div style={{ width: value, height: value, background: 'var(--color-accent)', opacity: 0.25, borderRadius: 'var(--radius-hair)' }} />
                <span style={{ fontFamily: 'var(--font-utility)', fontSize: 'var(--text-xs)' }}>{step}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-6)', marginBottom: 'var(--space-8)' }}>
            {Object.entries(radius).map(([name, value]) => (
              <div key={name} style={{ width: 72, height: 48, border: '1.5px solid var(--color-ink)', borderRadius: value, display: 'grid', placeItems: 'center', fontFamily: 'var(--font-utility)', fontSize: 'var(--text-xs)' }}>{name}</div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-6)', marginBottom: 'var(--space-8)' }}>
            {Object.entries(elevation).map(([name, value]) => (
              <div key={name} style={{ width: 120, height: 72, background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', boxShadow: value, display: 'grid', placeItems: 'center', fontFamily: 'var(--font-utility)', fontSize: 'var(--text-xs)', border: name === 'flat' ? '1px solid var(--color-line)' : 'none' }}>{name}</div>
            ))}
          </div>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-muted)', maxWidth: '64ch' }}>
            Motion: {motion.durationFast} hover · {motion.durationBase} state · {motion.durationSlow} page.
            Under <span style={{ fontFamily: 'var(--font-utility)' }}>prefers-reduced-motion</span> every duration collapses globally
            (tokens.css); nothing conveys meaning by motion alone.
          </p>
        </Section>

        <Section title="Measurement primitives (Part B) — API-shape driven">
          <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <ReliabilityLabel level="high" />
              <ReliabilityLabel level="moderate" />
              <ReliabilityLabel level="low" />
            </div>
            <div style={{ maxWidth: 420 }}>
              <ConfidenceBand ci={{ low: 64, high: 78, provisional: true }} />
            </div>
            <div style={{ maxWidth: 420 }}>
              <PendingStat
                label="Percentile"
                missing="A percentile appears once enough candidates have completed this assessment for a fair comparison."
                arrives="The score is final; the comparison is what's pending."
              />
            </div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-muted)', maxWidth: '64ch' }}>
              ConfidenceBand renders a band ONLY from an API-shaped CI — there is no prop to invent a
              number (CI-tested). ReliabilityLabel refuses unknown levels. PendingStat is the honest
              empty state, designed as carefully as the filled one.
            </p>
          </div>
        </Section>

        <Section title="The room, dark">
          <div className="room-dark" style={{ background: 'var(--color-paper)', color: 'var(--color-ink)', padding: 'var(--space-8)', borderRadius: 'var(--radius-lg)' }}>
            <p style={{ fontFamily: 'var(--font-utility)', fontSize: 'var(--text-xs)', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--color-accent-bright)', marginBottom: 'var(--space-3)' }}>
              Assessment room · dark-capable
            </p>
            <p style={{ maxWidth: '56ch' }}>
              Candidates test at night. The room opts into dark via one scope class — marketing and
              reports stay paper. The thread brightens to stay legible: <EvidenceTick>evidence · turn 2</EvidenceTick>
            </p>
          </div>
        </Section>

        <footer style={{ borderTop: '1px solid var(--color-line)', paddingTop: 'var(--space-6)', fontSize: 'var(--text-sm)', color: 'var(--color-ink-muted)' }}>
          Gate: human screenshot review of this route signs off Part A. Tokens live in
          <span style={{ fontFamily: 'var(--font-utility)' }}> src/design/tokens.js</span> — raw hex in rebuilt page code fails CI.
          Voice canon: <span style={{ fontFamily: 'var(--font-utility)' }}>docs/design/VOICE.md</span>.
        </footer>
      </div>
    </div>
  )
}
