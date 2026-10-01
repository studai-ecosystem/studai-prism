import { useId, useMemo, useRef, useState } from 'react'
import { useDismiss } from '../../hooks/useFocusTrap.js'
import { cx } from '../../lib/cx.js'

// Menu button (WAI-ARIA menu pattern): ArrowUp/Down/Home/End move, Enter/Space
// activate, Esc/outside click close and return focus to the trigger.
export function DropdownMenu({ label, trigger, items, align = 'end' }) {
  const menuId = useId()
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const menuRef = useRef(null)
  const itemRefs = useRef([])
  const refs = useMemo(() => [btnRef, menuRef], [])

  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) btnRef.current?.focus()
  }
  useDismiss(open, refs, () => close(true))

  const openAt = (i) => {
    setOpen(true)
    requestAnimationFrame(() => itemRefs.current[(i + items.length) % items.length]?.focus())
  }

  function onMenuKey(e) {
    const current = itemRefs.current.indexOf(document.activeElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); itemRefs.current[(current + 1) % items.length]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); itemRefs.current[(current - 1 + items.length) % items.length]?.focus() }
    else if (e.key === 'Home') { e.preventDefault(); itemRefs.current[0]?.focus() }
    else if (e.key === 'End') { e.preventDefault(); itemRefs.current[items.length - 1]?.focus() }
    else if (e.key === 'Tab') close(false)
  }

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={label}
        onClick={() => (open ? close(false) : openAt(0))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); openAt(0) }
          if (e.key === 'ArrowUp') { e.preventDefault(); openAt(items.length - 1) }
        }}
        className="inline-flex items-center gap-2 rounded-[var(--prism-radius-md)] px-2 py-1.5 text-sm text-prism-ink hover:bg-prism-subtle"
      >
        {trigger}
      </button>
      {open && (
        <ul
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          className={cx('absolute z-40 mt-2 min-w-[12rem] rounded-[var(--prism-radius-md)] border border-prism-border bg-prism-surface py-1 shadow-lg', align === 'end' ? 'right-0' : 'left-0')}
        >
          {items.map((item, i) => (
            <li key={item.id} role="none">
              <button
                ref={(el) => { itemRefs.current[i] = el }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={item.disabled}
                onClick={() => { close(true); item.onSelect?.() }}
                className={cx('block w-full px-3 py-2 text-left text-sm hover:bg-prism-subtle focus:bg-prism-subtle disabled:opacity-50', item.danger ? 'text-prism-blocked' : 'text-prism-ink')}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default DropdownMenu
