// Practice feedback (spec §16.4; P6.5/P6.6). One clear observation with its
// source, one next behaviour, then — on request — every check in this
// attempt and, for a retry, the criterion-level comparison with the earlier
// attempt. Only what the pipeline actually checked is reported; "Mission
// completed — X of Y" appears only when every behaviour was verified. Copied
// example text is labelled as such and never praised. No levels, points,
// percentages or growth claims.
import { forwardRef } from 'react'
import { StatusChip } from '../../../components/ui/Badge.jsx'
import { InlineNotice } from '../../../components/ui/Notice.jsx'
import { DEVELOPMENT_COPY } from '../../../lib/copy/student.js'

const TONE = { OBSERVED: 'positive', NOT_OBSERVED: 'neutral', NOT_JUDGEABLE: 'insufficient', UNCERTAIN: 'insufficient', COPIED_ASSISTANCE: 'partial' }

function Focus({ focus }) {
  const copy = DEVELOPMENT_COPY.player
  if (!focus) return null
  return (
    <div className="space-y-3" data-testid="feedback-focus">
      {focus.reviewIncomplete && <InlineNotice tone="insufficient">{copy.focusIncomplete}</InlineNotice>}
      {focus.completed && (
        <div className="rounded-[var(--prism-radius-md)] border border-prism-border p-3" data-testid="focus-observed">
          <p className="text-xs font-semibold uppercase tracking-wide text-prism-ink-muted">{copy.focusObserved}</p>
          <p className="mt-1 text-sm font-medium text-prism-ink">{focus.completed.description}</p>
          {focus.completed.quote && <p className="mt-1 text-sm text-prism-ink-muted">{copy.yourWords}: &ldquo;{focus.completed.quote}&rdquo;</p>}
          <p className="mt-1 text-xs text-prism-ink-subtle">{copy.focusSource[focus.completed.source] || copy.focusSource.AUTOMATIC_CHECK}</p>
        </div>
      )}
      {focus.nextChange && (
        <div className="rounded-[var(--prism-radius-md)] border border-prism-border p-3" data-testid="focus-next">
          <p className="text-xs font-semibold uppercase tracking-wide text-prism-ink-muted">{copy.focusNext}</p>
          <p className="mt-1 text-sm font-medium text-prism-ink">{focus.nextChange.description}</p>
          {focus.nextChange.because && <p className="mt-1 text-sm text-prism-ink-muted">{focus.nextChange.because}</p>}
          {focus.nextChange.yourWords && <p className="mt-1 text-xs text-prism-ink-subtle">{copy.yourWords}: &ldquo;{focus.nextChange.yourWords}&rdquo;</p>}
        </div>
      )}
      {focus.allMet && <p className="text-sm text-prism-ink" data-testid="focus-all-met">{copy.focusAllMet}</p>}
      {!focus.completed && !focus.nextChange && !focus.allMet && !focus.reviewIncomplete && focus.note && <p className="text-sm text-prism-ink-muted">{focus.note}</p>}
    </div>
  )
}

// P6.8: the person the learner wrote to replies in character. Every line is
// bound by the server to a criterion the review actually decided, so what
// appears here follows the learner's own message; nothing is scripted praise.
function Counterpart({ counterpart }) {
  const copy = DEVELOPMENT_COPY.player
  if (!counterpart || (!counterpart.lines.length && !counterpart.closing)) return null
  return (
    <section aria-labelledby="mission-counterpart-title" className="space-y-2 rounded-[var(--prism-radius-md)] border border-prism-border p-3" data-testid="feedback-counterpart">
      <h3 id="mission-counterpart-title" className="text-sm font-semibold text-prism-ink">{copy.counterpartTitle(counterpart.name, counterpart.role)}</h3>
      <ul className="space-y-1.5">
        {counterpart.lines.map((l) => (
          <li key={`${l.criterionId}:${l.when}`} className="text-sm text-prism-ink" data-testid="counterpart-line" data-when={l.when}>&ldquo;{l.text}&rdquo;</li>
        ))}
        {counterpart.closing && <li className="text-sm text-prism-ink" data-testid="counterpart-closing">&ldquo;{counterpart.closing}&rdquo;</li>}
      </ul>
      <p className="text-xs text-prism-ink-subtle">{counterpart.note}</p>
    </section>
  )
}

function Comparison({ comparison, criteria }) {
  const copy = DEVELOPMENT_COPY.player
  if (!comparison) return null
  const name = (id) => criteria.find((c) => c.criterionId === id)?.description || id
  const nothing = comparison.newlyMet.length === 0 && comparison.noLongerMet.length === 0
  return (
    <section aria-labelledby="mission-comparison-title" className="space-y-2 rounded-[var(--prism-radius-md)] border border-prism-border bg-prism-subtle p-3" data-testid="feedback-comparison">
      <h3 id="mission-comparison-title" className="text-sm font-semibold text-prism-ink">{copy.comparisonTitle}</h3>
      {nothing ? <p className="text-sm text-prism-ink-muted">{copy.nothingChanged}</p> : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-prism-ink-muted">{copy.newlyMet}</p>
            {comparison.newlyMet.length ? <ul className="mt-1 list-disc pl-5 text-sm text-prism-ink">{comparison.newlyMet.map((id) => <li key={id}>{name(id)}</li>)}</ul> : <p className="mt-1 text-sm text-prism-ink-subtle">None</p>}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-prism-ink-muted">{copy.noLongerMet}</p>
            {comparison.noLongerMet.length ? <ul className="mt-1 list-disc pl-5 text-sm text-prism-ink">{comparison.noLongerMet.map((id) => <li key={id}>{name(id)}</li>)}</ul> : <p className="mt-1 text-sm text-prism-ink-subtle">None</p>}
          </div>
        </div>
      )}
      <p className="text-xs text-prism-ink-subtle">{comparison.note}</p>
    </section>
  )
}

export const MissionFeedback = forwardRef(function MissionFeedback({ result }, headingRef) {
  const copy = DEVELOPMENT_COPY.player
  const detailed = !result.focus
  return (
    <section aria-labelledby="mission-feedback-title" className="space-y-4" data-testid="mission-feedback">
      <h2 id="mission-feedback-title" ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-prism-ink focus:outline-none">{copy.resultTitle}</h2>
      <p className="text-base font-medium text-prism-ink" data-testid="mission-summary">{result.summary}</p>
      {result.status === 'EVALUATION_UNAVAILABLE' && <InlineNotice tone="insufficient">{copy.unavailable}</InlineNotice>}
      <Focus focus={result.focus} />
      <Counterpart counterpart={result.counterpart} />
      <Comparison comparison={result.comparison} criteria={result.criteria} />
      <details open={detailed} className="rounded-[var(--prism-radius-md)] border border-prism-border p-3" data-testid="all-checks">
        <summary className="cursor-pointer text-sm font-semibold text-prism-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-prism-accent">{copy.allChecks}</summary>
        <ul className="mt-3 space-y-3">
          {result.criteria.map((c) => (
            <li key={c.criterionId} className="rounded-[var(--prism-radius-md)] border border-prism-border p-3" data-testid="mission-criterion" data-result={c.result}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-prism-ink">{c.description}</p>
                <StatusChip tone={TONE[c.result]} label={copy.results[c.result]} />
              </div>
              {c.quote && <p className="mt-2 text-sm text-prism-ink-muted">{copy.yourWords}: &ldquo;{c.quote}&rdquo;</p>}
              {c.note && <p className="mt-1 text-xs text-prism-ink-subtle">{c.note}</p>}
              {c.checks.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-prism-ink-muted">
                  {c.checks.map((k) => <li key={k.description}>{k.passed ? 'Automatic check met: ' : 'Automatic check not met: '}{k.description}</li>)}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </details>
      <p className="text-xs text-prism-ink-subtle">{DEVELOPMENT_COPY.missions.practiceNote}</p>
    </section>
  )
})

export default MissionFeedback