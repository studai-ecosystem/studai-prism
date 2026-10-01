import { useId, useMemo, useRef, useState } from 'react'
import { useDismiss } from '../../hooks/useFocusTrap.js'
import { cx } from '../../lib/cx.js'

// Non-modal disclosure panel anchored to a trigger. Esc / outside click close
// and focus returns to the trigger.
export function Popover({ label, trigger, children, align = 'start', className }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const panelRef = useRef(null)
  const refs = useMemo(() => [btnRef, panelRef], [])
  useDismiss(open, refs, () => {
    setOpen(false)
    btnRef.current?.focus()
  })
  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center rounded-[var(--prism-radius-md)] px-2 py-1 text-sm text-prism-ink hover:bg-prism-subtle"
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={panelRef}
          id={id}
          role="dialog"
          aria-label={label}
          className={cx(
            'absolute z-40 mt-2 min-w-[14rem] rounded-[var(--prism-radius-md)] border border-prism-border bg-prism-surface p-3 shadow-lg',
            align === 'end' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  )
}

export default Popover
