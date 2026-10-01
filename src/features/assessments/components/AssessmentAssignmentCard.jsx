import { Link } from 'react-router-dom'
import { Clock, ShieldCheck } from 'lucide-react'
import { Card } from '../../../components/ui/Card.jsx'
import { Badge, StatusChip } from '../../../components/ui/Badge.jsx'
import { LinkButton } from '../../../components/ui/Button.jsx'
import { AssessmentStatusTimeline } from './AssessmentStatusTimeline.jsx'
import { ASSESSMENT_STATUS_COPY, CTA_COPY, INTEGRITY_COPY, SCOPE_LABEL } from '../../../lib/copy/student.js'
import { formatDate } from '../../student/QueryState.jsx'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { assignmentBase } from '../pages/BriefingPage.jsx'

// One assessment in the list (spec §10): title, scope (personal or sponsored,
// always visible), sponsor, duration, due date, integrity mode, status, CTA.
export function AssessmentAssignmentCard({ assignment, headingLevel = 3 }) {
  const H = `h${headingLevel}`
  const { active } = useWorkspace()
  const status = ASSESSMENT_STATUS_COPY[assignment.status] || ASSESSMENT_STATUS_COPY.NOT_STARTED
  const scope = assignment.scope === 'SPONSORED' ? SCOPE_LABEL.SPONSORED(assignment.sponsor?.name) : SCOPE_LABEL.PERSONAL
  const due = formatDate(assignment.dueAt)
  const opens = formatDate(assignment.opensAt)
  const cta = assignment.cta.to && CTA_COPY[assignment.cta.kind]
  return (
    <Card as="article" className="space-y-3 p-5" data-testid="assignment-card" data-scope={assignment.scope}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Badge tone={assignment.scope === 'SPONSORED' ? 'accent' : 'neutral'}>{scope}</Badge>
          <H className="text-base font-semibold text-prism-ink">
            <Link to={assignmentBase(active, assignment.id)} className="hover:underline">{assignment.title}</Link>
          </H>
        </div>
        <StatusChip tone={status.tone} label={status.label} />
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-prism-ink-muted">
        <li className="flex items-center gap-1"><Clock size={14} aria-hidden="true" /> About {assignment.durationMinutes} minutes</li>
        <li className="flex items-center gap-1"><ShieldCheck size={14} aria-hidden="true" /> {INTEGRITY_COPY[assignment.integrityMode]?.label || 'Standard'} integrity</li>
        {due && <li>Due {due}</li>}
        {assignment.status === 'UPCOMING' && opens && <li>Opens {opens}</li>}
      </ul>
      <AssessmentStatusTimeline assignment={assignment} />
      {assignment.underReview && (
        <p className="text-sm text-prism-ink-muted">This result is under review and is not included in your capabilities until the review is finished.</p>
      )}
      {cta && (
        <LinkButton to={assignment.cta.to} variant={assignment.cta.kind === 'VIEW_REPORT' ? 'secondary' : 'primary'}>
          {cta}<span className="sr-only">: {assignment.title}</span>
        </LinkButton>
      )}
    </Card>
  )
}

export default AssessmentAssignmentCard
