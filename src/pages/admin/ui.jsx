// Shared building blocks for admin console pages (Control Centre Phase 2).
// Token-only styling (design ratchet). List pages compose: PageHeader +
// Toolbar + DataTable + Pager, driven by the useAdminList hook (server-side
// pagination + filters).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import { adminFetch } from '../../lib/adminApi.js'

export const field =
  'rounded-[6px] border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1.5 ' +
  'font-sans text-[13px] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]'

export const btn =
  'inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--color-line)] px-3 py-1.5 ' +
  'font-sans text-[13px] text-[var(--color-ink)] hover:border-[var(--color-accent)] disabled:opacity-50'

export const btnDanger =
  'inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--color-danger)] px-3 py-1.5 ' +
  'font-sans text-[13px] text-[var(--color-danger)] hover:opacity-80 disabled:opacity-50'

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
      <div>
        <h1 className="font-display text-xl text-[var(--color-ink)]">{title}</h1>
        {subtitle && <p className="font-mono text-[11px] text-[var(--color-ink-muted)]">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

export function ErrorNotice({ error }) {
  if (!error) return null
  return (
    <p role="alert" className="mb-4 rounded-[6px] border border-[var(--color-danger)] bg-[var(--color-danger-surface)] px-3 py-2 font-sans text-[13px] text-[var(--color-danger)]">
      {error}
    </p>
  )
}

export function Notice({ children }) {
  if (!children) return null
  return (
    <p className="mb-4 rounded-[6px] border border-[var(--color-success)] bg-[var(--color-success-surface)] px-3 py-2 font-sans text-[13px] text-[var(--color-ink)]">
      {children}
    </p>
  )
}

const PILL_STYLES = {
  ok: 'text-[var(--color-success)] border-[var(--color-success)]',
  info: 'text-[var(--color-info)] border-[var(--color-info)]',
  warn: 'text-[var(--color-reliability-moderate)] border-[var(--color-reliability-moderate)]',
  danger: 'text-[var(--color-danger)] border-[var(--color-danger)]',
  muted: 'text-[var(--color-ink-muted)] border-[var(--color-line)]',
}

export function Pill({ tone = 'muted', children }) {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${PILL_STYLES[tone] || PILL_STYLES.muted}`}>
      {children}
    </span>
  )
}

export function mono(v, len = 8) {
  return v == null ? '—' : String(v).slice(0, len)
}

export function when(v) {
  if (!v) return '—'
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v))
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

// Server-side paginated list state. `params` are merged into the querystring;
// changing filters resets to page 1.
export function useAdminList(path, initialParams = {}) {
  const [params, setParams] = useState({ page: 1, pageSize: 25, ...initialParams })
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const qs = new URLSearchParams()
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
      }
      setData(await adminFetch(`${path}?${qs.toString()}`))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }, [path, params])

  useEffect(() => { load() }, [load])

  const setFilter = useCallback((patch) => {
    setParams((prev) => ({ ...prev, ...patch, page: 1 }))
  }, [])
  const setPage = useCallback((page) => setParams((prev) => ({ ...prev, page })), [])

  return { data, error, busy, params, setFilter, setPage, reload: load }
}

export function Toolbar({ children, onRefresh, busy }) {
  return (
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      {children}
      {onRefresh && (
        <button type="button" className={btn} onClick={onRefresh} disabled={busy}>
          <RefreshCw size={13} className={busy ? 'animate-spin' : ''} aria-hidden="true" /> Refresh
        </button>
      )}
    </div>
  )
}

export function SearchBox({ value, onChange, placeholder = 'Search…' }) {
  const [draft, setDraft] = useState(value || '')
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onChange(draft.trim()) }}
      className="inline-flex items-center gap-1.5"
    >
      <input
        className={`${field} w-64`}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        aria-label="Search"
      />
      <button type="submit" className={btn}>Search</button>
    </form>
  )
}

// columns: [{ key, label, render?(row), className? }]
export function DataTable({ columns, rows, rowKey, empty = 'No records.', onRowClick, busy }) {
  if (busy && !rows) {
    return (
      <div className="p-6 flex items-center gap-2 font-sans text-sm text-[var(--color-ink-muted)]">
        <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Loading…
      </div>
    )
  }
  return (
    <div className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-[var(--color-line)]">
            {columns.map((c) => (
              <th key={c.key} className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(rows || []).length === 0 ? (
            <tr><td colSpan={columns.length} className="px-3 py-4 font-sans text-sm text-[var(--color-ink-muted)]">{empty}</td></tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={`border-b border-[var(--color-line)] last:border-0 align-top ${onRowClick ? 'cursor-pointer hover:bg-[var(--color-paper)]' : ''}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`px-3 py-2 font-sans text-[13px] text-[var(--color-ink)] ${c.className || ''}`}>
                    {c.render ? c.render(row) : row[c.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export function Pager({ data, onPage }) {
  const pages = useMemo(() => (data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1), [data])
  if (!data) return null
  return (
    <div className="flex items-center justify-between mt-3">
      <p className="font-mono text-[11px] text-[var(--color-ink-muted)] tabular-nums">
        {data.total} record{data.total === 1 ? '' : 's'} · page {data.page} of {pages}
      </p>
      <div className="flex gap-1.5">
        <button type="button" className={btn} disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>
          <ChevronLeft size={13} aria-hidden="true" /> Prev
        </button>
        <button type="button" className={btn} disabled={data.page >= pages} onClick={() => onPage(data.page + 1)}>
          Next <ChevronRight size={13} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

// Reason-gated action helper: prompts for the mandatory reason, POSTs, reloads.
export async function actWithReason(path, body, promptText) {
  const reason = window.prompt(promptText || 'Reason (recorded in the audit trail):')
  if (!reason) return null
  return adminFetch(path, { method: 'POST', body: { ...body, reason } })
}
