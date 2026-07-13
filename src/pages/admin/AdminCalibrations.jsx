import { useCallback, useEffect, useState } from 'react'
import { adminFetch, adminHasPermission } from '../../lib/adminApi.js'
import { PageHeader, ErrorNotice, Notice, Toolbar, DataTable, Pill, btn, btnDanger, field, when, mono } from './ui.jsx'

// ── /admin/calibrations — calibration-run lifecycle (Phase 3) ────────────────
// Freeze and Apply are SEPARATE dual-approved actions; Apply has live scoring
// effect (equating reads the frozen+applied run). One applied run per type.

const STATUS_TONE = { draft: 'muted', frozen: 'info', applied: 'ok', rejected: 'danger', superseded: 'warn' }

export default function AdminCalibrations() {
  const [runs, setRuns] = useState(null)
  const [runType, setRunType] = useState('')
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const canFreeze = adminHasPermission('calibrations:freeze')
  const canApply = adminHasPermission('calibrations:apply')

  const load = useCallback(async () => {
    setError('')
    try {
      const qs = runType ? `?runType=${encodeURIComponent(runType)}` : ''
      setRuns((await adminFetch(`/api/admin/calibrations${qs}`)).runs)
    } catch (err) { setError(err.message) }
  }, [runType])

  useEffect(() => { load() }, [load])

  const act = async (run, action, promptText) => {
    setError(''); setNotice('')
    const reason = window.prompt(promptText)
    if (!reason) return
    try {
      const r = await adminFetch(`/api/admin/calibrations/${run.run_id}/${action}`, { method: 'POST', body: { reason } })
      setNotice(action === 'apply'
        ? `Run applied${r.supersededRunId ? ` — superseded ${r.supersededRunId.slice(0, 8)}` : ''}. Scoring now reads this run.`
        : `Run ${action === 'freeze' ? 'frozen' : 'rejected'}.`)
      setDetail(null)
      await load()
    } catch (err) {
      setError(err.code === 'APPROVAL_REQUIRED'
        ? `${err.message}`
        : err.message)
    }
  }

  const openDetail = async (run) => {
    setError('')
    try {
      setDetail((await adminFetch(`/api/admin/calibrations/${run.run_id}`)).run)
    } catch (err) { setError(err.message) }
  }

  return (
    <div className="p-6 max-w-6xl">
      <PageHeader
        title="Calibration runs"
        subtitle="Freeze, then apply — two separate dual-approved decisions. Exactly one applied run per type; applying supersedes the previous one, never deletes it."
      />
      <ErrorNotice error={error} />
      <Notice>{notice}</Notice>
      <Toolbar onRefresh={load}>
        <select aria-label="Run type" className={field} value={runType} onChange={(e) => setRunType(e.target.value)}>
          <option value="">All run types</option>
          {['irt', 'rasch', 'equate', 'reliability', 'dif', 'conformal', 'channelB_train'].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </Toolbar>

      <DataTable
        rowKey={(r) => r.run_id}
        onRowClick={openDetail}
        columns={[
          { key: 'run_id', label: 'Run', render: (r) => `${mono(r.run_id, 8)}…`, className: 'font-mono text-[12px]' },
          { key: 'run_type', label: 'Type', className: 'font-mono text-[12px]' },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={STATUS_TONE[r.status]}>{r.status}</Pill> },
          { key: 'review_note', label: 'Review note', render: (r) => r.review_note ? <span className="line-clamp-1">{r.review_note}</span> : '—' },
          { key: 'created_at', label: 'Created', render: (r) => when(r.created_at), className: 'whitespace-nowrap font-mono text-[11px]' },
          { key: 'applied_at', label: 'Applied', render: (r) => when(r.applied_at), className: 'whitespace-nowrap font-mono text-[11px]' },
          {
            key: 'actions', label: '',
            render: (r) => (
              <span className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                {canFreeze && r.status === 'draft' && (
                  <button type="button" className={btn}
                    onClick={() => act(r, 'freeze', 'Review reason for FREEZING this run (10+ chars — requires a pre-approved "freeze_calibration" request for this run id):')}>
                    Freeze
                  </button>
                )}
                {canApply && r.status === 'frozen' && (
                  <button type="button" className={btnDanger}
                    onClick={() => act(r, 'apply', 'Reason for APPLYING this run (10+ chars — LIVE SCORING EFFECT; requires a pre-approved "apply_calibration" request):')}>
                    Apply
                  </button>
                )}
                {canFreeze && ['draft', 'frozen'].includes(r.status) && (
                  <button type="button" className={btn}
                    onClick={() => act(r, 'reject', 'Reason for rejecting this run (10+ chars):')}>
                    Reject
                  </button>
                )}
              </span>
            ),
          },
        ]}
        rows={runs}
        empty="No calibration runs yet — the Python jobs (calibration/jobs) write them."
      />

      {detail && (
        <section className="mt-4 mb-10 rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
              Run {detail.run_id} · {detail.run_type}
            </h2>
            <button type="button" className={btn} onClick={() => setDetail(null)}>Close</button>
          </div>
          <p className="mt-2 font-mono text-[11px] text-[var(--color-ink-muted)]">inputs summary</p>
          <pre className="mt-1 max-h-40 overflow-auto rounded-[6px] bg-[var(--color-paper)] p-3 font-mono text-[11px] text-[var(--color-ink)]">
            {JSON.stringify(detail.inputs_summary, null, 2)}
          </pre>
          <p className="mt-2 font-mono text-[11px] text-[var(--color-ink-muted)]">outputs</p>
          <pre className="mt-1 max-h-72 overflow-auto rounded-[6px] bg-[var(--color-paper)] p-3 font-mono text-[11px] text-[var(--color-ink)]">
            {JSON.stringify(detail.outputs, null, 2)}
          </pre>
        </section>
      )}
    </div>
  )
}
