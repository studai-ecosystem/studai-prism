// src/components/artifacts/AnalyticsDashboard.jsx — channel performance table
// rendered only from the artifact's data. No sample figures, no hints.
import { useState } from 'react'
import { ArtifactUnavailable } from './ArtifactUnavailable.jsx'

const fmt = (v) => (typeof v === 'number' ? v.toLocaleString('en-IN') : v ?? '')

export default function AnalyticsDashboard({ title, data }) {
  const channels = Array.isArray(data?.channels) ? data.channels : []
  const [selected, setSelected] = useState('ALL')
  if (channels.length === 0 && data?.blendedCac == null && data?.blendedRoas == null) return <ArtifactUnavailable title={title} />
  const shown = selected === 'ALL' ? channels : channels.filter((c) => c.name === selected)

  return (
    <div className="space-y-4 text-prism-ink">
      <h2 className="text-lg font-semibold">{title}</h2>
      {(data.blendedCac != null || data.blendedRoas != null) && (
        <dl className="grid gap-3 sm:grid-cols-2">
          {data.blendedCac != null && (
            <div className="rounded-[var(--prism-radius-md)] border border-prism-border bg-prism-surface p-3">
              <dt className="text-xs text-prism-ink-muted">Blended customer acquisition cost</dt>
              <dd className="text-xl font-semibold">{fmt(data.blendedCac)}</dd>
            </div>
          )}
          {data.blendedRoas != null && (
            <div className="rounded-[var(--prism-radius-md)] border border-prism-border bg-prism-surface p-3">
              <dt className="text-xs text-prism-ink-muted">Blended return on ad spend</dt>
              <dd className="text-xl font-semibold">{fmt(data.blendedRoas)}x</dd>
            </div>
          )}
        </dl>
      )}
      {channels.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter channels">
            {['ALL', ...channels.map((c) => c.name)].map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={selected === name}
                onClick={() => setSelected(name)}
                className={selected === name
                  ? 'rounded-[var(--prism-radius-md)] bg-prism-accent px-2.5 py-1 text-xs font-medium text-prism-accent-ink'
                  : 'rounded-[var(--prism-radius-md)] bg-prism-subtle px-2.5 py-1 text-xs font-medium text-prism-ink'}
              >
                {name === 'ALL' ? 'All channels' : name}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto rounded-[var(--prism-radius-md)] border border-prism-border">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{title}</caption>
              <thead className="bg-prism-subtle text-xs text-prism-ink-muted">
                <tr>
                  <th scope="col" className="p-2">Channel</th>
                  <th scope="col" className="p-2">Spend</th>
                  <th scope="col" className="p-2">CAC</th>
                  <th scope="col" className="p-2">ROAS</th>
                  <th scope="col" className="p-2">CTR</th>
                  <th scope="col" className="p-2">CVR</th>
                  <th scope="col" className="p-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-prism-border">
                {shown.map((c) => (
                  <tr key={c.name}>
                    <th scope="row" className="p-2 font-medium">{c.name}</th>
                    <td className="p-2 font-mono">{fmt(c.spend)}</td>
                    <td className="p-2 font-mono">{fmt(c.cac)}</td>
                    <td className="p-2 font-mono">{c.roas != null ? `${c.roas}x` : ''}</td>
                    <td className="p-2 font-mono">{c.ctr != null ? `${c.ctr}%` : ''}</td>
                    <td className="p-2 font-mono">{c.cvr != null ? `${c.cvr}%` : ''}</td>
                    <td className="p-2">{c.status || ''}</td>
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
