// A metrics table rendered only from the artifact's data: summary figures are
// the data's top-level numbers, columns are the rows' own keys (C5.09). No
// sample figures, no hints, no scenario vocabulary in this component.
import { useState } from 'react'
import { ArtifactUnavailable } from './ArtifactUnavailable.jsx'
import { ArtifactShell, ArtifactFilterGroup, ArtifactTable } from './ArtifactShell.jsx'
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
  const filterable = rows.length > 0 && rows.every((r) => typeof r.name === 'string')

  return (
    <ArtifactShell
      title={title}
      kind="Dashboard"
      toolbar={filterable ? (
        <ArtifactFilterGroup
          label="Filter rows"
          value={selected}
          onChange={setSelected}
          options={['ALL', ...rows.map((r) => r.name)].map((name) => ({ id: name, label: name === 'ALL' ? 'All rows' : name }))}
        />
      ) : null}
    >
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
        <ArtifactTable
          caption={title}
          columns={columns.map((c) => ({ key: c, label: humanizeKey(c) }))}
          rows={shown.map((r, i) => ({
            key: r.name || i,
            header: r.name || '',
            cells: Object.fromEntries(columns.map((c) => [c, { text: formatValue(r[c]), numeric: typeof r[c] === 'number' }])),
          }))}
        />
      )}
    </ArtifactShell>
  )
}