// Criterion-by-criterion practice feedback (spec §16.4). Only what the
// pipeline actually checked is reported; "Mission completed — X of Y" appears
// only when every behaviour was verified.
import { forwardRef } from 'react'
import { StatusChip } from '../../../components/ui/Badge.jsx'
import { InlineNotice } from '../../../components/ui/Notice.jsx'
import { DEVELOPMENT_COPY } from '../../../lib/copy/student.js'

const TONE = { OBSERVED: 'positive', NOT_OBSERVED: 'neutral', UNCERTAIN: 'insufficient' }

export const MissionFeedback = forwardRef(function MissionFeedback({ result }, headingRef) {
  const copy = DEVELOPMENT_COPY.player
  return (
    <section aria-labelledby="mission-feedback-title" className="space-y-4" data-testid="mission-feedback">
      <h2 id="mission-feedback-title" ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-prism-ink focus:outline-none">{copy.resultTitle}</h2>
      <p className="text-base font-medium text-prism-ink" data-testid="mission-summary">{result.summary}</p>
      {result.status === 'EVALUATION_UNAVAILABLE' && <InlineNotice tone="insufficient">{copy.unavailable}</InlineNotice>}
      <ul className="space-y-3">
        {result.criteria.map((c) => (
          <li key={c.criterionId} className="rounded-[var(--prism-radius-md)] border border-prism-border p-3" data-testid="mission-criterion">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-prism-ink">{c.description}</p>
              <StatusChip tone={TONE[c.result]} label={copy.results[c.result]} />
            </div>
            {c.quote && <p className="mt-2 text-sm text-prism-ink-muted">Your words: &ldquo;{c.quote}&rdquo;</p>}
            {c.note && <p className="mt-1 text-xs text-prism-ink-subtle">{c.note}</p>}
            {c.checks.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-prism-ink-muted">
                {c.checks.map((k) => <li key={k.description}>{k.passed ? 'Automatic check met: ' : 'Automatic check not met: '}{k.description}</li>)}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-prism-ink-subtle">{DEVELOPMENT_COPY.missions.practiceNote}</p>
    </section>
  )
})

export default MissionFeedback
