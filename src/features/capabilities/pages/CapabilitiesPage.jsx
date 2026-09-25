// /app/capabilities (spec §13): per capability — definition, evidence-backed
// level, sufficiency status, observed behaviours, evidence sources,
// development priority, related missions and valid history. No soft-skill
// score, no percentages, no change until assessments are comparable.
import { Link } from 'react-router-dom'
import { PageHeader } from '../../../components/ui/PageHeader.jsx'
import { Card } from '../../../components/ui/Card.jsx'
import { Badge } from '../../../components/ui/Badge.jsx'
import { LinkButton } from '../../../components/ui/Button.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'
import { EvidenceSufficiencyBadge } from '../../../components/evidence/EvidenceSufficiencyBadge.jsx'
import { CapabilityLevelBadge } from '../../../components/capability/CapabilityLevelBadge.jsx'
import { ObservedBehaviorCard } from '../../../components/evidence/ObservedBehaviorCard.jsx'
import { EmptyState } from '../../../components/states/index.js'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { useStudentCapabilities } from '../../student/hooks.js'
import { queryStateView, formatDate } from '../../student/QueryState.jsx'
import { reasonText } from '../../../lib/copy/evidence.js'
import { EMPTY_COPY, START_ASSESSMENT_PATH } from '../../../lib/copy/emptyStates.js'

function CapabilityDetail({ cap }) {
  const described = Boolean(cap.level)
  const reasons = [...new Set(cap.statusReasons.map(reasonText))]
  const source = cap.evidenceSources[0]
  return (
    <Card as="article" className="space-y-4 p-5" aria-labelledby={`cap-${cap.id}`} data-testid="capability-detail">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`cap-${cap.id}`} className="text-base font-semibold text-prism-ink">{cap.name}</h2>
            {cap.layer === 'CONTEXTUAL' && <Badge tone="neutral">Role-specific</Badge>}
            {cap.developmentPriority && <Badge tone="partial">Development priority</Badge>}
          </div>
          <p className="mt-1 text-sm text-prism-ink-muted">{cap.definition}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {cap.level && <CapabilityLevelBadge level={cap.level} provisional={cap.status === 'PROVISIONAL'} />}
          <EvidenceSufficiencyBadge status={cap.status} reasons={cap.statusReasons} />
        </div>
      </header>

      <p className="text-sm text-prism-ink">{cap.evidenceSummary.text}</p>

      {described ? (
        cap.observedBehaviors.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-prism-ink">What was observed</h3>
            <ul className="space-y-2">
              {cap.observedBehaviors.map((b) => <li key={b.evidenceId}><ObservedBehaviorCard behavior={b.behavior} quote={b.quote} /></li>)}
            </ul>
          </div>
        )
      ) : (
        reasons.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-sm text-prism-ink-muted">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        )
      )}

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-prism-ink">Evidence source</dt>
          <dd className="text-prism-ink-muted">
            {source ? `${source.assessmentTitle || 'Assessment'}${formatDate(source.completedAt) ? `, ${formatDate(source.completedAt)}` : ''}` : 'Not measured yet'}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-prism-ink">Change over time</dt>
          <dd className="text-prism-ink-muted">Shown only between assessments approved as comparable.</dd>
        </div>
        <div>
          <dt className="font-semibold text-prism-ink">Related practice</dt>
          <dd className="text-prism-ink-muted">{cap.relatedMissions.length ? `${cap.relatedMissions.length} missions` : 'No practice missions yet'}</dd>
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
  )
}

export default function CapabilitiesPage() {
  const { active } = useWorkspace()
  const query = useStudentCapabilities()
  const header = (
    <PageHeader
      title="My Capabilities"
      description="What your completed formal assessments show about how you work. Level names are provisional."
      context={active}
    />
  )
  const state = queryStateView(query, { label: 'Loading your capabilities' })
  if (state) return <div>{header}{state}</div>
  const { items, assessedCount, excludedCount = 0 } = query.data
  return (
    <div className="space-y-6">
      {header}
      {excludedCount > 0 && (
        <Callout tone="info" title={`${excludedCount} ${excludedCount === 1 ? 'assessment is' : 'assessments are'} under review`}>
          Results under review are not included here until the review is finished.
        </Callout>
      )}
      {assessedCount === 0 && (
        <EmptyState
          title={EMPTY_COPY.capabilities.title}
          description={EMPTY_COPY.capabilities.description}
          action={<LinkButton to={START_ASSESSMENT_PATH} variant="primary">Start an assessment</LinkButton>}
          headingLevel={2}
        />
      )}
      <ul className="space-y-4">
        {items.map((cap) => <li key={cap.id}><CapabilityDetail cap={cap} /></li>)}
      </ul>
    </div>
  )
}
