// /app/development and /app/campus/:organizationId/development (spec §16.1):
// current priorities from formal evidence (max three), practice missions when
// they exist, and practice evidence labelled as such.
import { PageHeader } from '../../../components/ui/PageHeader.jsx'
import { Card } from '../../../components/ui/Card.jsx'
import { CapabilityLevelBadge } from '../../../components/capability/CapabilityLevelBadge.jsx'
import { MissionCard } from '../../../components/missions/MissionCard.jsx'
import { EvidenceTracePanel } from '../../../components/evidence/EvidenceTracePanel.jsx'
import { EmptyState } from '../../../components/states/index.js'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { useDevelopmentPlan, useGrowth } from '../../student/hooks.js'
import { ReassessmentEntry } from '../../growth/components/ReassessmentEntry.jsx'
import { queryStateView, formatDate } from '../../student/QueryState.jsx'
import { DEVELOPMENT_COPY } from '../../../lib/copy/student.js'

export default function DevelopmentPage() {
  const { active } = useWorkspace()
  const query = useDevelopmentPlan()
  const growth = useGrowth()
  const header = <PageHeader title="Development" description="What to work on next, and how to practise it." context={active} />
  const state = queryStateView(query, { label: 'Loading your development plan' })
  if (state) return <div>{header}{state}</div>
  const plan = query.data
  const missionPath = (id) => (active.type === 'CAMPUS_STUDENT' ? `/app/campus/${active.organizationId}/development/missions/${id}` : `/app/development/missions/${id}`)
  return (
    <div className="space-y-6">
      {header}
      <section aria-labelledby="priorities-title" className="space-y-3">
        <h2 id="priorities-title" className="text-lg font-semibold text-prism-ink">Current priorities</h2>
        {plan.priorities.length === 0 ? (
          <EmptyState title={DEVELOPMENT_COPY.noPlan.title} description={DEVELOPMENT_COPY.noPlan.description} headingLevel={3} />
        ) : (
          <>
            <p className="text-sm text-prism-ink-muted">{DEVELOPMENT_COPY.focusIntro}</p>
            <ol className="space-y-3">
              {plan.priorities.map((p, i) => (
                <li key={p.capabilityId}>
                  <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="text-sm font-semibold text-prism-ink">{i + 1}. {p.name}</p>
                      {p.basedOn && (
                        <p className="text-xs text-prism-ink-subtle">From {p.basedOn.assessmentTitle || 'your assessment'}{formatDate(p.basedOn.completedAt) ? `, ${formatDate(p.basedOn.completedAt)}` : ''}</p>
                      )}
                    </div>
                    <CapabilityLevelBadge level={p.level} provisional={p.status === 'PROVISIONAL'} />
                  </Card>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
      <ReassessmentEntry reassessments={growth.data?.reassessments} assessmentsPath={active.type === 'CAMPUS_STUDENT' ? `/app/campus/${active.organizationId}/assignments` : '/app/assessments'} />
      <section aria-labelledby="missions-title" className="space-y-3">
        <h2 id="missions-title" className="text-lg font-semibold text-prism-ink">{DEVELOPMENT_COPY.missionsSoon.title}</h2>
        {!plan.missionsAvailable ? (
          <p className="text-sm text-prism-ink-muted">{active.type === 'CAMPUS_STUDENT' && plan.missionsEnabled ? DEVELOPMENT_COPY.missions.campusCatalogueEmpty : DEVELOPMENT_COPY.missionsSoon.description}</p>
        ) : (
          <>
            <p className="text-sm text-prism-ink-muted">{DEVELOPMENT_COPY.missions.practiceNote}</p>
            {active.type === 'CAMPUS_STUDENT' && <p className="text-sm text-prism-ink-muted">{DEVELOPMENT_COPY.missions.campusPrivacy(active.organizationName || 'Your institution')}</p>}
            <h3 className="text-base font-semibold text-prism-ink">{DEVELOPMENT_COPY.missions.recommendedTitle}</h3>
            {plan.missions.length === 0 ? (
              <p className="text-sm text-prism-ink-muted">{DEVELOPMENT_COPY.missions.noRecommended}</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {plan.missions.map((m) => <li key={m.id}><MissionCard mission={m} to={missionPath(m.id)} headingLevel={4} /></li>)}
              </ul>
            )}
            <h3 className="text-base font-semibold text-prism-ink">{DEVELOPMENT_COPY.missions.catalogueTitle}</h3>
            <ul className="grid gap-3 sm:grid-cols-2">
              {plan.catalogue.map((m) => <li key={m.id}><MissionCard mission={m} to={missionPath(m.id)} headingLevel={4} /></li>)}
            </ul>
          </>
        )}
      </section>
      {plan.completedMissions.length > 0 && (
        <section aria-labelledby="attempts-title" className="space-y-3">
          <h2 id="attempts-title" className="text-lg font-semibold text-prism-ink">{DEVELOPMENT_COPY.missions.completedTitle}</h2>
          <ul className="space-y-2">
            {plan.completedMissions.map((a) => (
              <li key={a.attemptId}>
                <Card className="p-4">
                  <p className="text-sm font-semibold text-prism-ink">{a.title || 'Practice mission'}</p>
                  <p className="text-sm text-prism-ink-muted">{a.summary || 'Feedback not available'}</p>
                  {formatDate(a.submittedAt) && <p className="text-xs text-prism-ink-subtle">{formatDate(a.submittedAt)}</p>}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
      {plan.practiceEvidence.length > 0 && (
        <section aria-labelledby="practice-title" className="space-y-3">
          <h2 id="practice-title" className="text-lg font-semibold text-prism-ink">Practice evidence</h2>
          <p className="text-sm text-prism-ink-muted">From practice missions. Practice never changes your formal results.</p>
          <ul className="space-y-2">
            {plan.practiceEvidence.map((p) => (
              <li key={p.id}><EvidenceTracePanel item={{ ...p, kind: 'PRACTICE' }} headingLevel={3} /></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
