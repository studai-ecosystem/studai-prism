import { useCallback, useEffect, useState } from 'react'
import { adminFetch } from '../../lib/adminApi.js'
import { PageHeader, ErrorNotice, Notice, Toolbar, DataTable, btn, field, when } from './ui.jsx'

// ── /admin/exports — research exports + ledger (Phase 4) ─────────────────────
// Pseudonymous datasets only (server allowlist). Every export is ledgered
// with who/what/why; beyond the row cap needs dual approval.

export default function AdminExports() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState({ dataset: 'timeline', rowLimit: '', purpose: '' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      setData(await adminFetch('/api/admin/exports'))
    } catch (err) { setError(err.message) }
  }, [])

  useEffect(() => { load() }, [load])

  const runExport = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(''); setNotice('')
    try {
      const body = { dataset: form.dataset, purpose: form.purpose }
      if (form.rowLimit) body.rowLimit = Number(form.rowLimit)
      const r = await adminFetch('/api/admin/exports/research', { method: 'POST', body })
      const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `prism-${form.dataset}-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(a.href)
      setNotice(`Exported ${r.rows} rows of ${form.dataset} (ledgered).`)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl">
      <PageHeader
        title="Research exports"
        subtitle={`Pseudonymous research datasets only — PII stores are never exportable here. Exports beyond ${data?.defaultCap ?? 1000} rows require dual approval ("large_export").`}
      />
      <ErrorNotice error={error} />
      <Notice>{notice}</Notice>

      <form onSubmit={runExport} className="mb-5 rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 grid gap-3 md:grid-cols-3">
        <label className="font-mono text-[11px] uppercase text-[var(--color-ink-muted)]">
          Dataset
          <select className={`${field} w-full mt-1`} value={form.dataset}
            onChange={(e) => setForm({ ...form, dataset: e.target.value })}>
            {(data?.datasets || ['timeline']).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="font-mono text-[11px] uppercase text-[var(--color-ink-muted)]">
          Row limit (blank = {data?.defaultCap ?? 1000})
          <input type="number" min="1" className={`${field} w-full mt-1 tabular-nums`} value={form.rowLimit}
            onChange={(e) => setForm({ ...form, rowLimit: e.target.value })} />
        </label>
        <label className="font-mono text-[11px] uppercase text-[var(--color-ink-muted)]">
          Purpose (goes on the ledger)
          <input required minLength={10} className={`${field} w-full mt-1`} value={form.purpose}
            onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
        </label>
        <div className="md:col-span-3">
          <button type="submit" disabled={busy} className={btn}>Export as JSON</button>
        </div>
      </form>

      <h2 className="font-display text-base text-[var(--color-ink)] mb-2">Export ledger</h2>
      <Toolbar onRefresh={load} />
      <DataTable
        rowKey={(e) => e.export_id}
        columns={[
          { key: 'entity_type', label: 'Dataset', className: 'font-mono text-[12px]' },
          { key: 'row_count', label: 'Rows', className: 'tabular-nums' },
          { key: 'purpose', label: 'Purpose' },
          { key: 'exported_by', label: 'By', className: 'font-mono text-[11px]' },
          { key: 'created_at', label: 'When', render: (e) => when(e.created_at), className: 'whitespace-nowrap font-mono text-[11px]' },
        ]}
        rows={data?.exports}
        empty="No exports on the ledger."
      />
    </div>
  )
}
