// Programs (spec §24): a program groups cohorts, assessments and (later)
// development for a period, with a reporting policy.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DataTable } from '../../../components/ui/DataTable.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { Modal } from '../../../components/ui/Modal.jsx'
import { Input, Textarea, Checkbox } from '../../../components/ui/FormControls.jsx'
import { StatusChip } from '../../../components/ui/Badge.jsx'
import { EmptyState } from '../../../components/states/EmptyState.jsx'
import { useToast } from '../../../components/ui/Toast.jsx'
import { formatDate } from '../../student/QueryState.jsx'
import { PROGRAM_STATUS_LABELS } from '../../../lib/copy/campus.js'
import { CampusPage, MutationError, focusFirstInvalid } from '../components/CampusPage.jsx'
import { useCampusOrg, usePrograms, useCohorts, useCreateProgram } from '../hooks.js'

const TONE = { DRAFT: 'neutral', ACTIVE: 'positive', COMPLETED: 'accent', ARCHIVED: 'insufficient' }
export const ProgramStatus = ({ status }) => <StatusChip tone={TONE[status]} label={PROGRAM_STATUS_LABELS[status] || status} />

const EMPTY = { name: '', description: '', startsOn: '', endsOn: '', cohortIds: [] }

function CreateProgramDialog({ open, onClose }) {
  const cohorts = useCohorts()
  const create = useCreateProgram()
  const toast = useToast()
  const [form, setForm] = useState(EMPTY)
  const [touched, setTouched] = useState(false)
  const errors = {
    name: touched && !form.name.trim() ? 'Give the program a name.' : null,
    endsOn: touched && form.startsOn && form.endsOn && form.endsOn < form.startsOn ? 'The end date must be after the start date.' : null,
  }
  const toggleCohort = (id) => setForm((f) => ({ ...f, cohortIds: f.cohortIds.includes(id) ? f.cohortIds.filter((x) => x !== id) : [...f.cohortIds, id] }))
  function submit(e) {
    e.preventDefault()
    setTouched(true)
    if (!form.name.trim() || (form.startsOn && form.endsOn && form.endsOn < form.startsOn)) return focusFirstInvalid()
    create.mutate({
      name: form.name.trim(),
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
      ...(form.startsOn ? { startsOn: form.startsOn } : {}),
      ...(form.endsOn ? { endsOn: form.endsOn } : {}),
      cohortIds: form.cohortIds,
    }, {
      onSuccess: (p) => { toast.show(`Program "${p.name}" created.`, { tone: 'positive' }); setForm(EMPTY); setTouched(false); onClose() },
    })
  }
  const active = (cohorts.data || []).filter((c) => c.status === 'ACTIVE')
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a program"
      size="lg"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="create-program" loading={create.isPending}>Create program</Button>
        </>
      )}
    >
      <form id="create-program" className="space-y-4" onSubmit={submit} noValidate>
        <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required error={errors.name} maxLength={160} />
        <Textarea label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} maxLength={2000} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Starts" type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} />
          <Input label="Ends" type="date" value={form.endsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} error={errors.endsOn} />
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-prism-ink">Cohorts</legend>
          {active.length ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {active.map((c) => <Checkbox key={c.id} label={c.name} description={`${c.memberCount ?? 0} students`} checked={form.cohortIds.includes(c.id)} onChange={() => toggleCohort(c.id)} />)}
            </div>
          ) : <p className="text-sm text-prism-ink-muted">No cohorts yet. You can add them later.</p>}
        </fieldset>
        <MutationError error={create.error} />
      </form>
    </Modal>
  )
}

export default function CampusProgramsPage() {
  const { orgId, can } = useCampusOrg()
  const query = usePrograms()
  const [open, setOpen] = useState(false)
  const write = can('programs.write')
  const rows = query.data || []
  return (
    <CampusPage
      title="Programs"
      description="Programs group cohorts and assessments for a period, for example a placement season."
      query={query}
      actions={write && <Button onClick={() => setOpen(true)}>Create program</Button>}
    >
      {rows.length === 0 ? (
        <EmptyState title="No programs yet" description="Create a program to organise cohorts and assessments for a period." action={write ? <Button onClick={() => setOpen(true)}>Create program</Button> : null} />
      ) : (
        <DataTable
          caption="Programs"
          rows={rows}
          columns={[
            { key: 'name', header: 'Program', render: (p) => <Link className="font-medium text-prism-accent-strong hover:underline" to={`/campus/${orgId}/programs/${p.id}`}>{p.name}</Link> },
            { key: 'dates', header: 'Dates', render: (p) => (p.startsOn || p.endsOn ? `${formatDate(p.startsOn) || '…'} – ${formatDate(p.endsOn) || '…'}` : 'No dates set') },
            { key: 'status', header: 'Status', render: (p) => <ProgramStatus status={p.status} /> },
          ]}
        />
      )}
      {write && <CreateProgramDialog open={open} onClose={() => setOpen(false)} />}
    </CampusPage>
  )
}
