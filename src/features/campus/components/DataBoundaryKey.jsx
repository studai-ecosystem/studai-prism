import { Badge } from '../../../components/ui/Badge.jsx'
import { cx } from '../../../lib/cx.js'

// Three kinds of information, and where each one stands for an institution.
// Access is enforced by the server; this only tells people what they are
// looking at.
const KINDS = [
  { id: 'sponsored', label: 'Institution-sponsored', tone: 'accent', dashed: false, text: 'Assessments your institution assigned, and their reports. Shown here.' },
  { id: 'shared', label: 'Shared by the student', tone: 'neutral', dashed: false, text: 'Only what a student chose to share with your institution.' },
  { id: 'private', label: 'Personal-private', tone: 'neutral', dashed: true, text: 'A student\u2019s own Prism activity. Never shown here.' },
]

export function DataBoundaryKey({ className }) {
  return (
    <ul className={cx('grid gap-3 text-sm sm:grid-cols-3', className)} aria-label="What institutions can and cannot see" data-testid="data-boundary">
      {KINDS.map((k) => (
        <li key={k.id} className={cx('space-y-1 rounded-[var(--prism-radius-md)] border p-3', k.dashed ? 'border-dashed border-prism-border-strong' : 'border-prism-border')}>
          <Badge tone={k.tone}>{k.label}</Badge>
          <p className="text-prism-ink-muted">{k.text}</p>
        </li>
      ))}
    </ul>
  )
}

export default DataBoundaryKey