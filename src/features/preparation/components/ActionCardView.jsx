// The preparation action card (CH-34, P7.4): AI assistance based on what
// the learner wrote, shown with its provenance, editable and discardable.
// Rehearsal observations (quoting only the learner's own lines) sit in
// their own panel, apart from the card. One application suggestion (P7.5)
// and the optional SELF_REPORT check-in follow. A missing card is an honest,
// explicit message — never a generic stand-in.
import { useState } from 'react'
import { Panel } from '../../../components/ui/Card.jsx'
import { Badge } from '../../../components/ui/Badge.jsx'
import { Button, LinkButton } from '../../../components/ui/Button.jsx'
import { Callout, InlineNotice } from '../../../components/ui/Notice.jsx'
import { Textarea, Checkbox } from '../../../components/ui/FormControls.jsx'
import { PREPARATION_COPY } from '../../../lib/copy/student.js'
import { CheckinForm } from './CheckinForm.jsx'
import { PreparationTitleBar } from './PreparationTitleBar.jsx'

const lines = (arr) => arr.join('\n')
const split = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean)

function CardEditor({ card, onSave, onCancel, saving, error }) {
  const [form, setForm] = useState({ plan: lines(card.plan), opening: card.opening, questions: lines(card.questions), tradeoffs: lines(card.tradeoffs), boundary: card.boundary, selfCheck: card.selfCheck })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const submit = (e) => {
    e.preventDefault()
    onSave({ plan: split(form.plan), opening: form.opening.trim(), questions: split(form.questions), tradeoffs: split(form.tradeoffs), boundary: form.boundary.trim(), selfCheck: form.selfCheck.trim() })
  }
  return (
    <form onSubmit={submit} className="space-y-3" aria-label="Edit your card" data-testid="card-editor">
      <Textarea id="card-plan" label="Plan (one step per line, 3 to 5)" rows={5} value={form.plan} onChange={set('plan')} />
      <Textarea id="card-opening" label="Opening" rows={2} maxLength={300} value={form.opening} onChange={set('opening')} />
      <Textarea id="card-questions" label="Questions to ask (one per line, 1 to 3)" rows={3} value={form.questions} onChange={set('questions')} />
      <Textarea id="card-tradeoffs" label="Trade-offs (one per line, up to 3)" rows={3} value={form.tradeoffs} onChange={set('tradeoffs')} />
      <Textarea id="card-boundary" label="Boundary or escalation option" rows={2} maxLength={400} value={form.boundary} onChange={set('boundary')} />
      <Textarea id="card-selfcheck" label="Self-check" rows={2} maxLength={400} value={form.selfCheck} onChange={set('selfCheck')} />
      {error && <InlineNotice tone="blocked">{error.message || 'The card could not be saved.'}</InlineNotice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={saving} loadingLabel="Saving…">Save card</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}

function ApplicationCard({ attempt, actions }) {
  const app = attempt.application
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(app?.text || '')
  if (!app || app.dismissed) return null
  const patch = (edits) => actions.editApplication.mutate({ id: attempt.id, edits })
  return (
    <Panel title={PREPARATION_COPY.applicationTitle} headingLevel={2} description={PREPARATION_COPY.applicationNote} data-testid="application-card">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{app.source === 'LEARNER' ? 'Your wording' : 'Suggested from your practice target'}</Badge>
        {app.checkedIn && <Badge tone="positive">Check-in recorded</Badge>}
      </div>
      {editing ? (
        <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { patch({ text: text.trim() }); setEditing(false) } }}>
          <Textarea id="application-text" label="One thing to try" rows={2} maxLength={400} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={actions.editApplication.isPending} loadingLabel="Saving…">Save</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(false); setText(app.text) }}>Cancel</Button>
          </div>
        </form>
      ) : (
        <p className="mt-3 text-sm text-prism-ink" data-testid="application-text">{app.text}</p>
      )}
      <div className="mt-3">
        <Checkbox id="application-reminder" label={PREPARATION_COPY.reminderLabel} description="Shown on your Prepare page only. Nothing is emailed or sent anywhere." checked={app.reminderOptIn} onChange={(e) => patch({ reminderOptIn: e.target.checked })} />
      </div>
      {actions.editApplication.error && <InlineNotice tone="blocked" className="mt-2">{actions.editApplication.error.message}</InlineNotice>}
      <div className="mt-3 flex flex-wrap gap-2">
        {!editing && <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>Edit</Button>}
        <Button variant="ghost" size="sm" onClick={() => patch({ dismissed: true })}>Dismiss</Button>
      </div>
    </Panel>
  )
}

export function ActionCardView({ attempt, actions }) {
  const [showCheckin, setShowCheckin] = useState(false)
  const [editingCard, setEditingCard] = useState(false)
  const card = attempt.card
  return (
    <div className="space-y-4" data-testid="action-card">
      <PreparationTitleBar attempt={attempt} actions={actions} />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{PREPARATION_COPY.privateLabel}</Badge>
        <Badge tone="neutral">{PREPARATION_COPY.notFormalLabel}</Badge>
      </div>
      {card ? (
        <Panel title="Your preparation card" description={PREPARATION_COPY.cardIntro} actions={<Badge tone="neutral">{PREPARATION_COPY.assistanceLabel}</Badge>}>
          {card.editedByLearner && <InlineNotice tone="info" className="mb-3">{PREPARATION_COPY.cardEditedNote}</InlineNotice>}
          {editingCard ? (
            <CardEditor card={card} saving={actions.editCard.isPending} error={actions.editCard.error} onCancel={() => setEditingCard(false)} onSave={async (edits) => { const ok = await actions.editCard.mutateAsync({ id: attempt.id, edits }).catch(() => null); if (ok) setEditingCard(false) }} />
          ) : (
            <>
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="font-medium text-prism-ink">Situation</dt>
                  <dd className="mt-1 text-prism-ink-muted">{card.situation}</dd>
                </div>
                <div>
                  <dt className="font-medium text-prism-ink">Plan</dt>
                  <dd className="mt-1"><ol className="list-decimal space-y-1 pl-5 text-prism-ink">{card.plan.map((step, i) => <li key={i}>{step}</li>)}</ol></dd>
                </div>
                <div>
                  <dt className="font-medium text-prism-ink">Opening</dt>
                  <dd className="mt-1 rounded-[var(--prism-radius-md)] border border-prism-border bg-prism-canvas px-3 py-2 text-prism-ink">{card.opening}</dd>
                </div>
                <div>
                  <dt className="font-medium text-prism-ink">Questions to ask</dt>
                  <dd className="mt-1"><ul className="list-disc space-y-1 pl-5 text-prism-ink">{card.questions.map((q, i) => <li key={i}>{q}</li>)}</ul></dd>
                </div>
                {card.tradeoffs.length > 0 && (
                  <div>
                    <dt className="font-medium text-prism-ink">Trade-offs to name</dt>
                    <dd className="mt-1"><ul className="list-disc space-y-1 pl-5 text-prism-ink">{card.tradeoffs.map((r, i) => <li key={i}>{r}</li>)}</ul></dd>
                  </div>
                )}
                <div>
                  <dt className="font-medium text-prism-ink">One boundary or escalation option</dt>
                  <dd className="mt-1 text-prism-ink">{card.boundary}</dd>
                </div>
                <div>
                  <dt className="font-medium text-prism-ink">Self-check</dt>
                  <dd className="mt-1 text-prism-ink-muted">{card.selfCheck}</dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => setEditingCard(true)}>Edit card</Button>
                <Button variant="ghost" size="sm" onClick={() => actions.discardCard.mutate(attempt.id)} loading={actions.discardCard.isPending} loadingLabel="Discarding…">Discard card</Button>
              </div>
            </>
          )}
        </Panel>
      ) : (
        <Callout tone="insufficient" title="No card" role="status">
          {PREPARATION_COPY.cardError[attempt.cardError] || 'No card is available for this rehearsal. Your rehearsal is kept.'}
        </Callout>
      )}
      <Panel title={PREPARATION_COPY.observedLabel} headingLevel={2} description={PREPARATION_COPY.observationsIntro} data-testid="observations">
        {attempt.observations.length === 0
          ? <p className="text-sm text-prism-ink-muted">{PREPARATION_COPY.observationsEmpty}</p>
          : (
            <ul className="space-y-3">
              {attempt.observations.map((o, i) => (
                <li key={i} className="text-sm" data-testid="observation" data-authorship={o.authorship}>
                  <p className="font-medium text-prism-ink">{o.label}</p>
                  <blockquote className="mt-1 border-l-2 border-prism-border-strong pl-3 text-prism-ink-muted"><span className="text-xs uppercase tracking-wide text-prism-ink-subtle">{PREPARATION_COPY.learnerLabel}: </span>“{o.quote}”</blockquote>
                </li>
              ))}
            </ul>
          )}
      </Panel>
      <ApplicationCard attempt={attempt} actions={actions} />
      <div className="flex flex-wrap gap-2">
        {!showCheckin && <Button variant="secondary" onClick={() => setShowCheckin(true)}>Record how it went</Button>}
        <LinkButton to="/app/prepare" variant="ghost">Back to Prepare</LinkButton>
      </div>
      {showCheckin && (
        <Panel title="After the real conversation" description={PREPARATION_COPY.checkinPrompt} headingLevel={2}>
          <CheckinForm
            sourceType="PREPARATION"
            sourceId={attempt.id}
            onSubmit={(body) => actions.checkin.mutate(body)}
            submitting={actions.checkin.isPending}
            error={actions.checkin.error}
            saved={actions.checkin.isSuccess}
            onDone={() => { actions.checkin.reset(); setShowCheckin(false) }}
            onCancel={() => setShowCheckin(false)}
          />
        </Panel>
      )}
    </div>
  )
}

export default ActionCardView
