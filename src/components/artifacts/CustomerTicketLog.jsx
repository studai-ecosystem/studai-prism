// src/components/artifacts/CustomerTicketLog.jsx — customer tickets rendered
// only from the artifact's data. Marks are a reading aid on this page; no
// automatic tags or hints are added to what the candidate sees.
import { useState } from 'react'
import { ArtifactUnavailable } from './ArtifactUnavailable.jsx'

const FILTERS = [
  { id: 'ALL', label: 'All' },
  { id: 'LOW', label: '1–2 stars' },
  { id: 'HIGH', label: '4–5 stars' },
]

export default function CustomerTicketLog({ title, data }) {
  const tickets = Array.isArray(data?.tickets) ? data.tickets : []
  const [filter, setFilter] = useState('ALL')
  const [marked, setMarked] = useState(() => new Set())
  if (tickets.length === 0) return <ArtifactUnavailable title={title} />

  const shown = tickets.filter((t) => filter === 'ALL' || (filter === 'LOW' ? t.rating <= 2 : t.rating >= 4))
  const toggle = (id) => setMarked((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  return (
    <div className="space-y-4 text-prism-ink">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-xs text-prism-ink-muted">Marked: {marked.size} (for your reference on this page)</p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by rating">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={filter === f.id
              ? 'rounded-[var(--prism-radius-md)] bg-prism-accent px-2.5 py-1 text-xs font-medium text-prism-accent-ink'
              : 'rounded-[var(--prism-radius-md)] bg-prism-subtle px-2.5 py-1 text-xs font-medium text-prism-ink'}
          >
            {f.label}
          </button>
        ))}
      </div>
      <ul className="space-y-3">
        {shown.map((t) => (
          <li key={t.id} className="rounded-[var(--prism-radius-md)] border border-prism-border bg-prism-surface p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-prism-ink-muted">
              <span><span className="font-mono">{t.id}</span>{t.customer ? ` · ${t.customer}` : ''}{t.rating != null ? ` · ${t.rating} of 5 stars` : ''}</span>
              <button
                type="button"
                aria-pressed={marked.has(t.id)}
                onClick={() => toggle(t.id)}
                className="rounded-[var(--prism-radius-sm)] border border-prism-border-strong px-2 py-0.5 text-xs font-medium text-prism-ink"
              >
                {marked.has(t.id) ? 'Marked' : 'Mark'}
              </button>
            </div>
            <p className="mt-2 text-sm">&ldquo;{t.comment}&rdquo;</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
