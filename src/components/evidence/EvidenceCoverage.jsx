import { cx } from '../../lib/cx.js'

// How many capabilities have enough evidence to be described, in words and as
// one marker per capability. A count, never a percentage or a score.
export function EvidenceCoverage({ items, className }) {
  const described = items.filter((c) => Boolean(c.level)).length
  const total = items.length
  if (total === 0) return null
  return (
    <div className={cx('flex flex-wrap items-center gap-3 text-sm', className)} data-testid="evidence-coverage">
      <ul className="flex gap-1" aria-hidden="true">
        {items.map((c) => (
          <li key={c.id} className={cx('h-2.5 w-6 rounded-full border', c.level ? 'border-prism-accent bg-prism-accent' : 'border-prism-border-strong')} />
        ))}
      </ul>
      <p className="text-prism-ink">
        {described} of {total} {total === 1 ? 'capability has' : 'capabilities have'} enough evidence to describe.
        <span className="sr-only"> The others say what is missing.</span>
      </p>
    </div>
  )
}

export default EvidenceCoverage