// Save indicator for the V3 player (spec §12.2 "clear saved indicator"; C5.10).
// States: Saving… / Saved / Not saved yet / Offline / Changes need your
// review (conflict). Colour is never the only signal.
const COPY = {
  SAVED: { text: 'All work saved', tone: 'text-prism-ink-muted' },
  SAVING: { text: 'Saving…', tone: 'text-prism-ink-muted' },
  DIRTY: { text: 'Saving…', tone: 'text-prism-ink-muted' },
  ERROR: { text: 'Not saved yet — retry', tone: 'text-prism-blocked' },
  OFFLINE: { text: 'Offline — your work will save when you reconnect', tone: 'text-prism-partial' },
  CONFLICT: { text: 'A change needs your review', tone: 'text-prism-partial' },
}

export function overallSaveState({ items = [], pendingMessage = null, online = true }) {
  if (!online) return 'OFFLINE'
  if (items.some((i) => i.status === 'CONFLICT')) return 'CONFLICT'
  if (items.some((i) => i.status === 'ERROR') || pendingMessage?.status === 'FAILED') return 'ERROR'
  if (items.some((i) => i.status === 'SAVING' || i.status === 'DIRTY') || pendingMessage?.status === 'SENDING') return 'SAVING'
  return 'SAVED'
}

export function SessionSaveStatus({ state }) {
  const c = COPY[state] || COPY.SAVED
  return (
    <p role="status" aria-live="polite" className={`text-xs font-medium ${c.tone}`} data-save-state={state}>
      {c.text}
    </p>
  )
}

export default SessionSaveStatus
