import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useFocusTrap } from '../../hooks/useFocusTrap.js'
import { cx } from '../../lib/cx.js'

// Modal dialog: focus trap, Esc closes, focus returns to the opener,
// labelled by its title, background inert to pointer via overlay.
export function Modal({ open, onClose, title, description, children, footer, size = 'md', initialFocusRef, themeClass }) {
  const titleId = useId()
  const descId = useId()
  const ref = useFocusTrap(open, { onEscape: onClose, initialFocusRef })
  // The body becomes a focusable, labelled region only while it scrolls, so
  // keyboard users can scroll it without adding a stop to short dialogs.
  const bodyRef = useRef(null)
  const [scrolls, setScrolls] = useState(false)
  useEffect(() => {
    const el = bodyRef.current
    if (!open || !el) return undefined
    const check = () => setScrolls(el.scrollHeight > el.clientHeight + 1)
    check()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(check)
    ro.observe(el)
    for (const child of el.children) ro.observe(child)
    return () => ro.disconnect()
  }, [open, children])
  if (!open) return null
  const width = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg'
  return createPortal(
    <div className={cx('prism-portal fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center', themeClass)}>
      <div className="absolute inset-0 bg-[var(--prism-overlay)]" aria-hidden="true" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cx('relative flex max-h-[calc(100dvh-2rem)] w-full flex-col rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-surface text-prism-ink shadow-xl', width)}
      >
        <div className="flex items-start justify-between gap-4 border-b border-prism-border px-5 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
            {description && <p id={descId} className="mt-1 text-sm text-prism-ink-muted">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-[var(--prism-radius-sm)] p-1 text-prism-ink-muted hover:bg-prism-subtle">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {/* The body scrolls on small screens; it is focusable so keyboard users can scroll it. */}
        <div ref={bodyRef} {...(scrolls ? { role: 'region', 'aria-labelledby': titleId, tabIndex: 0 } : {})} className="min-h-0 flex-1 overflow-y-auto px-5 py-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-prism-accent">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-prism-border px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export default Modal
