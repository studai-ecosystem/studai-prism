// Development missions for a group (PROD-READY Phase 9): the campus
// Development V2 interventions, assigned by the employer. Practice evidence is
// for learning and never counts as an assessment.
import { useState } from 'react'
import { DataTable } from '../../../components/ui/DataTable.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { Input, Select } from '../../../components/ui/FormControls.jsx'
import { Panel } from '../../../components/ui/Card.jsx'
import { EmptyState } from '../../../components/states/EmptyState.jsx'
import { useToast } from '../../../components/ui/Toast.jsx'
import { EMPLOYER_PAGE_COPY } from '../../../lib/copy/employerPages.js'
import { formatDate } from '../../student/QueryState.jsx'
import { MutationError } from '../../campus/components/CampusPage.jsx'
import { EmployerPage } from '../components/EmployerPage.jsx'
import { useEmployerOrg, useEmployerCohorts, useEmployerMissions, useEmployerInterventions, useCreateEmployerIntervention } from '../hooks.js'

function AssignPracticeForm() {
  const D = EMPLOYER_PAGE_COPY.development
  const missions = useEmployerMissions()
  const cohorts = useEmployerCohorts()
  const create = useCreateEmployerIntervention()
  const toast = useToast()
  const [form, setForm] = useState({ name: '', cohortId: '', missionId: '', startsOn: '', endsOn: '' })
  const [error, setError] = useState(null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const list = missions.data?.missions || []
  const mission = list.find((m) => m.id === form.missionId) || list[0]
  const groups = cohorts.data?.items || []
  const cohortId = form.cohortId || groups[0]?.id || ''
  const submit = (e) => {
    e.preventDefault()
    if (!form.name.trim() || !cohortId || !mission || !form.startsOn || !form.endsOn) { setError('Fill in every field.'); return }
    setError(null)
    create.mutate({ name: form.name.trim(), cohortId, targetCapabilityId: mission.targetCapabilityId, missionIds: [mission.id], startsOn: form.startsOn, endsOn: form.endsOn }, {
      onSuccess: () => { toast.show(D.created, { tone: 'positive' }); setForm({ name: '', cohortId: '', missionId: '', startsOn: '', endsOn: '' }) },
    })
  }
  return (
    <Panel title={D.create}>
      <form className="grid gap-3 md:grid-cols-2" onSubmit={submit} noValidate aria-label={D.create}>
        <Input label={D.name} value={form.name} onChange={set('name')} maxLength={160} />
        <Select label={D.group} value={cohortId} onChange={set('cohortId')} options={groups.map((c) => ({ value: c.id, label: c.name }))} />
        <Select label={D.missions} value={mission?.id || ''} onChange={set('missionId')} options={list.map((m) => ({ value: m.id, label: `${m.title} (${m.targetCapabilityName || m.targetCapabilityId})` }))} />
        <div className="grid grid-cols-2 gap-3">
          <Input type="date" label={D.starts} value={form.startsOn} onChange={set('startsOn')} />
          <Input type="date" label={D.ends} value={form.endsOn} onChange={set('endsOn')} />
        </div>
        {error && <p role="alert" className="md:col-span-2 text-sm text-prism-blocked">{error}</p>}
        <div className="md:col-span-2"><Button type="submit" loading={create.isPending}>{D.submit}</Button></div>
        <div className="md:col-span-2"><MutationError error={create.error} /></div>
      </form>
    </Panel>
  )
}

export default function EmployerDevelopmentPage() {
  const D = EMPLOYER_PAGE_COPY.development
  const { can } = useEmployerOrg()
  const query = useEmployerInterventions()
  const rows = query.data?.items || []
  return (
    <EmployerPage title={D.title} description={D.description} query={query}>
      <div className="space-y-6">
        {can('interventions.write') && <AssignPracticeForm />}
        {rows.length === 0 ? <EmptyState title={D.none} /> : (
          <DataTable
            caption={D.title}
            rows={rows}
            columns={[
              { key: 'name', header: D.name, render: (i) => i.name },
              { key: 'group', header: D.group, render: (i) => i.cohortName || i.cohort?.name || '—' },
              { key: 'dates', header: `${D.starts} – ${D.ends}`, render: (i) => `${formatDate(i.startsOn) || '—'} – ${formatDate(i.endsOn) || '—'}` },
            ]}
          />
        )}
      </div>
    </EmployerPage>
  )
}
