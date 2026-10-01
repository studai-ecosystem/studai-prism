// Customer tickets rendered only from the artifact's data. Marks are a
// reading aid on this page; no automatic tags or hints are added to what the
// candidate sees.
import { useState } from 'react'
import { ArtifactUnavailable } from './ArtifactUnavailable.jsx'
import { ArtifactShell, ArtifactFilterGroup } from './ArtifactShell.jsx'

const FILTERS = [
  { id: 'ALL', label: 'All' },
  { id: 'LOW', label: '1\u20132 stars' },
  { id: 'HIGH', label: '4\u20135 stars' },
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
    <ArtifactShell
      title={title}
      kind="Ticket log"
      status={<span className="text-xs">Marked: {marked.size} (for your reference on this page)</span>}
      toolbar={<ArtifactFilterGroup label="Filter by rating" options={FILTERS} value={filter} onChange={setFilter} />}
    >
      <ul className="space-y-3">
        {shown.map((t) => (
          <li key={t.id} className="rounded-[var(--prism-radius-md)] border border-prism-border bg-prism-surface p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-prism-ink-muted">
              <span><span className="font-mono">{t.id}</span>{t.customer ? ` \u00b7 ${t.customer}` : ''}{t.rating != null ? ` \u00b7 ${t.rating} of 5 stars` : ''}</span>
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
    </ArtifactShell>
  )
}