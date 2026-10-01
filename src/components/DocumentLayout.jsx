import { Children, isValidElement } from 'react'
import PageLayout from './PageLayout.jsx'
import { cx } from '../lib/cx.js'

// Documentation layout for policy and research pages: one readable column,
// an "On this page" index with anchors, and metadata under the title. No
// marketing furniture. Headings made with <DocH> are indexed automatically.

export function slugify(node) {
  const text = typeof node === 'string' ? node : Children.toArray(node).filter((c) => typeof c === 'string').join(' ')
  return text.toLowerCase().replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function DocH({ children, id, level = 2 }) {
  const Tag = `h${level}`
  return (
    <Tag id={id || slugify(children)} className="mt-8 scroll-mt-24 text-xl font-semibold text-prism-ink first:mt-0">
      {children}
    </Tag>
  )
}

export function DocP({ children, className }) {
  return <p className={cx('text-base leading-relaxed text-prism-ink-muted', className)}>{children}</p>
}

// A quiet card for a method, a study or a definition.
export function MethodCard({ title, label, children, className }) {
  return (
    <section className={cx('rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-surface p-5', className)}>
      {label && <p className="mb-1 font-mono text-xs uppercase tracking-widest text-prism-ink-subtle">{label}</p>}
      {title && <h3 className="mb-2 text-base font-semibold text-prism-ink">{title}</h3>}
      <div className="text-sm leading-relaxed text-prism-ink-muted">{children}</div>
    </section>
  )
}

const STATUS = {
  pending: ['\u25CB', 'Pending', 'border-prism-border bg-prism-insufficient-soft text-prism-ink-muted'],
  progress: ['\u25D0', 'In progress', 'border-prism-partial-soft bg-prism-partial-soft text-prism-ink'],
  complete: ['\u25CF', 'Complete', 'border-prism-positive-soft bg-prism-positive-soft text-prism-ink'],
}

// Study status is always written out; pending work is never hidden.
export function StudyStatus({ status = 'pending', children }) {
  const [marker, label, cls] = STATUS[status] || STATUS.pending
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold', cls)}>
      <span aria-hidden="true">{marker}</span>
      {children || label}
    </span>
  )
}

export default function DocumentLayout({ title, subtitle, meta, status, toc, children }) {
  const items = toc || Children.toArray(children)
    .filter((c) => isValidElement(c) && c.type === DocH)
    .map((c) => ({ id: c.props.id || slugify(c.props.children), label: c.props.children }))

  return (
    <PageLayout>
      <div className="mx-auto max-w-5xl px-6 py-12 md:py-16">
        <header className="mb-8 max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight text-prism-ink md:text-4xl">{title}</h1>
          {subtitle && <p className="mt-3 text-lg text-prism-ink-muted">{subtitle}</p>}
          {(meta || status) && (
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-prism-ink-subtle">
              {status}
              {meta && <p>{meta}</p>}
            </div>
          )}
        </header>

        <div className="grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
          {items.length > 1 && (
            <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
              <p className="mb-2 font-mono text-xs uppercase tracking-widest text-prism-ink-subtle">On this page</p>
              <ol className="flex flex-col gap-1.5 text-sm">
                {items.map((i) => (
                  <li key={i.id}><a href={`#${i.id}`} className="text-prism-ink-muted underline-offset-4 hover:text-prism-ink hover:underline">{i.label}</a></li>
                ))}
              </ol>
            </nav>
          )}
          <article className={cx('min-w-0 max-w-3xl space-y-4', items.length <= 1 && 'lg:col-span-2')}>{children}</article>
        </div>
      </div>
    </PageLayout>
  )
}