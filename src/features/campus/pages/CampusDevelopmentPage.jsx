// Campus development / interventions (spec §26; C8.09). Placement staff
// build cohort interventions around a target capability from published
// practice missions. Institutions see completion counts only — never a
// student's practice work — and completion never changes formal results.
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DataTable } from '../../../components/ui/DataTable.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { Modal } from '../../../components/ui/Modal.jsx'
import { Input, Select, Checkbox } from '../../../components/ui/FormControls.jsx'
import { StatusChip } from '../../../components/ui/Badge.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'
import { EmptyState } from '../../../components/states/EmptyState.jsx'
import { useToast } from '../../../components/ui/Toast.jsx'
import { formatDate } from '../../student/QueryState.jsx'
import { fetchInterventions, fetchPracticeCatalogue, createIntervention, setInterventionStatus } from '../../../api/development.js'
import { CampusPage, ConfirmDialog, MutationError, focusFirstInvalid, focusPageTitle } from '../components/CampusPage.jsx'
import { useCampusOrg, useCohorts } from '../hooks.js'

const STATUS = { ACTIVE: ['positive', 'Active'], COMPLETED: ['accent', 'Completed'], CANCELLED: ['insufficient', 'Cancelled'] }
// The admin's own calendar day (local), not the UTC one.
const dayOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const today = () => dayOf(new Date())
const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return dayOf(d) }
const students = (n) => `${n} ${n === 1 ? 'student' : 'students'}`

function InterventionBuilder({ open, onClose }) {
  const { orgId, key } = useCampusOrg()
  const queryClient = useQueryClient()
  const toast = useToast()
  const cohorts = useCohorts()
  const catalogue = useQuery({ queryKey: key('practice-catalogue'), queryFn: () => fetchPracticeCatalogue(orgId), enabled: open })
  const create = useMutation({
    mutationFn: (body) => createIntervention(orgId, body),
    onSuccess: (i) => {
      queryClient.invalidateQueries({ queryKey: key('interventions') })
      toast.show(`"${i.name}" created for ${students(i.counts.members)}.`, { tone: 'positive' })
      onClose()
    },
  })
  const defaults = () => ({ name: '', targetCapabilityId: '', cohortId: '', startsOn: today(), endsOn: inDays(28), missionIds: [], reassessmentPlanned: false })
  const { register, handleSubmit, watch, setValue, formState: { errors }, reset } = useForm({ defaultValues: defaults() })
  // Closing the builder discards what was typed and any validation messages.
  useEffect(() => { if (!open) { reset(defaults()); create.reset() } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const missionIds = watch('missionIds')
  const capability = watch('targetCapabilityId')
  const onValid = (v) => create.mutate({ ...v, reassessmentPlanned: Boolean(v.reassessmentPlanned) })
  const onInvalid = () => focusFirstInvalid()
  // Only missions that practise the chosen capability can be part of it.
  const missions = (catalogue.data?.missions || []).filter((m) => !capability || m.targetCapabilityId === capability)
  useEffect(() => {
    const allowed = new Set(missions.map((m) => m.id))
    if (missionIds.some((id) => !allowed.has(id))) setValue('missionIds', missionIds.filter((id) => allowed.has(id)))
  }, [capability]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create an intervention"
      description="Assign practice missions to a cohort for a set period. Practice never changes formal results."
      size="lg"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="intervention-form" loading={create.isPending}>Create intervention</Button>
        </>
      )}
    >
      <form id="intervention-form" className="space-y-4" noValidate onSubmit={handleSubmit(onValid, onInvalid)}>
        <Input label="Name" required error={errors.name?.message} maxLength={160} {...register('name', { validate: (v) => v.trim().length > 0 || 'Give the intervention a name.' })} />
        <Select
          label="Target capability"
          required
          placeholder="Choose a capability"
          error={errors.targetCapabilityId?.message}
          options={(catalogue.data?.capabilities || []).map((c) => ({ value: c.id, label: c.name }))}
          {...register('targetCapabilityId', { required: 'Choose a capability.' })}
        />
        <Select
          label="Cohort"
          required
          placeholder="Choose a cohort"
          error={errors.cohortId?.message}
          options={(cohorts.data || []).filter((c) => c.status === 'ACTIVE').map((c) => ({ value: c.id, label: `${c.name} (${students(c.memberCount ?? 0)})` }))}
          {...register('cohortId', { required: 'Choose a cohort.' })}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Starts" type="date" required error={errors.startsOn?.message} {...register('startsOn', { required: 'Choose a start date.' })} />
          <Input label="Ends" type="date" required error={errors.endsOn?.message} {...register('endsOn', { required: 'Choose an end date.', validate: (v, all) => v >= all.startsOn || 'The end date must be on or after the start date.' })} />
        </div>
        <fieldset aria-invalid={errors.missionIds ? true : undefined}>
          <legend className="mb-2 text-sm font-medium text-prism-ink">Practice missions <span className="text-prism-blocked">*</span></legend>
          <input type="hidden" {...register('missionIds', { validate: (v) => (Array.isArray(v) && v.length > 0) || 'Choose at least one mission.' })} />
          {catalogue.isPending ? <p className="text-sm text-prism-ink-muted">Loading missions…</p> : missions.length === 0 ? (
            <p className="text-sm text-prism-ink-muted">{capability ? 'No published practice missions for this capability yet.' : 'No published practice missions yet.'}</p>
          ) : (
            <div className="space-y-2">
              {missions.map((m) => (
                <Checkbox
                  key={m.id}
                  label={m.title}
                  description={`${m.targetCapabilityName || m.targetCapabilityId} · about ${m.estimatedMinutes} minutes`}
                  checked={missionIds.includes(m.id)}
                  onChange={() => setValue('missionIds', missionIds.includes(m.id) ? missionIds.filter((x) => x !== m.id) : [...missionIds, m.id], { shouldValidate: true })}
                />
              ))}
            </div>
          )}
          {errors.missionIds && <p role="alert" className="mt-1 text-xs font-medium text-prism-blocked">{errors.missionIds.message}</p>}
        </fieldset>
        <Checkbox label="A reassessment is planned after this intervention" description="Scheduling reassessments arrives with the growth features." {...register('reassessmentPlanned')} />
        <MutationError error={create.error} />
      </form>
    </Modal>
  )
}

export default function CampusDevelopmentPage() {
  const { orgId, can, key } = useCampusOrg()
  const queryClient = useQueryClient()
  const toast = useToast()
  const query = useQuery({ queryKey: key('interventions'), queryFn: () => fetchInterventions(orgId) })
  const [builderOpen, setBuilderOpen] = useState(false)
  const [detail, setDetail] = useState(null)
  const [ending, setEnding] = useState(null)
  const status = useMutation({
    mutationFn: ({ id, value }) => setInterventionStatus(orgId, id, value),
    onSuccess: (i) => {
      queryClient.invalidateQueries({ queryKey: key('interventions') })
      toast.show(i.status === 'COMPLETED' ? 'Intervention marked as completed.' : 'Intervention cancelled.', { tone: 'positive' })
      setEnding(null)
      setDetail(null)
      focusPageTitle()
    },
  })
  const write = can('interventions.write')
  const rows = query.data || []
  return (
    <CampusPage
      title="Development"
      description="Practice interventions for your cohorts. Completing practice never changes formal results."
      query={query}
      actions={write && <Button onClick={() => setBuilderOpen(true)}>Create intervention</Button>}
    >
      <div className="space-y-6">
        {rows.length === 0 ? (
          <EmptyState title="No interventions yet" description="Create one around a capability your cohort is developing." action={write ? <Button onClick={() => setBuilderOpen(true)}>Create intervention</Button> : null} />
        ) : (
          <DataTable
            caption="Interventions"
            rows={rows}
            columns={[
              { key: 'name', header: 'Intervention', render: (i) => <button type="button" className="font-medium text-prism-accent-strong hover:underline" onClick={() => setDetail(i)}>{i.name}</button> },
              { key: 'cohort', header: 'Cohort', render: (i) => i.cohortName || '—' },
              { key: 'capability', header: 'Target capability', render: (i) => i.targetCapability.name || i.targetCapability.id },
              { key: 'dates', header: 'Dates', render: (i) => `${formatDate(i.startsOn)} – ${formatDate(i.endsOn)}` },
              { key: 'progress', header: 'Progress', render: (i) => `${i.counts.completedAll} of ${i.counts.members} finished all missions` },
              { key: 'status', header: 'Status', render: (i) => <StatusChip tone={STATUS[i.status][0]} label={STATUS[i.status][1]} /> },
            ]}
          />
        )}
        <Callout title="Outcomes">
          Changes in formal results are shown only after a comparable reassessment. Outcome views arrive with campus analytics and reassessment.
        </Callout>
      </div>
      {write && <InterventionBuilder open={builderOpen} onClose={() => setBuilderOpen(false)} />}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.name || ''}
        description={detail ? `${detail.cohortName || 'Cohort'} · ${formatDate(detail.startsOn)} – ${formatDate(detail.endsOn)}` : undefined}
        footer={detail && write && detail.status === 'ACTIVE' ? (
          <>
            <Button variant="ghost" onClick={() => setEnding({ id: detail.id, value: 'CANCELLED' })}>Cancel intervention</Button>
            <Button onClick={() => setEnding({ id: detail.id, value: 'COMPLETED' })}>Mark as completed</Button>
          </>
        ) : null}
      >
        {detail && (
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-prism-ink-muted">Students</dt><dd className="mt-1 font-medium">{detail.counts.members}</dd></div>
            <div><dt className="text-prism-ink-muted">Started</dt><dd className="mt-1 font-medium">{detail.counts.started}</dd></div>
            <div><dt className="text-prism-ink-muted">Finished all missions</dt><dd className="mt-1 font-medium">{detail.counts.completedAll}</dd></div>
            <div className="sm:col-span-3">
              <dt className="text-prism-ink-muted">Missions</dt>
              <dd className="mt-1">
                <ul className="space-y-1">{detail.missions.map((m) => <li key={m.id}>{m.title || m.id}: {m.completed} of {detail.counts.members} finished</li>)}</ul>
              </dd>
            </div>
            <div className="sm:col-span-3"><dt className="text-prism-ink-muted">Reassessment</dt><dd className="mt-1">{detail.reassessmentPlanned ? 'Planned after this intervention' : 'Not planned'}</dd></div>
          </dl>
        )}
      </Modal>
      <ConfirmDialog
        open={Boolean(ending)}
        title={ending?.value === 'CANCELLED' ? 'Cancel this intervention?' : 'Mark as completed?'}
        description="Students keep their practice work. The missions stop appearing in their campus workspace."
        confirmLabel={ending?.value === 'CANCELLED' ? 'Cancel intervention' : 'Mark as completed'}
        cancelLabel="Keep intervention"
        tone={ending?.value === 'CANCELLED' ? 'danger' : 'primary'}
        pending={status.isPending}
        error={status.error}
        onClose={() => setEnding(null)}
        onConfirm={() => status.mutate(ending)}
      />
    </CampusPage>
  )
}
