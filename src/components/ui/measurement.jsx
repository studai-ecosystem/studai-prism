// Part B — measurement primitives + LAW 1/LAW 2 hooks.
//
// These are the ONLY components allowed to render measurement claims:
//   <ConfidenceBand>   renders a real CI, a provisional band, or nothing —
//                      decided ENTIRELY by the API shape. There is no prop
//                      to pass a number that the API didn't send.
//   <ReliabilityLabel> high/moderate/low + icon + plain-language tooltip —
//                      never color alone (LAW 4 + token rules).
//   <EvidenceQuote>    transcript quote + turn reference on the thread.
//   <PendingStat>      the designed honest empty state: what's missing and
//                      when it arrives.
//   <FlagGate>         LAW 2: pages never inline-check flags.
//   useClaims()        LAW 1: the only legal way for UI to assert a stat.

import { useEffect, useState, createContext, useContext } from 'react'
import { ShieldCheck, AlertTriangle, HelpCircle, Hourglass } from 'lucide-react'
import { EvidenceThread } from './EvidenceThread.jsx'

// ── LAW 1: useClaims ─────────────────────────────────────────────────────────
const ClaimsContext = createContext(null)

export function ClaimsProvider({ children }) {
  const [claims, setClaims] = useState(null)
  useEffect(() => {
    let cancelled = false
    fetch('/api/evidence/claims')
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => { if (!cancelled) setClaims(c) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  return <ClaimsContext.Provider value={claims}>{children}</ClaimsContext.Provider>
}

export function useClaims() {
  return useContext(ClaimsContext) // null while loading / unavailable — render pending states
}

// ── LAW 2: FlagGate ──────────────────────────────────────────────────────────
// Feature availability comes from the claims endpoint's `features` block
// (server-truth), never from client env or inline checks.
export function FlagGate({ feature, children, fallback = null }) {
  const claims = useClaims()
  if (!claims?.features?.[feature]) return fallback
  return children
}

// ── ReliabilityLabel ─────────────────────────────────────────────────────────
const RELIABILITY = {
  high: {
    label: 'High reliability',
    tooltip: 'The evaluation panel agreed closely on your performance.',
    Icon: ShieldCheck,
    color: 'var(--color-reliability-high)',
    surface: 'var(--color-success-surface)',
  },
  moderate: {
    label: 'Moderate reliability',
    tooltip: 'The panel mostly agreed; small differences remain.',
    Icon: HelpCircle,
    color: 'var(--color-reliability-moderate)',
    surface: 'var(--color-warn-surface)',
  },
  low: {
    label: 'Low agreement — eligible for human review',
    tooltip: 'This result is eligible for human review at no cost to you.',
    Icon: AlertTriangle,
    color: 'var(--color-reliability-low)',
    surface: 'var(--color-danger-surface)',
  },
}

export function ReliabilityLabel({ level }) {
  const spec = RELIABILITY[level]
  if (!spec) return null // unknown level: render nothing, never guess
  const { Icon } = spec
  return (
    <span
      title={spec.tooltip}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
        background: spec.surface, color: spec.color,
        border: `1px solid ${spec.color}`,
        borderRadius: 'var(--radius-full)', padding: 'var(--space-1) var(--space-3)',
        fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600,
      }}
    >
      <Icon size={14} aria-hidden="true" />
      {spec.label}
    </span>
  )
}

// ── ConfidenceBand ───────────────────────────────────────────────────────────
// API-shape decided, impossible to hardcode:
//   ci = { low, high, provisional? }  → renders the band (+ provisional note)
//   ci = null/undefined/malformed     → renders NOTHING (the report shows
//                                       ReliabilityLabel instead)
export function ConfidenceBand({ ci, max = 100 }) {
  if (!ci || !Number.isFinite(Number(ci.low)) || !Number.isFinite(Number(ci.high))) return null
  const low = Math.max(0, Number(ci.low))
  const high = Math.min(max, Number(ci.high))
  if (high < low) return null
  return (
    <div style={{ fontFamily: 'var(--font-utility)', fontSize: 'var(--text-sm)' }}>
      <div aria-hidden="true" style={{ position: 'relative', height: 6, background: 'var(--color-line)', borderRadius: 'var(--radius-full)' }}>
        <div style={{ position: 'absolute', left: `${(low / max) * 100}%`, width: `${((high - low) / max) * 100}%`, top: 0, bottom: 0, background: 'var(--thread-color)', borderRadius: 'var(--radius-full)' }} />
      </div>
      <p style={{ marginTop: 'var(--space-2)', color: 'var(--color-ink-muted)' }}>
        <span style={{ color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' }}>{low}–{high}</span>
        {' '}confidence band{ci.provisional ? ' · provisional until the first calibration study' : ' · 90% coverage target'}
      </p>
    </div>
  )
}

// ── EvidenceQuote ────────────────────────────────────────────────────────────
export function EvidenceQuote({ score, dimensionLabel, quote, turnRef }) {
  if (!quote) return null
  return (
    <EvidenceThread
      id={`eq-${turnRef || dimensionLabel}`}
      claim={
        <span style={{ fontSize: 'var(--text-lg)', fontVariantNumeric: 'tabular-nums' }}>
          {dimensionLabel}{Number.isFinite(Number(score)) ? ` · ${score}` : ''}
        </span>
      }
      sourceLabel={turnRef ? `Evidence · ${turnRef}` : 'Evidence'}
      source={<>“{quote}”</>}
    />
  )
}

// ── PendingStat ──────────────────────────────────────────────────────────────
// The honest empty state, designed as carefully as the filled one.
export function PendingStat({ label, missing, arrives }) {
  return (
    <div style={{
      border: '1px dashed var(--color-line)', borderRadius: 'var(--radius-md)',
      padding: 'var(--space-4)', display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start',
      background: 'var(--color-paper)',
    }}>
      <Hourglass size={16} style={{ color: 'var(--color-ink-muted)', flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
      <div style={{ fontFamily: 'var(--font-body)' }}>
        <p style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-ink)' }}>{label}: pending</p>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-muted)', maxWidth: '48ch' }}>
          {missing}{arrives ? ` ${arrives}` : ''}
        </p>
      </div>
    </div>
  )
}
