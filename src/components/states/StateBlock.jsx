import { cx } from '../../lib/cx.js'

// Base for every honest state screen: a title, an explanation, and one next action.
export function StateBlock({ icon: Icon, title, description, action, role, tone = 'neutral', className, headingLevel = 2, children }) {
  const H = `h${headingLevel}`
  const toneCls = tone === 'blocked' ? 'text-prism-blocked' : tone === 'partial' ? 'text-prism-partial' : 'text-prism-insufficient'
  return (
    <section role={role} className={cx('mx-auto flex max-w-xl flex-col items-center rounded-[var(--prism-radius-lg)] border border-dashed border-prism-border bg-prism-surface px-6 py-10 text-center', className)}>
      {Icon && <Icon size={28} aria-hidden="true" className={cx('mb-3', toneCls)} />}
      <H className="text-lg font-semibold text-prism-ink">{title}</H>
      {description && <p className="mt-2 text-sm text-prism-ink-muted">{description}</p>}
      {children}
      {action && <div className="mt-5">{action}</div>}
    </section>
  )
}
