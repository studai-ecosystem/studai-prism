import { useId } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useFocusTrap } from '../../hooks/useFocusTrap.js'
import { cx } from '../../lib/cx.js'

// Side sheet (e.g. student drawer, hint drawer). Same focus contract as Modal.
export function Drawer({ open, onClose, title, children, side = 'right', footer, themeClass }) {
  const titleId = useId()
  const ref = useFocusTrap(open, { onEscape: onClose })
  if (!open) return null
  return createPortal(
    <div className={cx('prism-portal fixed inset-0 z-50', themeClass)}>
      <div className="absolute inset-0 bg-[var(--prism-overlay)]" aria-hidden="true" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          'absolute top-0 flex h-full w-full max-w-md flex-col border-prism-border bg-prism-surface text-prism-ink shadow-xl',
          side === 'left' ? 'left-0 border-r' : 'right-0 border-l',
        )}
      >
        <div className="flex items-center justify-between gap-4 border-b border-prism-border px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close panel" className="rounded-[var(--prism-radius-sm)] p-1 text-prism-ink-muted hover:bg-prism-subtle">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-prism-border px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export default Drawer
