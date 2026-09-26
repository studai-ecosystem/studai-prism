// Organization settings (spec §19.1): academic structure and the
// organization activity log (who changed what — never student results).
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useFlag } from '../../../app/providers/FeatureFlagProvider.jsx'
import { analyticsApi } from '../../../api/analytics.js'
import { Panel } from '../../../components/ui/Card.jsx'
import { Tabs } from '../../../components/ui/Tabs.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { Input, Select } from '../../../components/ui/FormControls.jsx'
import { DataTable } from '../../../components/ui/DataTable.jsx'
import { useToast } from '../../../components/ui/Toast.jsx'
import { AUDIT_ACTION_TEXT, ANALYTICS_COPY } from '../../../lib/copy/campus.js'
import { queryStateView } from '../../student/QueryState.jsx'
import { CampusPage, MutationError } from '../components/CampusPage.jsx'
import { useCampusOrg, useStructure, useCreateStructure, useAuditLog } from '../hooks.js'

const KINDS = [
  { kind: 'campus', label: 'Campuses', singular: 'campus', list: 'campuses' },
  { kind: 'department', label: 'Departments', singular: 'department', list: 'departments', parent: { key: 'campusId', list: 'campuses', label: 'Campus' } },
  { kind: 'academicProgram', label: 'Academic programs', singular: 'academic program', list: 'academicPrograms', parent: { key: 'departmentId', list: 'departments', label: 'Department' } },
  { kind: 'batch', label: 'Batches', singular: 'batch', list: 'batches', parent: { key: 'programId', list: 'academicPrograms', label: 'Academic program' } },
]

function StructureSection({ spec, structure, canManage }) {
  const create = useCreateStructure()
  const toast = useToast()
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [error, setError] = useState(null)
  const items = structure[spec.list] || []
  function submit(e) {
    e.preventDefault()
    if (!name.trim()) return setError(`Enter a name for the ${spec.singular}.`)
    setError(null)
    return create.mutate({ kind: spec.kind, name: name.trim(), ...(spec.parent && parentId ? { [spec.parent.key]: parentId } : {}) }, {
      onSuccess: () => { setName(''); setParentId(''); toast.show(`Added "${name.trim()}".`, { tone: 'positive' }) },
    })
  }
  return (
    <Panel title={spec.label} headingLevel={3}>
      {items.length ? <ul className="mb-4 flex flex-wrap gap-2 text-sm">{items.map((x) => <li key={x.id} className="rounded-[var(--prism-radius-sm)] border border-prism-border px-2 py-1">{x.name}</li>)}</ul> : <p className="mb-4 text-sm text-prism-ink-muted">None yet.</p>}
      {canManage && (
        <form onSubmit={submit} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3" noValidate>
          <Input label={`New ${spec.singular}`} value={name} onChange={(e) => setName(e.target.value)} error={error} maxLength={160} />
          {spec.parent && <Select label={spec.parent.label} value={parentId} onChange={(e) => setParentId(e.target.value)} placeholder="None" options={(structure[spec.parent.list] || []).map((x) => ({ value: x.id, label: x.name }))} />}
          <div><Button type="submit" variant="secondary" loading={create.isPending && create.variables?.kind === spec.kind}>Add</Button></div>
          <MutationError error={create.variables?.kind === spec.kind ? create.error : null} />
        </form>
      )}
    </Panel>
  )
}

function AuditLog() {
  const query = useAuditLog()
  const state = queryStateView(query, { label: 'Loading activity' })
  if (state) return state
  return (
    <DataTable
      caption="Organization activity"
      rows={query.data.items}
      emptyMessage="No activity recorded yet."
      columns={[
        { key: 'at', header: 'When', render: (e) => new Date(e.at).toLocaleString() },
        { key: 'actor', header: 'Who', render: (e) => e.actor.name || e.actor.email || 'Team member' },
        { key: 'action', header: 'What', render: (e) => AUDIT_ACTION_TEXT[e.action] || e.action },
      ]}
    />
  )
}

// Minimum aggregate group size (spec §27.2). Owners change it; the server
// enforces the floor and records the change in the activity log.
function PrivacyThreshold() {
  const { orgId, key } = useCampusOrg()
  const toast = useToast()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: key('analytics-settings'), queryFn: () => analyticsApi.settings(orgId) })
  const [value, setValue] = useState(null)
  const save = useMutation({
    mutationFn: (n) => analyticsApi.saveSettings(orgId, { minAggregateGroupSize: n }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: key('analytics-settings') }); queryClient.invalidateQueries({ queryKey: key('analytics') }); toast.show('Privacy threshold saved.', { tone: 'positive' }) },
  })
  const state = queryStateView(query, { label: 'Loading privacy settings' })
  if (state) return state
  const s = query.data
  const current = value === null ? String(s.minAggregateGroupSize) : value
  const n = current === '' ? NaN : Number(current)
  const invalid = !Number.isInteger(n) || n < s.floor || n > 1000
  const editable = s.canChange
  return (
    <Panel title="Minimum group size for aggregate reporting" description={ANALYTICS_COPY.thresholdHelp(s.floor, s.default)}>
      {!editable && <p className="mb-3 text-sm text-prism-ink-muted">Only organization owners can change privacy thresholds.</p>}
      <form className="flex flex-wrap items-end gap-3" noValidate onSubmit={(e) => { e.preventDefault(); if (!invalid && editable) save.mutate(n) }}>
        <Input label="Minimum students per group" type="number" min={s.floor} max={1000} step={1} value={current} onChange={(e) => setValue(e.target.value)} disabled={!editable} error={editable && invalid ? `Enter a whole number from ${s.floor} to 1000.` : undefined} />
        {editable && <Button type="submit" loading={save.isPending} disabled={invalid}>Save</Button>}
      </form>
      <div className="mt-3"><MutationError error={save.error} /></div>
    </Panel>
  )
}

export default function CampusSettingsPage() {
  const { can } = useCampusOrg()
  const { enabled: analyticsOn } = useFlag('PRISM_CAMPUS_ANALYTICS')
  const [tab, setTab] = useState('structure')
  const structure = useStructure()
  const structureView = queryStateView(structure, { label: 'Loading academic structure' }) || (
    <div className="space-y-4">
      {KINDS.map((k) => <StructureSection key={k.kind} spec={k} structure={structure.data} canManage={can('org.manage')} />)}
    </div>
  )
  return (
    <CampusPage title="Settings" description="Academic structure and a record of changes made by your team.">
      <Tabs
        label="Settings sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'structure', label: 'Academic structure', content: structureView },
          { id: 'activity', label: 'Activity log', content: <AuditLog /> },
          ...(analyticsOn && can('org.settings.read') ? [{ id: 'privacy', label: 'Analytics privacy', content: <PrivacyThreshold /> }] : []),
        ]}
      />
    </CampusPage>
  )
}
