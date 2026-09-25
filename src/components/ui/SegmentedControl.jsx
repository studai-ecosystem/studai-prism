import { useId } from 'react'
import { cx } from '../../lib/cx.js'

// Single-choice segmented control, rendered as a radio group (arrow keys move).
export function SegmentedControl({ options, value, onChange, label, className }) {
  const name = useId()
  return (
    <fieldset className={cx('inline-flex rounded-[var(--prism-radius-md)] border border-prism-border bg-prism-subtle p-0.5', className)}>
      <legend className="sr-only">{label}</legend>
      {options.map((o) => {
        const checked = o.value === value
        return (
          <label
            key={o.value}
            className={cx(
              'cursor-pointer rounded-[var(--prism-radius-sm)] px-3 py-1.5 text-sm font-medium focus-within:outline focus-within:outline-2 focus-within:outline-[var(--prism-focus)]',
              checked ? 'bg-prism-surface text-prism-ink shadow-sm' : 'text-prism-ink-muted',
            )}
          >
            <input type="radio" className="sr-only" name={name} value={o.value} checked={checked} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        )
      })}
    </fieldset>
  )
}

export default SegmentedControl
