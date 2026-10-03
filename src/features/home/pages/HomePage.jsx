// /app/home and /app/campus/:organizationId/home (spec §9, P3.3): what should
// I do now? One dominant action by server priority, recent activity from the
// history projection, capability snapshot, up to three focus areas, and the
// privacy context of the active workspace.
import { PageHeader } from '../../../components/ui/PageHeader.jsx'
import { DocumentTitle } from '../../../components/ui/DocumentTitle.jsx'
import { CapabilitySnapshotCard } from '../../../components/capability/CapabilitySnapshotCard.jsx'
import { CapabilityLevelBadge } from '../../../components/capability/CapabilityLevelBadge.jsx'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { Link } from 'react-router-dom'
import { useStudentHome, useStudentHistory, useDevelopmentPlan, useGrowth } from '../../student/hooks.js'
import { assignmentsListPath } from '../../assessments/pages/BriefingPage.jsx'
import { queryStateView } from '../../student/QueryState.jsx'
import { PERSONAL_PRIVACY_NOTE, SPONSORED_PRIVACY_NOTE } from '../../../lib/copy/privacy.js'
import { NextActionCard } from '../components/NextActionCard.jsx'
import { IntentChooser } from '../components/IntentChooser.jsx'
import { NewLearnerStart } from '../components/IntentStep.jsx'
import { RecentActivityList } from '../components/RecentActivityList.jsx'

function greeting(name) {
  const hour = new Date().getHours()
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const first = name ? String(name).trim().split(/\s+/)[0] : null
  return first ? `${part}, ${first}` : part
}

export default function HomePage() {
  const { active } = useWorkspace()
  const home = useStudentHome()
  const history = useStudentHistory()
  const plan = useDevelopmentPlan()
  const growth = useGrowth()
  const campus = active.type === 'CAMPUS_STUDENT'
  const state = queryStateView(home, { label: 'Loading your home' })
  if (state) {
    return (
      <div>
        <PageHeader title="Home" context={active} />
        {state}
      </div>
    )
  }
  const data = home.data
  const org = data.workspace.organizationName || active.organizationName || active.name
  // Strengths are only capabilities with a governed demonstrated level; a
  // provisional one stays labelled provisional.
  const strengths = data.capabilitySnapshot.filter((c) => c.level && (c.level.band === 'DEMONSTRATED' || c.level.band === 'STRONG')).slice(0, 3)
  const mission = !campus && plan.data && plan.data.missionsAvailable && data.primaryAction.kind !== 'PRACTICE_AVAILABLE' ? plan.data.missions[0] : null
  const comparable = Boolean(growth.data && growth.data.comparable)
  const historyTo = `${assignmentsListPath(active)}?tab=history`
  // A new learner: the server offers "get started" and the workspace owns no
  // record at all. Only then is the intention chooser the primary action.
  const historyEmpty = Boolean(history.data) && history.data.pages.every((p) => p.items.length === 0)
  const newLearner = data.primaryAction.kind === 'GET_STARTED' && historyEmpty
  return (
    <div className="space-y-8">
      <PageHeader
        title={greeting(data.user.name)}
        description={campus ? SPONSORED_PRIVACY_NOTE(org) : PERSONAL_PRIVACY_NOTE}
        context={active}
      />
      <DocumentTitle title="Home" />
      {newLearner
        ? (campus
          ? <IntentChooser assessmentTo={data.primaryAction.to} practiceTo="/app/development" />
          : <NewLearnerStart assessmentTo={data.primaryAction.to} practiceTo="/app/development" />)
        : <NextActionCard action={data.primaryAction} sponsorName={campus ? org : null} historyTo={historyTo} />}

      <RecentActivityList historyTo={historyTo} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="strengths-title" className="space-y-3">
          <h2 id="strengths-title" className="text-lg font-semibold text-prism-ink">Strengths so far</h2>
          {strengths.length === 0 ? (
            <p className="text-sm text-prism-ink-muted">Nothing is shown as demonstrated yet. Strengths appear when an assessment gives enough evidence.</p>
          ) : (
            <ul className="space-y-2" data-testid="home-strengths">
              {strengths.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-[var(--prism-radius-md)] border border-prism-border bg-prism-surface p-3">
                  <span className="text-sm font-semibold text-prism-ink">{c.name}</span>
                  <CapabilityLevelBadge level={c.level} provisional={c.status === 'PROVISIONAL'} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="next-title" className="space-y-3">
          <h2 id="next-title" className="text-lg font-semibold text-prism-ink">Where to focus next</h2>
          {data.focus.length === 0 ? (
            <p className="text-sm text-prism-ink-muted">Your focus areas appear after an assessment with enough evidence - up to three at a time.</p>
          ) : (
            <ol className="space-y-2">
              {data.focus.map((f, i) => (
                <li key={f.capabilityId} className="flex flex-wrap items-center gap-3 rounded-[var(--prism-radius-md)] border border-prism-border bg-prism-surface p-3">
                  <span className="text-sm font-semibold text-prism-ink">{i + 1}. Develop {f.name}</span>
                  <CapabilityLevelBadge level={f.level} provisional={f.status === 'PROVISIONAL'} />
                </li>
              ))}
            </ol>
          )}
          {mission && (
            <p className="text-sm text-prism-ink-muted" data-testid="home-mission">
              Recommended practice: <Link to="/app/development" className="font-medium text-prism-accent-strong underline">{mission.title}</Link>
              {' '}(about {mission.estimatedMinutes} minutes). Practice never changes your formal results.
            </p>
          )}
        </section>
      </div>

      <section aria-labelledby="snapshot-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="snapshot-title" className="text-lg font-semibold text-prism-ink">Capability snapshot</h2>
          <p className="text-xs text-prism-ink-subtle">
            {data.assessedCount === 0 ? 'No completed assessments yet.' : `From ${data.assessedCount} completed ${data.assessedCount === 1 ? 'assessment' : 'assessments'}. Level names are provisional.`}
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.capabilitySnapshot.map((cap) => (
            <li key={cap.id}><CapabilitySnapshotCard cap={cap} detailsTo={campus ? null : `/app/capabilities/${encodeURIComponent(cap.id)}`} /></li>
          ))}
        </ul>
      </section>

      {!campus && (<section aria-labelledby="more-title" className="space-y-3">
        <h2 id="more-title" className="text-lg font-semibold text-prism-ink">Your evidence and growth</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          <li className="rounded-[var(--prism-radius-md)] border border-prism-border bg-prism-surface p-4 text-sm text-prism-ink-muted">
            <Link to="/app/evidence" className="font-medium text-prism-accent-strong underline">See the evidence</Link>
            {' '}behind each capability, with formal and practice evidence labelled separately.
          </li>
          <li className="rounded-[var(--prism-radius-md)] border border-prism-border bg-prism-surface p-4 text-sm text-prism-ink-muted">
            <Link to="/app/growth" className="font-medium text-prism-accent-strong underline">{comparable ? 'See your growth' : 'Growth'}</Link>
            {' '}{comparable ? 'between comparable assessments.' : 'is shown only between assessments approved as comparable.'}
          </li>
        </ul>
      </section>)}
    </div>
  )
}
