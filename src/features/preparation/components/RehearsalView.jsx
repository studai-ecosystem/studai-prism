// Untimed private rehearsal (CH-34). Reuses the conversation primitives;
// the learner's own lines are LEARNER-authored, the counterpart's and any
// requested sample sentence are ASSISTANT-authored and shown apart. No
// timer, no score counter; pause is simply leaving (everything is saved);
// retry re-sends the last learner line; assistance is bounded and labelled.
import { useState } from 'react'
import { ConversationPane } from '../../assessments/components/ConversationPane.jsx'
import { ResponseComposer } from '../../assessments/components/ResponseComposer.jsx'
import { Panel } from '../../../components/ui/Card.jsx'
import { Button, LinkButton } from '../../../components/ui/Button.jsx'
import { Badge } from '../../../components/ui/Badge.jsx'
import { InlineNotice } from '../../../components/ui/Notice.jsx'
import { PREPARATION_COPY } from '../../../lib/copy/student.js'
import { PreparationTitleBar } from './PreparationTitleBar.jsx'

// The counterpart's role label under a reply: the learner's own words, cut on a
// word boundary so a long description never ends mid-word.
const roleLabel = (audience, max = 60) => {
  const s = String(audience || '').trim()
  if (s.length <= max) return s
  const cut = s.lastIndexOf(' ', max)
  return `${s.slice(0, cut > 20 ? cut : max).replace(/[,;:]$/, '')}…`
}

export function RehearsalView({ attempt, actions }) {
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(null)
  const messages = attempt.turns
    .filter((t) => t.actor === 'CANDIDATE' || t.actor === 'AI_PARTICIPANT')
    .map((t) => (t.actor === 'CANDIDATE' ? { isUser: true, content: t.text } : { isUser: false, speaker: 'Counterpart', role: roleLabel(attempt.intent.audience), aiGenerated: true, content: t.text }))
  const suggestions = attempt.turns.filter((t) => t.actor === 'AI_ASSISTANT')
  const lastLearnerLine = [...attempt.turns].reverse().find((t) => t.actor === 'CANDIDATE')?.text || ''
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
  const boundary = pending ? null : attempt.boundary
  const assistExhausted = attempt.limits.assistance.used >= attempt.limits.assistance.max
  const turnsExhausted = attempt.limits.turns.used >= attempt.limits.turns.max
  return (
    <div className="space-y-4" data-testid="rehearsal">
      <PreparationTitleBar attempt={attempt} actions={actions} />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{PREPARATION_COPY.privateLabel}</Badge>
        <Badge tone="neutral">{PREPARATION_COPY.notFormalLabel}</Badge>
        <Badge tone="neutral">Untimed</Badge>
      </div>
      <Panel title="What you confirmed" headingLevel={2}>
        <p className="text-sm text-prism-ink" data-testid="rehearsal-summary">{attempt.summary}</p>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-prism-ink-muted">Situation</dt><dd className="font-medium text-prism-ink">{attempt.situationLabel}</dd></div>
          <div><dt className="text-prism-ink-muted">Practising</dt><dd className="font-medium text-prism-ink">{attempt.practiceTargetLabel || 'Not chosen'}</dd></div>
          <div><dt className="text-prism-ink-muted">Counterpart</dt><dd className="text-prism-ink">{attempt.intent.audience}</dd></div>
          <div><dt className="text-prism-ink-muted">Goal</dt><dd className="text-prism-ink">{attempt.intent.goal}</dd></div>
        </dl>
        {attempt.intent.constraints && <p className="mt-2 text-sm text-prism-ink-muted">Constraints: {attempt.intent.constraints}</p>}
        {attempt.intent.assumptions.length > 0 && (
          <details className="mt-3 text-sm" data-testid="rehearsal-assumptions">
            <summary className="cursor-pointer font-medium text-prism-ink">Assumptions you confirmed</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-prism-ink-muted">{attempt.intent.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
          </details>
        )}
        {attempt.limitation && <InlineNotice tone="partial" className="mt-3">{attempt.limitation.message}</InlineNotice>}
      </Panel>
      <section aria-label="Rehearsal" className="flex min-h-[20rem] flex-col rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-surface">
        <ConversationPane
          messages={messages}
          pending={pending}
          onRetry={() => send(pending?.text)}
          onEdit={() => { setDraft(pending?.text || ''); setPending(null) }}
        />
        {boundary && <div className="mx-3 mb-2" data-testid="rehearsal-boundary"><InlineNotice tone="partial">{boundary.message}</InlineNotice></div>}
        {replyError && <InlineNotice tone="partial" className="mx-3 mb-2">{PREPARATION_COPY.replyError[replyError] || 'The counterpart could not reply. What you wrote is saved.'}</InlineNotice>}
        <ResponseComposer draft={draft} onDraft={setDraft} onSend={() => send()} readOnly={Boolean(pending && pending.status === 'SENDING')} busy={actions.send.isPending} disabled={turnsExhausted} lockedNote={turnsExhausted ? 'This rehearsal has reached its length. Finish it to get your card.' : null} />
      </section>
      <div className="flex flex-wrap items-center gap-2 text-sm text-prism-ink-muted" data-testid="rehearsal-limits">
        <span>{PREPARATION_COPY.allowanceNote}</span>
        <Badge tone="neutral">Your lines: {attempt.limits.turns.used} of {attempt.limits.turns.max}</Badge>
        <Badge tone="neutral">AI suggestions: {attempt.limits.assistance.used} of {attempt.limits.assistance.max}</Badge>
      </div>
      <section aria-labelledby="rehearsal-assist" className="space-y-2" data-testid="rehearsal-assistance">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="rehearsal-assist" className="text-base font-semibold text-prism-ink">Need a hand?</h2>
          <Badge tone="insufficient">{PREPARATION_COPY.suggestionLabel}</Badge>
        </div>
        <p className="text-sm text-prism-ink-muted">A sample sentence you could adapt. It is written by the assistant, is never treated as something you said, and is not part of what Prism observes.</p>
        {suggestions.length > 0 && (
          <ul className="space-y-2">
            {suggestions.map((s) => (
              <li key={s.id} className="rounded-[var(--prism-radius-md)] border border-dashed border-prism-border px-3 py-2 text-sm text-prism-ink" data-testid="assist-suggestion" data-authorship={s.authorship}>
                <span className="mr-2 text-xs font-medium uppercase tracking-wide text-prism-ink-subtle">AI suggestion</span>{s.text}
              </li>
            ))}
          </ul>
        )}
        {attempt.assistError && <InlineNotice tone="partial">{PREPARATION_COPY.assistError[attempt.assistError] || 'No suggestion this time.'}</InlineNotice>}
        {actions.assist.error && <InlineNotice tone="partial">{actions.assist.error.message}</InlineNotice>}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => actions.assist.mutate(attempt.id)} loading={actions.assist.isPending} loadingLabel="Writing a suggestion…" disabled={assistExhausted}>
            {assistExhausted ? 'No suggestions left for this rehearsal' : 'Ask for a sample sentence'}
          </Button>
          {lastLearnerLine && !pending && (
            <Button variant="ghost" size="sm" onClick={() => setDraft(lastLearnerLine)}>Try my last line again</Button>
          )}
        </div>
      </section>
      <p className="text-sm text-prism-ink-muted">Say your opening, respond to the pushback, and revise as you go. Leave any time: everything is saved and you can resume from Prepare. When you are ready, finish to get a short card for the real conversation.</p>
      {actions.finish.error && <InlineNotice tone="blocked">{actions.finish.error.message || 'The rehearsal could not be finished. Nothing is lost.'}</InlineNotice>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => actions.finish.mutate(attempt.id)} loading={actions.finish.isPending} loadingLabel="Writing your card…">Finish and get my card</Button>
        <LinkButton to="/app/prepare" variant="secondary">Pause and come back later</LinkButton>
        <Button variant="ghost" onClick={() => actions.abandon.mutate(attempt.id)} loading={actions.abandon.isPending} loadingLabel="Closing…">Stop without a card</Button>
      </div>
    </div>
  )
}

export default RehearsalView
