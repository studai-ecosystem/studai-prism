// "Prepare for a situation" wizard (CH-34). One field per step; the server
// sanitizes the text and the learner confirms the sanitized version before
// any rehearsal begins. Personal and private by default.
import { useState } from 'react'
import { Panel } from '../../../components/ui/Card.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { Textarea, RadioGroup } from '../../../components/ui/FormControls.jsx'
import { Callout, InlineNotice } from '../../../components/ui/Notice.jsx'
import { Badge } from '../../../components/ui/Badge.jsx'
import { SITUATION_TYPES, SITUATION_LABELS } from '../../../api/preparation.js'
import { PREPARATION_COPY } from '../../../lib/copy/student.js'

const STEPS = ['situation', 'audience', 'goal', 'constraints', 'review']
const STEP_TITLE = {
  situation: 'What kind of situation is it?',
  audience: 'Who will you be talking to?',
  goal: 'What do you want from the conversation?',
  constraints: 'Any constraints to keep in mind?',
  review: 'Check what will be used',
}
const HINT = {
  audience: 'Describe the role, not the person. For example: the project lead who owns the deadline.',
  goal: 'One or two sentences. For example: agree a later date without dropping the review step.',
  constraints: 'Optional. Facts the counterpart might raise, in your words.',
}

export function PreparationWizard({ actions, onConfirmed }) {
  const [stepIndex, setStepIndex] = useState(0)
  const [intent, setIntent] = useState({ situationType: '', audience: '', goal: '', constraints: '' })
  const [touched, setTouched] = useState(false)
  const [created, setCreated] = useState(null)
  const [edited, setEdited] = useState(null)
  const step = STEPS[stepIndex]
  const field = (k) => (e) => setIntent((v) => ({ ...v, [k]: e.target.value }))
  const valid = {
    situation: Boolean(intent.situationType),
    audience: Boolean(intent.audience.trim()),
    goal: Boolean(intent.goal.trim()),
    constraints: true,
  }

  const next = async () => {
    setTouched(true)
    if (!valid[step]) return
    setTouched(false)
    if (step === 'constraints') {
      const out = await actions.create.mutateAsync({ situationType: intent.situationType, audience: intent.audience.trim(), goal: intent.goal.trim(), constraints: intent.constraints.trim() }).catch(() => null)
      if (!out) return
      setCreated(out)
      setEdited(out.sanitizedIntent)
    }
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1))
  }
  const back = () => { setTouched(false); setStepIndex((i) => Math.max(i - 1, 0)) }

  const confirm = async () => {
    const changed = edited && JSON.stringify(edited) !== JSON.stringify(created.sanitizedIntent)
    const attempt = await actions.confirm.mutateAsync({ id: created.attemptId, edits: changed ? { audience: edited.audience, goal: edited.goal, constraints: edited.constraints } : null }).catch(() => null)
    if (attempt) onConfirmed(attempt)
  }

  return (
    <div className="space-y-4" data-testid="preparation-wizard" data-step={step}>
      <Callout tone="info" title="Personal preparation, private to you">
        {PREPARATION_COPY.privateNote} {PREPARATION_COPY.omitNote}
      </Callout>
      <Panel title={STEP_TITLE[step]} description={`Step ${stepIndex + 1} of ${STEPS.length}`}>
        {step === 'situation' && (
          <RadioGroup
            label="Situation"
            value={intent.situationType}
            onChange={(v) => setIntent((s) => ({ ...s, situationType: v }))}
            options={SITUATION_TYPES.map((t) => ({ value: t, label: SITUATION_LABELS[t] }))}
            error={touched && !valid.situation ? 'Choose a situation.' : undefined}
          />
        )}
        {step === 'audience' && <Textarea id="prep-audience" label="Counterpart" rows={3} maxLength={2000} value={intent.audience} onChange={field('audience')} hint={HINT.audience} error={touched && !valid.audience ? 'Describe who you will talk to.' : undefined} />}
        {step === 'goal' && <Textarea id="prep-goal" label="Your goal" rows={3} maxLength={2000} value={intent.goal} onChange={field('goal')} hint={HINT.goal} error={touched && !valid.goal ? 'Say what you want from the conversation.' : undefined} />}
        {step === 'constraints' && <Textarea id="prep-constraints" label="Constraints" rows={3} maxLength={2000} value={intent.constraints} onChange={field('constraints')} hint={HINT.constraints} />}
        {step === 'review' && created && edited && (
          <div className="space-y-3" data-testid="preparation-review">
            {created.sanitizedChanged
              ? <InlineNotice tone="partial">We removed emails, phone numbers or links from your text. Check the result below and edit if needed.</InlineNotice>
              : <InlineNotice tone="info">This is the text the rehearsal will use. Edit it if needed, then confirm.</InlineNotice>}
            <p className="text-sm text-prism-ink"><span className="font-medium">Situation:</span> {SITUATION_LABELS[created.sanitizedIntent.situationType]}</p>
            <Textarea id="prep-review-audience" label="Counterpart" rows={2} maxLength={2000} value={edited.audience} onChange={(e) => setEdited((v) => ({ ...v, audience: e.target.value }))} />
            <Textarea id="prep-review-goal" label="Your goal" rows={2} maxLength={2000} value={edited.goal} onChange={(e) => setEdited((v) => ({ ...v, goal: e.target.value }))} />
            <Textarea id="prep-review-constraints" label="Constraints" rows={2} maxLength={2000} value={edited.constraints} onChange={(e) => setEdited((v) => ({ ...v, constraints: e.target.value }))} />
            <div className="flex flex-wrap items-center gap-2 text-sm text-prism-ink-muted">
              <Badge tone="neutral">Mode: private preparation</Badge>
              <Badge tone="neutral">Scope: personal</Badge>
            </div>
          </div>
        )}
        {(actions.create.error || actions.confirm.error) && (
          <InlineNotice tone="blocked" className="mt-3">{(actions.create.error || actions.confirm.error).message || 'Something went wrong. Your text is still here.'}</InlineNotice>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {stepIndex > 0 && step !== 'review' && <Button variant="secondary" onClick={back}>Back</Button>}
          {step !== 'review' && <Button onClick={next} loading={actions.create.isPending} loadingLabel="Saving…">{step === 'constraints' ? 'Review' : 'Next'}</Button>}
          {step === 'review' && <Button onClick={confirm} loading={actions.confirm.isPending} loadingLabel="Starting…">Confirm and start rehearsal</Button>}
        </div>
      </Panel>
    </div>
  )
}

export default PreparationWizard
