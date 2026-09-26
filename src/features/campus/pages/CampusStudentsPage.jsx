// Students directory (spec §21): server-side pagination and filters, only
// students in the caller's scope, sponsored assessment status only.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DataTable, Pagination } from '../../../components/ui/DataTable.jsx'
import { Input, Select } from '../../../components/ui/FormControls.jsx'
import { Button, LinkButton } from '../../../components/ui/Button.jsx'
import { Modal } from '../../../components/ui/Modal.jsx'
import { ErrorState } from '../../../components/states/ErrorState.jsx'
import { useToast } from '../../../components/ui/Toast.jsx'
import { MEMBER_STATUS_LABELS, ASSESSMENT_STATUS_LABELS } from '../../../lib/copy/campus.js'
import { campusAdminApi } from '../../../api/campusAdmin.js'
import { CampusPage, AssessmentStatus, MutationError, downloadText } from '../components/CampusPage.jsx'
import { useCampusOrg, useStudents, useCohorts, useMoveStudents, useResendInvite } from '../hooks.js'

const PAGE_SIZE = 25

export default function CampusStudentsPage() {
  const { orgId, can } = useCampusOrg()
  const toast = useToast()
  const [filters, setFilters] = useState({ q: '', cohortId: '', status: '', assessment: '' })
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState([])
  const [moveOpen, setMoveOpen] = useState(false)
  const [target, setTarget] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(null)
  const query = useStudents({ ...filters, page, pageSize: PAGE_SIZE })
  const cohorts = useCohorts()
  const move = useMoveStudents()
  const resend = useResendInvite()
  const manage = can('students.manage')

  const setFilter = (key) => (e) => { setFilters((f) => ({ ...f, [key]: e.target.value })); setPage(1); setSelected([]) }
  const cohortOptions = (cohorts.data || []).filter((c) => c.status === 'ACTIVE').map((c) => ({ value: c.id, label: c.name }))
  const d = query.data
  const filtered = Object.values(filters).some(Boolean)
  async function onExport() {
    setExporting(true)
    setExportError(null)
    try {
      const file = await campusAdminApi.exportStudents(orgId, filters)
      downloadText(file.fileName, file.csv, file.contentType)
      toast.show('The student list was downloaded.', { tone: 'positive' })
    } catch (err) {
      setExportError(err)
    } finally {
      setExporting(false)
    }
  }

  function onMove() {
    move.mutate({ userIds: selected, toCohortId: target }, {
      onSuccess: (r) => {
        toast.show(`${r.moved} ${r.moved === 1 ? 'student' : 'students'} added to the cohort.`, { tone: 'positive' })
        setMoveOpen(false)
        setSelected([])
      },
    })
  }

  const columns = [
    {
      key: 'name',
      header: 'Student',
      render: (r) => (r.kind === 'MEMBER'
        ? <Link className="font-medium text-prism-accent-strong hover:underline" to={`/campus/${orgId}/students/${encodeURIComponent(r.userId)}`}>{r.name || r.email}</Link>
        : <span>{r.email}</span>),
    },
    { key: 'email', header: 'Email', render: (r) => (r.kind === 'MEMBER' ? r.email : '') },
    { key: 'cohorts', header: 'Cohorts', render: (r) => r.cohorts.map((c) => c.name).join(', ') || 'None' },
    { key: 'status', header: 'Enrolment', render: (r) => MEMBER_STATUS_LABELS[r.status] || r.status },
    { key: 'assessment', header: 'Latest sponsored assessment', render: (r) => <AssessmentStatus status={r.assessment.status} /> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      render: (r) => (r.kind === 'INVITE' && manage
        ? <Button size="sm" variant="ghost" loading={resend.isPending && resend.variables === r.inviteId} onClick={() => resend.mutate(r.inviteId, { onSuccess: () => toast.show(`Invitation sent again to ${r.email}.`, { tone: 'positive' }) })}>Resend invite</Button>
        : null),
    },
  ]

  return (
    <CampusPage
      title="Students"
      description="Students you are responsible for and their sponsored assessments. Personal Prism activity is never shown."
      actions={(
        <>
          {can('exports.cohort') && <Button variant="secondary" onClick={onExport} loading={exporting} loadingLabel="Preparing…">Export CSV</Button>}
          {manage && <LinkButton variant="primary" to={`/campus/${orgId}/cohorts/import`}>Import students</LinkButton>}
        </>
      )}
    >
      <form role="search" aria-label="Filter students" className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => e.preventDefault()}>
        <Input label="Search" type="search" value={filters.q} onChange={setFilter('q')} placeholder="Name or email" />
        <Select label="Cohort" value={filters.cohortId} onChange={setFilter('cohortId')} options={cohortOptions} placeholder="All cohorts" />
        <Select label="Enrolment" value={filters.status} onChange={setFilter('status')} placeholder="Any" options={['ACTIVE', 'INVITED', 'SUSPENDED'].map((v) => ({ value: v, label: MEMBER_STATUS_LABELS[v] }))} />
        <Select label="Sponsored assessment" value={filters.assessment} onChange={setFilter('assessment')} placeholder="Any" options={Object.entries(ASSESSMENT_STATUS_LABELS).map(([value, label]) => ({ value, label }))} />
      </form>
      <MutationError error={exportError} />
      {query.error && !d ? (
        <ErrorState title="The student list could not be loaded" requestId={query.error.requestId} onRetry={() => query.refetch()} />
      ) : (
        <>
          {manage && selected.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-[var(--prism-radius-md)] border border-prism-border bg-prism-subtle px-3 py-2 text-sm" role="region" aria-label="Selected students">
              <span>{selected.length} selected</span>
              <Button size="sm" variant="secondary" onClick={() => setMoveOpen(true)}>Add to cohort</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear selection</Button>
            </div>
          )}
          <DataTable
            caption="Students"
            columns={columns}
            rows={d?.items || []}
            rowKey={(r) => r.userId || `invite-${r.inviteId}`}
            loading={query.isPending}
            emptyMessage={filtered ? 'No students match these filters.' : 'No students yet. Import a CSV file or invite students from a cohort.'}
            selectable={manage}
            selected={selected}
            isRowSelectable={(r) => r.kind === 'MEMBER'}
            rowLabel={(r) => r.name || r.email || 'student'}
            onSelectedChange={setSelected}
          />
          {d && (
            <Pagination
              summary={d.total ? `Showing ${(d.page - 1) * d.pageSize + 1}–${Math.min(d.total, d.page * d.pageSize)} of ${d.total}` : 'No students'}
              hasPrevious={d.page > 1}
              hasNext={d.page * d.pageSize < d.total}
              onPrevious={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => p + 1)}
            />
          )}
        </>
      )}
      <Modal
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        title="Add to cohort"
        description="Students stay in their current cohorts and are also added to this one. Open assessments for the cohort are assigned to them."
        size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setMoveOpen(false)}>Cancel</Button>
            <Button onClick={onMove} disabled={!target} loading={move.isPending}>Add {selected.length}</Button>
          </>
        )}
      >
        <Select label="Cohort" value={target} onChange={(e) => setTarget(e.target.value)} options={cohortOptions} placeholder="Choose a cohort" required />
        <MutationError error={move.error} />
      </Modal>
    </CampusPage>
  )
}
