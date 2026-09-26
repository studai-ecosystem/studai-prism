// Campus reassessments (spec §17, §25; C9.06). Staff schedule a reassessment
// of an earlier sponsored assessment for the same cohorts. Growth appears
// only where the assessment forms are approved as comparable and evidence is
// sufficient in both; outcome counts are aggregate-only and hidden for small
// groups. No student is ranked or scored here.
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DataTable } from '../../../components/ui/DataTable.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { Modal } from '../../../components/ui/Modal.jsx'
import { Input, Select } from '../../../components/ui/FormControls.jsx'
import { StatusChip } from '../../../components/ui/Badge.jsx'
import { Callout, InlineNotice } from '../../../components/ui/Notice.jsx'
import { EmptyState } from '../../../components/states/EmptyState.jsx'
import { useToast } from '../../../components/ui/Toast.jsx'
import { formatDate, formatDateTime } from '../../student/QueryState.jsx'
import { fetchReassessments, createReassessment, setReassessmentStatus, fetchGrowthOutcomes } from '../../../api/growth.js'
import { CampusPage, ConfirmDialog, MutationError, focusFirstInvalid, focusPageTitle } from '../components/CampusPage.jsx'
import { useCampusOrg, useAssignments } from '../hooks.js'
import { REASSESSMENT_COPY } from '../../../lib/copy/campus.js'

const STATUS = { SCHEDULED: ['neutral', 'Scheduled'], ACTIVE: ['positive', 'Open'], CLOSED: ['accent', 'Closed'], CANCELLED: ['insufficient', 'Cancelled'] }
const pad = (n) => String(n).padStart(2, '0')
// A datetime-local value (the admin's own clock) for n days from now at 09:00.
const localAt = (days) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(9, 0, 0, 0); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00` }
const students = (n) => `${n} ${n === 1 ? 'student' : 'students'}`

function ScheduleDialog({ open, onClose }) {
  const { orgId, key } = useCampusOrg()
  const queryClient = useQueryClient()
  const toast = useToast()
  const assignments = useAssignments()
  const create = useMutation({
    mutationFn: (body) => createReassessment(orgId, body),
    onSuccess: (c) => {
      queryClient.invalidateQueries({ queryKey: key('reassessments') })
      queryClient.invalidateQueries({ queryKey: key('assignments') })
      toast.show(`"${c.name}" scheduled for ${students(c.rostered ?? c.reassessment.rostered)}.`, { tone: 'positive' })
      onClose()
    },
  })
  const defaults = () => ({ name: '', baselineAssignmentId: '', windowStart: localAt(1), windowEnd: localAt(15) })
  const { register, handleSubmit, formState: { errors }, reset } = useForm({ defaultValues: defaults() })
  useEffect(() => { if (!open) { reset(defaults()); create.reset() } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const baselines = (assignments.data || []).filter((a) => a.status !== 'CANCELLED')
  const onValid = (v) => create.mutate({ name: v.name.trim(), baselineAssignmentId: v.baselineAssignmentId, windowStart: new Date(v.windowStart).toISOString(), windowEnd: new Date(v.windowEnd).toISOString() })
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Schedule a reassessment"
      description={REASSESSMENT_COPY.scheduleIntro}
      size="lg"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="reassessment-form" loading={create.isPending}>Schedule reassessment</Button>
        </>
      )}
    >
      <form id="reassessment-form" className="space-y-4" noValidate onSubmit={handleSubmit(onValid, () => focusFirstInvalid())}>
        <Input label="Name" required maxLength={160} error={errors.name?.message} {...register('name', { validate: (v) => v.trim().length > 0 || 'Give the reassessment a name.' })} />
        <Select
          label="Baseline assessment"
          required
          placeholder={assignments.isPending ? 'Loading assessments…' : 'Choose an assessment'}
          hint="Students in the same cohorts take the same assessment again."
          error={errors.baselineAssignmentId?.message}
          options={baselines.map((a) => ({ value: a.id, label: `${a.title || 'Assessment'} · ${formatDate(a.windowStart) || ''}–${formatDate(a.windowEnd) || ''}` }))}
          {...register('baselineAssignmentId', { required: 'Choose the earlier assessment to repeat.' })}
        />
        {assignments.isSuccess && baselines.length === 0 && <InlineNotice tone="partial">{REASSESSMENT_COPY.noBaselines}</InlineNotice>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Opens" type="datetime-local" required error={errors.windowStart?.message} {...register('windowStart', { required: 'Choose when it opens.' })} />
          <Input label="Closes" type="datetime-local" required error={errors.windowEnd?.message} {...register('windowEnd', { required: 'Choose when it closes.', validate: (v, all) => new Date(v) > new Date(all.windowStart) || 'It must close after it opens.' })} />
        </div>
        <Callout title="Growth comparison">{REASSESSMENT_COPY.comparabilityNote}</Callout>
        <MutationError error={create.error} />
      </form>
    </Modal>
  )
}

function Outcomes({ cycleId }) {
  const { orgId, key } = useCampusOrg()
  const query = useQuery({ queryKey: key('growth-outcomes', cycleId), queryFn: () => fetchGrowthOutcomes(orgId, cycleId) })
  if (query.isPending) return <p className="text-sm text-prism-ink-muted">Loading outcomes…</p>
  if (query.isError) return <MutationError error={query.error} />
  const o = query.data[0]
  if (!o) return null
  return (
    <div className="space-y-3">
      <p className="text-sm text-prism-ink-muted">
        {o.counts.completedBoth} completed both · {o.counts.comparable} can be compared · {o.counts.formsNotApproved} on forms not yet approved{o.counts.underReviewOrMissing ? ` · ${o.counts.underReviewOrMissing} under review or unavailable` : ''}
      </p>
      {o.capabilities.length === 0 ? (
        <p className="text-sm text-prism-ink-muted">{REASSESSMENT_COPY.noOutcomes}</p>
      ) : (
        <DataTable
          caption="Level changes by capability"
          rows={o.capabilities}
          rowKey={(r) => r.capabilityId}
          columns={[
            { key: 'name', header: 'Capability', render: (r) => r.name || r.capabilityId },
            { key: 'n', header: 'Students compared', render: (r) => (r.suppressed ? REASSESSMENT_COPY.suppressed : r.n) },
            { key: 'higher', header: 'Higher level', render: (r) => (r.suppressed ? '—' : r.higher) },
            { key: 'same', header: 'Same level', render: (r) => (r.suppressed ? '—' : r.same) },
            { key: 'lower', header: 'Lower level', render: (r) => (r.suppressed ? '—' : r.lower) },
          ]}
        />
      )}
      {o.capabilities.some((r) => r.suppressed) && <p className="text-sm text-prism-ink-muted">{REASSESSMENT_COPY.suppressedNote} (Fewer than {o.minGroupSize} students.)</p>}
      <p className="text-xs text-prism-ink-subtle">{o.method}</p>
    </div>
  )
}

export default function CampusReassessmentsPage() {
  const { orgId, can, key } = useCampusOrg()
  const queryClient = useQueryClient()
  const toast = useToast()
  const query = useQuery({ queryKey: key('reassessments'), queryFn: () => fetchReassessments(orgId) })
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [detail, setDetail] = useState(null)
  const [ending, setEnding] = useState(null)
  const status = useMutation({
    mutationFn: ({ id, value }) => setReassessmentStatus(orgId, id, value),
    onSuccess: (c) => {
      queryClient.invalidateQueries({ queryKey: key('reassessments') })
      queryClient.invalidateQueries({ queryKey: key('assignments') })
      toast.show(c.status === 'CANCELLED' ? 'Reassessment cancelled.' : 'Reassessment closed.', { tone: 'positive' })
      setEnding(null)
      setDetail(null)
      focusPageTitle()
    },
  })
  const write = can('reassessments.write')
  const rows = query.data || []
  return (
    <CampusPage
      title="Reassessments"
      description="Repeat an earlier assessment to see change. Growth is shown only where the assessment forms are approved as comparable."
      query={query}
      actions={write && <Button onClick={() => setScheduleOpen(true)}>Schedule reassessment</Button>}
    >
      <div className="space-y-6">
        {rows.length === 0 ? (
          <EmptyState title="No reassessments yet" description="Schedule one after a cohort has completed an assessment." action={write ? <Button onClick={() => setScheduleOpen(true)}>Schedule reassessment</Button> : null} />
        ) : (
          <DataTable
            caption="Reassessments"
            rows={rows}
            columns={[
              { key: 'name', header: 'Reassessment', render: (c) => <button type="button" className="font-medium text-prism-accent-strong hover:underline" onClick={() => setDetail(c)}>{c.name}</button> },
              { key: 'baseline', header: 'Baseline', render: (c) => `${c.baseline.title || 'Assessment'} · ${formatDate(c.baseline.windowEnd) || ''}` },
              { key: 'window', header: 'Window', render: (c) => (c.endedAt ? `${formatDateTime(c.windowStart)} – ended ${formatDateTime(c.endedAt)}` : `${formatDateTime(c.windowStart)} – ${formatDateTime(c.windowEnd)}`) },
              { key: 'progress', header: 'Completed', render: (c) => `${c.reassessment.completed} of ${c.reassessment.rostered}` },
              { key: 'comparability', header: 'Growth comparison', render: (c) => REASSESSMENT_COPY.comparability[c.comparability].short },
              { key: 'status', header: 'Status', render: (c) => <StatusChip tone={STATUS[c.status][0]} label={STATUS[c.status][1]} /> },
            ]}
          />
        )}
        <Callout title="How growth is shown">{REASSESSMENT_COPY.pageNote}</Callout>
      </div>
      {write && <ScheduleDialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} />}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.name || ''}
        description={detail ? (detail.endedAt ? `${formatDateTime(detail.windowStart)} – ended ${formatDateTime(detail.endedAt)}` : `${formatDateTime(detail.windowStart)} – ${formatDateTime(detail.windowEnd)}`) : undefined}
        size="lg"
        footer={detail && write && ['SCHEDULED', 'ACTIVE'].includes(detail.status) ? (
          <>
            <Button variant="ghost" onClick={() => setEnding({ id: detail.id, value: 'CANCELLED' })}>Cancel reassessment</Button>
            <Button onClick={() => setEnding({ id: detail.id, value: 'CLOSED' })}>Close window</Button>
          </>
        ) : null}
      >
        {detail && (
          <div className="space-y-4">
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-prism-ink-muted">Baseline completed</dt><dd className="mt-1 font-medium">{detail.baseline.completed} of {detail.baseline.rostered}</dd></div>
              <div><dt className="text-prism-ink-muted">Reassessment completed</dt><dd className="mt-1 font-medium">{detail.reassessment.completed} of {detail.reassessment.rostered}</dd></div>
              <div><dt className="text-prism-ink-muted">Status</dt><dd className="mt-1 font-medium">{STATUS[detail.status][1]}</dd></div>
            </dl>
            {['CLOSED', 'CANCELLED'].includes(detail.status)
              ? <InlineNotice tone="info">{REASSESSMENT_COPY.endedNote}</InlineNotice>
              : <InlineNotice tone={detail.comparability === 'APPROVED' ? 'info' : 'partial'}>{REASSESSMENT_COPY.comparability[detail.comparability].long}</InlineNotice>}
            {can('analytics.read') && (
              <section aria-labelledby="outcomes-title" className="space-y-2">
                <h3 id="outcomes-title" className="text-sm font-semibold text-prism-ink">Outcomes</h3>
                <Outcomes cycleId={detail.id} />
              </section>
            )}
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={Boolean(ending)}
        title={ending?.value === 'CANCELLED' ? 'Cancel this reassessment?' : 'Close this window?'}
        description={ending?.value === 'CANCELLED' ? 'Students can no longer start it. Seats of unfinished starts are released.' : 'Students who have not started can no longer start it.'}
        confirmLabel={ending?.value === 'CANCELLED' ? 'Cancel reassessment' : 'Close window'}
        cancelLabel="Keep it open"
        tone={ending?.value === 'CANCELLED' ? 'danger' : 'primary'}
        pending={status.isPending}
        error={status.error}
        onClose={() => setEnding(null)}
        onConfirm={() => status.mutate(ending)}
      />
    </CampusPage>
  )
}
