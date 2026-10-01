import { cx } from '../../lib/cx.js'

// A quote is shown only when the server verified it is the candidate's own
// words; without one this renders nothing rather than a placeholder.
export function EvidenceQuote({ quote, caption = 'Your words', className }) {
  if (!quote) return null
  return (
    <figure className={cx('space-y-1', className)}>
      <blockquote className="text-prism-ink">&ldquo;{quote}&rdquo;</blockquote>
      {caption && <figcaption className="text-xs text-prism-ink-subtle">{caption}</figcaption>}
    </figure>
  )
}

export default EvidenceQuote