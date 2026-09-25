import { cx } from '../../lib/cx.js'

// Progress through a task (e.g. "3 of 7 steps") — not a score display.
export function ProgressBar({ value, max = 100, label, valueText, className }) {
  const clamped = Math.max(0, Math.min(Number(value) || 0, max))
  const pct = max > 0 ? (clamped / max) * 100 : 0
  return (
    <div className={cx('w-full', className)}>
      {label && (
        <div className="mb-1 flex justify-between text-sm">
          <span className="font-medium text-prism-ink">{label}</span>
          {valueText && <span className="text-prism-ink-muted">{valueText}</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={clamped}
        aria-valuetext={valueText}
        className="h-2 w-full overflow-hidden rounded-full bg-prism-subtle"
      >
        <div className="h-full rounded-full bg-prism-accent transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default ProgressBar
