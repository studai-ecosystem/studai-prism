import { useCallback, useEffect, useState } from 'react'
import { adminFetch, adminHasPermission } from '../../lib/adminApi.js'
import {
  useAdminList, PageHeader, ErrorNotice, Notice, Toolbar, SearchBox, DataTable, Pager,
  Pill, btn, field, when, mono, actWithReason,
} from './ui.jsx'

// ── /admin/payments — payments & entitlements (Phase 2) ──────────────────────
// Successful payment identifiers/amounts have no edit path — corrections
// belong to the reconciliation ledger (Phase 5).

export default function AdminPayments() {
  const { data, error, busy, params, setFilter, setPage, reload } = useAdminList('/api/admin/payments')
  const [metrics, setMetrics] = useState(null)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const canGrant = adminHasPermission('payments:grant')
  const canRevoke = adminHasPermission('payments:revoke')

  const loadMetrics = useCallback(async () => {
    try {
      setMetrics(await adminFetch('/api/admin/payments/metrics'))
    } catch { /* metrics panel is best-effort */ }
  }, [])
  useEffect(() => { loadMetrics() }, [loadMetrics])

  const run = async (fn, okMsg) => {
    setActionError(''); setNotice('')
    try {
      const r = await fn()
      if (r === null) return
      if (r?.entitlement?.sessionId && r.entitlement.mode === 'admin_grant') {
        setNotice(`Entitlement granted. Session id (relay to candidate): ${r.entitlement.sessionId}`)
      } else if (okMsg) setNotice(okMsg)
      reload()
      loadMetrics()
    } catch (err) { setActionError(err.message) }
  }

  return (
    <div className="p-6 max-w-6xl">
      <PageHeader
        title="Payments & entitlements"
        subtitle="Paid identifiers and amounts are never edited here — reconciliation corrections arrive with Phase 5.">
        {canGrant && (
          <button type="button" className={btn}
            onClick={() => run(() => actWithReason('/api/admin/payments/grant', {}, 'Reason for granting a free assessment (audited):'))}>
            Grant entitlement
          </button>
        )}
      </PageHeader>
      <ErrorNotice error={error || actionError} />
      <Notice>{notice}</Notice>

      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[
            ['Revenue (paid)', `₹${(metrics.revenue / 100).toFixed(2)}`],
            ['Paid entitlements', metrics.paidCount],
            ['Unconsumed', metrics.unconsumed],
            ['Total entitlements', metrics.totalEntitlements],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">{label}</p>
              <p className="font-display text-xl text-[var(--color-ink)] tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      )}

      <Toolbar onRefresh={() => { reload(); loadMetrics() }} busy={busy}>
        <SearchBox value={params.q} onChange={(q) => setFilter({ q })} placeholder="Session, payment or order id…" />
        <select aria-label="Mode" className={field} value={params.mode || ''} onChange={(e) => setFilter({ mode: e.target.value || undefined })}>
          <option value="">All modes</option>
          {['paid', 'dev', 'dummy', 'admin_grant'].map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select aria-label="Consumption" className={field} value={params.consumed ?? ''} onChange={(e) => setFilter({ consumed: e.target.value || undefined })}>
          <option value="">Any state</option>
          <option value="false">Unconsumed</option>
          <option value="true">Consumed</option>
        </select>
      </Toolbar>

      <DataTable
        busy={busy}
        rowKey={(p) => p.sessionId}
        columns={[
          { key: 'sessionId', label: 'Session', render: (p) => `${mono(p.sessionId, 13)}…`, className: 'font-mono text-[12px]' },
          { key: 'paymentId', label: 'Payment id', render: (p) => p.paymentId || '—', className: 'font-mono text-[11px]' },
          { key: 'orderId', label: 'Order id', render: (p) => p.orderId || '—', className: 'font-mono text-[11px]' },
          { key: 'amount', label: 'Amount', render: (p) => (p.amount != null ? `₹${(p.amount / 100).toFixed(2)}` : '—'), className: 'tabular-nums' },
          { key: 'mode', label: 'Mode', render: (p) => <Pill tone={p.mode === 'paid' ? 'ok' : 'muted'}>{p.mode}</Pill> },
          {
            key: 'consumed', label: 'State',
            render: (p) => <Pill tone={p.consumed ? 'muted' : 'info'}>{p.revoked ? 'revoked' : p.consumed ? 'consumed' : 'unused'}</Pill>,
          },
          { key: 'createdAt', label: 'Created', render: (p) => when(p.createdAt), className: 'whitespace-nowrap font-mono text-[11px]' },
          {
            key: 'actions', label: '',
            render: (p) => (canRevoke && !p.consumed ? (
              <button type="button" className={btn}
                onClick={(e) => {
                  e.stopPropagation()
                  run(() => actWithReason(`/api/admin/payments/${p.sessionId}/revoke`, {}, 'Reason for revoking this unused entitlement (audited):'), 'Entitlement revoked.')
                }}>
                Revoke
              </button>
            ) : null),
          },
        ]}
        rows={data?.rows}
        empty="No entitlements match."
      />
      <Pager data={data} onPage={setPage} />
    </div>
  )
}
