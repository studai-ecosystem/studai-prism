import { cx } from '../../../lib/cx.js'

// After the candidate finishes: submitted, reviewed, report. Text carries the
// state (colour never does), and nothing here implies how the review went.
export function SubmissionProgress({ stage }) {
  const steps = [
    { id: 'submitted', label: 'Answers submitted', state: 'done' },
    { id: 'review', label: 'Review', state: stage === 'REPORT' ? 'done' : stage === 'FAILED' ? 'blocked' : 'current' },
    { id: 'report', label: 'Report', state: stage === 'REPORT' ? 'done' : 'later' },
  ]
  const word = { done: 'done', current: 'in progress', blocked: 'did not finish', later: 'not yet' }
  return (
    <ol aria-label="What happens after you finish" className="mb-4 flex flex-wrap gap-x-6 gap-y-2 text-sm" data-testid="submission-progress">
      {steps.map((s) => (
        <li key={s.id} aria-current={s.state === 'current' ? 'step' : undefined} className={cx('flex items-center gap-2', s.state === 'later' ? 'text-prism-ink-muted' : 'text-prism-ink')}>
          <span
            aria-hidden="true"
            className={cx(
              'h-2.5 w-2.5 rounded-full border',
              s.state === 'done' && 'border-prism-accent bg-prism-accent',
              s.state === 'current' && 'border-prism-ink bg-prism-ink',
              s.state === 'blocked' && 'border-prism-blocked bg-prism-blocked',
              s.state === 'later' && 'border-prism-border-strong',
            )}
          />
          {s.label}{' '}
          <span className="text-xs text-prism-ink-muted">({word[s.state]})</span>
        </li>
      ))}
    </ol>
  )
}

export default SubmissionProgress