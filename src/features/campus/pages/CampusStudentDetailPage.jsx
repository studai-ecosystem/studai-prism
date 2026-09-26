// Student detail (spec §22): only data this organization may see — cohorts,
// sponsored assignments, sponsored reports and what the student chose to
// share. Every open of this page is recorded server-side.
import { useParams, Link } from 'react-router-dom'
import { Panel } from '../../../components/ui/Card.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'
import { DataTable } from '../../../components/ui/DataTable.jsx'
import { formatDate } from '../../student/QueryState.jsx'
import { MEMBER_STATUS_LABELS, STUDENT_DETAIL_PRIVACY } from '../../../lib/copy/campus.js'
import { CampusPage, AssessmentStatus, crumbs } from '../components/CampusPage.jsx'
import { useCampusOrg, useStudent } from '../hooks.js'

export default function CampusStudentDetailPage() {
  const { studentId } = useParams()
  const { orgId } = useCampusOrg()
  const query = useStudent(studentId)
  const d = query.data
  const title = d ? (d.student.name || d.student.email || 'Student') : 'Student'
  const reportFor = new Map((d?.completedSponsoredSessions || []).map((s) => [s.assignmentId, s.sessionId]))
  return (
    <CampusPage
      title={title}
      description={d ? `${d.student.email || ''}${d.student.email ? ' · ' : ''}${MEMBER_STATUS_LABELS[d.student.status] || d.student.status}` : undefined}
      breadcrumbs={crumbs(orgId, { label: 'Students', to: `/campus/${orgId}/students` }, { label: title })}
      query={query}
    >
      {d && (
        <div className="space-y-6">
          <Callout title="What you can see here">{STUDENT_DETAIL_PRIVACY}</Callout>
          <Panel title="Cohorts">
            {d.cohorts.length ? (
              <ul className="flex flex-wrap gap-2">
                {d.cohorts.map((c) => <li key={c.id}><Link className="text-prism-accent-strong hover:underline" to={`/campus/${orgId}/cohorts/${c.id}`}>{c.name}</Link></li>)}
              </ul>
            ) : <p className="text-sm text-prism-ink-muted">Not in a cohort yet.</p>}
          </Panel>
          <Panel title="Sponsored assessments">
            <DataTable
              caption="Sponsored assessments"
              rows={d.assignments}
              rowKey={(r) => r.assignmentId}
              emptyMessage="No sponsored assessments assigned yet."
              columns={[
                { key: 'title', header: 'Assessment', render: (r) => r.title || 'Assessment' },
                { key: 'status', header: 'Status', render: (r) => <AssessmentStatus status={r.status} /> },
                { key: 'completedAt', header: 'Completed', render: (r) => formatDate(r.completedAt) || 'Not yet' },
                {
                  key: 'report',
                  header: 'Report',
                  render: (r) => (reportFor.get(r.assignmentId)
                    ? <Link className="text-prism-accent-strong hover:underline" to={`/campus/${orgId}/reports/${encodeURIComponent(reportFor.get(r.assignmentId))}`}>Open report</Link>
                    : <span className="text-prism-ink-muted">Not available</span>),
                },
              ]}
            />
          </Panel>
          <Panel title="Shared by the student" description="Personal results appear here only when the student chooses to share them with your institution.">
            {d.sharedWithOrganization.length ? (
              <ul className="space-y-1 text-sm">
                {d.sharedWithOrganization.map((g) => (
                  <li key={g.id}>
                    {g.resources.length} {g.resources.length === 1 ? 'item' : 'items'} shared ({g.resources.map((r) => (r.disclosureLevel === 'FULL' ? 'full report' : 'summary')).join(', ')}), until {formatDate(g.expiresAt)}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-prism-ink-muted">Nothing shared.</p>}
          </Panel>
        </div>
      )}
    </CampusPage>
  )
}
