// Campus Overview (spec §20): participation across the institution, within
// the caller's scope, plus (with analytics) a capability overview and the top
// development needs by a documented rule. No average score, no ranking.
import { useQuery } from '@tanstack/react-query'
import { StatCard, Panel } from '../../../components/ui/Card.jsx'
import { LinkButton } from '../../../components/ui/Button.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'
import { EmptyState } from '../../../components/states/EmptyState.jsx'
import { EMPTY_COPY } from '../../../lib/copy/emptyStates.js'
import { ANALYTICS_COPY } from '../../../lib/copy/campus.js'
import { useFlag } from '../../../app/providers/FeatureFlagProvider.jsx'
import { analyticsApi } from '../../../api/analytics.js'
import { CampusPage } from '../components/CampusPage.jsx'
import { CapabilityDistributionChart, SuppressedNote } from '../analytics/components.jsx'
import { useCampusOrg, useOverview, useOnboarding } from '../hooks.js'

function CapabilityOverview({ canCreate = false }) {
  const { orgId, key } = useCampusOrg()
  const query = useQuery({ queryKey: key('analytics', 'capabilities', {}), queryFn: () => analyticsApi.capabilities(orgId, {}) })
  if (query.isPending) return <p className="text-sm text-prism-ink-muted">Loading capability overview…</p>
  if (query.isError) return <p className="text-sm text-prism-ink-muted">The capability overview could not be loaded.</p>
  const v = query.data
  const top = !v.suppressed && v.topNeeds[0]
  return (
    <div className="space-y-4">
      {top && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--prism-radius-lg)] border border-prism-accent-soft bg-prism-subtle p-4" data-testid="campus-insight">
          <p className="text-sm font-medium text-prism-ink">{top.name} is the largest development opportunity among assessed students.</p>
          {canCreate && <LinkButton to={`/campus/${orgId}/development?capability=${encodeURIComponent(top.capabilityId)}`} variant="primary" size="sm">Create development intervention</LinkButton>}
        </div>
      )}
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel title="Capability overview" headingLevel={3} description={v.suppressed ? ANALYTICS_COPY.provisionalNote : `${v.assessed} assessed ${v.assessed === 1 ? 'student' : 'students'}. ${ANALYTICS_COPY.provisionalNote}`}>
        {v.suppressed ? <SuppressedNote /> : v.capabilities.length === 0 ? <p className="text-sm text-prism-ink-muted">{ANALYTICS_COPY.empty}</p> : <CapabilityDistributionChart view={v} />}
      </Panel>
      <Panel title="Top development needs" headingLevel={3}>
        {v.suppressed ? <SuppressedNote /> : v.topNeeds.length === 0 ? <p className="text-sm text-prism-ink-muted">No development needs identified from the evidence available.</p> : (
          <ol className="list-decimal space-y-1 pl-5 text-sm text-prism-ink">{v.topNeeds.map((n) => <li key={n.capabilityId}><span className="font-medium">{n.name}</span> — {ANALYTICS_COPY.needs(n.needs, n.of)}</li>)}</ol>
        )}
        <p className="mt-2 text-xs text-prism-ink-subtle">{v.method}</p>
      </Panel>
    </div>
    </div>
  )
}

export default function CampusOverviewPage() {
  const { orgId, can } = useCampusOrg()
  const query = useOverview()
  const onboarding = useOnboarding({ enabled: can('org.manage') })
  const d = query.data
  const { enabled: analyticsOn } = useFlag('PRISM_CAMPUS_ANALYTICS')
  const setupOpen = can('org.manage') && onboarding.data && !onboarding.data.completedSteps.includes('launch')
  const scoped = d && d.scope !== 'ALL' && d.scope !== 'LIMITED'
  return (
    <CampusPage title="Overview" description="Participation across your institution." query={query}>
      {d && (
        <div className="space-y-6">
          {setupOpen && (
            <Callout
              title="Finish setting up"
              action={<LinkButton to={`/campus/${orgId}/setup`} variant="primary" size="sm">Continue setup</LinkButton>}
            >
              {onboarding.data.completedSteps.length} of {onboarding.data.steps.length} setup steps done. You can stop at any point and come back later.
            </Callout>
          )}
          {scoped && <p className="text-sm text-prism-ink-muted">Counts cover the cohorts you are responsible for.</p>}
          <section aria-labelledby="participation-heading">
            <h2 id="participation-heading" className="mb-3 text-base font-semibold text-prism-ink">Participation</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Students enrolled" value={d.enrolled} provenance="Accepted an invitation" />
              <StatCard label="Invitations waiting" value={d.invited} provenance="Sent, not yet accepted" />
              <StatCard label="Active cohorts" value={d.cohorts} />
              <StatCard label="Active programs" value={d.activePrograms} />
              <StatCard label="Open assessments" value={d.activeAssignments} provenance="Open or scheduled windows" />
              <StatCard
                label="Assessments completed"
                value={d.completion.assigned ? `${d.completion.completed} of ${d.completion.assigned}` : null}
                emptyLabel="Nothing assigned yet"
                provenance="Across all sponsored assessments"
              />
              <StatCard label="Development missions active" value={d.missionsActive ?? null} emptyLabel="Not available yet" provenance="Active practice interventions across the organization" />
              <StatCard label="Reassessments due" value={d.reassessmentsDue ?? null} emptyLabel="Not available yet" provenance="Scheduled or open windows across the organization" />
            </div>
          </section>
          {analyticsOn && can('analytics.read') && (
            <section aria-labelledby="capability-heading" className="space-y-3">
              <h2 id="capability-heading" className="text-base font-semibold text-prism-ink">Capabilities</h2>
              <CapabilityOverview canCreate={can('interventions.write') && d.missionsActive !== null} />
            </section>
          )}
          {d.enrolled === 0 && d.invited === 0 ? (
            <EmptyState
              title={EMPTY_COPY.campusCohort.title}
              description={EMPTY_COPY.campusCohort.description}
              action={can('students.manage') ? <LinkButton to={`/campus/${orgId}/cohorts/import`} variant="primary">Import students</LinkButton> : null}
            />
          ) : (
            <Panel title="Next steps">
              <ul className="flex flex-wrap gap-2">
                {can('programs.write') && <li><LinkButton to={`/campus/${orgId}/programs`} size="sm">Create assessment program</LinkButton></li>}
                {can('students.manage') && <li><LinkButton to={`/campus/${orgId}/cohorts/import`} size="sm">Import students</LinkButton></li>}
                {can('assignments.write') && <li><LinkButton to={`/campus/${orgId}/assessments/assign`} size="sm">Assign an assessment</LinkButton></li>}
                {can('interventions.write') && d.missionsActive !== null && <li><LinkButton to={`/campus/${orgId}/development`} size="sm">Assign a development plan</LinkButton></li>}
                {can('reassessments.write') && d.reassessmentsDue !== null && <li><LinkButton to={`/campus/${orgId}/reassessments`} size="sm">Schedule a reassessment</LinkButton></li>}
                {analyticsOn && can('reports.read') && <li><LinkButton to={`/campus/${orgId}/reports`} size="sm">Export cohort report</LinkButton></li>}
                {can('students.read') && <li><LinkButton to={`/campus/${orgId}/students`} size="sm">View students</LinkButton></li>}
              </ul>
            </Panel>
          )}
          <p className="text-xs text-prism-ink-subtle">
            Institution views only include sponsored activity. Students' personal Prism activity is never shown here unless they share it.
          </p>
        </div>
      )}
    </CampusPage>
  )
}
