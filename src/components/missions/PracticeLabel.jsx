import { Target } from 'lucide-react'
import { cx } from '../../lib/cx.js'

// Practice is always dashed and named, so it cannot be mistaken for a formal
// assessment (which is solid and labelled "Formal assessment").
export function PracticeLabel({ variant = 'pill', className }) {
  if (variant === 'band') {
    return (
      <div className={cx('flex items-start gap-3 rounded-[var(--prism-radius-lg)] border border-dashed border-prism-border-strong bg-prism-subtle p-4', className)} data-testid="practice-label">
        <Target size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-prism-ink-muted" />
        <div className="text-sm">
          <p className="font-semibold text-prism-ink">Practice mission</p>
          <p className="text-prism-ink-muted">This is practice, not a formal assessment. It can give feedback and hints, and it never changes your formal results.</p>
        </div>
      </div>
    )
  }
  return (
    <span className={cx('inline-flex items-center rounded-full border border-dashed border-prism-border-strong px-2 py-0.5 text-xs font-medium text-prism-ink-muted', className)} data-testid="practice-label">
      Practice
    </span>
  )
}

export default PracticeLabel