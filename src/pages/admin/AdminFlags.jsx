import { useCallback, useEffect, useState } from 'react'
import { adminFetch, adminHasPermission, currentAdmin } from '../../lib/adminApi.js'
import { PageHeader, ErrorNotice, Notice, Toolbar, Pill, btn, field, when } from './ui.jsx'

// ── /admin/flags — feature-flag registry (Phase 5, §24) ──────────────────────
// THE ONE LAW: the console never flips a flag. Requests → (dual) approval →
// OPERATOR env action → mark-applied verifies the live environment.

const CHANGE_TONE = { requested: 'info', approved: 'warn', rejected: 'danger', cancelled: 'muted', applied_by_operator: 'ok' }

export default function AdminFlags() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const canRequest = adminHasPermission('flags:request')
  const canApprove = adminHasPermission('flags:approve')
  const me = currentAdmin()

  const load = useCallback(async () => {
    setError('')
    try { setData(await adminFetch('/api/admin/flags')) } catch (err) { setError(err.message) }
  }, [])
  useEffect(() => { load() }, [load])

  const run = async (fn, okMsg) => {
    setError(''); setNotice('')
    try {
      const r = await fn()
      if (r === null) return
      setNotice(r?.next || okMsg || 'Done.')
      await load()
    } catch (err) { setError(err.message) }
  }

  const request = (flag, state) =>
    run(async () => {
      const environment = window.prompt('Environment (development | staging | production):', 'production')
      if (!environment) return null
      const reason = window.prompt(`Reason for requesting ${flag.flag_key} → ${state} in ${environment} (10+ chars, audited):`)
      if (!reason) return null
      return adminFetch(`/api/admin/flags/${flag.flag_key}/request`, {
        method: 'POST', body: { environment: environment.trim(), requestedState: state, reason },
      })
    })

  return (
    <div className="p-6 max-w-6xl">
      <PageHeader title="Feature flags" subtitle={data?.law || ''} />
      <ErrorNotice error={error} />
      <Notice>{notice}</Notice>
      <Toolbar onRefresh={load} />

      <div className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] divide-y divide-[var(--color-line)]">
        {(data?.flags || []).map((f) => (
          <div key={f.flag_key} className="p-3 flex items-start gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[12px] text-[var(--color-ink)]">
                {f.flag_key}
                <Pill tone={f.liveState === 'on' ? 'ok' : 'muted'}>{f.liveState}</Pill>{' '}
                <Pill tone={f.risk === 'high' ? 'danger' : f.risk === 'medium' ? 'warn' : 'muted'}>{f.risk} risk</Pill>
                {f.scienceGated && f.flipCheck && (
                  <Pill tone={f.flipCheck.verdict === 'GO' ? 'ok' : 'danger'}>flip-check {f.flipCheck.verdict}</Pill>
                )}
              </p>
              <p className="font-sans text-[13px] text-[var(--color-ink-muted)]">{f.description}</p>
              <p className="font-mono text-[10px] text-[var(--color-ink-muted)]">owner: {f.owner} · gate: {f.data_gate || '—'}</p>
            </div>
            {canRequest && (
              <span className="flex gap-1.5">
                <button type="button" className={btn} onClick={() => request(f, 'on')}>Request enable</button>
                <button type="button" className={btn} onClick={() => request(f, 'off')}>Request disable</button>
              </span>
            )}
          </div>
        ))}
      </div>

      <h2 className="mt-6 font-display text-base text-[var(--color-ink)] mb-2">Change requests</h2>
      <div className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] divide-y divide-[var(--color-line)] mb-10">
        {(data?.changes || []).length === 0 ? (
          <p className="p-4 font-sans text-sm text-[var(--color-ink-muted)]">No change requests.</p>
        ) : (
          data.changes.map((c) => (
            <div key={c.change_id} className="p-3 flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="font-mono text-[12px] text-[var(--color-ink)]">
                  {c.flag_key} → {c.requested_state} · {c.environment}{' '}
                  <Pill tone={CHANGE_TONE[c.status]}>{c.status}</Pill>
                </p>
                <p className="font-sans text-[13px] text-[var(--color-ink-muted)]">
                  “{c.reason}” — {c.requested_by_email}, {when(c.created_at)}
                  {c.decided_by_email && <> · decided by {c.decided_by_email}</>}
                  {c.applied_note && <> · {c.applied_note}</>}
                </p>
              </div>
              <span className="flex gap-1.5">
                {c.status === 'requested' && canApprove && c.requested_by !== me?.id && (
                  <>
                    <button type="button" className={btn}
                      onClick={() => run(async () => {
                        const reason = window.prompt('Approval reason (audited):')
                        if (!reason) return null
                        return adminFetch(`/api/admin/flags/changes/${c.change_id}/decide`, { method: 'POST', body: { decision: 'approved', reason } })
                      }, 'Approved — an operator applies the env change, then marks it applied.')}>
                      Approve
                    </button>
                    <button type="button" className={btn}
                      onClick={() => run(async () => {
                        const reason = window.prompt('Rejection reason (audited):')
                        if (!reason) return null
                        return adminFetch(`/api/admin/flags/changes/${c.change_id}/decide`, { method: 'POST', body: { decision: 'rejected', reason } })
                      }, 'Rejected.')}>
                      Reject
                    </button>
                  </>
                )}
                {c.status === 'approved' && canRequest && (
                  <button type="button" className={btn}
                    onClick={() => run(() => adminFetch(`/api/admin/flags/changes/${c.change_id}/mark-applied`, { method: 'POST', body: {} }),
                      'Marked applied (verified against the live environment).')}>
                    Mark applied
                  </button>
                )}
                {['requested', 'approved'].includes(c.status) && c.requested_by === me?.id && (
                  <button type="button" className={btn}
                    onClick={() => run(() => adminFetch(`/api/admin/flags/changes/${c.change_id}/cancel`, { method: 'POST', body: {} }), 'Cancelled.')}>
                    Cancel
                  </button>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
