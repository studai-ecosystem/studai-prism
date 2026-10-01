// /app/capabilities (spec 13): the capability profile. One compact card per
// capability - evidence-backed level, sufficiency status and the reason when
// there is not enough evidence. Detail lives at /app/capabilities/:id.
// No soft-skill score, no percentages, no change until assessments are comparable.
import { PageHeader } from '../../../components/ui/PageHeader.jsx'
import { LinkButton } from '../../../components/ui/Button.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'
import { CapabilityCard } from '../../../components/capability/CapabilityCard.jsx'
import { EvidenceCoverage } from '../../../components/evidence/EvidenceCoverage.jsx'
import { EmptyState } from '../../../components/states/index.js'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { useStudentCapabilities } from '../../student/hooks.js'
import { queryStateView } from '../../student/QueryState.jsx'
import { EMPTY_COPY, START_ASSESSMENT_PATH } from '../../../lib/copy/emptyStates.js'

export default function CapabilitiesPage() {
  const { active } = useWorkspace()
  const query = useStudentCapabilities()
  const header = (
    <PageHeader
      title="Capabilities"
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
      {assessedCount > 0 && <EvidenceCoverage items={items} />}
      <ul className="grid gap-4 lg:grid-cols-2">
        {items.map((cap) => <li key={cap.id}><CapabilityCard cap={cap} to={`/app/capabilities/${encodeURIComponent(cap.id)}`} /></li>)}
      </ul>
    </div>
  )
}