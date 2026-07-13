import { useCallback, useEffect, useState } from 'react'
import { adminFetch, adminHasPermission } from '../../lib/adminApi.js'
import { PageHeader, ErrorNotice, Notice, Toolbar, DataTable, Pill, btn, when, mono } from './ui.jsx'

// ── /admin/replays — practice replays (Phase 4) ──────────────────────────────
// Practice-only ledger: structurally unable to touch certified scores. Erasure
// runs through the Phase 6 privacy workflow — not ad-hoc deletion here.

export default function AdminReplays() {
  const [replays, setReplays] = useState(null)
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const canFlag = adminHasPermission('replays:flag')
  const canExport = adminHasPermission('exports:create')

  const load = useCallback(async () => {
    setError('')
    try {
      setReplays((await adminFetch('/api/admin/replays')).replays)
    } catch (err) { setError(err.message) }
  }, [])

  useEffect(() => { load() }, [load])

  const flag = async (replay) => {
    setError(''); setNotice('')
    const reason = window.prompt('Reason for flagging this replay for abuse review (10+ characters):')
    if (!reason) return
    try {
      await adminFetch(`/api/admin/replays/${replay.replay_id}/flag`, { method: 'POST', body: { reason } })
      setNotice('Flagged — an incident was opened for review.')
      await load()
    } catch (err) { setError(err.message) }
  }

  const exportReplays = async () => {
    setError(''); setNotice('')
    const purpose = window.prompt('Purpose for this research export (goes on the export ledger):')
    if (!purpose) return
    try {
      const r = await adminFetch(`/api/admin/replays/export?limit=200&purpose=${encodeURIComponent(purpose)}`)
      const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `prism-replays-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(a.href)
      setNotice(`Exported ${r.rows} replays (ledgered).`)
    } catch (err) { setError(err.message) }
  }

  const openDetail = async (replay) => {
    setError('')
    try {
      setDetail(await adminFetch(`/api/admin/replays/${replay.replay_id}`))
    } catch (err) { setError(err.message) }
  }

  return (
    <div className="p-6 max-w-5xl">
      <PageHeader
        title="Practice replays"
        subtitle="Practice-only ledger — replay activity can never change a certified score or credential (structural). Erasure runs through the privacy workflow (Phase 6).">
        {canExport && <button type="button" className={btn} onClick={exportReplays}>Export for research</button>}
      </PageHeader>
      <ErrorNotice error={error} />
      <Notice>{notice}</Notice>
      <Toolbar onRefresh={load} />

      <DataTable
        rowKey={(r) => r.replay_id}
        onRowClick={openDetail}
        columns={[
          { key: 'replay_id', label: 'Replay', render: (r) => `${mono(r.replay_id, 13)}…`, className: 'font-mono text-[12px]' },
          { key: 'source_session_id', label: 'Source session', render: (r) => `${mono(r.source_session_id, 13)}…`, className: 'font-mono text-[11px]' },
          { key: 'exchange_no', label: 'Exchange', className: 'tabular-nums' },
          { key: 'moment', label: 'Moment', render: (r) => r.moment ? `${r.moment.dimension || ''} ${r.moment.kind || ''}`.trim() || '—' : '—' },
          { key: 'turn_count', label: 'Turns', className: 'tabular-nums' },
          { key: 'flagged', label: 'State', render: (r) => r.flagged ? <Pill tone="danger">flagged</Pill> : <Pill tone="muted">practice</Pill> },
          { key: 'created_at', label: 'Created', render: (r) => when(r.created_at), className: 'whitespace-nowrap font-mono text-[11px]' },
          {
            key: 'actions', label: '',
            render: (r) => (canFlag && !r.flagged ? (
              <button type="button" className={btn} onClick={(e) => { e.stopPropagation(); flag(r) }}>Flag abuse</button>
            ) : null),
          },
        ]}
        rows={replays}
        empty="No practice replays recorded."
      />

      {detail && (
        <section className="mt-4 mb-10 rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
              Replay {detail.replay.replay_id}
            </h2>
            <button type="button" className={btn} onClick={() => setDetail(null)}>Close</button>
          </div>
          <div className="mt-2 space-y-2 max-h-80 overflow-y-auto">
            {(detail.replay.turns || []).map((turn, i) => (
              <div key={i} className="font-sans text-[13px]">
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
                  {turn.speaker || 'unknown'}
                </span>
                <p className="text-[var(--color-ink)] whitespace-pre-wrap">{String(turn.text || '')}</p>
              </div>
            ))}
          </div>
          {detail.incidents.length > 0 && (
            <div className="mt-3 border-t border-[var(--color-line)] pt-2">
              {detail.incidents.map((i) => (
                <p key={i.incident_id} className="font-sans text-[13px] text-[var(--color-danger)]">
                  incident {mono(i.incident_id, 8)} · {i.severity} · {i.status} · {when(i.created_at)}
                </p>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
