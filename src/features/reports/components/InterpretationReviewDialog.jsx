import { useEffect, useRef, useState } from 'react'
import { Modal } from '../../../components/ui/Modal.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { Select, Textarea } from '../../../components/ui/FormControls.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'
import { useRequestReview } from '../hooks.js'
import { REVIEW_CATEGORIES } from '../../../api/reports.js'
import { REPORT_COPY } from '../../../lib/copy/report.js'

const MIN = 10
const MAX = 2000

// Interpretation review (P5.7, CH-29): the learner points at a bounded
// category and a specific concern. The request becomes an OPEN case; the
// report is not changed here, and no outcome or timing is promised.
export function InterpretationReviewDialog({ open, onClose, sessionId, version, moments = [], capability = null }) {
  const review = useRequestReview(sessionId)
  const [category, setCategory] = useState('INTERPRETATION')
  const [momentId, setMomentId] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(null)
  const doneRef = useRef(null)
  useEffect(() => { if (sent) doneRef.current?.focus() }, [sent])
  // Pre-selected from a capability detail page: moments are narrowed to that
  // capability and the request names it, so the reviewer knows the scope.
  const scopedMoments = capability ? moments.filter((m) => m.capability?.id === capability.id) : moments
  const capabilityName = capability ? capability.displayLabel || capability.name : null

  const close = () => {
    setSent(null); setError(null); setReason(''); setMomentId(''); setCategory('INTERPRETATION'); review.reset(); onClose()
  }
  const submit = async (e) => {
    e.preventDefault()
    const text = reason.trim()
    if (text.length < MIN) { setError('Write a few sentences so a person knows what to look at.'); return }
    if (text.length > MAX) { setError('Please keep this shorter.'); return }
    setError(null)
    try {
      const out = await review.mutateAsync({ ...(version ? { version } : {}), category, ...(momentId ? { momentId } : {}), reason: capabilityName ? `[${capabilityName}] ${text}`.slice(0, MAX) : text })
      setSent(out)
    } catch {
      // The mutation error is shown inline below.
    }
  }
  const R = REPORT_COPY
  return (
    <Modal
      open={open}
      onClose={close}
      title={R.reviewTitle}
      description={sent ? undefined : R.reviewIntro}
      footer={sent
        ? <Button ref={doneRef} onClick={close}>Done</Button>
        : <><Button variant="secondary" onClick={close}>Cancel</Button><Button form="report-review-form" type="submit" loading={review.isPending} loadingLabel="Sending...">{R.reviewSend}</Button></>}
    >
      {sent ? (
        <Callout tone="info" title={R.reviewSent} role="status">
          <p>{R.reviewSentBody}</p>
          <p className="mt-1 text-xs">Request for report version {sent.version} · {R.reviewStates[sent.state] || sent.state}</p>
        </Callout>
      ) : (
        <form id="report-review-form" onSubmit={submit} className="space-y-4" noValidate>
          {capabilityName && <p className="text-sm text-prism-ink" data-testid="review-capability-scope"><span className="font-medium">About: </span>{capabilityName}</p>}
          <Select
            label={R.reviewCategory}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={REVIEW_CATEGORIES.map((c) => ({ value: c, label: R.reviewCategories[c] || c }))}
          />
          {scopedMoments.length > 0 && (
            <Select
              label="Which moment (optional)"
              value={momentId}
              onChange={(e) => setMomentId(e.target.value)}
              placeholder="Not about one moment"
              options={scopedMoments.map((m) => ({ value: m.id, label: m.observedBehavior }))}
            />
          )}
          <Textarea
            label={R.reviewReason}
            hint={R.reviewReasonHint}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={error}
            required
            rows={5}
            maxLength={MAX}
          />
          {review.error && <Callout tone="blocked" role="alert" title="Not sent">{review.error.message}</Callout>}
        </form>
      )}
    </Modal>
  )
}

export default InterpretationReviewDialog
