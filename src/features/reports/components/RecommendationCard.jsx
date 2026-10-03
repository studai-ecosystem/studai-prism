import { LinkButton } from '../../../components/ui/Button.jsx'
import { Badge } from '../../../components/ui/Badge.jsx'
import { REPORT_COPY } from '../../../lib/copy/report.js'

// One current practice recommendation (P5.6), projected by the server at read
// time beside an insight. Shows what will be practised, the duration, the
// practice label, the allowance and whether starting consumes an activity.
// When nothing qualifies it says so — never a placeholder mission.
export function RecommendationCard({ recommendation, headingLevel = 3 }) {
  if (!recommendation) return null
  const H = `h${headingLevel}`
  const R = REPORT_COPY
  const stretch = recommendation.kind === 'STRETCH'
  const m = recommendation.mission
  const unavailable = recommendation.availability === 'NO_REVIEWED_PRACTICE' ? R.recommendationUnavailable
    : recommendation.availability === 'PRACTICE_OFF' ? R.recommendationOff
      : null
  return (
    <div className="space-y-2 rounded-[var(--prism-radius-md)] border border-prism-border bg-prism-surface p-3 text-sm" data-testid="practice-recommendation" data-availability={recommendation.availability}>
      <div className="flex flex-wrap items-center gap-2">
        <H className="font-semibold text-prism-ink">{stretch ? R.recommendationStretch : R.recommendationTitle}</H>
        {m && <Badge tone="neutral">{m.label}</Badge>}
      </div>
      {stretch && <p className="text-prism-ink-muted">{R.recommendationStretchBody}</p>}
      {m ? (
        <>
          <p className="text-prism-ink"><span className="font-medium">{m.title}</span>{m.displayCode ? <span className="text-prism-ink-subtle"> · {m.displayCode}</span> : null}</p>
          <dl className="grid gap-x-4 gap-y-1 text-prism-ink-muted sm:grid-cols-[max-content_1fr]">
            {recommendation.nextBehavior && <><dt className="font-medium text-prism-ink">What you will practise</dt><dd>{recommendation.nextBehavior}</dd></>}
            {Number.isFinite(m.estimatedMinutes) && <><dt className="font-medium text-prism-ink">Suggested duration</dt><dd>About {m.estimatedMinutes} minutes</dd></>}
            <dt className="font-medium text-prism-ink">Allowance</dt>
            <dd>{recommendation.allowance.kind === 'BOUNDED' ? `${recommendation.allowance.remaining} of ${recommendation.allowance.total} practice activities left` : 'No limit on practice activities'}</dd>
          </dl>
          {recommendation.consumesActivity && <p className="text-xs text-prism-ink-subtle">{R.recommendationConsumes}</p>}
          {recommendation.availability === 'ALLOWANCE_EXHAUSTED'
            ? <p className="text-prism-ink-muted" role="status">{R.recommendationExhausted}</p>
            : <LinkButton size="sm" variant="primary" to={m.to} aria-label={`${R.practiseThis}: ${m.title}`}>{R.practiseThis}</LinkButton>}
        </>
      ) : (
        <p className="text-prism-ink-muted" data-testid="practice-unavailable">{unavailable}</p>
      )}
    </div>
  )
}

export default RecommendationCard
