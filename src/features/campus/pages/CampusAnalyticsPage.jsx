// Campus analytics (spec §27; C10.05). Aggregate views of sponsored formal
// evidence within the caller's scope: capability distribution with top
// development needs, evidence sufficiency, cohort/department comparison,
// completion funnel, and intervention outcomes (comparable only). Every chart
// has a table equivalent; small groups are hidden; nothing ranks students.
import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Tabs } from '../../../components/ui/Tabs.jsx'
import { Panel } from '../../../components/ui/Card.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'
import { DataTable } from '../../../components/ui/DataTable.jsx'
import { EmptyState } from '../../../components/states/EmptyState.jsx'
import { useToast } from '../../../components/ui/Toast.jsx'
import { analyticsApi } from '../../../api/analytics.js'
import { ANALYTICS_COPY } from '../../../lib/copy/campus.js'
import { CampusPage, MutationError, downloadText } from '../components/CampusPage.jsx'
import { useCampusOrg, useCohorts, useStructure, usePrograms } from '../hooks.js'
import { CapabilityDistributionChart, CohortCapabilityHeatmap, InterventionOutcomeChart, CohortFilterBar, SuppressedNote, TableEquivalent } from '../analytics/components.jsx'
import { queryStateView } from '../../student/QueryState.jsx'

function ExportButton({ view, filters, groupBy }) {
  const { orgId, can } = useCampusOrg()
  const toast = useToast()
  const run = useMutation({
    mutationFn: () => analyticsApi.exportCsv(orgId, { view, ...(Object.keys(filters).length ? { filters } : {}), ...(groupBy ? { groupBy } : {}) }),
    onSuccess: (f) => { downloadText(f.fileName, f.csv, f.contentType); toast.show('Export downloaded. It contains aggregate counts only.', { tone: 'positive' }) },
  })
  if (!can('exports.cohort')) return null
  return (
    <div className="space-y-2">
      <Button variant="secondary" size="sm" loading={run.isPending} onClick={() => run.mutate()}>Export CSV</Button>
      <MutationError error={run.error} />
    </div>
  )
}

function Section({ query, children, loading }) {
  return queryStateView(query, { label: loading }) || children(query.data)
}

function CapabilitiesTab({ filters }) {
  const { orgId, key } = useCampusOrg()
  const query = useQuery({ queryKey: key('analytics', 'capabilities', filters), queryFn: () => analyticsApi.capabilities(orgId, filters) })
  return (
    <Section query={query} loading="Loading capability analytics">
      {(v) => (
        <div className="space-y-4">
          {!v.suppressed && <p className="text-sm text-prism-ink-muted">{v.assessed} assessed {v.assessed === 1 ? 'student' : 'students'}.{v.underReview ? ` ${ANALYTICS_COPY.underReview(v.underReview)}` : ''}</p>}
          {v.suppressed ? <SuppressedNote /> : v.capabilities.length === 0 ? <EmptyState title="Nothing to show yet" description={ANALYTICS_COPY.empty} headingLevel={3} /> : (
            <>
              <Panel title="Top development needs" headingLevel={3}>
                {v.topNeeds.length === 0 ? <p className="text-sm text-prism-ink-muted">No capability needs further development in this group.</p> : (
                  <ol className="list-decimal space-y-1 pl-5 text-sm text-prism-ink" data-testid="top-needs">
                    {v.topNeeds.map((n) => <li key={n.capabilityId}><span className="font-medium">{n.name}</span> — {ANALYTICS_COPY.needs(n.needs, n.of)}</li>)}
                  </ol>
                )}
                <p className="mt-2 text-xs text-prism-ink-subtle">{v.method}</p>
              </Panel>
              <Panel title="Capability distribution" headingLevel={3}>
                <CapabilityDistributionChart view={v} />
              </Panel>
            </>
          )}
          <ExportButton view="capabilities" filters={filters} />
        </div>
      )}
    </Section>
  )
}

function EvidenceTab({ filters }) {
  const { orgId, key } = useCampusOrg()
  const query = useQuery({ queryKey: key('analytics', 'sufficiency', filters), queryFn: () => analyticsApi.sufficiency(orgId, filters) })
  return (
    <Section query={query} loading="Loading evidence analytics">
      {(v) => (
        <div className="space-y-4">
          {v.suppressed ? <SuppressedNote /> : v.capabilities.length === 0 ? <EmptyState title="Nothing to show yet" description={ANALYTICS_COPY.empty} headingLevel={3} /> : (
            <DataTable
              caption="Evidence sufficiency by capability"
              rowKey={(r) => r.capabilityId}
              rows={v.capabilities}
              columns={[
                { key: 'name', header: 'Capability', render: (r) => r.name || r.capabilityId },
                { key: 'n', header: 'Students assessed', render: (r) => (r.suppressed ? ANALYTICS_COPY.hidden : r.n) },
                ...['SUFFICIENT', 'PROVISIONAL', 'INSUFFICIENT_EVIDENCE', 'HUMAN_REVIEW_REQUIRED'].map((s) => ({ key: s, header: ANALYTICS_COPY.statusLabels[s], render: (r) => (r.suppressed ? '—' : r.statuses[s]) })),
              ]}
            />
          )}
          {!v.suppressed && v.capabilities.some((c) => c.suppressed) && <SuppressedNote />}
          <ExportButton view="sufficiency" filters={filters} />
        </div>
      )}
    </Section>
  )
}

function ComparisonTab({ filters }) {
  const { orgId, key } = useCampusOrg()
  const [groupBy, setGroupBy] = useState('cohort')
  const query = useQuery({ queryKey: key('analytics', 'comparison', groupBy, filters), queryFn: () => analyticsApi.comparison(orgId, filters, groupBy) })
  return (
    <div className="space-y-4">
      <fieldset className="flex flex-wrap items-center gap-4">
        <legend className="sr-only">Compare by</legend>
        {['cohort', 'department'].map((g) => (
          <label key={g} className="flex items-center gap-2 text-sm text-prism-ink">
            <input type="radio" name="groupBy" value={g} checked={groupBy === g} onChange={() => setGroupBy(g)} />
            By {g}
          </label>
        ))}
      </fieldset>
      <Section query={query} loading="Loading comparison">
        {(v) => (v.groups.length === 0 ? <EmptyState title="Nothing to compare yet" description={ANALYTICS_COPY.empty} headingLevel={3} /> : <CohortCapabilityHeatmap view={v} />)}
      </Section>
      <ExportButton view="comparison" filters={filters} groupBy={groupBy} />
    </div>
  )
}

function CompletionTab({ filters }) {
  const { orgId, key } = useCampusOrg()
  const query = useQuery({ queryKey: key('analytics', 'completion', filters), queryFn: () => analyticsApi.completion(orgId, filters) })
  return (
    <Section query={query} loading="Loading completion">
      {(v) => (
        <div className="space-y-4">
          <p className="text-sm text-prism-ink-muted">Across {v.assignments} sponsored {v.assignments === 1 ? 'assessment' : 'assessments'}.</p>
          <TableEquivalent
            caption="Assessment completion funnel"
            defaultOpen
            rowKey={(r) => r.stage}
            rows={[
              { stage: 'Assigned', n: v.funnel.assigned },
              { stage: 'Acknowledged', n: v.funnel.acknowledged },
              { stage: 'Started', n: v.funnel.started },
              { stage: 'Completed', n: v.funnel.completed },
            ]}
            columns={[{ key: 'stage', header: 'Stage' }, { key: 'n', header: 'Students', render: (r) => `${r.n} of ${v.funnel.assigned}` }]}
          />
          <ExportButton view="completion" filters={filters} />
        </div>
      )}
    </Section>
  )
}

function InterventionsTab() {
  const { orgId, key } = useCampusOrg()
  const query = useQuery({ queryKey: key('analytics', 'interventions'), queryFn: () => analyticsApi.interventions(orgId) })
  return (
    <Section query={query} loading="Loading intervention outcomes">
      {(v) => (
        <div className="space-y-4">
          <p className="text-sm text-prism-ink-muted">{ANALYTICS_COPY.filtersNotApplied}</p>
          {v.interventions.length === 0 ? <p className="text-sm text-prism-ink-muted">No practice interventions yet.</p> : (
            <DataTable
              caption="Practice interventions"
              rowKey={(r) => r.interventionId}
              rows={v.interventions}
              columns={[
                { key: 'name', header: 'Intervention' },
                { key: 'capability', header: 'Target capability', render: (r) => r.targetCapability.name || r.targetCapability.id },
                { key: 'members', header: 'Students', render: (r) => (r.suppressed ? ANALYTICS_COPY.hidden : r.members) },
                { key: 'started', header: 'Started', render: (r) => (r.suppressed ? '—' : r.started) },
                { key: 'done', header: 'Finished all missions', render: (r) => (r.suppressed ? '—' : r.completedAll) },
              ]}
            />
          )}
          {v.interventions.some((i) => i.suppressed) && <SuppressedNote />}
          <h3 className="text-base font-semibold text-prism-ink">Baseline and reassessment</h3>
          {v.reassessments.length === 0 ? <p className="text-sm text-prism-ink-muted">No reassessment outcomes yet. Change is shown only between assessment forms approved as comparable.</p>
            : v.reassessments.map((o) => (
              <Panel key={o.cycle.id} title={o.cycle.name} headingLevel={4}>
                <InterventionOutcomeChart outcome={o} />
              </Panel>
            ))}
          <ExportButton view="missions" filters={{}} />
        </div>
      )}
    </Section>
  )
}

export default function CampusAnalyticsPage() {
  const [tab, setTab] = useState('capabilities')
  const [filters, setFilters] = useState({})
  const cohorts = useCohorts()
  const structure = useStructure()
  const programs = usePrograms()
  return (
    <CampusPage title="Analytics" description="Aggregate capability evidence for the cohorts you are responsible for.">
      <div className="space-y-4">
        <Callout title="How to read these views">{ANALYTICS_COPY.scopeNote} {ANALYTICS_COPY.provisionalNote} {ANALYTICS_COPY.noRanking}</Callout>
        <CohortFilterBar
          value={filters}
          onChange={setFilters}
          cohorts={cohorts.data || []}
          departments={structure.data?.departments || []}
          programs={programs.data || []}
        />
        <Tabs
          label="Analytics views"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'capabilities', label: 'Capabilities', content: <CapabilitiesTab filters={filters} /> },
            { id: 'evidence', label: 'Evidence', content: <EvidenceTab filters={filters} /> },
            { id: 'comparison', label: 'Comparison', content: <ComparisonTab filters={filters} /> },
            { id: 'completion', label: 'Completion', content: <CompletionTab filters={filters} /> },
            { id: 'interventions', label: 'Interventions', content: <InterventionsTab /> },
          ]}
        />
      </div>
    </CampusPage>
  )
}
