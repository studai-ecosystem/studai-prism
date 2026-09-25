import { forwardRef, useId } from 'react'
import { cx } from '../../lib/cx.js'

const CONTROL = 'w-full rounded-[var(--prism-radius-md)] border bg-prism-surface px-3 text-sm text-prism-ink placeholder:text-prism-ink-subtle disabled:cursor-not-allowed disabled:opacity-60'

// Label + hint + error wiring shared by every text control.
export function Field({ id, label, hint, error, required, children, className }) {
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-sm font-medium text-prism-ink">
        {label}
        {required && <span className="text-prism-blocked"> *</span>}
        {required && <span className="sr-only"> (required)</span>}
      </label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-prism-ink-subtle">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-xs font-medium text-prism-blocked">{error}</p>}
    </div>
  )
}

function describedBy(id, hint, error) {
  return [error ? `${id}-error` : null, hint && !error ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined
}

export const Input = forwardRef(function Input({ id: idProp, label, hint, error, required, className, type = 'text', ...rest }, ref) {
  const auto = useId()
  const id = idProp || auto
  return (
    <Field id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <input
        ref={ref}
        id={id}
        type={type}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(CONTROL, 'h-10', error ? 'border-prism-blocked' : 'border-prism-border-strong')}
        {...rest}
      />
    </Field>
  )
})

export const Textarea = forwardRef(function Textarea({ id: idProp, label, hint, error, required, className, rows = 4, ...rest }, ref) {
  const auto = useId()
  const id = idProp || auto
  return (
    <Field id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(CONTROL, 'py-2', error ? 'border-prism-blocked' : 'border-prism-border-strong')}
        {...rest}
      />
    </Field>
  )
})

export const Select = forwardRef(function Select({ id: idProp, label, hint, error, required, options = [], placeholder, className, ...rest }, ref) {
  const auto = useId()
  const id = idProp || auto
  return (
    <Field id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <select
        ref={ref}
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(CONTROL, 'h-10', error ? 'border-prism-blocked' : 'border-prism-border-strong')}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
        ))}
      </select>
    </Field>
  )
})

export const Checkbox = forwardRef(function Checkbox({ id: idProp, label, description, error, className, ...rest }, ref) {
  const auto = useId()
  const id = idProp || auto
  return (
    <div className={cx('flex items-start gap-2', className)}>
      <input
        ref={ref}
        id={id}
        type="checkbox"
        aria-invalid={error ? true : undefined}
        aria-describedby={[description ? `${id}-desc` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined}
        className="mt-0.5 h-4 w-4 rounded border-prism-border-strong accent-[var(--prism-accent)]"
        {...rest}
      />
      <div>
        <label htmlFor={id} className="text-sm font-medium text-prism-ink">{label}</label>
        {description && <p id={`${id}-desc`} className="text-xs text-prism-ink-muted">{description}</p>}
        {error && <p id={`${id}-error`} role="alert" className="text-xs font-medium text-prism-blocked">{error}</p>}
      </div>
    </div>
  )
})

export function RadioGroup({ label, name: nameProp, options, value, onChange, error, className }) {
  const auto = useId()
  const name = nameProp || auto
  return (
    <fieldset className={cx('flex flex-col gap-2', className)} aria-invalid={error ? true : undefined}>
      <legend className="mb-1 text-sm font-medium text-prism-ink">{label}</legend>
      {options.map((o) => {
        const id = `${name}-${o.value}`
        return (
          <div key={o.value} className="flex items-start gap-2">
            <input
              id={id}
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              disabled={o.disabled}
              className="mt-0.5 h-4 w-4 accent-[var(--prism-accent)]"
            />
            <label htmlFor={id} className="text-sm text-prism-ink">
              {o.label}
              {o.description && <span className="block text-xs text-prism-ink-muted">{o.description}</span>}
            </label>
          </div>
        )
      })}
      {error && <p role="alert" className="text-xs font-medium text-prism-blocked">{error}</p>}
    </fieldset>
  )
}

export function Switch({ id: idProp, label, checked, onChange, disabled, description }) {
  const auto = useId()
  const id = idProp || auto
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-prism-ink">{label}</label>
        {description && <p className="text-xs text-prism-ink-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={Boolean(checked)}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50', checked ? 'border-prism-accent bg-prism-accent' : 'border-prism-border-strong bg-prism-subtle')}
      >
        <span className={cx('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-6' : 'translate-x-1')} />
        <span className="sr-only">{checked ? 'On' : 'Off'}</span>
      </button>
    </div>
  )
}
