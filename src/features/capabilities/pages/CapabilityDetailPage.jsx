// /app/capabilities/:capabilityId (spec 13): one capability in full -
// definition, evidence-backed level, sufficiency, what was observed, where the
// evidence came from, growth direction, development actions and reassessment.
// Every statement is a governed API fact or an honest "not yet" state.
import { Link, useParams } from 'react-router-dom'
import { PageHeader } from '../../../components/ui/PageHeader.jsx'
import { Card } from '../../../components/ui/Card.jsx'
import { Badge } from '../../../components/ui/Badge.jsx'
import { LinkButton } from '../../../components/ui/Button.jsx'
import { EvidenceSufficiencyBadge } from '../../../components/evidence/EvidenceSufficiencyBadge.jsx'
import { CapabilityLevelBadge } from '../../../components/capability/CapabilityLevelBadge.jsx'
import { ObservedBehaviorCard } from '../../../components/evidence/ObservedBehaviorCard.jsx'
import { EmptyState } from '../../../components/states/index.js'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { useStudentCapabilities, useDevelopmentPlan, useGrowth } from '../../student/hooks.js'
import { queryStateView, formatDate } from '../../student/QueryState.jsx'
import { reasonText } from '../../../lib/copy/evidence.js'

function Section({ id, title, children }) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h2 id={id} className="text-base font-semibold text-prism-ink">{title}</h2>
      <div className="text-sm text-prism-ink-muted">{children}</div>
    </section>
  )
}

const crumbs = (name) => [{ label: 'Capabilities', to: '/app/capabilities' }, { label: name }]

export default function CapabilityDetailPage() {
  const { capabilityId } = useParams()
  const { active } = useWorkspace()
  const query = useStudentCapabilities()
  const plan = useDevelopmentPlan()
  const growth = useGrowth()
  const state = queryStateView(query, { label: 'Loading this capability', homeTo: '/app/capabilities' })
  if (state) return <div><PageHeader title="Capability" context={active} breadcrumbs={crumbs('Capability')} />{state}</div>
  const cap = query.data.items.find((c) => c.id === capabilityId)
  if (!cap) {
    return (
      <div>
        <PageHeader title="Capability" context={active} breadcrumbs={crumbs('Not available')} />
        <EmptyState
          title="This capability is not available"
          description="It may not be part of your profile, or the link may be out of date."
          action={<LinkButton to="/app/capabilities" variant="secondary">Back to capabilities</LinkButton>}
          headingLevel={2}
        />
      </div>
    )
  }
  const described = Boolean(cap.level)
  const reasons = [...new Set(cap.statusReasons.map(reasonText))]
  const source = cap.evidenceSources[0]
  const missions = plan.data ? plan.data.missions.filter((m) => m.targetCapabilityName === cap.name) : []
  const reassessmentListed = Boolean(growth.data && growth.data.reassessments.length > 0)

  return (
    <div className="space-y-6">
      <PageHeader title={cap.name} description={cap.definition} context={active} breadcrumbs={crumbs(cap.name)} />
      <Card as="article" className="space-y-5 p-6" aria-label={cap.name} data-testid="capability-detail">
        <div className="flex flex-wrap items-center gap-2">
          {cap.layer === 'CONTEXTUAL' && <Badge tone="neutral">Role-specific</Badge>}
          {cap.developmentPriority && <Badge tone="partial">Development priority</Badge>}
          {described && <CapabilityLevelBadge level={cap.level} provisional={cap.status === 'PROVISIONAL'} />}
          <EvidenceSufficiencyBadge status={cap.status} reasons={cap.statusReasons} />
        </div>

        <p className="text-sm text-prism-ink">{cap.evidenceSummary.text}</p>

        {described ? (
          cap.observedBehaviors.length > 0 && (
            <Section id="cap-observed" title="What was observed">
              <ul className="space-y-2">
                {cap.observedBehaviors.map((b) => <li key={b.evidenceId}><ObservedBehaviorCard behavior={b.behavior} quote={b.quote} /></li>)}
              </ul>
            </Section>
          )
        ) : (
          reasons.length > 0 && (
            <Section id="cap-why" title="Why there is no level yet">
              <ul className="list-disc space-y-1 pl-5">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            </Section>
          )
        )}

        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-prism-ink">Evidence source</dt>
            <dd className="text-prism-ink-muted">
              {source ? `${source.assessmentTitle || 'Assessment'}${formatDate(source.completedAt) ? `, ${formatDate(source.completedAt)}` : ''}` : 'Not measured yet'}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-prism-ink">Earlier observations</dt>
            <dd className="text-prism-ink-muted">
              {cap.history.length > 1
                ? `${cap.history.length - 1} earlier ${cap.history.length - 1 === 1 ? 'assessment' : 'assessments'} measured this`
                : 'None'}
            </dd>
          </div>
        </dl>
        {described && (
          <Link to={`/app/evidence?capability=${encodeURIComponent(cap.id)}`} className="inline-flex min-h-6 items-center text-sm font-medium text-prism-accent-strong underline">
            See the evidence<span className="sr-only"> for {cap.name}</span>
          </Link>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-2">
          <Section id="cap-growth" title="Growth direction">
            <p>Change over time is shown only between assessments approved as comparable.</p>
            <Link to="/app/growth" className="mt-2 inline-flex min-h-6 items-center font-medium text-prism-accent-strong underline">Open growth</Link>
          </Section>
        </Card>
        <Card className="space-y-2">
          <Section id="cap-actions" title="Development actions">
            {missions.length > 0 ? (
              <ul className="space-y-1">
                {missions.map((m) => <li key={m.id}>{m.title} <span className="text-prism-ink-subtle">- practice, about {m.estimatedMinutes} minutes</span></li>)}
              </ul>
            ) : (
              <p>No practice mission is linked to this capability yet.</p>
            )}
            <Link to="/app/development" className="mt-2 inline-flex min-h-6 items-center font-medium text-prism-accent-strong underline">Open development</Link>
          </Section>
        </Card>
        <Card className="space-y-2">
          <Section id="cap-reassess" title="Reassessment">
            <p>{reassessmentListed ? 'A reassessment is listed for you in Growth.' : 'No reassessment is scheduled for you.'}</p>
          </Section>
        </Card>
      </div>
    </div>
  )
}