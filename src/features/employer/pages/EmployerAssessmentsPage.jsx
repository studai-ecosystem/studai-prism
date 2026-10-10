// Sponsored assessments (PROD-READY Phase 9): only assessments within the
// published job-family scope are offered; each employee reads the employer
// disclosure on the briefing before starting. No proctoring options, no
// thresholds and no per-person results here.
import { useState } from 'react'
import { DataTable } from '../../../components/ui/DataTable.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { Input, Select, Checkbox } from '../../../components/ui/FormControls.jsx'
import { Panel } from '../../../components/ui/Card.jsx'
import { StatusChip } from '../../../components/ui/Badge.jsx'
import { EmptyState } from '../../../components/states/EmptyState.jsx'
import { useToast } from '../../../components/ui/Toast.jsx'
import { ASSIGNMENT_STATUS_LABELS } from '../../../lib/copy/campus.js'
import { EMPLOYER_PAGE_COPY } from '../../../lib/copy/employerPages.js'
import { formatDate } from '../../student/QueryState.jsx'
import { MutationError } from '../../campus/components/CampusPage.jsx'
import { EmployerPage } from '../components/EmployerPage.jsx'
import { useEmployerOrg, useEmployerAssignments, useEmployerCatalog, useEmployerCohorts, useCreateEmployerAssignment } from '../hooks.js'

const toIso = (local) => (local ? new Date(local).toISOString() : null)

function SponsorForm() {
  const A = EMPLOYER_PAGE_COPY.assessments
  const catalog = useEmployerCatalog()
  const cohorts = useEmployerCohorts()
  const create = useCreateEmployerAssignment()
  const toast = useToast()
  const [definitionId, setDefinitionId] = useState('')
  const [groups, setGroups] = useState([])
  const [opens, setOpens] = useState('')
  const [closes, setCloses] = useState('')
  const [participation, setParticipation] = useState('VOLUNTARY')
  const [error, setError] = useState(null)
  const items = catalog.data?.items || []
  const chosen = definitionId || items[0]?.id || ''
  const submit = (e) => {
    e.preventDefault()
    if (!groups.length) { setError(A.groupsRequired); return }
    if (!opens || !closes) { setError(A.windowRequired); return }
    setError(null)
    create.mutate({ definitionId: chosen, cohortIds: groups, windowStart: toIso(opens), windowEnd: toIso(closes), participation }, {
      onSuccess: (out) => { toast.show(A.created(out.rostered ?? 0), { tone: 'positive' }); setGroups([]) },
    })
  }
  return (
    <Panel title={A.sponsor} description={catalog.data?.note}>
      <form className="grid gap-3 md:grid-cols-2" onSubmit={submit} noValidate aria-label={A.sponsor}>
        <Select label={A.definition} value={chosen} onChange={(e) => setDefinitionId(e.target.value)} options={items.map((d) => ({ value: d.id, label: `${d.title} (${d.families.map((f) => f.name).join(', ')})` }))} />
        <Select label={A.participation} value={participation} onChange={(e) => setParticipation(e.target.value)} options={[{ value: 'VOLUNTARY', label: A.voluntary }, { value: 'COMPULSORY', label: A.compulsory }, { value: 'UNKNOWN', label: A.unknown }]} />
        <Input type="datetime-local" label={A.opens} value={opens} onChange={(e) => setOpens(e.target.value)} />
        <Input type="datetime-local" label={A.closes} value={closes} onChange={(e) => setCloses(e.target.value)} />
        <fieldset className="md:col-span-2">
          <legend className="mb-1 text-sm font-medium text-prism-ink">{A.groups}</legend>
          <div className="flex flex-wrap gap-4">
            {(cohorts.data?.items || []).map((c) => (
              <Checkbox key={c.id} id={`group-${c.id}`} label={c.name} checked={groups.includes(c.id)} onChange={(e) => setGroups((g) => (e.target.checked ? [...g, c.id] : g.filter((x) => x !== c.id)))} />
            ))}
          </div>
        </fieldset>
        {error && <p role="alert" className="md:col-span-2 text-sm text-prism-blocked">{error}</p>}
        <div className="md:col-span-2"><Button type="submit" loading={create.isPending} disabled={!chosen}>{A.submit}</Button></div>
        <div className="md:col-span-2"><MutationError error={create.error} /></div>
      </form>
    </Panel>
  )
}

export default function EmployerAssessmentsPage() {
  const A = EMPLOYER_PAGE_COPY.assessments
  const { can } = useEmployerOrg()
  const query = useEmployerAssignments()
  const rows = query.data?.items || []
  return (
    <EmployerPage title={A.title} description={A.description} query={query}>
      <div className="space-y-6">
        {can('assignments.write') && <SponsorForm />}
        {rows.length === 0 ? <EmptyState title={A.none} /> : (
          <DataTable
            caption={A.title}
            rows={rows}
            columns={[
              { key: 'title', header: A.definition, render: (a) => a.title || a.definitionId },
              { key: 'window', header: A.window, render: (a) => `${formatDate(a.windowStart) || '—'} – ${formatDate(a.windowEnd) || '—'}` },
              { key: 'status', header: A.status, render: (a) => <StatusChip tone={a.status === 'ACTIVE' ? 'positive' : 'neutral'} label={ASSIGNMENT_STATUS_LABELS[a.status] || a.status} /> },
              { key: 'completed', header: A.completed, align: 'right', render: (a) => (a.counts ? `${a.counts.COMPLETED || 0} of ${a.counts.total ?? 0}` : '—') },
            ]}
          />
        )}
      </div>
    </EmployerPage>
  )
}
