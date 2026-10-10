// Adjustment (accommodation) request for an assessment that has not started
// (ACCOMMODATIONS_POLICY_v1; PROD-READY Phase 4). Used on the briefing page
// and in Settings while PRISM_V3_SUPPORT_ROUTES is on. The learner writes what
// they need; a person decides before the start; an approved adjustment
// applies automatically at the start. It never changes how answers are judged.
import { useState } from 'react'
import { Button } from '../../../components/ui/Button.jsx'
import { Textarea } from '../../../components/ui/FormControls.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'
import { StatusChip } from '../../../components/ui/Badge.jsx'
import { Skeleton } from '../../../components/ui/Skeleton.jsx'
import { formatDate } from '../../student/QueryState.jsx'
import { useAccommodation, useRequestAccommodation } from '../hooks.js'
import { ACCOMMODATION_COPY as C } from '../../../lib/copy/support.js'

const MIN = 10
const MAX = 2000
const TONE = { REQUESTED: 'partial', APPROVED: 'positive', DENIED: 'neutral', LAPSED: 'neutral' }

export function AccommodationRequestPanel({ assignmentId, idPrefix = 'adjustment' }) {
  const status = useAccommodation(assignmentId)
  const send = useRequestAccommodation(assignmentId)
  const [needs, setNeeds] = useState(null)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)

  if (status.isPending) return <Skeleton label="Loading your adjustment request" lines={2} />
  if (status.error) {
    return (
      <Callout tone="partial" title="Your adjustment request could not be loaded">
        <p>{status.error.message}</p>
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => status.refetch()}>Try again</Button>
      </Callout>
    )
  }
  const d = status.data
  const req = d.request
  const value = needs ?? (req?.status === 'REQUESTED' ? req.needs : '')
  const submit = async (e) => {
    e.preventDefault()
    const text = value.trim()
    if (text.length < MIN) { setError('Describe what you need in a sentence or two.'); return }
    if (text.length > MAX) { setError('Please keep this shorter.'); return }
    setError(null)
    setSent(false)
    try {
      await send.mutateAsync({ needs: text })
      setNeeds(null)
      setSent(true)
    } catch {
      // Shown below from the mutation state.
    }
  }
  const modes = req?.modes ? Object.entries(req.modes).filter(([, on]) => on).map(([k]) => C.modes[k]) : []

  return (
    <div className="space-y-3" data-testid="adjustment-panel">
      <p className="text-sm text-prism-ink-muted">{C.intro}</p>
      {req && (
        <div className="space-y-2 rounded-[var(--prism-radius-md)] border border-prism-border bg-prism-subtle p-3" data-testid="adjustment-status">
          <StatusChip tone={TONE[req.status]} label={C.statusLabel[req.status]} />
          <p className="text-sm text-prism-ink">{C.status[req.status]}</p>
          {modes.length > 0 && <ul className="list-disc pl-5 text-sm text-prism-ink">{modes.map((m) => <li key={m}>{m}</li>)}</ul>}
          <p className="text-xs text-prism-ink-subtle">Sent on {formatDate(req.createdAt)}{req.decidedAt ? `, decided on ${formatDate(req.decidedAt)}` : ''}.</p>
        </div>
      )}
      {d.requestable ? (
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Textarea id={`${idPrefix}-needs`} label={C.needsLabel} hint={C.needsHint} error={error} value={value} maxLength={MAX} onChange={(e) => setNeeds(e.target.value)} />
          <p className="text-xs text-prism-ink-subtle">{C.privacy}</p>
          {send.error && <Callout tone="blocked" role="alert" title="Your request was not sent">{send.error.message}</Callout>}
          {sent && <p role="status" className="text-sm text-prism-ink">{C.sent}</p>}
          <Button type="submit" variant="secondary" loading={send.isPending} loadingLabel={C.submitting}>{req ? C.update : C.submit}</Button>
        </form>
      ) : (!req || req.status === 'REQUESTED') && d.reason ? (
        <p className="text-sm text-prism-ink-muted">{C.notRequestable[d.reason]}</p>
      ) : null}
    </div>
  )
}

export default AccommodationRequestPanel
