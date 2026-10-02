import { forwardRef } from 'react'
import { Button } from '../../../components/ui/Button.jsx'

// Answer box (spec §12.1). The parent keeps drafts and pending answers across
// refreshes; only a server-confirmed answer enters the saved conversation.
// While an answer is in flight the box is read-only (not disabled) so keyboard
// focus is never dropped to the page.
export const ResponseComposer = forwardRef(function ResponseComposer({ draft, onDraft, onSend, disabled, readOnly = false, busy }, ref) {
  const submit = (e) => {
    e?.preventDefault()
    if (!draft.trim() || disabled || readOnly || busy) return
    onSend()
  }
  return (
    <form onSubmit={submit} className="shrink-0 space-y-2 border-t border-prism-border bg-prism-canvas p-3">
      <label htmlFor="answer" className="sr-only">Your answer</label>
      <div className="flex gap-2">
        <textarea
          ref={ref}
          id="answer"
          rows={2}
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          disabled={disabled}
          readOnly={readOnly}
          aria-readonly={readOnly || undefined}
          maxLength={4000}
          placeholder="Type your answer"
          className="min-w-0 flex-1 resize-none rounded-[var(--prism-radius-md)] border border-prism-border-strong bg-prism-surface px-3 py-2 text-sm text-prism-ink disabled:opacity-60"
        />
        <Button type="submit" disabled={disabled || readOnly || !draft.trim()} loading={busy} loadingLabel="Sending…">Send</Button>
      </div>
      <p className="text-xs text-prism-ink-subtle">Enter sends. Shift + Enter starts a new line.</p>
    </form>
  )
})

export default ResponseComposer
