// Common frame for work materials: they read as one family of fictional
// workplace tools. Presentation only - no scenario vocabulary, no hints, no
// derived figures; everything inside comes from the artifact's own data.
import { cx } from '../../lib/cx.js'

export function ArtifactShell({ title, kind, status, toolbar, children, className }) {
  return (
    <section aria-label={title} className={cx('overflow-hidden rounded-[var(--prism-radius-lg)] border border-prism-border', className)} data-artifact-shell>
      <header className="flex flex-wrap items-end justify-between gap-2 border-b border-prism-border bg-prism-subtle px-4 py-3">
        <div className="min-w-0">
          {kind && <p className="text-[11px] font-medium uppercase tracking-wide text-prism-ink-subtle">{kind}</p>}
          <h2 className="text-lg font-semibold text-prism-ink">{title}</h2>
        </div>
        {status && <div className="text-sm text-prism-ink-muted">{status}</div>}
      </header>
      {toolbar && <div className="flex flex-wrap items-center gap-2 border-b border-prism-border px-4 py-2">{toolbar}</div>}
      <div className="space-y-4 p-4 text-prism-ink">{children}</div>
    </section>
  )
}

// A pressed-state filter row. Filters only change what is shown on this page.
export function ArtifactFilterGroup({ label, options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={value === o.id
            ? 'min-h-6 rounded-[var(--prism-radius-md)] bg-prism-accent px-2.5 py-1 text-xs font-medium text-prism-accent-ink'
            : 'min-h-6 rounded-[var(--prism-radius-md)] bg-prism-subtle px-2.5 py-1 text-xs font-medium text-prism-ink'}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// Scrollable region is focusable so keyboard users can reach a wide table.
export function ArtifactTable({ caption, headerLabel = 'Name', columns, rows }) {
  return (
    <div tabIndex={0} role="region" aria-label={`${caption} table`} className="overflow-x-auto rounded-[var(--prism-radius-md)] border border-prism-border focus:outline focus:outline-2 focus:outline-[var(--prism-focus)]">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-prism-subtle text-xs text-prism-ink-muted">
          <tr>
            <th scope="col" className="p-2">{headerLabel}</th>
            {columns.map((c) => <th key={c.key} scope="col" className="p-2">{c.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-prism-border">
          {rows.map((r, i) => (
            <tr key={r.key ?? i}>
              <th scope="row" className="p-2 font-medium">{r.header}</th>
              {columns.map((c) => <td key={c.key} className={r.cells[c.key]?.numeric ? 'p-2 font-mono' : 'p-2'}>{r.cells[c.key]?.text}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// "Saved" is only ever shown after the server confirmed it.
export function ArtifactSaveStatus({ saved, failed, failedText }) {
  return (
    <span aria-live="polite" className="text-sm">
      {saved && <span className="text-prism-positive">Saved</span>}
      {failed && <span className="text-prism-blocked">{failedText}</span>}
    </span>
  )
}