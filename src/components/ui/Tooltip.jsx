import { cloneElement, useId, useState } from 'react'

// Tooltip for supplementary text only (never the sole carrier of information).
// Shows on hover AND keyboard focus; Escape hides it (WCAG 1.4.13).
export function Tooltip({ content, children, side = 'top' }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const trigger = cloneElement(children, {
    'aria-describedby': open ? id : undefined,
    onFocus: (e) => { setOpen(true); children.props.onFocus?.(e) },
    onBlur: (e) => { setOpen(false); children.props.onBlur?.(e) },
    onMouseEnter: (e) => { setOpen(true); children.props.onMouseEnter?.(e) },
    onMouseLeave: (e) => { setOpen(false); children.props.onMouseLeave?.(e) },
    onKeyDown: (e) => { if (e.key === 'Escape') setOpen(false); children.props.onKeyDown?.(e) },
  })
  return (
    <span className="relative inline-flex">
      {trigger}
      {open && (
        <span
          role="tooltip"
          id={id}
          className={`pointer-events-none absolute left-1/2 z-50 w-max max-w-xs -translate-x-1/2 rounded-[var(--prism-radius-sm)] bg-prism-ink px-2 py-1 text-xs text-prism-surface ${side === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2'}`}
        >
          {content}
        </span>
      )}
    </span>
  )
}

export default Tooltip
