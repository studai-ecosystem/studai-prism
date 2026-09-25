import { cx } from '../../lib/cx.js'

function Bar({ className }) {
  return <div className={cx('animate-pulse rounded bg-prism-subtle', className)} />
}

// Loading placeholder. Announced once via role=status; visuals are aria-hidden.
export function Skeleton({ variant = 'block', label = 'Loading', lines = 3, className }) {
  return (
    <div role="status" aria-live="polite" className={cx(variant === 'page' && 'mx-auto w-full max-w-6xl px-4 py-6 md:px-8', className)}>
      <span className="sr-only">{label}…</span>
      <div aria-hidden="true" className="space-y-3">
        {variant === 'page' && <Bar className="mb-6 h-8 w-64" />}
        {variant === 'page' ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => <Bar key={i} className="h-32" />)}
          </div>
        ) : (
          Array.from({ length: lines }, (_, i) => <Bar key={i} className={cx('h-4', i === lines - 1 ? 'w-2/3' : 'w-full')} />)
        )}
      </div>
    </div>
  )
}

export default Skeleton
