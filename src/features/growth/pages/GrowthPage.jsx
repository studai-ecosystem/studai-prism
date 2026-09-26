// /app/growth and /app/campus/:organizationId/growth (spec §17). Growth is
// shown only between formal assessments whose forms are APPROVED as
// comparable and only for capabilities with enough evidence in both; every
// other case says why no change is shown. Changes are level labels, never
// scores or percentages.
import { PageHeader } from '../../../components/ui/PageHeader.jsx'
import { Panel } from '../../../components/ui/Card.jsx'
import { LinkButton } from '../../../components/ui/Button.jsx'
import { EmptyState } from '../../../components/states/index.js'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { useGrowth } from '../../student/hooks.js'
import { queryStateView, formatDate, formatDateTime } from '../../student/QueryState.jsx'
import { GROWTH_REASON_COPY, GROWTH_COPY } from '../../../lib/copy/student.js'
import { GrowthDeltaCard } from '../components/GrowthDeltaCard.jsx'
import { GrowthTimeline } from '../components/GrowthTimeline.jsx'

function SessionLine({ label, s }) {
  return (
    <div>
      <dt className="text-prism-ink-muted">{label}</dt>
      <dd className="mt-1 font-medium text-prism-ink">
        {s.title || 'Assessment'} · {formatDate(s.completedAt) || 'Date not recorded'}
        {s.form && <span className="block text-xs font-normal text-prism-ink-subtle">Form version {s.form.version}</span>}
      </dd>
    </div>
  )
}

export default function GrowthPage() {
  const { active } = useWorkspace()
  const query = useGrowth()
  const header = <PageHeader title="Growth" description="Change between assessments, shown only when the assessments can be fairly compared." context={active} />
  const state = queryStateView(query, { label: 'Loading growth' })
  if (state) return <div>{header}{state}</div>
  const g = query.data
  const copy = GROWTH_REASON_COPY[g.reason] || GROWTH_REASON_COPY.NEEDS_COMPARABLE_REASSESSMENT
  const compared = g.changes.filter((c) => c.comparable)
  const notCompared = g.changes.filter((c) => !c.comparable)
  const assessmentsPath = active.type === 'CAMPUS_STUDENT' ? `/app/campus/${active.organizationId}/assignments` : '/app/assessments'
  const openReassessment = g.reassessments.find((r) => r.status === 'ACTIVE' && r.rosterStatus !== 'COMPLETED')
  return (
    <div className="space-y-6">
      {header}
      {openReassessment && (
        <Panel title="Reassessment open">
          <p className="text-sm text-prism-ink">{openReassessment.name} is open until {formatDateTime(openReassessment.windowEnd)}.</p>
          {openReassessment.comparability !== 'APPROVED' && <p className="mt-2 text-sm text-prism-ink-muted">{GROWTH_COPY.reassessmentNotComparable}</p>}
          <LinkButton className="mt-3" to={assessmentsPath}>Go to your assessments</LinkButton>
        </Panel>
      )}
      {!g.comparable && <EmptyState title={copy.title} description={copy.description} headingLevel={2} />}
      {g.comparison && (
        <section aria-labelledby="growth-comparison" className="space-y-3">
          <h2 id="growth-comparison" className="text-lg font-semibold text-prism-ink">What is compared</h2>
          <Panel>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <SessionLine label="Baseline" s={g.comparison.baseline} />
              <SessionLine label="Reassessment" s={g.comparison.reassessment} />
            </dl>
            <p className="mt-3 text-sm text-prism-ink-muted" data-testid="growth-comparability">{GROWTH_COPY.formApproved}</p>
          </Panel>
        </section>
      )}
      {compared.length > 0 && (
        <section aria-labelledby="growth-changes" className="space-y-3">
          <h2 id="growth-changes" className="text-lg font-semibold text-prism-ink">Capability changes</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {compared.map((c) => <li key={c.capabilityId}><GrowthDeltaCard change={c} /></li>)}
          </ul>
        </section>
      )}
      {g.comparison && notCompared.length > 0 && (
        <section aria-labelledby="growth-not-compared" className="space-y-2">
          <h2 id="growth-not-compared" className="text-base font-semibold text-prism-ink">Not compared</h2>
          <ul className="space-y-1 text-sm text-prism-ink-muted">
            {notCompared.map((c) => <li key={c.capabilityId}>{c.name || 'Capability'}: {GROWTH_COPY.notCompared[c.reason] || 'Not comparable'}</li>)}
          </ul>
        </section>
      )}
      <GrowthTimeline assessments={g.assessments} interventions={g.interventions} reassessments={g.reassessments} comparison={g.comparison} />
    </div>
  )
}
