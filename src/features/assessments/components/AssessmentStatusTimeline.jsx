import { formatDate } from '../../student/QueryState.jsx'

// Where an assessment is in its life (spec §10): assigned → acknowledged →
// started → completed, with the real dates the server recorded. Steps that
// have not happened are shown as not yet reached — never inferred.
export function AssessmentStatusTimeline({ assignment }) {
  const steps = [
    { id: 'opens', label: assignment.opensAt ? 'Opens' : 'Available', date: assignment.opensAt, done: assignment.status !== 'UPCOMING' },
    ...(assignment.acknowledgementRequired ? [{ id: 'ack', label: 'Disclosure acknowledged', date: null, done: assignment.acknowledged }] : []),
    { id: 'started', label: 'Started', date: assignment.startedAt, done: Boolean(assignment.startedAt) || assignment.status === 'IN_PROGRESS' || assignment.status === 'COMPLETED' },
    { id: 'completed', label: 'Completed', date: assignment.completedAt, done: assignment.status === 'COMPLETED' },
  ]
  return (
    <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Progress">
      {steps.map((s) => (
        <li key={s.id} className={s.done ? 'text-prism-ink' : 'text-prism-ink-subtle'}>
          <span aria-hidden="true">{s.done ? '● ' : '○ '}</span>
          {s.label}
          {s.date && formatDate(s.date) ? ` · ${formatDate(s.date)}` : ''}
          <span className="sr-only">{s.done ? ' (done)' : ' (not yet)'}</span>
        </li>
      ))}
    </ol>
  )
}

export default AssessmentStatusTimeline
