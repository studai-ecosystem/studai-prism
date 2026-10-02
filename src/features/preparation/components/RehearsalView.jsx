// Untimed private rehearsal (CH-34). Reuses the conversation primitives;
// the learner's own lines are CANDIDATE turns, the counterpart's are
// AI_PARTICIPANT. No timer, no score, no coaching inside the rehearsal.
import { useState } from 'react'
import { ConversationPane } from '../../assessments/components/ConversationPane.jsx'
import { ResponseComposer } from '../../assessments/components/ResponseComposer.jsx'
import { Panel } from '../../../components/ui/Card.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { Badge } from '../../../components/ui/Badge.jsx'
import { InlineNotice } from '../../../components/ui/Notice.jsx'
import { PREPARATION_COPY } from '../../../lib/copy/student.js'

export function RehearsalView({ attempt, actions }) {
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(null)
  const messages = attempt.turns
    .filter((t) => t.actor !== 'SYSTEM')
    .map((t) => (t.actor === 'CANDIDATE' ? { isUser: true, content: t.text } : { isUser: false, speaker: 'Counterpart', role: attempt.intent.audience.slice(0, 60), content: t.text }))
  const send = async (text = draft) => {
    const line = text.trim()
    if (!line) return
    setPending({ text: line, status: 'SENDING' })
    try {
      await actions.send.mutateAsync({ id: attempt.id, text: line })
      setDraft('')
      setPending(null)
    } catch (err) {
      setPending({ text: line, status: 'FAILED', message: err?.message, retryable: true, editable: true })
    }
  }
  const replyError = pending ? null : attempt.replyError
  return (
    <div className="space-y-4" data-testid="rehearsal">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{PREPARATION_COPY.privateLabel}</Badge>
        <Badge tone="neutral">Untimed</Badge>
      </div>
      <Panel title="What you confirmed" headingLevel={2}>
        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <div><dt className="text-prism-ink-muted">Situation</dt><dd className="font-medium text-prism-ink">{attempt.situationLabel}</dd></div>
          <div><dt className="text-prism-ink-muted">Counterpart</dt><dd className="text-prism-ink">{attempt.intent.audience}</dd></div>
          <div><dt className="text-prism-ink-muted">Goal</dt><dd className="text-prism-ink">{attempt.intent.goal}</dd></div>
        </dl>
        {attempt.intent.constraints && <p className="mt-2 text-sm text-prism-ink-muted">Constraints: {attempt.intent.constraints}</p>}
      </Panel>
      <section aria-label="Rehearsal" className="flex min-h-[20rem] flex-col rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-surface">
        <ConversationPane
          messages={messages}
          pending={pending}
          onRetry={() => send(pending?.text)}
          onEdit={() => { setDraft(pending?.text || ''); setPending(null) }}
        />
        {replyError && <InlineNotice tone="partial" className="mx-3 mb-2">{PREPARATION_COPY.replyError[replyError] || 'The counterpart could not reply. What you wrote is saved.'}</InlineNotice>}
        <ResponseComposer draft={draft} onDraft={setDraft} onSend={() => send()} readOnly={Boolean(pending && pending.status === 'SENDING')} busy={actions.send.isPending} />
      </section>
      <p className="text-sm text-prism-ink-muted">Say your opening, respond to the pushback, and revise as you go. When you are ready, finish to get a short card for the real conversation.</p>
      {actions.finish.error && <InlineNotice tone="blocked">{actions.finish.error.message || 'The rehearsal could not be finished. Nothing is lost.'}</InlineNotice>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => actions.finish.mutate(attempt.id)} loading={actions.finish.isPending} loadingLabel="Writing your card…">Finish and get my card</Button>
        <Button variant="secondary" onClick={() => actions.abandon.mutate(attempt.id)} loading={actions.abandon.isPending} loadingLabel="Closing…">Stop without a card</Button>
      </div>
    </div>
  )
}

export default RehearsalView
