import { useCallback, useEffect, useState } from 'react'
import { adminFetch, adminHasPermission } from '../../lib/adminApi.js'
import { ErrorNotice, Notice, Pill, DataTable, btn, btnDanger, field, when, mono } from './ui.jsx'

// ── /admin/system → Job queue (PROD-READY Phase 5) ───────────────────────────
// The PostgreSQL background job queue: counts per status, dead letters first,
// and an audited retry / cancel with a written reason (jobs:manage). The
// panel renders nothing while the server flag PRISM_JOB_WORKER is off (the
// API answers 404). Payloads hold ids only; account ids are masked by the API.

const STATUSES = ['DEAD', 'FAILED', 'PENDING', 'RUNNING', 'SUCCEEDED', 'CANCELLED']
const TONE = { DEAD: 'danger', FAILED: 'warn', PENDING: 'info', RUNNING: 'info', SUCCEEDED: 'ok', CANCELLED: 'muted' }

function ActionForm({ job, action, onDone, onCancel }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await adminFetch(`/api/admin/job-queue/${job.id}/${action}`, { method: 'POST', body: { reason: reason.trim() } })
      onDone(action === 'retry' ? 'Job queued again.' : 'Job cancelled.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="mt-2 flex flex-wrap items-center gap-2" aria-label={`${action === 'retry' ? 'Retry' : 'Cancel'} job ${mono(job.id)}`}>
      <label className="font-sans text-[13px] text-prism-ink" htmlFor={`reason-${job.id}`}>Reason</label>
      <input
        id={`reason-${job.id}`}
        className={`${field} w-72`}
        value={reason}
        minLength={5}
        maxLength={300}
        required
        onChange={(e) => setReason(e.target.value)}
        placeholder={action === 'retry' ? 'What was fixed' : 'Why this job should not run'}
      />
      <button type="submit" className={action === 'retry' ? btn : btnDanger} disabled={busy || reason.trim().length < 5}>
        {action === 'retry' ? 'Confirm retry' : 'Confirm cancel'}
      </button>
      <button type="button" className={btn} onClick={onCancel}>Back</button>
      {error && <span role="alert" className="font-sans text-[13px] text-prism-blocked">{error}</span>}
    </form>
  )
}

export default function AdminJobQueue() {
  const [status, setStatus] = useState('DEAD')
  const [data, setData] = useState(null)
  const [dark, setDark] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [acting, setActing] = useState(null) // { job, action }
  const canManage = adminHasPermission('jobs:manage')

  const load = useCallback(async () => {
    setError('')
    try {
      setData(await adminFetch(`/api/admin/job-queue?status=${encodeURIComponent(status)}`))
    } catch (err) {
      if (err.status === 404) setDark(true)
      else setError(err.message)
    }
  }, [status])
  useEffect(() => { load() }, [load])

  if (dark) return null

  const columns = [
    { key: 'kind', label: 'Kind', render: (j) => <span className="font-mono text-[12px]">{j.kind}</span> },
    { key: 'status', label: 'Status', render: (j) => <Pill tone={TONE[j.status]}>{j.status}</Pill> },
    { key: 'attempts', label: 'Attempts', render: (j) => <span className="font-mono text-[12px] tabular-nums">{j.attempts}/{j.maxAttempts}</span> },
    { key: 'lastError', label: 'Last error', render: (j) => <span className="font-mono text-[11px] break-all">{j.lastError || '—'}</span> },
    { key: 'updatedAt', label: 'Updated', render: (j) => <span className="font-mono text-[11px]">{when(j.updatedAt)}</span> },
    {
      key: 'actions',
      label: 'Actions',
      render: (j) => {
        if (!canManage || !['DEAD', 'PENDING', 'FAILED'].includes(j.status)) return '—'
        if (acting?.job.id === j.id) {
          return (
            <ActionForm
              job={j}
              action={acting.action}
              onCancel={() => setActing(null)}
              onDone={(msg) => { setActing(null); setNotice(msg); load() }}
            />
          )
        }
        return (
          <span className="flex gap-1.5">
            {j.status === 'DEAD' && <button type="button" className={btn} onClick={() => { setNotice(''); setActing({ job: j, action: 'retry' }) }}>Retry</button>}
            <button type="button" className={btnDanger} onClick={() => { setNotice(''); setActing({ job: j, action: 'cancel' }) }}>Cancel</button>
          </span>
        )
      },
    },
  ]

  return (
    <section className="mt-4 rounded-[10px] border border-[var(--prism-border)] bg-[var(--prism-surface)] p-4" aria-labelledby="job-queue-heading">
      <h2 id="job-queue-heading" className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--prism-ink-muted)] mb-1">Job queue</h2>
      <ErrorNotice error={error} />
      <Notice>{notice}</Notice>
      {data && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {STATUSES.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 font-mono text-[11px] text-prism-ink">
                <Pill tone={TONE[s]}>{s}</Pill>
                <span className="tabular-nums" data-testid={`job-count-${s}`}>{data.counts?.[s] ?? 0}</span>
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <label htmlFor="job-status-filter" className="font-sans text-[13px] text-prism-ink">Show</label>
            <select id="job-status-filter" className={field} value={status} onChange={(e) => { setActing(null); setStatus(e.target.value) }}>
              {STATUSES.map((s) => <option key={s} value={s}>{s === 'DEAD' ? 'DEAD (dead letters)' : s}</option>)}
            </select>
            <button type="button" className={btn} onClick={load}>Refresh</button>
          </div>
          <DataTable caption="Background jobs" columns={columns} rows={data.jobs} rowKey={(j) => j.id} empty={status === 'DEAD' ? 'No dead letters.' : 'No jobs in this state.'} />
          <p className="mt-2 font-mono text-[10px] text-[var(--prism-ink-muted)]">{data.note}</p>
        </>
      )}
    </section>
  )
}
