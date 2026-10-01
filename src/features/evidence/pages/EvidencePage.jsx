// /app/evidence (spec §15): the trace from scenario to evidence status, with
// filters for capability, assessment, date and formal/practice. Practice
// evidence is visually distinct and never mixed into formal results.
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../../../components/ui/PageHeader.jsx'
import { Select, Input } from '../../../components/ui/FormControls.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { EmptyState } from '../../../components/states/index.js'
import { EvidenceTracePanel } from '../../../components/evidence/EvidenceTracePanel.jsx'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { useStudentEvidence } from '../../student/hooks.js'
import { queryStateView, formatDate } from '../../student/QueryState.jsx'
import { EMPTY_COPY } from '../../../lib/copy/emptyStates.js'

const FILTER_KEYS = ['capability', 'assessment', 'kind', 'from', 'to']
// Only well-formed filter values reach the server; anything else in the URL
// is ignored rather than turned into an error page.
const VALID = {
  capability: (v) => /^[A-Za-z0-9][A-Za-z0-9:._-]{0,79}$/.test(v),
  assessment: (v) => /^[A-Za-z0-9][A-Za-z0-9:._-]{0,79}$/.test(v),
  kind: (v) => v === 'FORMAL' || v === 'PRACTICE',
  from: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
  to: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
}

export default function EvidencePage() {
  const { active } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k)]).filter(([k, v]) => v && VALID[k](v)))
  const query = useStudentEvidence(filters)

  const set = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const header = (
    <PageHeader
      title="Evidence"
      description="Every conclusion Prism draws is traced to something you did. Showing personal evidence only — sponsored evidence stays in your institution workspace."
      context={active}
    />
  )
  const state = queryStateView(query, { label: 'Loading evidence' })
  if (state) return <div>{header}{state}</div>
  const { items, total, facets } = query.data
  const filtered = Object.keys(filters).length > 0

  return (
    <div className="space-y-6">
      {header}
      {total > 0 && (
        <div className="space-y-2">
          {/* Small screens: filters behind a toggle so evidence starts on the first screen. */}
          <Button variant="secondary" size="sm" className="md:hidden" aria-expanded={filtersOpen} aria-controls="evidence-filters" onClick={() => setFiltersOpen((v) => !v)}>
            {filtersOpen ? 'Hide filters' : `Filters${filtered ? ` (${Object.keys(filters).length})` : ''}`}
          </Button>
        <form id="evidence-filters" className={`${filtersOpen ? 'grid' : 'hidden'} gap-3 rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-surface p-4 sm:grid-cols-2 md:grid lg:grid-cols-5`} aria-label="Filter evidence" onSubmit={(e) => e.preventDefault()}>
          <Select id="f-capability" label="Capability" value={filters.capability || ''} onChange={(e) => set('capability', e.target.value)} placeholder="All capabilities" options={facets.capabilities.map((c) => ({ value: c.id, label: c.name || c.id }))} />
          <Select id="f-assessment" label="Assessment" value={filters.assessment || ''} onChange={(e) => set('assessment', e.target.value)} placeholder="All assessments" options={facets.assessments.map((a) => ({ value: a.sessionId, label: `${a.title || 'Assessment'}${formatDate(a.completedAt) ? ` · ${formatDate(a.completedAt)}` : ''}` }))} />
          <Select id="f-kind" label="Type" value={filters.kind || ''} onChange={(e) => set('kind', e.target.value)} placeholder="Formal and practice" options={[{ value: 'FORMAL', label: 'Formal assessment' }, { value: 'PRACTICE', label: 'Practice' }]} />
          <Input id="f-from" type="date" label="From" value={filters.from || ''} onChange={(e) => set('from', e.target.value)} />
          <Input id="f-to" type="date" label="To" value={filters.to || ''} onChange={(e) => set('to', e.target.value)} />
        </form>
        </div>
      )}
      {total === 0 ? (
        <EmptyState title={EMPTY_COPY.evidence.title} description={EMPTY_COPY.evidence.description} headingLevel={2} />
      ) : items.length === 0 ? (
        <EmptyState
          title="No evidence matches these filters"
          description="Try removing a filter."
          action={filtered ? <Button variant="secondary" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Clear filters</Button> : null}
          headingLevel={2}
        />
      ) : (
        <>
          <p className="text-sm text-prism-ink-muted" role="status">{items.length} of {total} evidence items</p>
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id}>
                <EvidenceTracePanel item={item} headingLevel={2} dateLabel={formatDate(item.date) ? `Recorded ${formatDate(item.date)}` : null} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
