import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { cx } from '../../lib/cx.js'

const ToastContext = createContext(null)

const TONE = {
  info: 'border-prism-border',
  positive: 'border-prism-positive',
  partial: 'border-prism-partial',
  blocked: 'border-prism-blocked',
}

// Toasts are announced through a persistent polite live region; errors use
// an assertive region. They never carry the only copy of critical information.
export function ToastProvider({ children, durationMs = 5000 }) {
  const [toasts, setToasts] = useState([])
  const seq = useRef(0)
  const dismiss = useCallback((id) => setToasts((ts) => ts.filter((t) => t.id !== id)), [])
  const show = useCallback((message, { tone = 'info', title } = {}) => {
    seq.current += 1
    const id = seq.current
    setToasts((ts) => [...ts, { id, message, tone, title }])
    if (durationMs > 0) setTimeout(() => dismiss(id), durationMs)
    return id
  }, [dismiss, durationMs])
  const value = useMemo(() => ({ show, dismiss }), [show, dismiss])
  const polite = toasts.filter((t) => t.tone !== 'blocked')
  const assertive = toasts.filter((t) => t.tone === 'blocked')

  const render = (t) => (
    <li key={t.id} className={cx('pointer-events-auto flex items-start gap-3 rounded-[var(--prism-radius-md)] border-l-4 bg-prism-surface px-4 py-3 text-sm text-prism-ink shadow-lg', TONE[t.tone] || TONE.info)}>
      <div className="min-w-0 flex-1">
        {t.title && <p className="font-semibold">{t.title}</p>}
        <p>{t.message}</p>
      </div>
      <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="rounded p-0.5 text-prism-ink-muted hover:bg-prism-subtle">
        <X size={14} aria-hidden="true" />
      </button>
    </li>
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-20 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 md:bottom-4">
        <ul role="status" aria-live="polite" className="flex flex-col gap-2">{polite.map(render)}</ul>
        <ul role="alert" aria-live="assertive" className="flex flex-col gap-2">{assertive.map(render)}</ul>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
