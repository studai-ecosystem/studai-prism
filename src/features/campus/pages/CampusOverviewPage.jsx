// Campus Overview (spec §20): participation across the institution, within
// the caller's scope. Counts only — no capability detail, no ranking.
import { StatCard, Panel } from '../../../components/ui/Card.jsx'
import { LinkButton } from '../../../components/ui/Button.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'
import { EmptyState } from '../../../components/states/EmptyState.jsx'
import { EMPTY_COPY } from '../../../lib/copy/emptyStates.js'
import { CampusPage } from '../components/CampusPage.jsx'
import { useCampusOrg, useOverview, useOnboarding } from '../hooks.js'

export default function CampusOverviewPage() {
  const { orgId, can } = useCampusOrg()
  const query = useOverview()
  const onboarding = useOnboarding({ enabled: can('org.manage') })
  const d = query.data
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
              <StatCard label="Development and reassessment" value={null} emptyLabel="Not available yet" provenance="Arrives with development missions" />
            </div>
          </section>
          {d.enrolled === 0 && d.invited === 0 ? (
            <EmptyState
              title={EMPTY_COPY.campusCohort.title}
              description={EMPTY_COPY.campusCohort.description}
              action={can('students.manage') ? <LinkButton to={`/campus/${orgId}/cohorts/import`} variant="primary">Import students</LinkButton> : null}
            />
          ) : (
            <Panel title="Next steps">
              <ul className="flex flex-wrap gap-2">
                {can('students.manage') && <li><LinkButton to={`/campus/${orgId}/cohorts/import`} size="sm">Import students</LinkButton></li>}
                {can('assignments.write') && <li><LinkButton to={`/campus/${orgId}/assessments/assign`} size="sm">Assign an assessment</LinkButton></li>}
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
