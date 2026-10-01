import { useId, useRef } from 'react'
import { cx } from '../../lib/cx.js'

// WAI-ARIA tabs with automatic activation and roving tabindex.
export function Tabs({ tabs, value, onChange, label, className }) {
  const baseId = useId()
  const refs = useRef([])
  const index = Math.max(0, tabs.findIndex((t) => t.id === value))

  function focusAt(i) {
    const n = (i + tabs.length) % tabs.length
    refs.current[n]?.focus()
    onChange(tabs[n].id)
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); focusAt(index + 1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); focusAt(index - 1) }
    else if (e.key === 'Home') { e.preventDefault(); focusAt(0) }
    else if (e.key === 'End') { e.preventDefault(); focusAt(tabs.length - 1) }
  }

  const active = tabs[index]
  return (
    <div className={className}>
      <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-prism-border" onKeyDown={onKeyDown}>
        {tabs.map((t, i) => {
          const selected = i === index
          return (
            <button
              key={t.id}
              ref={(el) => { refs.current[i] = el }}
              id={`${baseId}-tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.id)}
              className={cx(
                '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium',
                selected ? 'border-prism-accent text-prism-ink' : 'border-transparent text-prism-ink-muted hover:text-prism-ink',
              )}
            >
              {t.label}
            </button>
          )
        })}
      </div>
      {active && (
        <div role="tabpanel" id={`${baseId}-panel-${active.id}`} aria-labelledby={`${baseId}-tab-${active.id}`} tabIndex={0} className="pt-4">
          {active.content}
        </div>
      )}
    </div>
  )
}

export default Tabs
