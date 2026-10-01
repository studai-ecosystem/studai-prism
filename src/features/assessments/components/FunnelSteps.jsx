import { Check } from 'lucide-react'
import { cx } from '../../../lib/cx.js'

// Where the candidate is on the way to an assessment. Orientation only: it
// never shows a score, a percentage or how well anything is going.
const STEPS = [
  { id: 'briefing', label: 'Briefing' },
  { id: 'check', label: 'Device and consent' },
  { id: 'assessment', label: 'Assessment' },
  { id: 'report', label: 'Report' },
]

export function FunnelSteps({ current, className }) {
  const at = Math.max(0, STEPS.findIndex((s) => s.id === current))
  return (
    <ol aria-label="Steps to your assessment" className={cx('mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs', className)} data-testid="funnel-steps">
      {STEPS.map((s, i) => {
        const done = i < at
        const here = i === at
        return (
          <li key={s.id} aria-current={here ? 'step' : undefined} className={cx('flex items-center gap-2', here ? 'font-semibold text-prism-ink' : 'text-prism-ink-muted')}>
            <span
              aria-hidden="true"
              className={cx(
                'flex h-5 w-5 items-center justify-center rounded-full border text-[11px]',
                done ? 'border-prism-accent bg-prism-accent text-prism-accent-ink' : here ? 'border-prism-ink' : 'border-prism-border-strong',
              )}
            >
              {done ? <Check size={12} /> : i + 1}
            </span>
            {s.label}
            <span className="sr-only">{done ? ' (done)' : here ? ' (current step)' : ' (later)'}</span>
          </li>
        )
      })}
    </ol>
  )
}

export default FunnelSteps