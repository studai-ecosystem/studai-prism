// src/components/artifacts/AnalyticsDashboard.jsx — a metrics table rendered
// only from the artifact's data: summary figures are the data's top-level
// numbers, columns are the rows' own keys (C5.09). No sample figures, no
// hints, no scenario vocabulary in this component.
import { useState } from 'react'
import { ArtifactUnavailable } from './ArtifactUnavailable.jsx'
import { humanizeKey, formatValue } from './format.js'

export default function AnalyticsDashboard({ title, data }) {
  const rows = Array.isArray(data?.channels) ? data.channels.filter((r) => r && typeof r === 'object') : []
  const summary = data && typeof data === 'object'
    ? Object.entries(data).filter(([k, v]) => k !== 'channels' && (typeof v === 'number' || typeof v === 'string'))
    : []
  const [selected, setSelected] = useState('ALL')
  if (rows.length === 0 && summary.length === 0) return <ArtifactUnavailable title={title} />
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => k !== 'name')
  const shown = selected === 'ALL' ? rows : rows.filter((r) => r.name === selected)

  return (
    <div className="space-y-4 text-prism-ink">
      <h2 className="text-lg font-semibold">{title}</h2>
      {summary.length > 0 && (
        <dl className="grid gap-3 sm:grid-cols-2">
          {summary.map(([k, v]) => (
            <div key={k} className="rounded-[var(--prism-radius-md)] border border-prism-border bg-prism-surface p-3">
              <dt className="text-xs text-prism-ink-muted">{humanizeKey(k)}</dt>
              <dd className="text-xl font-semibold">{formatValue(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {rows.length > 0 && (
        <>
          {rows.every((r) => typeof r.name === 'string') && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter rows">
              {['ALL', ...rows.map((r) => r.name)].map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={selected === name}
                  onClick={() => setSelected(name)}
                  className={selected === name
                    ? 'min-h-6 rounded-[var(--prism-radius-md)] bg-prism-accent px-2.5 py-1 text-xs font-medium text-prism-accent-ink'
                    : 'min-h-6 rounded-[var(--prism-radius-md)] bg-prism-subtle px-2.5 py-1 text-xs font-medium text-prism-ink'}
                >
                  {name === 'ALL' ? 'All rows' : name}
                </button>
              ))}
            </div>
          )}
          {/* Focusable so keyboard users can scroll a wide table (WCAG 2.1.1). */}
          <div tabIndex={0} role="region" aria-label={`${title} table`} className="overflow-x-auto rounded-[var(--prism-radius-md)] border border-prism-border focus:outline focus:outline-2 focus:outline-[var(--prism-focus)]">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{title}</caption>
              <thead className="bg-prism-subtle text-xs text-prism-ink-muted">
                <tr>
                  <th scope="col" className="p-2">Name</th>
                  {columns.map((c) => <th key={c} scope="col" className="p-2">{humanizeKey(c)}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-prism-border">
                {shown.map((r, i) => (
                  <tr key={r.name || i}>
                    <th scope="row" className="p-2 font-medium">{r.name || ''}</th>
                    {columns.map((c) => <td key={c} className={typeof r[c] === 'number' ? 'p-2 font-mono' : 'p-2'}>{formatValue(r[c])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
