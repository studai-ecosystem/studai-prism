import { useCallback, useEffect, useState } from 'react'
import { adminFetch, adminHasPermission } from '../../lib/adminApi.js'
import {
  PageHeader, ErrorNotice, Notice, Toolbar, Pill, DataTable, btn, btnDanger, field, when, mono,
} from './ui.jsx'

// ── /admin/privacy — data-subject requests + retention rules (Phase 6, §21) ──
// Erasure is a governed pipeline: verify → dry-run plan → dual approval →
// execute (receipt). Nothing deletes without a plan on file and a second
// administrator's approval. Retention rules are documented policy, not timers.

const STATUS_TONE = {
  received: 'info', verifying: 'warn', dry_run: 'warn', awaiting_approval: 'warn',
  executing: 'warn', completed: 'ok', rejected: 'danger',
}

const KINDS = ['access', 'export', 'correction', 'erasure', 'restriction', 'sharing_revocation']

function downloadJson(name, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function NewRequestForm({ onDone }) {
  const [form, setForm] = useState({ kind: 'access', scope: 'candidate', candidateEmail: '', sessionId: '', details: '' })
  const [error, setError] = useState('')
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const body = { kind: form.kind, scope: form.scope, details: form.details }
      if (form.scope === 'candidate') body.candidateEmail = form.candidateEmail
      else body.sessionId = form.sessionId
      const r = await adminFetch('/api/admin/privacy', { method: 'POST', body })
      onDone(r.requestId)
    } catch (err) { setError(err.message) }
  }

  return (
    <form onSubmit={submit} className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 mb-5 flex flex-col gap-2 max-w-2xl">
      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">Open a data-subject request</p>
      <ErrorNotice error={error} />
      <div className="flex gap-2 flex-wrap">
        <select className={field} value={form.kind} onChange={(e) => set({ kind: e.target.value })} aria-label="Kind">
          {KINDS.map((k) => <option key={k} value={k}>{k.replace('_', ' ')}</option>)}
        </select>
        <select className={field} value={form.scope} onChange={(e) => set({ scope: e.target.value })} aria-label="Scope">
          <option value="candidate">whole candidate</option>
          <option value="session">single session</option>
        </select>
        {form.scope === 'candidate' ? (
          <input className={`${field} w-64`} placeholder="candidate email" value={form.candidateEmail}
            onChange={(e) => set({ candidateEmail: e.target.value })} aria-label="Candidate email" />
        ) : (
          <input className={`${field} w-72`} placeholder="session id" value={form.sessionId}
            onChange={(e) => set({ sessionId: e.target.value })} aria-label="Session id" />
        )}
      </div>
      <textarea className={`${field} min-h-[64px]`} placeholder="How did this request reach us? (support ticket, email, in-app…) — 10+ characters, audited"
        value={form.details} onChange={(e) => set({ details: e.target.value })} aria-label="Details" />
      <div><button type="submit" className={btn}>Open request</button></div>
    </form>
  )
}

function PlanView({ title, plan }) {
  if (!plan) return null
  return (
    <div className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-paper)] p-3 mt-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-2">{title}</p>
      <pre className="font-mono text-[11px] text-[var(--color-ink)] whitespace-pre-wrap overflow-x-auto max-h-80 overflow-y-auto">
        {JSON.stringify(plan, null, 2)}
      </pre>
    </div>
  )
}

function RequestDetail({ id, onChanged, onClose }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const canManage = adminHasPermission('privacy:manage')
  const canExecute = adminHasPermission('privacy:execute')

  const load = useCallback(async () => {
    setError('')
    try { setData(await adminFetch(`/api/admin/privacy/${id}`)) } catch (err) { setError(err.message) }
  }, [id])
  useEffect(() => { load() }, [load])

  const run = async (fn, okMsg) => {
    setError(''); setNotice('')
    try {
      const r = await fn()
      if (r === null) return
      setNotice(okMsg || 'Done.')
      await load()
      onChanged()
      return r
    } catch (err) { setError(err.message) }
  }

  const r = data?.request
  if (!r) return <ErrorNotice error={error} />
  const open = !['completed', 'rejected'].includes(r.status)

  return (
    <div className="rounded-[10px] border border-[var(--color-accent)] bg-[var(--color-surface)] p-4 mb-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="font-mono text-[12px] text-[var(--color-ink)]">
            {mono(r.request_id, 12)} · <strong>{r.kind}</strong> · {r.scope}{' '}
            <Pill tone={STATUS_TONE[r.status] || 'muted'}>{r.status}</Pill>
          </p>
          <p className="font-sans text-[13px] text-[var(--color-ink-muted)]">
            {r.candidate_email || r.session_id || r.candidate_user_id || '—'} · opened by {r.opened_by_email} · {when(r.created_at)}
          </p>
          <p className="font-sans text-[13px] text-[var(--color-ink)] mt-1">{r.details}</p>
          {r.decided_reason && (
            <p className="font-sans text-[13px] text-[var(--color-ink-muted)] mt-1">Resolution: {r.decided_reason}</p>
          )}
        </div>
        <button type="button" className={btn} onClick={onClose}>Close</button>
      </div>

      <ErrorNotice error={error} />
      <Notice>{notice}</Notice>

      {open && (
        <div className="flex gap-1.5 flex-wrap mt-3">
          {canManage && ['received', 'verifying'].includes(r.status) && (
            <button type="button" className={btn}
              onClick={() => run(() => adminFetch(`/api/admin/privacy/${id}/verify`, { method: 'POST', body: {} }),
                'Data subject verified.')}>
              Verify data subject
            </button>
          )}
          {canManage && r.kind === 'erasure' && ['verifying', 'dry_run', 'awaiting_approval'].includes(r.status) && (
            <button type="button" className={btn}
              onClick={() => run(() => adminFetch(`/api/admin/privacy/${id}/dry-run`, { method: 'POST', body: {} }),
                'Dry-run plan generated — nothing was deleted. Review the plan below, then obtain dual approval (action "privacy_erasure").')}>
              Run erasure dry-run
            </button>
          )}
          {canExecute && r.kind === 'erasure' && r.status === 'awaiting_approval' && (
            <button type="button" className={btnDanger}
              onClick={() => {
                if (!window.confirm('Execute the approved erasure? This permanently deletes the data in the plan. This cannot be undone.')) return
                run(() => adminFetch(`/api/admin/privacy/${id}/execute`, { method: 'POST', body: {} }),
                  'Erasure executed — receipt recorded below and in the audit trail.')
              }}>
              Execute erasure
            </button>
          )}
          {canManage && ['access', 'export'].includes(r.kind) && r.status === 'verifying' && (
            <button type="button" className={btn}
              onClick={async () => {
                const resp = await run(() => adminFetch(`/api/admin/privacy/${id}/fulfil`, { method: 'POST', body: {} }),
                  'Data package assembled (export ledgered) — downloading.')
                if (resp?.package) downloadJson(`privacy-package-${mono(id, 8)}.json`, resp.package)
              }}>
              Assemble &amp; download package
            </button>
          )}
          {canManage && ['correction', 'restriction', 'sharing_revocation'].includes(r.kind) && r.status === 'verifying' && (
            <button type="button" className={btn}
              onClick={() => {
                const resolution = window.prompt('Written resolution — name the governed workflow that handled it (10+ chars):')
                if (!resolution) return
                run(() => adminFetch(`/api/admin/privacy/${id}/fulfil`, { method: 'POST', body: { resolution } }),
                  'Resolution recorded.')
              }}>
              Record resolution
            </button>
          )}
          {canManage && (
            <button type="button" className={btnDanger}
              onClick={() => {
                const reason = window.prompt('Reason for rejecting this request (10+ chars, audited):')
                if (!reason) return
                run(() => adminFetch(`/api/admin/privacy/${id}/reject`, { method: 'POST', body: { reason } }),
                  'Request rejected.')
              }}>
              Reject
            </button>
          )}
        </div>
      )}

      <PlanView title="Dry-run plan (nothing deleted yet)" plan={r.dry_run_plan} />
      <PlanView title="Erasure receipt" plan={r.receipt} />
    </div>
  )
}

export default function AdminPrivacy() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [selected, setSelected] = useState(null)
  const canCreate = adminHasPermission('privacy:create')
  const canRetention = adminHasPermission('retention:manage')

  const load = useCallback(async () => {
    setError('')
    try { setData(await adminFetch('/api/admin/privacy')) } catch (err) { setError(err.message) }
  }, [])
  useEffect(() => { load() }, [load])

  const setRetention = async (rule) => {
    const days = window.prompt(`Retention days for ${rule.entity} (positive integer, empty = undecided):`, rule.retention_days ?? '')
    if (days === null) return
    const basis = window.prompt('Legal/operational basis for this retention period (10+ chars, audited):', rule.basis || '')
    if (!basis) return
    setError('')
    try {
      await adminFetch(`/api/admin/privacy/retention/${rule.entity}`, {
        method: 'PUT',
        body: { retentionDays: days.trim() === '' ? null : Number(days), basis },
      })
      await load()
    } catch (err) { setError(err.message) }
  }

  return (
    <div className="p-6 max-w-6xl">
      <PageHeader title="Privacy requests" subtitle={data?.note || ''}>
        {canCreate && (
          <button type="button" className={btn} onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Hide form' : 'New request'}
          </button>
        )}
      </PageHeader>
      <ErrorNotice error={error} />
      <Toolbar onRefresh={load} />

      {showForm && <NewRequestForm onDone={(id) => { setShowForm(false); setSelected(id); load() }} />}
      {selected && (
        <RequestDetail id={selected} onChanged={load} onClose={() => setSelected(null)} />
      )}

      <DataTable
        columns={[
          { key: 'request_id', label: 'Request', render: (r) => mono(r.request_id, 8), className: 'font-mono' },
          { key: 'kind', label: 'Kind' },
          { key: 'scope', label: 'Scope' },
          { key: 'subject', label: 'Subject', render: (r) => r.candidate_email || mono(r.session_id, 12) || '—' },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={STATUS_TONE[r.status] || 'muted'}>{r.status}</Pill> },
          { key: 'opened_by_email', label: 'Opened by' },
          { key: 'created_at', label: 'Opened', render: (r) => when(r.created_at) },
          { key: 'completed_at', label: 'Completed', render: (r) => when(r.completed_at) },
        ]}
        rows={data?.requests}
        rowKey={(r) => r.request_id}
        onRowClick={(r) => setSelected(r.request_id)}
        empty="No privacy requests."
        busy={!data}
      />

      <h2 className="mt-8 font-display text-base text-[var(--color-ink)] mb-2">Retention rules</h2>
      <p className="font-sans text-[13px] text-[var(--color-ink-muted)] mb-3">
        Documented policy per data class. Nothing auto-deletes on a timer — enforcement is a deliberate, audited action.
      </p>
      <DataTable
        columns={[
          { key: 'entity', label: 'Data class', className: 'font-mono' },
          {
            key: 'state', label: 'Retention',
            render: (r) => r.retention_days == null
              ? <Pill tone="warn">NOT SET — requires decision</Pill>
              : <Pill tone="ok">{r.retention_days} days</Pill>,
          },
          { key: 'basis', label: 'Basis', render: (r) => r.basis || '—' },
          { key: 'updated_at', label: 'Updated', render: (r) => when(r.updated_at) },
          {
            key: 'actions', label: '',
            render: (r) => canRetention
              ? <button type="button" className={btn} onClick={(e) => { e.stopPropagation(); setRetention(r) }}>Set</button>
              : null,
          },
        ]}
        rows={data?.retention}
        rowKey={(r) => r.entity}
        empty="No retention entities."
        busy={!data}
      />
      <div className="h-10" />
    </div>
  )
}
