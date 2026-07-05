// The Evidence Thread — Prism's signature element (Part A.2).
//
// The ONE visual device that appears everywhere a number meets its
// justification: a fine calibrated line with a tick at each terminus,
// connecting a claim (score, CI band, percentile, marketing stat) to its
// provenance (transcript quote, calibration note, cohort N). Used
// identically on the report, the credential, the methodology page and the
// marketing site — the glass-box philosophy made visible.
//
// Usage rules (enforced by review, documented in /design-system):
//   1. The thread ALWAYS runs claim → source. Never decorative, never empty.
//   2. Thread color is the accent — and the accent is reserved for
//      measurement moments, so the thread is what the accent MEANS.
//   3. A claim with no source available gets NO thread — it gets a
//      <PendingStat> honest empty state instead (Part B).

export function EvidenceThread({ claim, source, sourceLabel, id }) {
  return (
    <div className="evidence-thread" data-thread-id={id}>
      <div className="evidence-thread__claim">{claim}</div>
      <div className="evidence-thread__line" aria-hidden="true">
        <span className="evidence-thread__tick" />
        <span className="evidence-thread__rail" />
        <span className="evidence-thread__tick" />
      </div>
      <div className="evidence-thread__source">
        {sourceLabel && <span className="evidence-thread__source-label">{sourceLabel}</span>}
        {source}
      </div>
    </div>
  )
}

// Inline variant: a compact thread marker for dense surfaces (tables,
// credential rows) — same tick geometry, horizontal.
export function EvidenceTick({ children }) {
  return (
    <span className="evidence-tick">
      <span className="evidence-tick__mark" aria-hidden="true" />
      {children}
    </span>
  )
}

export const evidenceThreadStyles = `
.evidence-thread {
  display: grid;
  grid-template-columns: max-content var(--space-6) 1fr;
  align-items: start;
  gap: var(--space-2);
}
.evidence-thread__claim { font-family: var(--font-utility); }
.evidence-thread__line {
  display: flex;
  flex-direction: column;
  align-items: center;
  align-self: stretch;
  padding-top: var(--space-2);
  padding-bottom: var(--space-2);
}
.evidence-thread__rail {
  flex: 1;
  width: var(--thread-stroke);
  min-height: var(--space-4);
  background: var(--thread-color);
  opacity: 0.85;
}
.evidence-thread__tick {
  width: var(--thread-tick);
  height: var(--thread-stroke);
  background: var(--thread-color);
  border-radius: var(--radius-hair);
}
.evidence-thread__source {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  line-height: var(--leading-base);
  color: var(--color-ink-muted);
  max-width: 52ch;
}
.evidence-thread__source-label {
  display: block;
  font-family: var(--font-utility);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--thread-color);
  margin-bottom: var(--space-1);
}
.evidence-tick {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-ink-muted);
}
.evidence-tick__mark {
  display: inline-block;
  width: var(--thread-tick);
  height: var(--thread-tick);
  border-left: var(--thread-stroke) solid var(--thread-color);
  border-bottom: var(--thread-stroke) solid var(--thread-color);
}
@media print {
  .evidence-thread__rail, .evidence-thread__tick, .evidence-tick__mark {
    background: black; border-color: black;
  }
}
`
