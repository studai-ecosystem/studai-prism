import { cx } from '../../lib/cx.js'

export function Card({ as: Tag = 'section', className, children, ...rest }) {
  return (
    <Tag className={cx('min-w-0 rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-surface p-5 [overflow-wrap:anywhere]', className)} {...rest}>
      {children}
    </Tag>
  )
}

export function Panel({ title, description, actions, headingLevel = 2, className, children, ...rest }) {
  const H = `h${headingLevel}`
  return (
    <section className={cx('min-w-0 rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-surface [overflow-wrap:anywhere]', className)} {...rest}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-prism-border px-5 py-4">
          <div className="min-w-0">
            {title && <H className="text-base font-semibold text-prism-ink">{title}</H>}
            {description && <p className="mt-1 text-sm text-prism-ink-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

// A number is only shown with its meaning and provenance (spec §5.1 rule 10):
// `value` is required to come with `label` and `provenance`; when the value is
// unknown it renders the explicit `emptyLabel` instead of a zero.
export function StatCard({ label, value, provenance, emptyLabel = 'Not available yet', className }) {
  const hasValue = value !== null && value !== undefined && value !== ''
  return (
    <div className={cx('rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-surface p-4', className)}>
      <p className="text-sm font-medium text-prism-ink-muted">{label}</p>
      <p className={cx('mt-1 font-semibold', hasValue ? 'text-2xl text-prism-ink' : 'text-base text-prism-insufficient')}>
        {hasValue ? value : emptyLabel}
      </p>
      {provenance && <p className="mt-1 text-xs text-prism-ink-subtle">{provenance}</p>}
    </div>
  )
}

export default Card
