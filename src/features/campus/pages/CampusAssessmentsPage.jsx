// Campus assessments (spec §25): sponsored assessment windows and progress.
import { Link } from 'react-router-dom'
import { DataTable } from '../../../components/ui/DataTable.jsx'
import { LinkButton } from '../../../components/ui/Button.jsx'
import { StatusChip } from '../../../components/ui/Badge.jsx'
import { EmptyState } from '../../../components/states/EmptyState.jsx'
import { formatDate } from '../../student/QueryState.jsx'
import { ASSIGNMENT_STATUS_LABELS } from '../../../lib/copy/campus.js'
import { CampusPage } from '../components/CampusPage.jsx'
import { useCampusOrg, useAssignments } from '../hooks.js'

const TONE = { DRAFT: 'neutral', SCHEDULED: 'accent', ACTIVE: 'positive', CLOSED: 'insufficient', CANCELLED: 'insufficient' }
export const AssignmentStatus = ({ status }) => <StatusChip tone={TONE[status] || 'neutral'} label={ASSIGNMENT_STATUS_LABELS[status] || status} />

export default function CampusAssessmentsPage() {
  const { orgId, can } = useCampusOrg()
  const query = useAssignments()
  const rows = query.data || []
  const write = can('assignments.write')
  const assign = write && <LinkButton variant="primary" to={`/campus/${orgId}/assessments/assign`}>Assign an assessment</LinkButton>
  return (
    <CampusPage
      title="Assessments"
      description="Sponsored assessments you have assigned. Assessment content is fixed and approved; it cannot be edited here."
      query={query}
      actions={assign}
    >
      {rows.length === 0 ? (
        <EmptyState title="No assessments assigned yet" description="Choose an approved assessment and the cohorts who should take it." action={assign || null} />
      ) : (
        <DataTable
          caption="Sponsored assessments"
          rows={rows}
          columns={[
            { key: 'title', header: 'Assessment', render: (a) => <Link className="font-medium text-prism-accent-strong hover:underline" to={`/campus/${orgId}/assessments/${a.id}`}>{a.title || 'Assessment'}</Link> },
            { key: 'window', header: 'Window', render: (a) => `${formatDate(a.windowStart) || '…'} – ${formatDate(a.windowEnd) || '…'}` },
            { key: 'status', header: 'Status', render: (a) => <AssignmentStatus status={a.status} /> },
            { key: 'completed', header: 'Completed', render: (a) => `${a.counts.COMPLETED || 0} of ${a.counts.total || 0}` },
          ]}
        />
      )}
    </CampusPage>
  )
}
