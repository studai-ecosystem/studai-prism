import { Badge } from '../ui/Badge.jsx'
import { EvidenceSufficiencyBadge } from './EvidenceSufficiencyBadge.jsx'
import { cx } from '../../lib/cx.js'

// Evidence trace (spec §15): scenario → your action → observed behaviour →
// capability → rubric anchor → evidence status. Practice evidence is drawn
// with a dashed border and an explicit "Practice evidence" label so it can
// never be mistaken for formal assessment evidence.
export function EvidenceTracePanel({ item, dateLabel, headingLevel = 3 }) {
  const H = `h${headingLevel}`
  const practice = item.kind === 'PRACTICE'
  const steps = [
    { label: 'Scenario', value: item.assessmentTitle },
    {
      label: 'What you did',
      value: item.candidateAction?.quote
        ? <>&ldquo;{item.candidateAction.quote}&rdquo;</>
        : item.candidateAction?.artifactId ? 'Worked in a scenario document' : item.candidateAction?.turn != null ? `Your reply at exchange ${item.candidateAction.turn}` : null,
    },
    { label: 'Observed behaviour', value: item.observedBehavior },
    { label: 'Capability', value: item.capability?.name },
    { label: 'Described behaviour at this level', value: item.rubricAnchor?.criteria },
  ].filter((s) => s.value)
  return (
    <article
      className={cx('rounded-[var(--prism-radius-lg)] border p-4', practice ? 'border-dashed border-prism-border bg-prism-surface' : 'border-prism-border bg-prism-surface')}
      data-kind={item.kind}
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <H className="text-sm font-semibold text-prism-ink">{item.capability?.name || 'Evidence'}</H>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={practice ? 'neutral' : 'accent'}>{practice ? 'Practice evidence' : 'Formal assessment'}</Badge>
          {!practice && <EvidenceSufficiencyBadge status={item.evidenceStatus} />}
        </div>
      </header>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.label} className="grid gap-1 sm:grid-cols-[12rem_1fr]">
            <span className="text-xs font-semibold uppercase tracking-wide text-prism-ink-subtle">
              <span aria-hidden="true">{i + 1}. </span>{s.label}
            </span>
            <span className="text-sm text-prism-ink">{s.value}</span>
          </li>
        ))}
      </ol>
      {dateLabel && <p className="mt-3 text-xs text-prism-ink-subtle">{dateLabel}</p>}
    </article>
  )
}

export default EvidenceTracePanel
