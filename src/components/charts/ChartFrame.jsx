import { cx } from '../../lib/cx.js'

// One frame for every Prism chart: what it shows in words, how many people it
// rests on, and honest states when there is nothing, or too little, to draw.
// The table equivalent always follows, so the data is never only a picture.
export function ChartFrame({ title, description, n, status = 'ready', emptyText = 'There is nothing to chart yet.', insufficientText = 'There are too few students to show this chart without identifying anyone.', children, table, className }) {
  return (
    <figure className={cx('space-y-3', className)} data-chart-status={status}>
      {(title || n != null) && (
        <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
          {title && <span className="text-sm font-semibold text-prism-ink">{title}</span>}
          {n != null && <span className="text-xs text-prism-ink-subtle">Based on {n} {n === 1 ? 'student' : 'students'}</span>}
        </figcaption>
      )}
      {description && <p className="text-xs text-prism-ink-muted">{description}</p>}
      {status === 'ready' && children}
      {status === 'empty' && <p role="status" className="rounded-[var(--prism-radius-md)] border border-dashed border-prism-border p-4 text-sm text-prism-ink-muted">{emptyText}</p>}
      {status === 'insufficient' && <p role="status" className="rounded-[var(--prism-radius-md)] border border-dashed border-prism-border p-4 text-sm text-prism-ink-muted">{insufficientText}</p>}
      {table}
    </figure>
  )
}

export default ChartFrame