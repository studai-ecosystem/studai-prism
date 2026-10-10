// Accessible building blocks for campus analytics (spec §27.3; C10.05):
// every chart has a table equivalent (always in the accessibility tree, shown
// on request), sample sizes and insufficient evidence are always visible, and
// hidden segments carry the §27.2 sentence. No student appears anywhere.
import { Suspense, lazy, useId, useState } from 'react'
import { Lock, CreditCard } from 'lucide-react'
import { Button } from '../../../components/ui/Button.jsx'
import { Skeleton } from '../../../components/ui/Skeleton.jsx'
import { StateBlock } from '../../../components/states/StateBlock.jsx'
import { ErrorState } from '../../../components/states/ErrorState.jsx'
import { DataTable } from '../../../components/ui/DataTable.jsx'
import { Input, Select } from '../../../components/ui/FormControls.jsx'
import { ChartFrame } from '../../../components/charts/ChartFrame.jsx'
import { ANALYTICS_COPY } from '../../../lib/copy/campus.js'

const Charts = lazy(() => import('./charts.jsx').then((m) => ({ default: m.DistributionBars })))
const Outcomes = lazy(() => import('./charts.jsx').then((m) => ({ default: m.OutcomeBars })))
export const BUCKETS = ['INSUFFICIENT', 'EARLY', 'DEVELOPING', 'DEMONSTRATED', 'STRONG']

// One analytics view (tab panel): its own h2 under the page h1, so the
// headings inside a view (h3, h4) never skip a level.
export function AnalyticsTabPanel({ id, title, children }) {
  return (
    <section aria-labelledby={`analytics-view-${id}`} className="space-y-4" data-testid={`analytics-view-${id}`}>
      <h2 id={`analytics-view-${id}`} className="text-lg font-semibold text-prism-ink">{title}</h2>
      {children}
    </section>
  )
}

// View-level states. A view the caller cannot open, or one the plan does not
// include, says so inside its own tab: the rest of the analytics page (other
// views, filters) stays usable, so there is no "go home" link here.
export const ANALYTICS_VIEW_STATES = Object.freeze({
  forbidden: {
    title: 'You don’t have access to this view',
    description: 'Your role in this organization does not include this analytics view. The other views on this page may still be available. An organization owner can change your role.',
  },
  planRequired: {
    title: 'This view is not included in your organization’s plan',
    description: 'This analytics view needs an active campus plan or sponsorship. The other views on this page are not affected. An organization owner can check the plan on the Billing page.',
  },
  failed: {
    title: 'This view could not load',
    description: 'The other views on this page still work. Try this one again in a moment.',
  },
  unavailable: {
    title: 'This view is temporarily unavailable',
    description: 'Please try again in a few minutes. The other views on this page are not affected.',
  },
  offline: {
    title: 'You appear to be offline',
    description: 'This view will load when your connection is back.',
  },
})

export function analyticsViewState(query, { label = 'Loading' } = {}) {
  const S = ANALYTICS_VIEW_STATES
  const retry = () => query.refetch()
  if (query.isPending && query.fetchStatus === 'paused') return <ErrorState headingLevel={3} {...S.offline} onRetry={retry} />
  if (query.isPending) return <Skeleton label={label} lines={6} />
  const err = query.error
  if (!err) return null
  if (err.code === 'FORBIDDEN' || err.code === 'NOT_FOUND' || err.status === 403 || err.status === 404) {
    return <div data-testid="analytics-view-state" data-state="forbidden"><StateBlock icon={Lock} headingLevel={3} {...S.forbidden} /></div>
  }
  if (err.code === 'ENTITLEMENT_REQUIRED' || err.code === 'ENTITLEMENT_EXPIRED' || err.status === 402) {
    return <div data-testid="analytics-view-state" data-state="plan"><StateBlock icon={CreditCard} tone="partial" headingLevel={3} {...S.planRequired} /></div>
  }
  if (err.code === 'NETWORK_ERROR') return <ErrorState headingLevel={3} {...S.offline} onRetry={retry} />
  const copy = err.code === 'CAMPUS_STORE_UNAVAILABLE' ? S.unavailable : S.failed
  return <div data-testid="analytics-view-state" data-state="error"><ErrorState headingLevel={3} {...copy} requestId={err.requestId} onRetry={retry} /></div>
}

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
    <ChartFrame
      description="Each bar is a capability; its segments count the students at each level. Axes start at zero and show numbers of students, never percentages."
      n={typeof view.assessed === 'number' ? view.assessed : undefined}
      status={visible.length > 0 ? 'ready' : hidden.length > 0 ? 'insufficient' : 'empty'}
      emptyText={ANALYTICS_COPY.empty}
      table={(
        <div className="space-y-3">
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
      )}
    >
      <Suspense fallback={<p className="text-sm text-prism-ink-muted">Loading chart…</p>}>
          <Charts rows={visible} bucketLabels={view.bucketLabels} buckets={BUCKETS} />
        </Suspense>
    </ChartFrame>
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

// Below lg the filters sit behind a disclosure so the data is on the first
// screen; from lg up they are always shown (the toggle is hidden there).
export function CohortFilterBar({ value, onChange, cohorts = [], departments = [], programs = [] }) {
  const [draft, setDraft] = useState(value)
  const [open, setOpen] = useState(false)
  const formId = useId()
  const set = (k) => (e) => setDraft({ ...draft, [k]: e.target.value || undefined })
  const applied = Object.values(value || {}).filter(Boolean).length
  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        size="sm"
        className="lg:hidden"
        aria-expanded={open}
        aria-controls={formId}
        onClick={() => setOpen((v) => !v)}
        data-testid="filters-toggle"
      >
        Filters{applied > 0 ? ` (${applied} applied)` : ''}
      </Button>
      <form
        id={formId}
        className={`${open ? 'grid' : 'hidden'} grid-cols-1 gap-3 rounded-[var(--prism-radius-lg)] border border-prism-border p-4 sm:grid-cols-2 lg:grid lg:grid-cols-3 2xl:grid-cols-6`}
        aria-label="Filters"
        data-open={open ? 'true' : 'false'}
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
    </div>
  )
}
