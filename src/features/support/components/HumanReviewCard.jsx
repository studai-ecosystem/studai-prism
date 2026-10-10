// The one free human review of an assessment (charter §11; PROD-READY
// Phase 4). Shown on the V3 report page only while PRISM_V3_SUPPORT_ROUTES is
// on. The request is sent once; while it is open the page says so; after a
// decision the outcome is shown in plain language and a further review is not
// offered (no priced review exists).
import { useState } from 'react'
import { Panel } from '../../../components/ui/Card.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { Textarea } from '../../../components/ui/FormControls.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'
import { StatusChip } from '../../../components/ui/Badge.jsx'
import { Skeleton } from '../../../components/ui/Skeleton.jsx'
import { formatDate } from '../../student/QueryState.jsx'
import { useHumanReview, useRequestHumanReview } from '../hooks.js'
import { REVIEW_COPY } from '../../../lib/copy/support.js'

const MIN = 10
const MAX = 2000

export function HumanReviewCard({ sessionId }) {
  const review = useHumanReview(sessionId)
  const send = useRequestHumanReview(sessionId)
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)

  let body
  if (review.isPending) body = <Skeleton label="Loading the review status" lines={2} />
  else if (review.error) {
    body = (
      <Callout tone="partial" title="The review status could not be loaded">
        <p>{review.error.message}</p>
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => review.refetch()}>Try again</Button>
      </Callout>
    )
  } else {
    const d = review.data
    const req = d.request
    if (req?.state === 'OPEN') {
      body = (
        <div className="space-y-2" data-testid="human-review-open">
          <StatusChip tone="partial" label="In review" />
          <p role="status" className="text-sm text-prism-ink">{REVIEW_COPY.open}</p>
          <p className="text-sm text-prism-ink-muted">{REVIEW_COPY.requestedOn(formatDate(req.createdAt))} {REVIEW_COPY.turnaround(d.turnaround.targetBusinessDays)}</p>
        </div>
      )
    } else if (req?.state === 'RESOLVED') {
      body = (
        <div className="space-y-2" data-testid="human-review-resolved">
          <StatusChip tone="positive" label="Reviewed" />
          <h3 className="text-sm font-semibold text-prism-ink">{REVIEW_COPY.outcomeTitle}</h3>
          {req.outcome?.explanation && <p className="text-sm text-prism-ink">{req.outcome.explanation}</p>}
          {req.outcome?.correctedVersion && <p className="text-sm text-prism-ink-muted">{REVIEW_COPY.correctedVersion(req.outcome.correctedVersion)}</p>}
          <p className="text-sm text-prism-ink-muted">{REVIEW_COPY.used} {REVIEW_COPY.furtherNotOffered}</p>
        </div>
      )
    } else if (!d.freeReview.available) {
      body = <p className="text-sm text-prism-ink-muted">{REVIEW_COPY.notReady}</p>
    } else {
      const submit = async (e) => {
        e.preventDefault()
        const text = reason.trim()
        if (text.length < MIN) { setError('Write a few sentences so a person knows what to look at.'); return }
        if (text.length > MAX) { setError('Please keep this shorter.'); return }
        setError(null)
        try {
          await send.mutateAsync({ reason: text })
          setReason('')
        } catch {
          // Shown below from the mutation state.
        }
      }
      body = (
        <form onSubmit={submit} className="space-y-3" noValidate>
          <p className="text-sm text-prism-ink-muted">{REVIEW_COPY.intro} {REVIEW_COPY.turnaround(d.turnaround.targetBusinessDays)}</p>
          <Textarea id="human-review-reason" label={REVIEW_COPY.reasonLabel} hint={REVIEW_COPY.reasonHint} error={error} value={reason} maxLength={MAX} onChange={(e) => setReason(e.target.value)} />
          {send.error && <Callout tone="blocked" role="alert" title="Your review request was not sent">{send.error.message}</Callout>}
          <Button type="submit" loading={send.isPending} loadingLabel={REVIEW_COPY.submitting}>{REVIEW_COPY.submit}</Button>
        </form>
      )
    }
  }
  return <Panel title={REVIEW_COPY.title} data-testid="human-review-card">{body}</Panel>
}

export default HumanReviewCard
