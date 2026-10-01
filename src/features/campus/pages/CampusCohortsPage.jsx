// Cohorts (spec §23): the cohorts in the caller's scope, with create.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DataTable } from '../../../components/ui/DataTable.jsx'
import { Button, LinkButton } from '../../../components/ui/Button.jsx'
import { Modal } from '../../../components/ui/Modal.jsx'
import { Input, Select } from '../../../components/ui/FormControls.jsx'
import { StatusChip } from '../../../components/ui/Badge.jsx'
import { EmptyState } from '../../../components/states/EmptyState.jsx'
import { useToast } from '../../../components/ui/Toast.jsx'
import { CampusPage, MutationError, focusFirstInvalid } from '../components/CampusPage.jsx'
import { useCampusOrg, useCohorts, useStructure, useCreateCohort } from '../hooks.js'

function CreateCohortDialog({ open, onClose }) {
  const structure = useStructure()
  const create = useCreateCohort()
  const toast = useToast()
  const [form, setForm] = useState({ name: '', departmentId: '', academicProgramId: '', batchId: '', semester: '' })
  const [touched, setTouched] = useState(false)
  const s = structure.data
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const nameError = touched && !form.name.trim() ? 'Give the cohort a name.' : null
  function submit(e) {
    e.preventDefault()
    setTouched(true)
    if (!form.name.trim()) return focusFirstInvalid()
    const body = { name: form.name.trim() }
    for (const k of ['departmentId', 'academicProgramId', 'batchId']) if (form[k]) body[k] = form[k]
    if (form.semester.trim()) body.semester = form.semester.trim()
    create.mutate(body, {
      onSuccess: (c) => {
        toast.show(`Cohort "${c.name}" created.`, { tone: 'positive' })
        setForm({ name: '', departmentId: '', academicProgramId: '', batchId: '', semester: '' })
        setTouched(false)
        onClose()
      },
    })
  }
  const opts = (list) => (list || []).map((x) => ({ value: x.id, label: x.name }))
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a cohort"
      description="A cohort is a group of students you assign assessments to."
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="create-cohort" loading={create.isPending}>Create cohort</Button>
        </>
      )}
    >
      <form id="create-cohort" className="space-y-3" onSubmit={submit} noValidate>
        <Input label="Name" value={form.name} onChange={set('name')} required error={nameError} maxLength={160} />
        <Select label="Department" value={form.departmentId} onChange={set('departmentId')} options={opts(s?.departments)} placeholder="None" />
        <Select label="Academic program" value={form.academicProgramId} onChange={set('academicProgramId')} options={opts(s?.academicPrograms)} placeholder="None" />
        <Select label="Batch" value={form.batchId} onChange={set('batchId')} options={opts(s?.batches)} placeholder="None" />
        <Input label="Semester" value={form.semester} onChange={set('semester')} maxLength={40} hint="Optional, for example S5" />
        <MutationError error={create.error} />
      </form>
    </Modal>
  )
}

export default function CampusCohortsPage() {
  const { orgId, can } = useCampusOrg()
  const query = useCohorts()
  const [open, setOpen] = useState(false)
  const manage = can('students.manage')
  const rows = query.data || []
  return (
    <CampusPage
      title="Cohorts"
      description="Groups of students. Assessments and programs are assigned to cohorts."
      query={query}
      actions={manage && (
        <>
          <LinkButton to={`/campus/${orgId}/cohorts/import`}>Import students</LinkButton>
          <Button onClick={() => setOpen(true)}>Create cohort</Button>
        </>
      )}
    >
      {rows.length === 0 ? (
        <EmptyState title="No cohorts yet" description="Create a cohort, then import students into it." action={manage ? <Button onClick={() => setOpen(true)}>Create cohort</Button> : null} />
      ) : (
        <DataTable
          caption="Cohorts"
          rows={rows}
          columns={[
            { key: 'name', header: 'Cohort', render: (c) => <Link className="font-medium text-prism-accent-strong hover:underline" to={`/campus/${orgId}/cohorts/${c.id}`}>{c.name}</Link> },
            { key: 'semester', header: 'Semester', render: (c) => c.semester || '—' },
            { key: 'memberCount', header: 'Students', align: 'right', render: (c) => c.memberCount ?? '—' },
            { key: 'status', header: 'Status', render: (c) => <StatusChip tone={c.status === 'ACTIVE' ? 'positive' : 'insufficient'} label={c.status === 'ACTIVE' ? 'Active' : 'Archived'} /> },
          ]}
        />
      )}
      {manage && <CreateCohortDialog open={open} onClose={() => setOpen(false)} />}
    </CampusPage>
  )
}
