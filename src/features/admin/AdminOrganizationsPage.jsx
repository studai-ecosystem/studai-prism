// /admin/organizations — campus organizations for StudAI operations (Campus
// Phase 11, C11.05). Membership counts, sponsorship seats with their ledger
// counts, and campus contracts (create draft → activate → end/cancel, each
// with an audited reason). Prices are never entered here (K5, HA-C006).
import { useCallback, useEffect, useState } from 'react'
import { adminFetch, adminHasPermission } from '../../lib/adminApi.js'
import { PageHeader, ErrorNotice, Notice, DataTable, Pill, btn, field, when, actWithReason } from '../../pages/admin/ui.jsx'

const EVENTS = { ASSESSMENT_COMPLETED: 'Assessment completed (default)', ASSESSMENT_STARTED: 'Assessment started', REPORT_GENERATED: 'Report generated' }
const COMPONENTS = {
  platformFee: 'Platform access', perCompletedAssessment: 'Per completed assessment', reassessment: 'Reassessments',
  reviewAllowance: 'Human review allowance', customIntegrations: 'Custom integrations', validationServices: 'Validation services',
}
const TONE = { DRAFT: 'muted', ACTIVE: 'ok', ENDED: 'muted', CANCELLED: 'muted' }

function NewContract({ orgId, onCreated, onError }) {
  const empty = { name: '', termStart: '', termEnd: '', includedSeats: '', billableEvent: 'ASSESSMENT_COMPLETED', components: {}, reason: '' }
  const [form, setForm] = useState(empty)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    try {
      await adminFetch(`/api/admin/organizations/${orgId}/contracts`, { method: 'POST', body: { ...form, includedSeats: Number(form.includedSeats) } })
      setForm(empty)
      onCreated('Draft contract created. Activate it to mint the sponsored seats.')
    } catch (err) { onError(err.message) }
  }
  return (
    <form onSubmit={submit} className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 space-y-3" aria-label="New draft contract">
      <p className="font-sans text-sm font-semibold text-[var(--color-ink)]">New draft contract</p>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <label className="font-sans text-xs text-[var(--color-ink-muted)] md:col-span-2">Name
          <input className={`${field} w-full`} value={form.name} onChange={set('name')} maxLength={160} required />
        </label>
        <label className="font-sans text-xs text-[var(--color-ink-muted)]">Term start
          <input type="date" className={`${field} w-full`} value={form.termStart} onChange={set('termStart')} required />
        </label>
        <label className="font-sans text-xs text-[var(--color-ink-muted)]">Term end
          <input type="date" className={`${field} w-full`} value={form.termEnd} onChange={set('termEnd')} required />
        </label>
        <label className="font-sans text-xs text-[var(--color-ink-muted)]">Included seats
          <input type="number" min={1} step={1} className={`${field} w-full`} value={form.includedSeats} onChange={set('includedSeats')} required />
        </label>
      </div>
      <label className="block font-sans text-xs text-[var(--color-ink-muted)]">Billable event
        <select className={`${field} block`} value={form.billableEvent} onChange={set('billableEvent')}>
          {Object.entries(EVENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="font-sans text-xs text-[var(--color-ink-muted)] mb-1">Included components (no amounts — finance sets prices)</legend>
        {Object.entries(COMPONENTS).map(([k, v]) => (
          <label key={k} className="inline-flex items-center gap-1.5 font-sans text-[13px] text-[var(--color-ink)]">
            <input type="checkbox" checked={Boolean(form.components[k])} onChange={(e) => setForm({ ...form, components: { ...form.components, [k]: e.target.checked } })} />
            {v}
          </label>
        ))}
      </fieldset>
      <label className="block font-sans text-xs text-[var(--color-ink-muted)]">Reason (audited, at least 10 characters)
        <input className={`${field} w-full`} value={form.reason} onChange={set('reason')} maxLength={500} required />
      </label>
      <button type="submit" className={btn}>Create draft</button>
    </form>
  )
}

function Detail({ orgId, onBack }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const canManage = adminHasPermission('contracts:manage')
  const load = useCallback(async () => {
    setError('')
    try { setData(await adminFetch(`/api/admin/organizations/${orgId}`)) } catch (err) { setError(err.message) }
  }, [orgId])
  useEffect(() => { load() }, [load])
  const run = async (fn, okMsg) => {
    setError(''); setNotice('')
    try {
      const r = await fn()
      if (r === null) return
      setNotice(okMsg)
      load()
    } catch (err) { setError(err.message) }
  }
  if (!data) return <div className="p-6"><ErrorNotice error={error} />{!error && <p className="font-sans text-sm text-[var(--color-ink-muted)]">Loading…</p>}</div>
  const roles = Object.entries(data.memberships.byRole)
  return (
    <div className="p-6 max-w-6xl space-y-5">
      <PageHeader title={data.organization.name} subtitle={`${data.organization.organizationType} · ${data.organization.status} · created ${when(data.organization.createdAt)}`}>
        <button type="button" className={btn} onClick={onBack}>All organizations</button>
      </PageHeader>
      <ErrorNotice error={error} />
      <Notice>{notice}</Notice>

      <section aria-labelledby="org-members">
        <h2 id="org-members" className="font-sans text-sm font-semibold text-[var(--color-ink)] mb-2">Memberships ({data.memberships.total})</h2>
        <DataTable
          rowKey={([role]) => role}
          rows={roles}
          empty="No memberships yet."
          columns={[
            { key: 'role', label: 'Role', render: ([role]) => role },
            ...['ACTIVE', 'INVITED', 'SUSPENDED', 'REMOVED'].map((s) => ({ key: s, label: s.toLowerCase(), render: ([, c]) => c[s] || 0, className: 'tabular-nums' })),
          ]}
        />
      </section>

      <section aria-labelledby="org-seats">
        <h2 id="org-seats" className="font-sans text-sm font-semibold text-[var(--color-ink)] mb-2">Sponsored seat pools</h2>
        <DataTable
          rowKey={(e) => e.id}
          rows={data.entitlements}
          empty="No sponsored seats."
          columns={[
            { key: 'source', label: 'Source', render: (e) => <Pill tone="info">{e.source.toLowerCase()}</Pill> },
            { key: 'status', label: 'Status', render: (e) => e.status.toLowerCase() },
            { key: 'window', label: 'Valid', render: (e) => `${when(e.validFrom)} → ${e.validUntil ? when(e.validUntil) : 'open'}`, className: 'whitespace-nowrap font-mono text-[11px]' },
            { key: 'seats', label: 'Seats (in use / included)', render: (e) => `${e.seats.inUse} / ${e.seats.included}`, className: 'tabular-nums' },
            { key: 'ledger', label: 'Ledger (reserved · consumed · released)', render: (e) => `${e.ledger.started} · ${e.ledger.billable} · ${e.ledger.released}`, className: 'tabular-nums' },
            { key: 'event', label: 'Billable event', render: (e) => EVENTS[e.billableEvent] || e.billableEvent },
          ]}
        />
      </section>

      <section aria-labelledby="org-contracts" className="space-y-3">
        <h2 id="org-contracts" className="font-sans text-sm font-semibold text-[var(--color-ink)]">Contracts</h2>
        <DataTable
          rowKey={(c) => c.id}
          rows={data.contracts}
          empty="No contracts."
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'status', label: 'Status', render: (c) => <Pill tone={TONE[c.status]}>{c.status.toLowerCase()}</Pill> },
            { key: 'term', label: 'Term', render: (c) => `${c.termStart} → ${c.termEnd}`, className: 'whitespace-nowrap font-mono text-[11px]' },
            { key: 'seats', label: 'Seats', render: (c) => c.includedSeats, className: 'tabular-nums' },
            { key: 'event', label: 'Billable event', render: (c) => EVENTS[c.billableEvent] || c.billableEvent },
            {
              key: 'actions', label: '',
              render: (c) => (canManage ? (
                <span className="inline-flex gap-1.5">
                  {c.status === 'DRAFT' && <button type="button" className={btn} onClick={() => run(() => actWithReason(`/api/admin/organizations/contracts/${c.id}/activate`, {}, 'Reason for activating this contract (audited; mints the sponsored seats):'), 'Contract activated.')}>Activate</button>}
                  {c.status === 'ACTIVE' && <button type="button" className={btn} onClick={() => run(() => actWithReason(`/api/admin/organizations/contracts/${c.id}/close`, { status: 'ENDED' }, 'Reason for ending this contract (audited; stops new starts):'), 'Contract ended.')}>End</button>}
                  {['DRAFT', 'ACTIVE'].includes(c.status) && <button type="button" className={btn} onClick={() => run(() => actWithReason(`/api/admin/organizations/contracts/${c.id}/close`, { status: 'CANCELLED' }, 'Reason for cancelling this contract (audited):'), 'Contract cancelled.')}>Cancel</button>}
                </span>
              ) : null),
            },
          ]}
        />
        {canManage && <NewContract orgId={orgId} onCreated={(m) => { setNotice(m); load() }} onError={setError} />}
        <p className="font-sans text-xs text-[var(--color-ink-muted)]">Prices are not entered in the console. Finance records approved prices outside the application (HA-C006).</p>
      </section>
    </div>
  )
}

export default function AdminOrganizationsPage() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const load = useCallback(async () => {
    setError('')
    try { setRows((await adminFetch('/api/admin/organizations')).rows) } catch (err) { setError(err.message) }
  }, [])
  useEffect(() => { load() }, [load])
  if (selected) return <Detail orgId={selected} onBack={() => { setSelected(null); load() }} />
  return (
    <div className="p-6 max-w-6xl">
      <PageHeader title="Campus organizations" subtitle="Institutions, their sponsored seats and contracts. Direct B2C payments are on the Payments page." />
      <ErrorNotice error={error} />
      <DataTable
        busy={!rows && !error}
        rowKey={(o) => o.id}
        rows={rows}
        empty="No organizations yet."
        onRowClick={(o) => setSelected(o.id)}
        columns={[
          { key: 'name', label: 'Organization' },
          { key: 'type', label: 'Type', render: (o) => o.organizationType },
          { key: 'status', label: 'Status', render: (o) => o.status.toLowerCase() },
          { key: 'contracts', label: 'Active contracts', render: (o) => o.activeContracts, className: 'tabular-nums' },
          { key: 'createdAt', label: 'Created', render: (o) => when(o.createdAt), className: 'whitespace-nowrap font-mono text-[11px]' },
          { key: 'open', label: '', render: (o) => <button type="button" className={btn} onClick={(e) => { e.stopPropagation(); setSelected(o.id) }}>Open</button> },
        ]}
      />
    </div>
  )
}
