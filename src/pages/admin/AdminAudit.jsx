import { useCallback, useEffect, useState } from 'react'
import { adminFetch } from '../../lib/adminApi.js'
import {
  PageHeader, ErrorNotice, Notice, Toolbar, Pill, DataTable, Pager, useAdminList,
  btn, field, when, mono,
} from './ui.jsx'

// ── /admin/audit — the immutable audit trail (Phase 6, §27) ──────────────────
// Read-only by construction: the API registers no mutating routes and the
// table blocks UPDATE/DELETE by trigger. Search, entity/admin timelines,
// security summary, and a ledgered export (the export itself is audited).

const SECURITY_TONE = {
  admin_login_failed: 'warn', admin_mfa_failed: 'warn', admin_login_blocked_locked: 'danger',
  break_glass_activated: 'danger', admin_session_revoked: 'warn', admin_password_reset: 'warn',
  admin_login_new_ip: 'info', verification_viewed: 'info', user_pii_viewed: 'info',
  admin_role_granted: 'warn', admin_state_changed: 'warn',
}

function downloadJson(name, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function EntityTimeline({ entity, onClose }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    setData(null); setError('')
    adminFetch(`/api/admin/audit/entity/${encodeURIComponent(entity.type)}/${encodeURIComponent(entity.id)}`)
      .then((d) => { if (live) setData(d) })
      .catch((err) => { if (live) setError(err.message) })
    return () => { live = false }
  }, [entity])

  return (
    <div className="rounded-[10px] border border-[var(--color-accent)] bg-[var(--color-surface)] p-4 mb-5">
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[12px] text-[var(--color-ink)]">
          Timeline — {entity.type} · {mono(entity.id, 16)}
        </p>
        <button type="button" className={btn} onClick={onClose}>Close</button>
      </div>
      <ErrorNotice error={error} />
      {data && (
        <>
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mt-3 mb-1">Administrator actions</p>
          {(data.adminEvents || []).length === 0 && <p className="font-sans text-[13px] text-[var(--color-ink-muted)]">None.</p>}
          {(data.adminEvents || []).map((e) => (
            <div key={e.event_id} className="border-b border-[var(--color-line)] last:border-0 py-1.5">
              <p className="font-sans text-[13px] text-[var(--color-ink)]">
                <span className="font-mono text-[11px]">{when(e.created_at)}</span> · {e.admin_email} · <strong>{e.action}</strong>
              </p>
              {e.reason && <p className="font-sans text-[12px] text-[var(--color-ink-muted)]">{e.reason}</p>}
            </div>
          ))}
          {(data.decisionTrail || []).length > 0 && (
            <>
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mt-4 mb-1">
                Assessment decision trail (system)
              </p>
              {data.decisionTrail.map((e, i) => (
                <div key={i} className="border-b border-[var(--color-line)] last:border-0 py-1.5">
                  <p className="font-sans text-[13px] text-[var(--color-ink)]">
                    <span className="font-mono text-[11px]">{when(e.created_at)}</span> · <strong>{e.event_type}</strong>
                  </p>
                  <pre className="font-mono text-[10px] text-[var(--color-ink-muted)] whitespace-pre-wrap">{JSON.stringify(e.payload)}</pre>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}

function SecurityTab() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try { setData(await adminFetch('/api/admin/audit/security')) } catch (err) { setError(err.message) }
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <>
      <ErrorNotice error={error} />
      <Toolbar onRefresh={load} />
      <div className="flex gap-3 flex-wrap mb-5">
        <div className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">Locked admin accounts</p>
          <p className="font-display text-xl text-[var(--color-ink)] tabular-nums">{data?.lockedAdminAccounts ?? '—'}</p>
        </div>
        <div className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">Open incidents</p>
          <p className="font-display text-xl text-[var(--color-ink)] tabular-nums">{data?.openIncidents ?? '—'}</p>
        </div>
        <div className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 min-w-[260px]">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-1">Security events — last 7 days</p>
          {(data?.last7Days || []).length === 0 && <p className="font-sans text-[13px] text-[var(--color-ink-muted)]">None.</p>}
          {(data?.last7Days || []).map((a) => (
            <p key={a.action} className="font-mono text-[11px] text-[var(--color-ink)] tabular-nums">
              {a.n} × {a.action}
            </p>
          ))}
        </div>
      </div>

      <h2 className="font-display text-base text-[var(--color-ink)] mb-2">Recent security events</h2>
      <DataTable
        columns={[
          { key: 'created_at', label: 'When', render: (r) => when(r.created_at), className: 'font-mono whitespace-nowrap' },
          { key: 'action', label: 'Action', render: (r) => <Pill tone={SECURITY_TONE[r.action] || 'muted'}>{r.action}</Pill> },
          { key: 'admin_email', label: 'Admin', render: (r) => r.admin_email || '—' },
          { key: 'entity', label: 'Entity', render: (r) => (r.entity_type ? `${r.entity_type} ${mono(r.entity_id, 10)}` : '—') },
          { key: 'ip', label: 'IP', render: (r) => r.ip || '—', className: 'font-mono' },
        ]}
        rows={data?.recentEvents}
        rowKey={(r) => r.event_id}
        empty="No security events."
        busy={!data}
      />

      <h2 className="mt-6 font-display text-base text-[var(--color-ink)] mb-2">Incidents</h2>
      <DataTable
        columns={[
          { key: 'created_at', label: 'Opened', render: (r) => when(r.created_at), className: 'font-mono whitespace-nowrap' },
          { key: 'kind', label: 'Kind' },
          { key: 'severity', label: 'Severity', render: (r) => <Pill tone={r.severity === 'critical' ? 'danger' : r.severity === 'high' ? 'warn' : 'muted'}>{r.severity}</Pill> },
          { key: 'title', label: 'Title' },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'resolved' ? 'ok' : 'warn'}>{r.status}</Pill> },
        ]}
        rows={data?.incidents}
        rowKey={(r) => r.incident_id}
        empty="No incidents."
        busy={!data}
      />
      <div className="h-10" />
    </>
  )
}

export default function AdminAudit() {
  const [tab, setTab] = useState('search') // search | security
  const list = useAdminList('/api/admin/audit')
  const [entity, setEntity] = useState(null)
  const [notice, setNotice] = useState('')
  const [exportError, setExportError] = useState('')

  const exportTrail = async () => {
    setExportError(''); setNotice('')
    try {
      const qs = new URLSearchParams()
      for (const [k, v] of Object.entries(list.params)) {
        if (['page', 'pageSize'].includes(k) || v === '' || v == null) continue
        qs.set(k, String(v))
      }
      qs.set('purpose', 'console export')
      const r = await adminFetch(`/api/admin/audit/export?${qs.toString()}`)
      downloadJson(`audit-export-${new Date().toISOString().slice(0, 10)}.json`, r)
      setNotice(`Exported ${r.rows} events — the export itself is ledgered and audited.`)
    } catch (err) { setExportError(err.message) }
  }

  const filterInput = (key, placeholder, width = 'w-44') => (
    <input
      className={`${field} ${width}`}
      placeholder={placeholder}
      defaultValue={list.params[key] || ''}
      onBlur={(e) => list.setFilter({ [key]: e.target.value.trim() })}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); list.setFilter({ [e.target.dataset.key]: e.target.value.trim() }) } }}
      data-key={key}
      aria-label={placeholder}
    />
  )

  return (
    <div className="p-6 max-w-6xl">
      <PageHeader title="Audit trail" subtitle="Immutable by trigger — the console cannot edit or delete history.">
        <button type="button" className={btn} onClick={() => setTab('search')} aria-pressed={tab === 'search'}>Search</button>
        <button type="button" className={btn} onClick={() => setTab('security')} aria-pressed={tab === 'security'}>Security</button>
      </PageHeader>

      {tab === 'security' ? (
        <SecurityTab />
      ) : (
        <>
          <ErrorNotice error={list.error || exportError} />
          <Notice>{notice}</Notice>
          <Toolbar onRefresh={list.reload} busy={list.busy}>
            {filterInput('action', 'action (exact)')}
            {filterInput('adminEmail', 'admin email')}
            {filterInput('entityType', 'entity type', 'w-36')}
            {filterInput('entityId', 'entity id')}
            {filterInput('from', 'from (ISO date)', 'w-36')}
            {filterInput('to', 'to (ISO date)', 'w-36')}
            <button type="button" className={btn} onClick={exportTrail}>Export (ledgered)</button>
          </Toolbar>

          {entity && <EntityTimeline entity={entity} onClose={() => setEntity(null)} />}

          <DataTable
            columns={[
              { key: 'created_at', label: 'When', render: (r) => when(r.created_at), className: 'font-mono whitespace-nowrap' },
              { key: 'admin_email', label: 'Admin', render: (r) => r.admin_email || '—' },
              { key: 'action', label: 'Action', className: 'font-mono' },
              { key: 'entity', label: 'Entity', render: (r) => (r.entity_type ? `${r.entity_type} ${mono(r.entity_id, 10)}` : '—') },
              { key: 'reason', label: 'Reason', render: (r) => r.reason || '—' },
              { key: 'approval_id', label: 'Approval', render: (r) => (r.approval_id ? <Pill tone="ok">dual</Pill> : '—') },
              { key: 'ip', label: 'IP', render: (r) => r.ip || '—', className: 'font-mono' },
            ]}
            rows={list.data?.rows}
            rowKey={(r) => r.event_id}
            onRowClick={(r) => { if (r.entity_type && r.entity_id) setEntity({ type: r.entity_type, id: r.entity_id }) }}
            empty="No audit events match."
            busy={list.busy}
          />
          <Pager data={list.data} onPage={list.setPage} />
          <div className="h-10" />
        </>
      )}
    </div>
  )
}
