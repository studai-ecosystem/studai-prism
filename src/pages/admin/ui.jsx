// Shared building blocks for admin console pages (Control Centre Phase 2).
// Token-only styling (design ratchet). List pages compose: PageHeader +
// Toolbar + DataTable + Pager, driven by the useAdminList hook (server-side
// pagination + filters).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Loader2, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import { adminFetch } from '../../lib/adminApi.js'
import { TONES } from '../../components/ui/Badge.jsx'
import { Modal } from '../../components/ui/Modal.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Input, Textarea } from '../../components/ui/FormControls.jsx'

export const field =
  'rounded-[6px] border border-prism-border bg-prism-surface px-3 py-1.5 ' +
  'font-sans text-[13px] text-prism-ink outline-none focus:border-brand-green-ink'

export const btn =
  'inline-flex items-center gap-1.5 rounded-[6px] border border-prism-border px-3 py-1.5 ' +
  'font-sans text-[13px] text-prism-ink hover:border-brand-green-ink disabled:opacity-50'

export const btnDanger =
  'inline-flex items-center gap-1.5 rounded-[6px] border border-prism-blocked px-3 py-1.5 ' +
  'font-sans text-[13px] text-prism-blocked hover:opacity-80 disabled:opacity-50'

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
      <div>
        <h1 className="font-display text-xl text-prism-ink">{title}</h1>
        {subtitle && <p className="font-mono text-[11px] text-prism-ink-muted">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

export function ErrorNotice({ error }) {
  if (!error) return null
  return (
    <p role="alert" className="mb-4 rounded-[6px] border border-prism-blocked bg-prism-blocked-soft px-3 py-2 font-sans text-[13px] text-prism-blocked">
      {error}
    </p>
  )
}

export function Notice({ children }) {
  if (!children) return null
  return (
    <p className="mb-4 rounded-[6px] border border-prism-positive bg-prism-positive-soft px-3 py-2 font-sans text-[13px] text-prism-ink">
      {children}
    </p>
  )
}

// A status label always carries a text label and a shape marker, never colour alone.
const PILL = {
  ok: ['positive', '\u25CF'],
  info: ['accent', '\u25C6'],
  warn: ['partial', '\u25D0'],
  danger: ['blocked', '\u25A0'],
  muted: ['neutral', '\u00B7'],
}

export function Pill({ tone = 'muted', children }) {
  const [semantic, marker] = PILL[tone] || PILL.muted
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${TONES[semantic]}`}>
      <span aria-hidden="true">{marker}</span>
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
export function DataTable({ columns, rows, rowKey, empty = 'No records.', onRowClick, busy, caption }) {
  if (busy && !rows) {
    return (
      <div className="p-6 flex items-center gap-2 font-sans text-sm text-prism-ink-muted">
        <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Loading…
      </div>
    )
  }
  return (
    <div className="max-h-[70vh] overflow-auto rounded-[10px] border border-prism-border bg-prism-surface">
      <table className="w-full text-left">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-prism-border">
            {columns.map((c) => (
              <th key={c.key} scope="col" className="sticky top-0 bg-prism-subtle px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-prism-ink-muted whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(rows || []).length === 0 ? (
            <tr><td colSpan={columns.length} className="px-3 py-4 font-sans text-sm text-prism-ink-muted">{empty}</td></tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={`border-b border-prism-border last:border-0 align-top ${onRowClick ? 'cursor-pointer hover:bg-prism-subtle' : ''}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`px-3 py-1.5 font-sans text-[13px] text-prism-ink ${c.className || ''}`}>
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
      <p className="font-mono text-[11px] text-prism-ink-muted tabular-nums">
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

// In-app replacements for the browser prompt and confirm boxes: a labelled
// dialog with a focus trap, Esc to cancel and focus returned to the opener.
// They resolve like the originals: a string (or true) to continue, null (or
// false) to cancel, so audited actions keep their mandatory-reason flow.
function openDialog(render) {
  return new Promise((resolve) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const finish = (value) => { root.unmount(); host.remove(); resolve(value) }
    root.render(render(finish))
  })
}

const MULTILINE = /reason|note|decision|explanation|resolution|basis|purpose/i

function TextDialog({ question, initial, onDone }) {
  const [value, setValue] = useState(initial || '')
  const Control = MULTILINE.test(question) ? Textarea : Input
  return (
    <Modal
      open
      onClose={() => onDone(null)}
      title="Details needed"
      size="sm"
      footer={(
        <>
          <Button variant="secondary" onClick={() => onDone(null)}>Cancel</Button>
          <Button onClick={() => onDone(value)}>Continue</Button>
        </>
      )}
    >
      <form onSubmit={(e) => { e.preventDefault(); onDone(value) }}>
        <Control label={question} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
      </form>
    </Modal>
  )
}

function ConfirmBox({ question, onDone }) {
  const danger = /delete|erase|permanent|cannot be undone/i.test(question)
  return (
    <Modal
      open
      onClose={() => onDone(false)}
      title={danger ? 'Please confirm' : 'Confirm'}
      description={question}
      size="sm"
      footer={(
        <>
          <Button variant="secondary" onClick={() => onDone(false)}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={() => onDone(true)}>Confirm</Button>
        </>
      )}
    />
  )
}

export const askText = (question, initial = '') => openDialog((done) => <TextDialog question={question} initial={initial} onDone={done} />)
export const askConfirm = (question) => openDialog((done) => <ConfirmBox question={question} onDone={done} />)

// Reason-gated action helper: asks for the mandatory reason, POSTs, reloads.
export async function actWithReason(path, body, promptText) {
  const reason = await askText(promptText || 'Reason (recorded in the audit trail):')
  if (!reason) return null
  return adminFetch(path, { method: 'POST', body: { ...body, reason } })
}