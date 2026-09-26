// Program detail (spec §24): cohorts, sponsored assessments and status.
import { useParams, Link } from 'react-router-dom'
import { Panel } from '../../../components/ui/Card.jsx'
import { DataTable } from '../../../components/ui/DataTable.jsx'
import { Select } from '../../../components/ui/FormControls.jsx'
import { LinkButton } from '../../../components/ui/Button.jsx'
import { useToast } from '../../../components/ui/Toast.jsx'
import { formatDate } from '../../student/QueryState.jsx'
import { PROGRAM_STATUS_LABELS, ASSIGNMENT_STATUS_LABELS } from '../../../lib/copy/campus.js'
import { CampusPage, MutationError, crumbs } from '../components/CampusPage.jsx'
import { ProgramStatus } from './CampusProgramsPage.jsx'
import { useCampusOrg, useProgram, useUpdateProgram } from '../hooks.js'

export default function CampusProgramDetailPage() {
  const { programId } = useParams()
  const { orgId, can } = useCampusOrg()
  const toast = useToast()
  const query = useProgram(programId)
  const update = useUpdateProgram(programId)
  const d = query.data
  const name = d?.program.name || 'Program'
  return (
    <CampusPage
      title={name}
      description={d?.program.description || undefined}
      breadcrumbs={crumbs(orgId, { label: 'Programs', to: `/campus/${orgId}/programs` }, { label: name })}
      query={query}
      actions={can('assignments.write') && d && <LinkButton variant="primary" to={`/campus/${orgId}/assessments/assign?program=${programId}`}>Assign an assessment</LinkButton>}
    >
      {d && (
        <div className="space-y-6">
          <Panel title="Details">
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-prism-ink-muted">Status</dt><dd className="mt-1"><ProgramStatus status={d.program.status} /></dd></div>
              <div><dt className="text-prism-ink-muted">Starts</dt><dd className="mt-1">{formatDate(d.program.startsOn) || 'Not set'}</dd></div>
              <div><dt className="text-prism-ink-muted">Ends</dt><dd className="mt-1">{formatDate(d.program.endsOn) || 'Not set'}</dd></div>
            </dl>
            {can('programs.write') && (
              <div className="mt-4 max-w-xs">
                <Select
                  label="Change status"
                  value={d.program.status}
                  onChange={(e) => update.mutate({ status: e.target.value }, { onSuccess: () => toast.show('Program updated.', { tone: 'positive' }) })}
                  options={Object.entries(PROGRAM_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
                  disabled={update.isPending}
                />
                <MutationError error={update.error} />
              </div>
            )}
          </Panel>
          <Panel title="Cohorts">
            <DataTable
              caption="Cohorts in this program"
              rows={d.cohorts}
              emptyMessage="No cohorts in this program yet."
              columns={[
                { key: 'name', header: 'Cohort', render: (c) => <Link className="text-prism-accent-strong hover:underline" to={`/campus/${orgId}/cohorts/${c.id}`}>{c.name}</Link> },
                { key: 'memberCount', header: 'Students', align: 'right', render: (c) => c.memberCount ?? '—' },
              ]}
            />
          </Panel>
          <Panel title="Sponsored assessments">
            <DataTable
              caption="Assessments in this program"
              rows={d.assignments}
              emptyMessage="No assessments assigned in this program yet."
              columns={[
                { key: 'title', header: 'Assessment', render: (a) => <Link className="text-prism-accent-strong hover:underline" to={`/campus/${orgId}/assessments/${a.id}`}>{a.title || 'Assessment'}</Link> },
                { key: 'status', header: 'Window', render: (a) => ASSIGNMENT_STATUS_LABELS[a.status] || a.status },
                { key: 'completed', header: 'Completed', render: (a) => `${a.counts.COMPLETED || 0} of ${a.counts.total || 0}` },
              ]}
            />
          </Panel>
        </div>
      )}
    </CampusPage>
  )
}
