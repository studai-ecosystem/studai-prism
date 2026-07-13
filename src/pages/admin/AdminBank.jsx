import { useCallback, useEffect, useState } from 'react'
import { Snowflake } from 'lucide-react'
import { adminFetch, adminHasPermission } from '../../lib/adminApi.js'
import { PageHeader, ErrorNotice, Notice, Toolbar, DataTable, Pill, btn, field, when, actWithReason } from './ui.jsx'

// ── /admin/bank — scenario & item bank (Phase 3) ─────────────────────────────
// Freeze-aware: while no IRT calibration run is frozen, the bank is frozen at
// <= 8 active scenarios and there is NO create path — the banner explains why
// instead of showing dead buttons. Items retire; they never delete.

export default function AdminBank() {
  const [scenarios, setScenarios] = useState(null)
  const [freeze, setFreeze] = useState(null)
  const [items, setItems] = useState(null)
  const [filter, setFilter] = useState({ scenarioKey: '', status: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const canRetire = adminHasPermission('items:retire')

  const load = useCallback(async () => {
    setError('')
    try {
      const s = await adminFetch('/api/admin/bank/scenarios')
      setScenarios(s.scenarios)
      setFreeze(s.freeze)
      const qs = new URLSearchParams()
      if (filter.scenarioKey) qs.set('scenarioKey', filter.scenarioKey)
      if (filter.status) qs.set('status', filter.status)
      setItems((await adminFetch(`/api/admin/bank/items?${qs}`)).items)
    } catch (err) {
      setError(err.message)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  const retire = async (item) => {
    setError(''); setNotice('')
    try {
      const r = await actWithReason(`/api/admin/bank/items/${item.item_id}/retire`, {},
        'Reason for retiring this item (10+ characters — recorded in BOTH audit trails):')
      if (r === null) return
      setNotice('Item retired. It remains referenced by historical responses forever.')
      await load()
    } catch (err) { setError(err.message) }
  }

  return (
    <div className="p-6 max-w-6xl">
      <PageHeader title="Scenario & item bank" subtitle="Calibrated or historically used items are retired or superseded — never deleted." />
      <ErrorNotice error={error} />
      <Notice>{notice}</Notice>

      {freeze && (
        <div className={`mb-4 rounded-[10px] border p-4 flex items-start gap-3 ${freeze.bankFrozen ? 'border-[var(--color-info)] bg-[var(--color-info-surface)]' : 'border-[var(--color-line)] bg-[var(--color-surface)]'}`}>
          <Snowflake size={16} className="text-[var(--color-info)] mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-sans text-sm text-[var(--color-ink)]">
              {freeze.bankFrozen
                ? 'Bank FROZEN — no scenario or item creation is available anywhere in this console.'
                : `Bank freeze lifted by frozen IRT run ${String(freeze.unfrozenBy?.runId || '').slice(0, 8)} (${when(freeze.unfrozenBy?.at)}). Scenario authoring tooling ships with the post-calibration roadmap.`}
            </p>
            <p className="mt-1 font-mono text-[11px] text-[var(--color-ink-muted)]">{freeze.rule}</p>
          </div>
        </div>
      )}

      <h2 className="font-display text-base text-[var(--color-ink)] mb-2">Scenarios</h2>
      <DataTable
        rowKey={(s) => s.scenario_key}
        onRowClick={(s) => setFilter({ ...filter, scenarioKey: s.scenario_key })}
        columns={[
          { key: 'scenario_key', label: 'Scenario', className: 'font-mono text-[12px]' },
          { key: 'tier_label', label: 'Tier' },
          { key: 'status', label: 'Status', render: (s) => <Pill tone={s.status === 'retired' ? 'muted' : s.status === 'calibrating' ? 'warn' : 'info'}>{s.status}</Pill> },
          { key: 'probe_count', label: 'Probes', className: 'tabular-nums' },
          { key: 'retired', label: 'Retired items', className: 'tabular-nums' },
          { key: 'response_count', label: 'Responses accumulated', className: 'tabular-nums' },
        ]}
        rows={scenarios}
        empty="No scenarios seeded."
      />

      <div className="mt-6 flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-display text-base text-[var(--color-ink)]">Items & probes</h2>
        <Toolbar onRefresh={load}>
          {filter.scenarioKey && (
            <button type="button" className={btn} onClick={() => setFilter({ ...filter, scenarioKey: '' })}>
              Clear scenario filter ({filter.scenarioKey})
            </button>
          )}
          <select aria-label="Status" className={field} value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
            <option value="">All statuses</option>
            {['provisional', 'calibrated', 'retired'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Toolbar>
      </div>
      <div className="mt-2">
        <DataTable
          rowKey={(i) => i.item_id}
          columns={[
            { key: 'scenario_key', label: 'Scenario', className: 'font-mono text-[11px]' },
            { key: 'kind', label: 'Kind' },
            { key: 'dimension', label: 'Dimension' },
            { key: 'facet', label: 'Facet', render: (i) => i.facet || '—' },
            { key: 'difficulty_b', label: 'b', className: 'tabular-nums font-mono text-[11px]' },
            { key: 'discrimination_a', label: 'a', className: 'tabular-nums font-mono text-[11px]' },
            { key: 'response_count', label: 'Responses', className: 'tabular-nums' },
            { key: 'status', label: 'Status', render: (i) => <Pill tone={i.status === 'retired' ? 'muted' : i.status === 'calibrated' ? 'ok' : 'info'}>{i.status}</Pill> },
            {
              key: 'actions', label: '',
              render: (i) => (canRetire && i.status !== 'retired' ? (
                <button type="button" className={btn} onClick={(e) => { e.stopPropagation(); retire(i) }}>Retire</button>
              ) : null),
            },
          ]}
          rows={items}
          empty="No items match."
        />
      </div>
    </div>
  )
}
