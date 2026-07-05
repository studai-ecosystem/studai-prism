// /verify/:id — the credential's public face (UI rebuild Part C7, on the
// Part A design system). The employer's first touch with Prism: instant
// verdict, then the disclosed evidence layers, every number wearing its
// provenance via the evidence thread. LAW 1: everything renders from the
// report + credential APIs; there is no hardcoded stat on this page.

import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ShieldCheck, AlertTriangle, Loader2, BadgeCheck, ChevronDown } from 'lucide-react'
import '../design/tokens.css'
import { EvidenceThread, EvidenceTick, evidenceThreadStyles } from '../components/ui/EvidenceThread.jsx'
import { ReliabilityLabel, ConfidenceBand, PendingStat } from '../components/ui/measurement.jsx'

const DIMENSIONS = [
  { key: 'criticalThinking', label: 'Critical Thinking' },
  { key: 'communication', label: 'Communication' },
  { key: 'collaboration', label: 'Collaboration' },
  { key: 'problemSolving', label: 'Problem Solving' },
  { key: 'aiDigitalFluency', label: 'AI & Digital Fluency' },
]

const BANDS = [
  { min: 90, label: 'Exceptional Performer' },
  { min: 75, label: 'Strong Performer' },
  { min: 60, label: 'Competent Performer' },
  { min: 40, label: 'Developing Performer' },
  { min: 0, label: 'Early Stage' },
]
const getBand = (s) => BANDS.find((b) => s >= b.min) || BANDS[BANDS.length - 1]

// The instant verdict strip — the first thing an employer reads.
function Verdict({ credential, report }) {
  if (credential?.verification && !credential.verification.verified) {
    return (
      <div role="alert" style={{ background: 'var(--color-danger-surface)', color: 'var(--color-danger)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
        <AlertTriangle size={18} aria-hidden="true" />
        <div>
          <p style={{ fontWeight: 700 }}>Signature check failed</p>
          <p style={{ fontSize: 'var(--text-sm)' }}>This artifact does not match what Prism issued. Do not trust it.</p>
        </div>
      </div>
    )
  }
  if (credential?.status === 'revoked') {
    return (
      <div role="alert" style={{ background: 'var(--color-danger-surface)', color: 'var(--color-danger)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
        <p style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}><AlertTriangle size={16} aria-hidden="true" /> Credential revoked</p>
        {credential.revokedReason && <p style={{ fontSize: 'var(--text-sm)' }}>Reason on record: {credential.revokedReason}</p>}
      </div>
    )
  }
  if (credential?.status === 'superseded') {
    return (
      <div style={{ background: 'var(--color-warn-surface)', color: 'var(--color-reliability-moderate)', border: '1px solid var(--color-reliability-moderate)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
        <p style={{ fontWeight: 700 }}>Superseded by a corrected credential</p>
        <p style={{ fontSize: 'var(--text-sm)' }}>The full correction chain is visible below — nothing is silently rewritten.</p>
      </div>
    )
  }
  const crypto = credential?.verification?.verified
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', justifyContent: 'center' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', background: 'var(--color-success-surface)', color: 'var(--color-reliability-high)', border: '1px solid var(--color-reliability-high)', borderRadius: 'var(--radius-full)', padding: 'var(--space-1) var(--space-3)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
        <BadgeCheck size={14} aria-hidden="true" /> Verified Prism credential
      </span>
      {crypto && (
        <span title={`bundle ${credential.bundleHash?.slice(0, 16)}… · key ${credential.keyId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', background: 'var(--color-ink)', color: 'var(--color-accent-bright)', borderRadius: 'var(--radius-full)', padding: 'var(--space-1) var(--space-3)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
          <ShieldCheck size={14} aria-hidden="true" /> Evidence chain cryptographically verified
        </span>
      )}
      {(report?.scoring?.status === 'provisional_uncalibrated' || credential?.view?.issued?.scoringStatus === 'provisional_uncalibrated') && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', background: 'var(--color-warn-surface)', color: 'var(--color-reliability-moderate)', border: '1px solid var(--color-reliability-moderate)', borderRadius: 'var(--radius-full)', padding: 'var(--space-1) var(--space-3)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
          Provisional — non-English scoring not yet calibrated
        </span>
      )}
    </div>
  )
}

export default function Verify() {
  const { id } = useParams()
  const [state, setState] = useState({ status: 'loading', report: null })
  const [credential, setCredential] = useState(null)
  const [showCrypto, setShowCrypto] = useState(false)

  useEffect(() => {
    let cancelled = false
    document.title = 'Prism — Credential verification'
    fetch(`/api/assessment/report/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('not found'))))
      .then((report) => { if (!cancelled) setState({ status: 'ok', report }) })
      .catch(() => { if (!cancelled) setState({ status: 'error', report: null }) })
    fetch(`/api/credentials/${id}/verify`)
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => { if (!cancelled) setCredential(c) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [id])

  if (state.status === 'loading') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-paper)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-body)' }}>
        <div style={{ textAlign: 'center', color: 'var(--color-ink-muted)' }}>
          <Loader2 size={28} style={{ color: 'var(--color-accent)', animation: 'spin 1s linear infinite' }} aria-hidden="true" />
          <p style={{ marginTop: 'var(--space-3)' }}>Verifying credential…</p>
        </div>
        <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-paper)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-body)', padding: 'var(--space-6)' }}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <AlertTriangle size={36} style={{ color: 'var(--color-reliability-moderate)' }} aria-hidden="true" />
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', margin: 'var(--space-3) 0' }}>Credential not found</h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-muted)' }}>
            No Prism credential exists at this address. The link may be incorrect, the assessment
            was never completed, or the candidate exercised their right to erasure.
          </p>
          <Link to="/" style={{ color: 'var(--color-accent)', fontSize: 'var(--text-sm)' }}>Back to home</Link>
        </div>
      </div>
    )
  }

  const { report } = state
  const overall = report.scores?.overall ?? 0
  const band = getBand(overall)
  const issued = report.issuedAt ? new Date(report.issuedAt) : null
  const issuedStr = issued ? issued.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'
  const evidence = report.evidence || credential?.view?.evidence || {}
  const strongestDim = DIMENSIONS.reduce((a, b) => ((report.scores?.[b.key] ?? 0) > (report.scores?.[a.key] ?? 0) ? b : a), DIMENSIONS[0])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-paper)', color: 'var(--color-ink)', fontFamily: 'var(--font-body)', lineHeight: 'var(--leading-base)' }}>
      <style>{evidenceThreadStyles}</style>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: 'var(--space-12) var(--space-4)' }}>
        <Verdict credential={credential} report={report} />

        {/* The instrument card */}
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-line)', borderRadius: 'var(--radius-lg)', marginTop: 'var(--space-6)', overflow: 'hidden', boxShadow: 'var(--elevation-raised)' }}>
          <div style={{ padding: 'var(--space-8)', borderBottom: '1px solid var(--color-line)' }}>
            <p style={{ fontFamily: 'var(--font-utility)', fontSize: 'var(--text-xs)', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--color-ink-muted)' }}>Prism Score</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
              <span style={{ fontFamily: 'var(--font-utility)', fontSize: 'var(--text-3xl)', fontVariantNumeric: 'tabular-nums', lineHeight: 'var(--leading-tight)' }}>{overall}</span>
              <span style={{ fontFamily: 'var(--font-utility)', color: 'var(--color-ink-muted)' }}>/100</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-3)', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-md)' }}>{band.label}</span>
              {report.reliability?.label && <ReliabilityLabel level={report.reliability.label} />}
            </div>
            <div style={{ marginTop: 'var(--space-4)' }}>
              <ConfidenceBand ci={report.confidenceInterval} />
            </div>
            {typeof report.percentile === 'number' && report.percentile > 0 ? (
              <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--color-ink-muted)' }}>
                Outperformed {report.percentile}% of assessed candidates
              </p>
            ) : (
              <div style={{ marginTop: 'var(--space-4)' }}>
                <PendingStat
                  label="Percentile"
                  missing="A percentile appears once enough candidates have completed this assessment for a fair comparison."
                  arrives="The score is final; the comparison is what's pending."
                />
              </div>
            )}
          </div>

          {/* Dimensions */}
          <div style={{ padding: 'var(--space-8)' }}>
            <p style={{ fontFamily: 'var(--font-utility)', fontSize: 'var(--text-xs)', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--color-ink-muted)', marginBottom: 'var(--space-4)' }}>Dimension breakdown</p>
            <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
              {DIMENSIONS.map((d) => {
                const v = report.scores?.[d.key] ?? 0
                return (
                  <div key={d.key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--space-1)' }}>
                      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{d.label}</span>
                      <span style={{ fontFamily: 'var(--font-utility)', fontSize: 'var(--text-sm)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                    </div>
                    <div aria-hidden="true" style={{ height: 5, background: 'var(--color-paper)', border: '1px solid var(--color-line)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${v}%`, background: d.key === strongestDim.key ? 'var(--color-accent)' : 'var(--color-ink-muted)', borderRadius: 'var(--radius-full)', transition: 'width var(--duration-slow) var(--ease-standard)' }} />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* The evidence thread on the strongest dimension — the glass box, live */}
            {evidence[strongestDim.key] && (
              <div style={{ marginTop: 'var(--space-8)' }}>
                <EvidenceThread
                  id="verify-strongest"
                  claim={<span style={{ fontSize: 'var(--text-lg)', fontVariantNumeric: 'tabular-nums' }}>{strongestDim.label} · {report.scores?.[strongestDim.key]}</span>}
                  sourceLabel="Evidence from the conversation"
                  source={<>“{evidence[strongestDim.key]}”</>}
                />
              </div>
            )}
          </div>

          {/* Provenance footer */}
          <div style={{ padding: 'var(--space-6) var(--space-8)', borderTop: '1px solid var(--color-line)', background: 'var(--color-paper)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-8)', fontSize: 'var(--text-xs)' }}>
            <div>
              <p style={{ fontFamily: 'var(--font-utility)', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--color-ink-muted)' }}>Credential ID</p>
              <p style={{ fontFamily: 'var(--font-utility)' }}>{id}</p>
            </div>
            <div>
              <p style={{ fontFamily: 'var(--font-utility)', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--color-ink-muted)' }}>Issued</p>
              <p>{issuedStr}</p>
            </div>
            <div>
              <p style={{ fontFamily: 'var(--font-utility)', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--color-ink-muted)' }}>Validity</p>
              <p>{report.validityMonths || 12} months</p>
            </div>
            {credential?.view?.issued?.language && credential.view.issued.language !== 'en' && (
              <div>
                <p style={{ fontFamily: 'var(--font-utility)', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--color-ink-muted)' }}>Language</p>
                <p>{credential.view.issued.language} · provisional</p>
              </div>
            )}
          </div>
        </div>

        {/* Verify-it-yourself expander */}
        {credential?.verification?.verified && (
          <div style={{ marginTop: 'var(--space-6)' }}>
            <button
              onClick={() => setShowCrypto((v) => !v)}
              aria-expanded={showCrypto}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', background: 'none', border: 'none', color: 'var(--color-accent)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', cursor: 'pointer', padding: 0 }}
            >
              <ChevronDown size={14} style={{ transform: showCrypto ? 'rotate(180deg)' : 'none', transition: 'transform var(--duration-fast) var(--ease-standard)' }} aria-hidden="true" />
              Verify the signature yourself
            </button>
            {showCrypto && (
              <div style={{ marginTop: 'var(--space-3)', background: 'var(--color-surface)', border: '1px solid var(--color-line)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', fontFamily: 'var(--font-utility)', fontSize: 'var(--text-xs)', lineHeight: 'var(--leading-loose)', overflowWrap: 'anywhere' }}>
                <p><EvidenceTick>bundle sha-256 · {credential.bundleHash}</EvidenceTick></p>
                <p><EvidenceTick>signing key · {credential.keyId}</EvidenceTick></p>
                <p style={{ marginTop: 'var(--space-2)', fontFamily: 'var(--font-body)', color: 'var(--color-ink-muted)' }}>
                  Fetch the public key at <code>/api/credentials/public-key</code>, the W3C
                  Verifiable Credential at <code>?format=vc</code>, and the frozen bundle schema at{' '}
                  <code>/docs/evidence-bundle-schema-v1.json</code>. The Ed25519 signature covers the
                  SHA-256 of the canonical evidence bundle — recompute it and check it yourself.
                </p>
                {Array.isArray(credential.chain) && credential.chain.length > 1 && (
                  <div style={{ marginTop: 'var(--space-3)', fontFamily: 'var(--font-body)', color: 'var(--color-ink-muted)' }}>
                    <p style={{ fontWeight: 600, color: 'var(--color-ink)' }}>Correction chain ({credential.chain.length} credentials):</p>
                    {credential.chain.map((c) => (
                      <p key={c.credential_id} style={{ fontFamily: 'var(--font-utility)' }}>
                        {String(c.credential_id).slice(0, 8)}… · {c.status}{c.superseded_by ? ` → ${String(c.superseded_by).slice(0, 8)}…` : ''}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <p style={{ textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', marginTop: 'var(--space-8)' }}>
          Prism by StudAI One · cryptographically verifiable evidence chain
        </p>
        <p style={{ textAlign: 'center', marginTop: 'var(--space-2)' }}>
          <Link to="/" style={{ color: 'var(--color-accent)', fontSize: 'var(--text-sm)' }}>Take your own Prism assessment →</Link>
        </p>
      </div>
    </div>
  )
}
