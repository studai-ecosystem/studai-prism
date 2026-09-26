// Campus reports (spec §28; C10.06). Executive (everything in the caller's
// scope), department and cohort reports: participation, capability
// distributions, major gaps, intervention activity, reassessment status and
// recommended next actions. Aggregate only — no personal Prism data, no names,
// no ranking. Generating a report is recorded in the activity log.
import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Panel } from '../../../components/ui/Card.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { Select } from '../../../components/ui/FormControls.jsx'
import { DataTable } from '../../../components/ui/DataTable.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'
import { useToast } from '../../../components/ui/Toast.jsx'
import { analyticsApi } from '../../../api/analytics.js'
import { ANALYTICS_COPY, REASSESSMENT_COPY } from '../../../lib/copy/campus.js'
import { formatDateTime } from '../../student/QueryState.jsx'
import { CampusPage, MutationError } from '../components/CampusPage.jsx'
import { useCampusOrg, useCohorts, useStructure } from '../hooks.js'
import { CapabilityDistributionChart, SuppressedNote } from '../analytics/components.jsx'

const KIND_TITLE = { EXECUTIVE: 'Executive cohort report', DEPARTMENT: 'Department report', COHORT: 'Cohort report' }
const BUCKETS = ['INSUFFICIENT', 'EARLY', 'DEVELOPING', 'DEMONSTRATED', 'STRONG']

// Plain-text PDF built in the browser from the same aggregate JSON.
async function downloadPdf(report, scopeName) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  let y = 48
  const line = (text, size = 10, gap = 14) => {
    for (const part of doc.splitTextToSize(String(text), 500)) {
      if (y > 790) { doc.addPage(); y = 48 }
      doc.setFontSize(size)
      doc.text(part, 48, y)
      y += gap
    }
  }
  line(`${KIND_TITLE[report.kind]}${scopeName ? ` — ${scopeName}` : ''}`, 16, 22)
  line(`Generated ${formatDateTime(report.generatedAt)}`)
  line(report.privacy)
  y += 8
  const f = report.participation.funnel
  line('Participation', 13, 18)
  line(`Assigned ${f.assigned} · Acknowledged ${f.acknowledged} · Started ${f.started} · Completed ${f.completed}`)
  y += 8
  line('Capability distribution (students)', 13, 18)
  if (report.capabilities.suppressed) line(ANALYTICS_COPY.suppressed)
  for (const c of report.capabilities.items) {
    line(c.suppressed ? `${c.name}: ${ANALYTICS_COPY.hidden}` : `${c.name} (n=${c.n}): ${BUCKETS.map((b) => `${report.capabilities.bucketLabels[b]} ${c.buckets[b]}`).join(', ')}`)
  }
  if (!report.capabilities.suppressed && report.capabilities.items.some((c) => c.suppressed)) line(ANALYTICS_COPY.suppressed)
  y += 8
  line('Major gaps', 13, 18)
  if (!report.majorGaps.length) line('None identified from the evidence available.')
  for (const g of report.majorGaps) line(`${g.name}: ${ANALYTICS_COPY.needs(g.needs, g.of)}`)
  y += 8
  line('Intervention activity', 13, 18)
  if (!report.interventions.length) line('No practice interventions yet.')
  for (const i of report.interventions) line(i.suppressed ? `${i.name}: ${ANALYTICS_COPY.hidden}` : `${i.name}: ${i.members} students, ${i.completedAll} finished all missions`)
  if (report.interventions.some((i) => i.suppressed)) line(ANALYTICS_COPY.suppressed)
  y += 8
  line('Reassessment status', 13, 18)
  if (!report.reassessments.length) line('No reassessments scheduled.')
  for (const c of report.reassessments) line(`${c.name}: ${formatDateTime(c.windowStart)} – ${formatDateTime(c.windowEnd)} · ${REASSESSMENT_COPY.comparability[c.comparability]?.short || c.comparability}`)
  y += 8
  line('Recommended next actions', 13, 18)
  for (const a of report.recommendedActions) line(`- ${a.text}`)
  y += 8
  line(report.method, 8, 11)
  doc.save(`prism-${report.kind.toLowerCase()}-report.pdf`)
}

export default function CampusReportsPage() {
  const { orgId } = useCampusOrg()
  const toast = useToast()
  const cohorts = useCohorts()
  const structure = useStructure()
  const [kind, setKind] = useState('EXECUTIVE')
  const [target, setTarget] = useState('')
  const [error, setError] = useState(null)
  const run = useMutation({ mutationFn: (body) => analyticsApi.report(orgId, body) })
  const options = kind === 'DEPARTMENT' ? (structure.data?.departments || []).map((d) => ({ value: d.id, label: d.name })) : (cohorts.data || []).map((c) => ({ value: c.id, label: c.name }))
  const scopeName = kind === 'EXECUTIVE' ? null : options.find((o) => o.value === target)?.label || null
  const generate = (e) => {
    e.preventDefault()
    if (kind !== 'EXECUTIVE' && !target) { setError(kind === 'DEPARTMENT' ? 'Choose a department.' : 'Choose a cohort.'); document.getElementById('report-target')?.focus(); return }
    setError(null)
    run.mutate(kind === 'EXECUTIVE' ? {} : kind === 'DEPARTMENT' ? { departmentId: target } : { cohortId: target })
  }
  const r = run.data
  // Move focus to the new report once it is on the page (a frame scheduled
  // from onSuccess can run before React has rendered it).
  useEffect(() => { if (r) document.getElementById('report-title')?.focus() }, [r])
  return (
    <CampusPage title="Reports" description="Aggregate reports for leadership and departments. No personal data and no ranking.">
      <div className="space-y-6">
        <form className="space-y-4 rounded-[var(--prism-radius-lg)] border border-prism-border p-4" onSubmit={generate} noValidate aria-label="Generate a report">
          <fieldset className="flex flex-wrap gap-4">
            <legend className="mb-2 text-sm font-medium text-prism-ink">Report type</legend>
            {Object.entries(KIND_TITLE).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-prism-ink">
                <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => { setKind(k); setTarget(''); setError(null) }} />
                {label}
              </label>
            ))}
          </fieldset>
          {kind !== 'EXECUTIVE' && (
            <Select id="report-target" label={kind === 'DEPARTMENT' ? 'Department' : 'Cohort'} required placeholder={kind === 'DEPARTMENT' ? 'Choose a department' : 'Choose a cohort'} value={target} onChange={(e) => setTarget(e.target.value)} options={options} error={error} />
          )}
          <Button type="submit" loading={run.isPending}>Generate report</Button>
          <MutationError error={run.error} />
        </form>

        {r && (
          <article aria-labelledby="report-title" className="space-y-4" data-testid="campus-report">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="report-title" tabIndex={-1} className="text-lg font-semibold text-prism-ink">{KIND_TITLE[r.kind]}{scopeName ? ` — ${scopeName}` : ''}</h2>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => downloadPdf(r, scopeName).catch(() => toast.show('The PDF could not be created. Try again, or print this page instead.', { tone: 'blocked' }))}>Download PDF</Button>
              </div>
            </div>
            <p className="text-sm text-prism-ink-muted">Generated {formatDateTime(r.generatedAt)}. {r.privacy}</p>
            <Panel title="Participation" headingLevel={3}>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                {[['Assigned', r.participation.funnel.assigned], ['Acknowledged', r.participation.funnel.acknowledged], ['Started', r.participation.funnel.started], ['Completed', r.participation.funnel.completed]].map(([k, v]) => (
                  <div key={k}><dt className="text-prism-ink-muted">{k}</dt><dd className="mt-1 font-medium">{v}</dd></div>
                ))}
              </dl>
            </Panel>
            <Panel title="Capability distributions" headingLevel={3}>
              {r.capabilities.suppressed ? <SuppressedNote /> : <CapabilityDistributionChart view={{ capabilities: r.capabilities.items, bucketLabels: r.capabilities.bucketLabels }} />}
            </Panel>
            <Panel title="Major gaps" headingLevel={3}>
              {r.majorGaps.length === 0 ? <p className="text-sm text-prism-ink-muted">None identified from the evidence available.</p> : (
                <ol className="list-decimal space-y-1 pl-5 text-sm">{r.majorGaps.map((g) => <li key={g.capabilityId}><span className="font-medium">{g.name}</span> — {ANALYTICS_COPY.needs(g.needs, g.of)}</li>)}</ol>
              )}
              <p className="mt-2 text-xs text-prism-ink-subtle">{r.method}</p>
            </Panel>
            <Panel title="Intervention activity" headingLevel={3}>
              {r.interventions.length === 0 ? <p className="text-sm text-prism-ink-muted">No practice interventions yet.</p> : (
                <DataTable
                  caption="Intervention activity"
                  rowKey={(i) => i.interventionId}
                  rows={r.interventions}
                  columns={[
                    { key: 'name', header: 'Intervention' },
                    { key: 'members', header: 'Students', render: (i) => (i.suppressed ? ANALYTICS_COPY.hidden : i.members) },
                    { key: 'done', header: 'Finished all missions', render: (i) => (i.suppressed ? '—' : i.completedAll) },
                  ]}
                />
              )}
              {r.interventions.some((i) => i.suppressed) && <SuppressedNote />}
            </Panel>
            <Panel title="Reassessment status" headingLevel={3}>
              {r.reassessments.length === 0 ? <p className="text-sm text-prism-ink-muted">No reassessments scheduled.</p> : (
                <ul className="space-y-1 text-sm">{r.reassessments.map((c) => <li key={c.id}>{c.name}: {formatDateTime(c.windowStart)} – {formatDateTime(c.windowEnd)} · {REASSESSMENT_COPY.comparability[c.comparability]?.short || c.comparability}</li>)}</ul>
              )}
            </Panel>
            <Panel title="Recommended next actions" headingLevel={3}>
              {r.recommendedActions.length === 0 ? <p className="text-sm text-prism-ink-muted">Nothing needs action right now.</p> : (
                <ul className="list-disc space-y-1 pl-5 text-sm">{r.recommendedActions.map((a, i) => <li key={`${a.kind}-${i}`}>{a.text}</li>)}</ul>
              )}
            </Panel>
          </article>
        )}
        {!r && <Callout title="About these reports">{ANALYTICS_COPY.scopeNote} {ANALYTICS_COPY.noRanking}</Callout>}
      </div>
    </CampusPage>
  )
}
