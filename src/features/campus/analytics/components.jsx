// Accessible building blocks for campus analytics (spec §27.3; C10.05):
// every chart has a table equivalent (always in the accessibility tree, shown
// on request), sample sizes and insufficient evidence are always visible, and
// hidden segments carry the §27.2 sentence. No student appears anywhere.
import { Suspense, lazy, useState } from 'react'
import { Button } from '../../../components/ui/Button.jsx'
import { DataTable } from '../../../components/ui/DataTable.jsx'
import { Input, Select } from '../../../components/ui/FormControls.jsx'
import { ANALYTICS_COPY } from '../../../lib/copy/campus.js'

const Charts = lazy(() => import('./charts.jsx').then((m) => ({ default: m.DistributionBars })))
const Outcomes = lazy(() => import('./charts.jsx').then((m) => ({ default: m.OutcomeBars })))
export const BUCKETS = ['INSUFFICIENT', 'EARLY', 'DEVELOPING', 'DEMONSTRATED', 'STRONG']

export function SuppressedNote({ className }) {
  return <p className={className || 'text-sm text-prism-ink-muted'}>{ANALYTICS_COPY.suppressed}</p>
}

// A table that is always available to assistive technology and can be shown.
export function TableEquivalent({ caption, columns, rows, rowKey, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="space-y-2">
      <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? ANALYTICS_COPY.hideTable : ANALYTICS_COPY.showTable}</Button>
      <div className={open ? '' : 'sr-only'}>
        <DataTable caption={caption} columns={columns} rows={rows} rowKey={rowKey} />
      </div>
    </div>
  )
}

export function CapabilityDistributionChart({ view }) {
  const visible = view.capabilities.filter((c) => !c.suppressed)
  const hidden = view.capabilities.filter((c) => c.suppressed)
  return (
    <div className="space-y-3">
      {visible.length > 0 && (
        <Suspense fallback={<p className="text-sm text-prism-ink-muted">Loading chart…</p>}>
          <Charts rows={visible} bucketLabels={view.bucketLabels} buckets={BUCKETS} />
        </Suspense>
      )}
      <TableEquivalent
        caption="Students by capability level"
        rowKey={(r) => r.capabilityId}
        rows={view.capabilities}
        defaultOpen={visible.length === 0 || hidden.length > 0}
        columns={[
          { key: 'name', header: 'Capability', render: (r) => r.name || r.capabilityId },
          { key: 'n', header: 'Students assessed', render: (r) => (r.suppressed ? ANALYTICS_COPY.hidden : r.n) },
          ...BUCKETS.map((b) => ({ key: b, header: view.bucketLabels[b] || b, render: (r) => (r.suppressed ? '—' : r.buckets[b]) })),
        ]}
      />
      {hidden.length > 0 && <SuppressedNote />}
    </div>
  )
}

// Groups × capabilities, as a table. Cell text is "X of N need development";
// the shade is a visual aid only (the text carries the value).
export function CohortCapabilityHeatmap({ view }) {
  const shade = (needs, n) => {
    const r = n ? needs / n : 0
    return r >= 0.5 ? 'bg-prism-accent-strong text-prism-accent-ink' : r >= 0.25 ? 'bg-[var(--prism-chart-early)] text-prism-ink' : 'bg-prism-surface text-prism-ink'
  }
  const cell = (g, capId) => {
    if (g.suppressed) return <span>{ANALYTICS_COPY.hidden}</span>
    const c = g.capabilities.find((x) => x.capabilityId === capId)
    if (!c || c.suppressed) return <span>{ANALYTICS_COPY.hidden}</span>
    const needs = c.buckets.INSUFFICIENT + c.buckets.EARLY + c.buckets.DEVELOPING
    return <span className={`inline-block rounded px-2 py-0.5 ${shade(needs, c.n)}`}>{needs} of {c.n}</span>
  }
  const any = view.groups.some((g) => g.suppressed || g.capabilities?.some((c) => c.suppressed))
  return (
    <div className="space-y-2">
      <p className="text-xs text-prism-ink-subtle">{ANALYTICS_COPY.heatmapKey}</p>
      <DataTable
        caption={`Students needing further evidence or development, by ${view.groupBy}`}
        rowKey={(g) => g.groupId}
        rows={view.groups}
        columns={[
          { key: 'name', header: view.groupBy === 'department' ? 'Department' : 'Cohort', render: (g) => g.name || '—' },
          { key: 'n', header: 'Students assessed', render: (g) => (g.suppressed ? ANALYTICS_COPY.hidden : g.n) },
          ...view.capabilities.map((c) => ({ key: c.capabilityId, header: c.name || c.capabilityId, render: (g) => cell(g, c.capabilityId) })),
        ]}
      />
      {any && <SuppressedNote />}
    </div>
  )
}

export function InterventionOutcomeChart({ outcome }) {
  const visible = outcome.capabilities.filter((c) => !c.suppressed)
  return (
    <div className="space-y-2">
      <p className="text-sm text-prism-ink-muted">
        {outcome.counts.completedBoth} completed both · {outcome.counts.comparable} can be compared · {outcome.counts.formsNotApproved} on forms not yet approved as comparable
      </p>
      {visible.length > 0 && (
        <Suspense fallback={<p className="text-sm text-prism-ink-muted">Loading chart…</p>}>
          <Outcomes rows={visible} />
        </Suspense>
      )}
      {outcome.capabilities.length > 0 ? (
        <TableEquivalent
          caption={`Level changes: ${outcome.cycle.name}`}
          rowKey={(r) => r.capabilityId}
          rows={outcome.capabilities}
          defaultOpen={visible.length === 0}
          columns={[
            { key: 'name', header: 'Capability', render: (r) => r.name || r.capabilityId },
            { key: 'n', header: 'Students compared', render: (r) => (r.suppressed ? ANALYTICS_COPY.hidden : r.n) },
            { key: 'higher', header: 'Higher level', render: (r) => (r.suppressed ? '—' : r.higher) },
            { key: 'same', header: 'Same level', render: (r) => (r.suppressed ? '—' : r.same) },
            { key: 'lower', header: 'Lower level', render: (r) => (r.suppressed ? '—' : r.lower) },
          ]}
        />
      ) : <p className="text-sm text-prism-ink-muted">No capability change can be shown yet.</p>}
      {outcome.capabilities.some((c) => c.suppressed) && <SuppressedNote />}
      <p className="text-xs text-prism-ink-subtle">{outcome.method}</p>
    </div>
  )
}

export function CohortFilterBar({ value, onChange, cohorts = [], departments = [], programs = [] }) {
  const [draft, setDraft] = useState(value)
  const set = (k) => (e) => setDraft({ ...draft, [k]: e.target.value || undefined })
  return (
    <form
      className="grid grid-cols-1 gap-3 rounded-[var(--prism-radius-lg)] border border-prism-border p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6"
      aria-label="Filters"
      onSubmit={(e) => { e.preventDefault(); onChange(draft) }}
    >
      <Select label="Department" placeholder="All departments" value={draft.departmentId || ''} onChange={set('departmentId')} options={departments.map((d) => ({ value: d.id, label: d.name }))} />
      <Select label="Cohort" placeholder="All cohorts" value={draft.cohortId || ''} onChange={set('cohortId')} options={cohorts.map((c) => ({ value: c.id, label: c.name }))} />
      <Select label="Program" placeholder="All programs" value={draft.programId || ''} onChange={set('programId')} options={programs.map((p) => ({ value: p.id, label: p.name }))} />
      <Input label="Completed from" type="date" value={draft.from || ''} onChange={set('from')} />
      <Input label="Completed to" type="date" value={draft.to || ''} onChange={set('to')} />
      <div className="flex items-end gap-2">
        <Button type="submit" size="sm">Apply</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => { setDraft({}); onChange({}) }}>Reset</Button>
      </div>
    </form>
  )
}
