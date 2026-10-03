// Self-reported check-in (CH-35). The learner's own account of trying
// something outside Prism: did you try it, what happened, what next.
// Labelled SELF_REPORT; it is never evidence and no capability change is
// claimed. Also used to edit an existing note.
import { useState } from 'react'
import { Textarea } from '../../../components/ui/FormControls.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { Badge } from '../../../components/ui/Badge.jsx'
import { InlineNotice } from '../../../components/ui/Notice.jsx'
import { PREPARATION_COPY } from '../../../lib/copy/student.js'

export function CheckinForm({ sourceType, sourceId = null, initial = null, onSubmit, submitting = false, error = null, saved = false, onDone, onCancel }) {
  const [whatTried, setWhatTried] = useState(initial?.whatTried || '')
  const [outcome, setOutcome] = useState(initial?.outcome || '')
  const [nextStep, setNextStep] = useState(initial?.nextStep || '')
  const [touched, setTouched] = useState(false)
  const missing = { whatTried: touched && !whatTried.trim(), outcome: touched && !outcome.trim() }
  const key = initial?.id || sourceId || sourceType
  const submit = (e) => {
    e.preventDefault()
    setTouched(true)
    if (!whatTried.trim() || !outcome.trim()) return
    const body = { whatTried: whatTried.trim(), outcome: outcome.trim(), ...(nextStep.trim() ? { nextStep: nextStep.trim() } : initial ? { nextStep: '' } : {}) }
    onSubmit(initial ? body : { sourceType, ...(sourceId ? { sourceId } : {}), ...body })
  }
  if (saved) {
    return (
      <div className="space-y-3" data-testid="checkin-saved">
        <InlineNotice tone="positive">Your note is saved as self-reported. It is kept apart from assessments and cannot change a formal result.</InlineNotice>
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
      <Textarea id={`checkin-tried-${key}`} label="Did you try it? What did you do?" rows={3} maxLength={2000} value={whatTried} onChange={(e) => setWhatTried(e.target.value)} error={missing.whatTried ? 'Say what you tried.' : undefined} hint={PREPARATION_COPY.omitNote} />
      <Textarea id={`checkin-outcome-${key}`} label="What happened?" rows={3} maxLength={2000} value={outcome} onChange={(e) => setOutcome(e.target.value)} error={missing.outcome ? 'Say what happened.' : undefined} />
      <Textarea id={`checkin-next-${key}`} label="What do you want to try next? (optional)" rows={2} maxLength={2000} value={nextStep} onChange={(e) => setNextStep(e.target.value)} />
      {error && <InlineNotice tone="blocked">{error.message || 'Your note could not be saved.'}</InlineNotice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={submitting} loadingLabel="Saving…">{initial ? 'Save changes' : 'Save check-in'}</Button>
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  )
}

export default CheckinForm
