import { Link } from 'react-router-dom'
import { cx } from '../../../lib/cx.js'

// Baseline, development, reassessment, change. Each stage says only what the
// intervention record knows; change is never implied before a comparable
// reassessment exists.
export function InterventionLoop({ intervention: i, orgId, canReassess = false, canAnalytics = false, compact = false }) {
  const dev = i.status === 'COMPLETED' ? 'Finished' : i.status === 'CANCELLED' ? 'Cancelled' : `${i.counts.started} of ${i.counts.members} students started`
  const stages = [
    { id: 'baseline', label: 'Baseline', state: 'The cohort\u2019s earlier completed assessment, chosen when a reassessment is scheduled.', done: false },
    { id: 'development', label: 'Development', state: dev, done: i.status === 'COMPLETED' },
    {
      id: 'reassessment',
      label: 'Reassessment',
      state: i.reassessmentPlanned ? 'Planned after this intervention.' : 'Not planned.',
      link: i.reassessmentPlanned && canReassess ? { to: `/campus/${orgId}/reassessments`, text: 'Open reassessments' } : null,
      done: false,
    },
    {
      id: 'change',
      label: 'Change',
      state: 'Shown only after a comparable reassessment.',
      link: canAnalytics ? { to: `/campus/${orgId}/analytics`, text: 'Open analytics' } : null,
      done: false,
    },
  ]
  return (
    <ol className={cx('grid gap-3', compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-4')} aria-label="Baseline, development, reassessment, change" data-testid="intervention-loop">
      {stages.map((s, n) => (
        <li key={s.id} className={cx('space-y-1 rounded-[var(--prism-radius-md)] border p-3 text-sm', s.done ? 'border-prism-accent' : 'border-prism-border')}>
          <p className="text-xs font-semibold uppercase tracking-wide text-prism-ink-subtle"><span aria-hidden="true">{n + 1}. </span>{s.label}</p>
          <p className="text-prism-ink">{s.state}</p>
          {s.link && <Link to={s.link.to} className="text-prism-accent-strong underline">{s.link.text}</Link>}
        </li>
      ))}
    </ol>
  )
}

export default InterventionLoop