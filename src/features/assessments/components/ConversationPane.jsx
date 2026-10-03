import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown } from 'lucide-react'
import { InlineNotice } from '../../../components/ui/Notice.jsx'
import { Button } from '../../../components/ui/Button.jsx'

// How close (px) to the bottom still counts as "following the conversation".
export const NEAR_BOTTOM_PX = 120

// The conversation (spec §12.1). Only turns the server returned are shown;
// an answer that did not reach the server is labelled "Not sent" and is never
// followed by a generated reply. P3.6: the feed follows new turns only while
// the learner is near the latest message; when they are rereading, a new
// participant reply shows "New reply - jump to latest" instead of moving the
// text under them. Only this region scrolls; the page header never moves.
export function ConversationPane({ messages, pending, onRetry, onEdit }) {
  const feedRef = useRef(null)
  const nearBottom = useRef(true)
  const seen = useRef(-1)
  const [unread, setUnread] = useState(false)

  const onScroll = useCallback(() => {
    const el = feedRef.current
    if (!el) return
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX
    if (nearBottom.current) setUnread(false)
  }, [])

  const jump = useCallback(() => {
    const el = feedRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    nearBottom.current = true
    setUnread(false)
    el.focus({ preventScroll: true })
  }, [])

  useLayoutEffect(() => {
    const el = feedRef.current
    if (!el) return
    const first = seen.current < 0
    const added = first ? [] : messages.slice(seen.current)
    seen.current = messages.length
    const newReply = added.some((m) => !m.isUser)
    const ownTurn = added.some((m) => m.isUser) || pending?.status === 'SENDING'
    // First paint (resume) and the learner's own send always show the latest turn.
    if (first || nearBottom.current || ownTurn) {
      el.scrollTop = el.scrollHeight
      nearBottom.current = true
      setUnread(false)
    } else if (newReply) {
      setUnread(true)
    }
  }, [messages, pending])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={feedRef} onScroll={onScroll} role="log" aria-label="Assessment conversation" tabIndex={0} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-prism-accent" aria-live="polite" aria-relevant="additions" data-testid="conversation">
        {messages.length === 0 && <p className="text-sm text-prism-ink-muted">The conversation has not started yet.</p>}
        {messages.map((msg, i) => (
          <div key={i} className={msg.isUser ? 'flex flex-col items-end' : 'flex flex-col items-start'} data-role={msg.isUser ? 'candidate' : 'participant'} data-actor-kind={msg.isUser ? undefined : msg.actorKind} data-ai-generated={msg.aiGenerated ? 'true' : undefined}>
            <span className="mb-1 flex flex-wrap items-center gap-2 px-1 text-xs font-medium text-prism-ink-muted">
              <span>{msg.isUser ? 'You' : `${msg.speaker}${msg.role ? `, ${msg.role}` : ''}`}</span>
              {msg.aiGenerated && (
                <span className="rounded-sm border border-prism-border-strong px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-prism-ink" data-testid="ai-generated-label">AI-generated</span>
              )}
            </span>
            <p className={msg.isUser
              ? 'max-w-[85%] whitespace-pre-wrap rounded-[var(--prism-radius-lg)] bg-prism-accent px-4 py-3 text-sm text-prism-accent-ink'
              : 'max-w-[85%] whitespace-pre-wrap rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-surface px-4 py-3 text-sm text-prism-ink'}
            >
              {msg.content}
            </p>
          </div>
        ))}
        {pending && (
          <div className="flex flex-col items-end" data-role="pending">
            <span className="mb-1 px-1 text-xs font-medium text-prism-ink-muted">You</span>
            <p className="max-w-[85%] whitespace-pre-wrap rounded-[var(--prism-radius-lg)] border border-dashed border-prism-border-strong px-4 py-3 text-sm text-prism-ink">{pending.text}</p>
            {pending.status === 'SENDING' && <p className="mt-1 text-xs text-prism-ink-muted">Sending…</p>}
            {pending.status === 'FAILED' && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <InlineNotice tone="blocked">Not sent. {pending.message || 'Your answer is safe here.'}</InlineNotice>
                {pending.retryable && <Button id="retry-answer" size="sm" variant="secondary" onClick={onRetry}>Retry</Button>}
                {pending.editable && onEdit && <Button id="edit-answer" size="sm" variant="secondary" onClick={onEdit}>Edit answer</Button>}
              </div>
            )}
          </div>
        )}
      </div>
      <div aria-live="polite" className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
        {unread && (
          <Button size="sm" className="pointer-events-auto shadow-md" onClick={jump} data-testid="jump-to-latest">
            <ArrowDown size={16} aria-hidden="true" />
            New reply — jump to latest
          </Button>
        )}
      </div>
    </div>
  )
}

export default ConversationPane
