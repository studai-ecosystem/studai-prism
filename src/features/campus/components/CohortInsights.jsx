import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Panel } from '../../../components/ui/Card.jsx'
import { LinkButton } from '../../../components/ui/Button.jsx'
import { StatusChip } from '../../../components/ui/Badge.jsx'
import { formatDate } from '../../student/QueryState.jsx'
import { analyticsApi } from '../../../api/analytics.js'
import { fetchInterventions } from '../../../api/development.js'
import { fetchReassessments } from '../../../api/growth.js'
import { ANALYTICS_COPY } from '../../../lib/copy/campus.js'
import { useCampusOrg } from '../hooks.js'
import { CapabilityDistributionChart, SuppressedNote } from '../analytics/components.jsx'
import { InterventionLoop } from './InterventionLoop.jsx'

const Loading = ({ what }) => <p className="text-sm text-prism-ink-muted">Loading {what}…</p>
const Failed = ({ what }) => <p className="text-sm text-prism-ink-muted">{what} could not be loaded.</p>

function useCohortCapabilities(cohortId) {
  const { orgId, key } = useCampusOrg()
  return useQuery({ queryKey: key('analytics', 'capabilities', { cohortId }), queryFn: () => analyticsApi.capabilities(orgId, { cohortId }) })
}

export function CohortOverview({ d, onOpen }) {
  const pending = d.pendingInvites.length
  return (
    <Panel title="At a glance">
      <dl className="grid gap-4 text-sm sm:grid-cols-3">
        <div><dt className="text-prism-ink-muted">Students</dt><dd className="mt-1 text-xl font-semibold text-prism-ink">{d.cohort.memberCount}</dd></div>
        <div><dt className="text-prism-ink-muted">Invitations waiting</dt><dd className="mt-1 text-xl font-semibold text-prism-ink">{pending}</dd></div>
        <div><dt className="text-prism-ink-muted">Status</dt><dd className="mt-1 font-medium text-prism-ink">{d.cohort.status === 'ARCHIVED' ? 'Archived' : 'Active'}</dd></div>
      </dl>
      <p className="mt-4 text-sm text-prism-ink-muted">
        Capability distribution, development needs, interventions and assessment cycles for this cohort are in the tabs above. Individual students appear only through the sponsored assessments you assigned them.
      </p>
      <button type="button" className="mt-2 text-sm font-medium text-prism-accent-strong underline" onClick={() => onOpen('students')}>See students</button>
    </Panel>
  )
}

export function CohortCapabilities({ cohortId }) {
  const q = useCohortCapabilities(cohortId)
  if (q.isPending) return <Loading what="the capability distribution" />
  if (q.isError) return <Failed what="The capability distribution" />
  const v = q.data
  return (
    <Panel title="Capability distribution" description={ANALYTICS_COPY.provisionalNote}>
      {v.suppressed ? <SuppressedNote /> : v.capabilities.length === 0 ? <p className="text-sm text-prism-ink-muted">{ANALYTICS_COPY.empty}</p> : <CapabilityDistributionChart view={v} />}
    </Panel>
  )
}

export function CohortNeeds({ cohortId }) {
  const { orgId, can } = useCampusOrg()
  const q = useCohortCapabilities(cohortId)
  if (q.isPending) return <Loading what="development needs" />
  if (q.isError) return <Failed what="Development needs" />
  const v = q.data
  const top = !v.suppressed && v.topNeeds[0]
  return (
    <Panel title="Development needs">
      {v.suppressed ? <SuppressedNote /> : v.topNeeds.length === 0 ? <p className="text-sm text-prism-ink-muted">No development needs identified from the evidence available.</p> : (
        <ol className="list-decimal space-y-1 pl-5 text-sm text-prism-ink">{v.topNeeds.map((n) => <li key={n.capabilityId}><span className="font-medium">{n.name}</span> {'\u2014'} {ANALYTICS_COPY.needs(n.needs, n.of)}</li>)}</ol>
      )}
      {top && can('interventions.write') && (
        <LinkButton className="mt-3" size="sm" to={`/campus/${orgId}/development?capability=${encodeURIComponent(top.capabilityId)}&cohort=${encodeURIComponent(cohortId)}`}>Create development intervention</LinkButton>
      )}
      <p className="mt-2 text-xs text-prism-ink-subtle">{v.method}</p>
    </Panel>
  )
}

export function CohortInterventions({ cohortId }) {
  const { orgId, can, key } = useCampusOrg()
  const q = useQuery({ queryKey: key('interventions'), queryFn: () => fetchInterventions(orgId) })
  if (q.isPending) return <Loading what="interventions" />
  if (q.isError) return <Failed what="Interventions" />
  const mine = q.data.filter((i) => i.cohortId === cohortId)
  if (mine.length === 0) return <Panel title="Assigned interventions"><p className="text-sm text-prism-ink-muted">No intervention is assigned to this cohort yet.</p></Panel>
  return (
    <div className="space-y-4">
      {mine.map((i) => (
        <Panel key={i.id} title={i.name} headingLevel={3} description={`${i.targetCapability.name || i.targetCapability.id} \u00b7 ${formatDate(i.startsOn)} \u2013 ${formatDate(i.endsOn)}`}>
          <InterventionLoop intervention={i} orgId={orgId} canReassess={can('reassessments.read') || can('reassessments.write')} canAnalytics={can('analytics.read')} />
        </Panel>
      ))}
    </div>
  )
}

export function CohortCycles({ cohortId }) {
  const { orgId, key } = useCampusOrg()
  const q = useQuery({ queryKey: key('reassessments'), queryFn: () => fetchReassessments(orgId) })
  if (q.isPending) return <Loading what="assessment cycles" />
  if (q.isError) return <Failed what="Assessment cycles" />
  const mine = q.data.filter((c) => c.cohortIds.includes(cohortId))
  return (
    <Panel title="Assessment cycles and growth" description="A change in level is shown only after a comparable reassessment.">
      {mine.length === 0 ? <p className="text-sm text-prism-ink-muted">No reassessment is scheduled for this cohort.</p> : (
        <ul className="space-y-3 text-sm">
          {mine.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-prism-ink"><span className="font-medium">{c.name}</span> {'\u00b7'} {formatDate(c.windowStart)} {'\u2013'} {formatDate(c.windowEnd)} {'\u00b7'} {c.reassessment.completed} of {c.reassessment.rostered} completed</span>
              <StatusChip tone={c.comparability === 'APPROVED' ? 'positive' : 'neutral'} label={c.comparability === 'APPROVED' ? 'Comparable' : 'Not yet approved as comparable'} />
            </li>
          ))}
        </ul>
      )}
      <Link to={`/campus/${orgId}/reassessments`} className="mt-3 inline-block text-sm font-medium text-prism-accent-strong underline">Open reassessments</Link>
    </Panel>
  )
}

export function CohortReports() {
  const { orgId } = useCampusOrg()
  return (
    <Panel title="Reports">
      <p className="text-sm text-prism-ink-muted">Executive and cohort reports are generated from sponsored evidence only, with small groups hidden.</p>
      <LinkButton className="mt-3" size="sm" to={`/campus/${orgId}/reports`}>Open reports</LinkButton>
    </Panel>
  )
}