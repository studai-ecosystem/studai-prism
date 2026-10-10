// Assignment detail (spec §25): completion for the students in the caller's
// scope, links to finished sponsored reports, close or cancel the window.
import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Panel, StatCard } from '../../../components/ui/Card.jsx'
import { DataTable, Pagination } from '../../../components/ui/DataTable.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { useToast } from '../../../components/ui/Toast.jsx'
import { formatDate } from '../../student/QueryState.jsx'
import { CampusPage, AssessmentStatus, ConfirmDialog, crumbs } from '../components/CampusPage.jsx'
import { AssignmentStatus } from './CampusAssessmentsPage.jsx'
import { useCampusOrg, useCompletion, useSetAssignmentStatus, useCursorPages } from '../hooks.js'

export default function CampusAssignmentDetailPage() {
  const { assignmentId } = useParams()
  const { orgId, can } = useCampusOrg()
  const toast = useToast()
  const pages = useCursorPages()
  const query = useCompletion(assignmentId, { cursor: pages.cursor })
  const setStatus = useSetAssignmentStatus(assignmentId)
  const [closing, setClosing] = useState(null)
  const d = query.data
  const title = d?.assignment.title || 'Assessment'
  // The server counts every student you can see (the table shows one page).
  const count = (s) => (d.statusCounts ? d.statusCounts[s] || 0 : d.students.filter((x) => x.status === s).length)
  const assigned = d ? (d.total ?? d.students.length) : 0
  const live = d && ['ACTIVE', 'SCHEDULED'].includes(d.assignment.status)
  return (
    <CampusPage
      title={title}
      description={d ? `${formatDate(d.assignment.windowStart) || '…'} – ${formatDate(d.assignment.windowEnd) || '…'}` : undefined}
      breadcrumbs={crumbs(orgId, { label: 'Assessments', to: `/campus/${orgId}/assessments` }, { label: title })}
      query={query}
      actions={can('assignments.write') && live && (
        <>
          <Button variant="secondary" onClick={() => setClosing('CLOSED')}>Close window</Button>
          <Button variant="ghost" onClick={() => setClosing('CANCELLED')}>Cancel assessment</Button>
        </>
      )}
    >
      {d && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-prism-ink-muted">Status:</span> <AssignmentStatus status={d.assignment.status} /></div>
          <section aria-labelledby="completion-heading">
            <h2 id="completion-heading" className="mb-3 text-base font-semibold text-prism-ink">Completion</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Assigned" value={assigned} provenance="Students you can see" />
              <StatCard label="Not started" value={count('ASSIGNED') + count('ACKNOWLEDGED')} />
              <StatCard label="In progress" value={count('IN_PROGRESS')} />
              <StatCard label="Completed" value={count('COMPLETED')} />
            </div>
          </section>
          <Panel title="Students">
            <DataTable
              caption={`Students assigned ${title}`}
              rows={d.students}
              rowKey={(s) => s.userId}
              emptyMessage="No students are assigned yet. Students added to the cohorts are assigned automatically while the window is open."
              columns={[
                { key: 'name', header: 'Student', render: (s) => (can('students.read') ? <Link className="text-prism-accent-strong hover:underline" to={`/campus/${orgId}/students/${encodeURIComponent(s.userId)}`}>{s.name || s.email || 'Student'}</Link> : (s.name || s.email)) },
                { key: 'status', header: 'Status', render: (s) => <AssessmentStatus status={s.status} /> },
                { key: 'completedAt', header: 'Completed', render: (s) => formatDate(s.completedAt) || '—' },
                { key: 'report', header: 'Report', render: (s) => (s.reportAvailable ? <Link className="text-prism-accent-strong hover:underline" to={`/campus/${orgId}/reports/${encodeURIComponent(s.sessionId)}`}>Open report</Link> : <span className="text-prism-ink-muted">Not available</span>) },
              ]}
            />
            {(pages.hasPrevious || d.nextCursor) && (
              <Pagination
                summary={`Page ${pages.page} · ${assigned} ${assigned === 1 ? 'student' : 'students'}`}
                hasPrevious={pages.hasPrevious}
                hasNext={Boolean(d.nextCursor)}
                onPrevious={pages.previous}
                onNext={() => pages.next(d.nextCursor)}
              />
            )}
          </Panel>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(closing)}
        title={closing === 'CANCELLED' ? 'Cancel this assessment?' : 'Close the window?'}
        description={closing === 'CANCELLED'
          ? 'Students who have not finished can no longer start. Finished reports are kept.'
          : 'Students who have not started can no longer start. Finished reports are kept.'}
        confirmLabel={closing === 'CANCELLED' ? 'Cancel assessment' : 'Close window'}
        tone="danger"
        pending={setStatus.isPending}
        error={setStatus.error}
        onClose={() => setClosing(null)}
        onConfirm={() => setStatus.mutate(closing, { onSuccess: () => { toast.show(closing === 'CANCELLED' ? 'Assessment cancelled.' : 'Window closed.', { tone: 'positive' }); setClosing(null) } })}
      />
    </CampusPage>
  )
}
