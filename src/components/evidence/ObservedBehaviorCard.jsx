import { cx } from '../../lib/cx.js'

// One observed behaviour (spec §13.2, §15). A quote appears only when the
// server verified it is the candidate's own words.
export function ObservedBehaviorCard({ behavior, quote = null, practice = false, className }) {
  return (
    <div
      className={cx(
        'rounded-[var(--prism-radius-md)] border p-3 text-sm',
        practice ? 'border-dashed border-prism-border bg-prism-surface' : 'border-prism-border bg-prism-subtle',
        className,
      )}
    >
      <p className="text-prism-ink">{behavior}</p>
      {quote && (
        <figure className="mt-2">
          <blockquote className="text-prism-ink-muted">&ldquo;{quote}&rdquo;</blockquote>
          <figcaption className="mt-1 text-xs text-prism-ink-subtle">Your words.</figcaption>
        </figure>
      )}
    </div>
  )
}

export default ObservedBehaviorCard
