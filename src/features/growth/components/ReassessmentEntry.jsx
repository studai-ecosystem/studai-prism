import { LinkButton } from '../../../components/ui/Button.jsx'
import { Card } from '../../../components/ui/Card.jsx'
import { formatDateTime } from '../../student/QueryState.jsx'
import { GROWTH_COPY } from '../../../lib/copy/student.js'

// The way into a reassessment. Shown only when the server lists one: open now
// (with a link) or scheduled (with its date). Never a promise of a result.
export function ReassessmentEntry({ reassessments, assessmentsPath = '/app/assessments' }) {
  const list = reassessments || []
  const open = list.find((r) => r.status === 'ACTIVE' && r.rosterStatus !== 'COMPLETED' && !r.endedAt)
  const upcoming = open ? null : list.find((r) => r.status === 'SCHEDULED')
  const r = open || upcoming
  if (!r) return null
  return (
    <Card className="space-y-2 p-4" data-testid="reassessment-entry">
      <h3 className="text-sm font-semibold text-prism-ink">Reassessment</h3>
      <p className="text-sm text-prism-ink">{open ? `${r.name} is open until ${formatDateTime(r.windowEnd)}.` : `${r.name} opens ${formatDateTime(r.windowStart)}.`}</p>
      {r.comparability !== 'APPROVED' && <p className="text-sm text-prism-ink-muted">{GROWTH_COPY.reassessmentNotComparable}</p>}
      {open && <LinkButton to={assessmentsPath} variant="secondary" size="sm">Go to your assessments</LinkButton>}
    </Card>
  )
}

export default ReassessmentEntry