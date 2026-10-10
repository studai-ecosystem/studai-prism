// Group summaries (PROD-READY Phase 9): the campus analytics service's
// suppressed aggregates — capability distributions, participation and
// practice. Groups below the minimum size are hidden whole. The only export
// is a CSV of these group summaries; there is no export of people.
import { useState } from 'react'
import { DataTable } from '../../../components/ui/DataTable.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { Select } from '../../../components/ui/FormControls.jsx'
import { Panel, StatCard } from '../../../components/ui/Card.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'
import { useToast } from '../../../components/ui/Toast.jsx'
import { EMPLOYER_PAGE_COPY } from '../../../lib/copy/employerPages.js'
import { MutationError, downloadText } from '../../campus/components/CampusPage.jsx'
import { EmployerPage } from '../components/EmployerPage.jsx'
import { useEmployerOrg, useEmployerInsights, useExportInsights } from '../hooks.js'

const BUCKETS = ['INSUFFICIENT', 'EARLY', 'DEVELOPING', 'DEMONSTRATED', 'STRONG']

function ExportPanel() {
  const I = EMPLOYER_PAGE_COPY.insights
  const run = useExportInsights()
  const toast = useToast()
  const [view, setView] = useState('capabilities')
  const submit = (e) => {
    e.preventDefault()
    run.mutate(view, { onSuccess: (out) => { downloadText(out.fileName, out.csv, out.contentType); toast.show(I.exported, { tone: 'positive' }) } })
  }
  return (
    <Panel title={I.exportTitle} description={run.data?.note || 'Exports contain group summaries only. Individual results cannot be exported.'}>
      <form className="flex flex-wrap items-end gap-3" onSubmit={submit} aria-label={I.exportTitle}>
        <Select label={I.exportView} value={view} onChange={(e) => setView(e.target.value)} options={[{ value: 'capabilities', label: I.exportCapabilities }, { value: 'completion', label: I.exportCompletion }, { value: 'missions', label: I.exportMissions }]} />
        <Button type="submit" variant="secondary" loading={run.isPending}>{I.export}</Button>
      </form>
      <MutationError error={run.error} />
    </Panel>
  )
}

export default function EmployerInsightsPage() {
  const I = EMPLOYER_PAGE_COPY.insights
  const { can } = useEmployerOrg()
  const query = useEmployerInsights()
  const d = query.data
  const labels = d?.capabilities.bucketLabels || {}
  return (
    <EmployerPage title={I.title} description={I.description} query={query}>
      {d && (
        <div className="space-y-6">
          <p className="text-sm text-prism-ink-muted">{d.note}</p>
          <Panel title={I.capabilities} description={d.capabilities.method}>
            {d.capabilities.suppressed ? <Callout tone="info" title={I.hidden} /> : (
              <DataTable
                caption={I.capabilities}
                rows={d.capabilities.items}
                rowKey={(c) => c.capabilityId}
                columns={[
                  { key: 'name', header: 'Capability', render: (c) => c.name || c.capabilityId },
                  ...BUCKETS.map((b) => ({ key: b, header: labels[b] || b, align: 'right', render: (c) => (c.suppressed ? 'Hidden' : c.buckets?.[b] ?? '—') })),
                ]}
              />
            )}
            {!d.capabilities.suppressed && d.capabilities.developmentFocus.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-prism-ink">{I.focus}</h3>
                <ul className="mt-1 list-disc pl-5 text-sm text-prism-ink">
                  {d.capabilities.developmentFocus.map((f) => <li key={f.capabilityId}>{f.name}: {f.needs} of {f.of}</li>)}
                </ul>
              </div>
            )}
          </Panel>
          <Panel title={I.completion}>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label={I.assigned} value={d.completion.funnel.assigned} />
              <StatCard label={I.started} value={d.completion.funnel.started} />
              <StatCard label={I.completed} value={d.completion.funnel.completed} />
            </div>
          </Panel>
          <Panel title={I.practice}>
            {d.missions.interventions.length === 0 ? <p className="text-sm text-prism-ink-muted">{EMPLOYER_PAGE_COPY.development.none}</p> : (
              <ul className="space-y-1 text-sm text-prism-ink">
                {d.missions.interventions.map((i) => (
                  <li key={i.interventionId}>{i.name}: {i.suppressed ? I.hidden : `${i.started} of ${i.members} started, ${i.completedAll} finished every mission`}</li>
                ))}
              </ul>
            )}
          </Panel>
          {can('exports.cohort') && <ExportPanel />}
        </div>
      )}
    </EmployerPage>
  )
}
