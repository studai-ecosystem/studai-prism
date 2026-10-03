import { StatusChip } from '../../../components/ui/Badge.jsx'
import { cx } from '../../../lib/cx.js'
import { REPORT_COPY } from '../../../lib/copy/report.js'

// Capability Map (P5.3, CH-24, T37): five labelled rows, each a segmented
// ordinal track of the four governed bands plus a SEPARATE evidence-state
// chip. The band fill and the evidence chip never share a colour role. A
// missing or under-review result is a neutral, explicitly worded state —
// never zero, never red, never a smaller shape. Each row is one button that
// opens that capability's details; the visual track is decorative and the
// same facts are in the row text, so screen readers and small screens get
// the straightforward list.
const BANDS = ['EARLY', 'DEVELOPING', 'DEMONSTRATED', 'STRONG']
const EVIDENCE_TONE = { SUFFICIENT: 'positive', PROVISIONAL: 'partial', HUMAN_REVIEW_REQUIRED: 'neutral', INSUFFICIENT_EVIDENCE: 'insufficient' }

export function mapRowState(cap) {
  const band = cap.level?.band && BANDS.includes(cap.level.band) ? cap.level.band : null
  const underReview = cap.status === 'HUMAN_REVIEW_REQUIRED'
  return {
    band,
    bandLabel: band ? (cap.level.label || REPORT_COPY.mapBands[band]) : underReview ? REPORT_COPY.mapUnderReview : REPORT_COPY.mapNotMeasured,
    evidenceLabel: REPORT_COPY.mapEvidence[cap.status] || REPORT_COPY.mapEvidence.INSUFFICIENT_EVIDENCE,
    evidenceTone: EVIDENCE_TONE[cap.status] || 'insufficient',
  }
}

// The evidence-state chip used by the map rows, reused wherever a capability
// level is shown so sufficiency never borrows the band's colour role.
export function CapabilityEvidenceChip({ status }) {
  const s = mapRowState({ status, level: null })
  return <StatusChip tone={s.evidenceTone} label={s.evidenceLabel} />
}

export function CapabilityMap({ capabilities = [], onSelect, headingLevel = 2, collapseInsufficient = false }) {
  const H = `h${headingLevel}`
  const describedCount = capabilities.filter((c) => c.level).length
  return (
    <section className="space-y-3" aria-labelledby="capability-map-title" data-testid="capability-map">
      <div>
        <H id="capability-map-title" className="text-lg font-semibold text-prism-ink">{REPORT_COPY.mapTitle}</H>
        <p className="text-sm text-prism-ink-muted">{REPORT_COPY.mapIntro}</p>
      </div>
      <ol className="divide-y divide-prism-border rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-surface">
        {capabilities.map((cap) => {
          const s = mapRowState(cap)
          const title = cap.displayLabel || cap.name
          const filled = s.band ? BANDS.indexOf(s.band) + 1 : 0
          const showChip = !(collapseInsufficient && describedCount === 0 && !s.band)
          return (
            <li key={cap.id} data-testid="capability-map-row" data-band={s.band || 'NONE'} data-evidence={cap.status}>
              <button
                type="button"
                onClick={onSelect ? () => onSelect(cap.id) : undefined}
                disabled={!onSelect}
                className="grid w-full gap-2 px-4 py-3 text-left transition-colors hover:bg-prism-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-prism-accent disabled:cursor-default disabled:hover:bg-transparent sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] sm:items-center"
                aria-label={`${REPORT_COPY.mapOpen} ${title}. ${s.bandLabel}. Evidence: ${s.evidenceLabel}.`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold uppercase tracking-wide text-prism-ink">{title}</span>
                  {cap.displayLabel && <span className="block text-xs text-prism-ink-subtle">{cap.name}</span>}
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  {/* Ordinal track: four equal segments, filled up to the band. Decorative; the label beside it is the fact. */}
                  <span className="hidden gap-1 sm:flex" aria-hidden="true">
                    {BANDS.map((b, i) => (
                      <span
                        key={b}
                        className={cx(
                          'h-2 flex-1 rounded-[var(--prism-radius-sm)] border',
                          s.band ? (i < filled ? 'border-prism-accent bg-prism-accent' : 'border-prism-border bg-prism-subtle') : 'border-dashed border-prism-border bg-transparent',
                        )}
                      />
                    ))}
                  </span>
                  <span className={cx('text-sm', s.band ? 'font-medium text-prism-ink' : 'text-prism-ink-muted')}>{s.bandLabel}</span>
                </span>
                <span className="flex items-center gap-2">
                  {showChip && <StatusChip tone={s.evidenceTone} label={s.evidenceLabel} />}
                  <span aria-hidden="true" className="text-prism-ink-subtle">→</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export default CapabilityMap
