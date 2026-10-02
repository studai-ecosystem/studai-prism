// /app/home and /app/campus/:organizationId/home (spec §9): what should I do
// now? Primary action by server priority, capability snapshot, up to three
// focus areas, and the privacy context of the active workspace.
import { PageHeader } from '../../../components/ui/PageHeader.jsx'
import { DocumentTitle } from '../../../components/ui/DocumentTitle.jsx'
import { Card } from '../../../components/ui/Card.jsx'
import { LinkButton } from '../../../components/ui/Button.jsx'
import { Badge } from '../../../components/ui/Badge.jsx'
import { CapabilitySnapshotCard } from '../../../components/capability/CapabilitySnapshotCard.jsx'
import { CapabilityLevelBadge } from '../../../components/capability/CapabilityLevelBadge.jsx'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { Link } from 'react-router-dom'
import { useStudentHome, useStudentAssessments, useDevelopmentPlan, useGrowth } from '../../student/hooks.js'
import { AssessmentAssignmentCard } from '../../assessments/components/AssessmentAssignmentCard.jsx'
import { assignmentsListPath } from '../../assessments/pages/BriefingPage.jsx'
import { queryStateView, formatDate } from '../../student/QueryState.jsx'
import { PRIMARY_ACTION_COPY, SCOPE_LABEL } from '../../../lib/copy/student.js'
import { PERSONAL_PRIVACY_NOTE, SPONSORED_PRIVACY_NOTE } from '../../../lib/copy/privacy.js'

function greeting(name) {
  const hour = new Date().getHours()
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const first = name ? String(name).trim().split(/\s+/)[0] : null
  return first ? `${part}, ${first}` : part
}

function PrimaryAction({ action, sponsorName }) {
  const copy = PRIMARY_ACTION_COPY[action.kind]
  const assessment = Boolean(action.assignmentId)
  const due = formatDate(action.dueAt)
  return (
    <Card className="space-y-3 border-prism-accent-soft p-6" aria-labelledby="primary-action">
      <p className="text-xs font-semibold uppercase tracking-wide text-prism-accent-strong">{copy.eyebrow}</p>
      <h2 id="primary-action" className="text-xl font-semibold text-prism-ink">{assessment ? action.title : copy.title}</h2>
      {assessment && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-prism-ink-muted">
          <Badge tone={action.scope === 'SPONSORED' ? 'accent' : 'neutral'}>{action.scope === 'SPONSORED' ? SCOPE_LABEL.SPONSORED(sponsorName) : SCOPE_LABEL.PERSONAL}</Badge>
          {due && <span>Due {due}</span>}
        </div>
      )}
      {!assessment && copy.description && <p className="max-w-2xl text-sm text-prism-ink-muted">{copy.description}</p>}
      {action.to && copy.cta && <LinkButton to={action.to} variant="primary">{copy.cta}</LinkButton>}
    </Card>
  )
}

export default function HomePage() {
  const { active } = useWorkspace()
  const home = useStudentHome()
  const assessments = useStudentAssessments()
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
  const mission = !campus && plan.data && plan.data.missionsAvailable ? plan.data.missions[0] : null
  const comparable = Boolean(growth.data && growth.data.comparable)
  const historyState = queryStateView(assessments, { label: 'Loading recent assessments', homeTo: assignmentsListPath(active) })
  const recent = assessments.data?.completed
    .filter((a) => a.status === 'COMPLETED')
    .slice()
    .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))
    .slice(0, 3)
  return (
    <div className="space-y-8">
      <PageHeader
        title={greeting(data.user.name)}
        description={campus ? SPONSORED_PRIVACY_NOTE(org) : PERSONAL_PRIVACY_NOTE}
        context={active}
      />
      <DocumentTitle title="Home" />
      <PrimaryAction action={data.primaryAction} sponsorName={campus ? org : null} />

      <section aria-labelledby="recent-assessments-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="recent-assessments-title" className="text-lg font-semibold text-prism-ink">Recent assessments</h2>
          <LinkButton to={assignmentsListPath(active)} variant="secondary" size="sm">View all assessments</LinkButton>
        </div>
        {historyState || (recent.length > 0 ? (
          <ul className="grid gap-4 lg:grid-cols-3">
            {recent.map((a) => <li key={a.id}><AssessmentAssignmentCard assignment={a} /></li>)}
          </ul>
        ) : (
          <p className="text-sm text-prism-ink-muted">No completed assessments are linked to this workspace yet. If you have an earlier report that is missing, <Link to="/contact" className="font-medium text-prism-accent-strong underline">contact support</Link>.</p>
        ))}
      </section>

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
