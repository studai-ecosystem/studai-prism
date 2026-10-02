import { useEffect, useRef } from 'react'
import { InlineNotice } from '../../../components/ui/Notice.jsx'
import { Button } from '../../../components/ui/Button.jsx'

// The conversation (spec §12.1). Only turns the server returned are shown;
// an answer that did not reach the server is labelled "Not sent" and is never
// followed by a generated reply.
export function ConversationPane({ messages, pending, onRetry, onEdit }) {
  const feedRef = useRef(null)
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight
  }, [messages, pending])
  return (
    <div ref={feedRef} role="log" aria-label="Assessment conversation" tabIndex={0} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-prism-accent" aria-live="polite" aria-relevant="additions" data-testid="conversation">
      {messages.length === 0 && <p className="text-sm text-prism-ink-muted">The conversation has not started yet.</p>}
      {messages.map((msg, i) => (
        <div key={i} className={msg.isUser ? 'flex flex-col items-end' : 'flex flex-col items-start'} data-role={msg.isUser ? 'candidate' : 'participant'}>
          <span className="mb-1 px-1 text-xs font-medium text-prism-ink-muted">{msg.isUser ? 'You' : `${msg.speaker}${msg.role ? `, ${msg.role}` : ''}`}</span>
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
  )
}

export default ConversationPane
