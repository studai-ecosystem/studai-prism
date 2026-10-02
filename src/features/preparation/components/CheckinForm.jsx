// Self-reported check-in (CH-35). The learner's own account of trying
// something outside Prism. Labelled SELF_REPORT; it is never evidence and
// no capability change is claimed.
import { useState } from 'react'
import { Textarea } from '../../../components/ui/FormControls.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { Badge } from '../../../components/ui/Badge.jsx'
import { InlineNotice } from '../../../components/ui/Notice.jsx'
import { PREPARATION_COPY } from '../../../lib/copy/student.js'

export function CheckinForm({ sourceType, sourceId = null, onSubmit, submitting = false, error = null, saved = false, onDone }) {
  const [whatTried, setWhatTried] = useState('')
  const [outcome, setOutcome] = useState('')
  const [touched, setTouched] = useState(false)
  const missing = { whatTried: touched && !whatTried.trim(), outcome: touched && !outcome.trim() }
  const submit = (e) => {
    e.preventDefault()
    setTouched(true)
    if (!whatTried.trim() || !outcome.trim()) return
    onSubmit({ sourceType, ...(sourceId ? { sourceId } : {}), whatTried: whatTried.trim(), outcome: outcome.trim() })
  }
  if (saved) {
    return (
      <div className="space-y-3" data-testid="checkin-saved">
        <InlineNotice tone="positive">Your note is saved as self-reported. It is kept apart from assessments.</InlineNotice>
        {onDone && <Button variant="secondary" size="sm" onClick={onDone}>Done</Button>}
      </div>
    )
  }
  return (
    <form onSubmit={submit} className="space-y-3" aria-label="Self-reported check-in" data-testid="checkin-form">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="insufficient">{PREPARATION_COPY.selfReportLabel}</Badge>
        <p className="text-sm text-prism-ink-muted">{PREPARATION_COPY.selfReportNote}</p>
      </div>
      <Textarea id={`checkin-tried-${sourceId || sourceType}`} label="What did you try?" rows={3} maxLength={2000} value={whatTried} onChange={(e) => setWhatTried(e.target.value)} error={missing.whatTried ? 'Say what you tried.' : undefined} hint={PREPARATION_COPY.omitNote} />
      <Textarea id={`checkin-outcome-${sourceId || sourceType}`} label="What happened?" rows={3} maxLength={2000} value={outcome} onChange={(e) => setOutcome(e.target.value)} error={missing.outcome ? 'Say what happened.' : undefined} />
      {error && <InlineNotice tone="blocked">{error.message || 'Your note could not be saved.'}</InlineNotice>}
      <Button type="submit" loading={submitting} loadingLabel="Saving…">Save check-in</Button>
    </form>
  )
}

export default CheckinForm
