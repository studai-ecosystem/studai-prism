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
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../../../components/ui/Button.jsx'
import { InlineNotice } from '../../../components/ui/Notice.jsx'
import { usePracticeStarters } from '../hooks.js'

const ORIGIN_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/

// Catalogue grouped by capability family (P6.1), in the order the server
// listed them; cards with no capability name fall into a final group.
function groupByFamily(missions, fallback) {
  const groups = new Map()
  for (const m of missions) {
    const key = m.targetCapabilityId || 'other'
    if (!groups.has(key)) groups.set(key, { id: key, name: m.targetCapabilityName || fallback, missions: [] })
    groups.get(key).missions.push(m)
  }
  return [...groups.values()]
}

export default function DevelopmentPage() {
  const { active } = useWorkspace()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const query = useDevelopmentPlan()
  const growth = useGrowth()
  const starters = usePracticeStarters()
  const copy = DEVELOPMENT_COPY.missions
  const header = <PageHeader title="Development" description="What to work on next, and how to practise it." context={active} />
  const state = queryStateView(query, { label: 'Loading your development plan' })
  if (state) return <div>{header}{state}</div>
  const plan = query.data
  // A moment carried from a report is passed to the mission as its origin (ids only).
  const origin = params.get('source') ? `?source=${encodeURIComponent(params.get('source'))}${params.get('moment') ? `&moment=${encodeURIComponent(params.get('moment'))}` : ''}` : ''
  const devPath = active.type === 'CAMPUS_STUDENT' ? `/app/campus/${active.organizationId}/development` : '/app/development'
  const missionPath = (id) => `${devPath}/missions/${id}${origin}`
  const sourceId = params.get('source') || ''
  const momentId = params.get('moment') || ''
  const canReplay = plan.missionsAvailable && ORIGIN_ID.test(sourceId) && ORIGIN_ID.test(momentId)
  const allowance = plan.allowance || { kind: 'UNLIMITED' }
  const exhausted = allowance.kind === 'BOUNDED' && allowance.remaining <= 0
  const hasDraft = plan.catalogue.some((m) => m.status === 'DRAFT')
  const groups = groupByFamily(plan.catalogue, copy.ungrouped)
  const openStarted = ({ attempt, missionId }) => navigate(`${devPath}/missions/${missionId}?attempt=${encodeURIComponent(attempt.id)}`)
  const replay = () => starters.replay.mutate({ sessionId: sourceId, opportunityId: momentId }, { onSuccess: openStarted })
  const challenge = (capabilityId) => starters.challenge.mutate({ capabilityId }, { onSuccess: openStarted })
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
            {allowance.kind === 'BOUNDED' && (
              <p className="text-sm font-medium text-prism-ink" data-testid="practice-allowance" role="status">
                {exhausted ? copy.allowanceNone : copy.allowanceRemaining(allowance.remaining, allowance.total)}
              </p>
            )}
            {canReplay && (
              <Card className="space-y-2 p-4" data-testid="replay-moment">
                <h3 className="text-base font-semibold text-prism-ink">{copy.replayTitle}</h3>
                <p className="text-sm text-prism-ink-muted">{copy.replayHelp}</p>
                {starters.replay.error && <div role="alert"><InlineNotice tone="blocked">{starters.replay.error.message}</InlineNotice></div>}
                <Button onClick={replay} loading={starters.replay.isPending} disabled={exhausted}>{copy.replayAction}</Button>
              </Card>
            )}
            <h3 className="text-base font-semibold text-prism-ink">{DEVELOPMENT_COPY.missions.recommendedTitle}</h3>
            {plan.missions.length === 0 ? (
              <p className="text-sm text-prism-ink-muted">{DEVELOPMENT_COPY.missions.noRecommended}</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {plan.missions.map((m) => <li key={m.id}><MissionCard mission={m} to={missionPath(m.id)} headingLevel={4} /></li>)}
              </ul>
            )}
            <h3 className="text-base font-semibold text-prism-ink">{DEVELOPMENT_COPY.missions.catalogueTitle}</h3>
            {hasDraft && <p className="text-sm text-prism-ink-muted" data-testid="draft-note">{copy.draftNote}</p>}
            {starters.challenge.error && <div role="alert"><InlineNotice tone="blocked">{starters.challenge.error.message}</InlineNotice></div>}
            {groups.map((g) => (
              <section key={g.id} aria-labelledby={`family-${g.id}`} className="space-y-3" data-testid="family-group">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 id={`family-${g.id}`} className="text-sm font-semibold text-prism-ink">{g.name}</h4>
                  {g.id !== 'other' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => challenge(g.id)}
                      loading={starters.challenge.isPending && starters.challenge.variables?.capabilityId === g.id}
                      disabled={exhausted}
                      title={copy.freshChallengeHelp}
                    >
                      {copy.freshChallengeAction(g.name)}
                    </Button>
                  )}
                </div>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {g.missions.map((m) => <li key={m.id}><MissionCard mission={m} to={missionPath(m.id)} headingLevel={5} /></li>)}
                </ul>
              </section>
            ))}
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
