// src/pages/EmployeeReportV2.jsx — workplace view of the capability report
// (legacy V2 route). Fail closed (spec §33): no readiness percentages, gap
// levels or ramp estimates; only server-decided statuses and real edges.
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchEmployeeReportV2 } from '../api/assessment.js'
import { PageHeader, Card, Skeleton, LinkButton } from '../components/ui/index.js'
import { ErrorState, InsufficientEvidenceState } from '../components/states/index.js'
import { EvidenceSufficiencyBadge } from '../components/evidence/EvidenceSufficiencyBadge.jsx'
import { CapabilityLevelBadge } from '../components/capability/CapabilityLevelBadge.jsx'
import { CapabilityCard } from '../components/reports/CapabilityCard.jsx'

export default function EmployeeReportV2() {
  const { sessionId } = useParams()
  const [state, setState] = useState({ loading: true, report: null, error: null })
  const load = useCallback(async () => {
    setState({ loading: true, report: null, error: null })
    try {
      setState({ loading: false, report: await fetchEmployeeReportV2(sessionId), error: null })
    } catch (error) {
      setState({ loading: false, report: null, error })
    }
  }, [sessionId])
  useEffect(() => { if (sessionId) load() }, [sessionId, load])

  const { loading, report, error } = state
  let body
  if (loading) {
    body = <Skeleton label="Loading the workplace view" lines={6} />
  } else if (error) {
    body = error.code === 'LEGACY_VIEW_UNAVAILABLE'
      ? <ErrorState title="Your original report is preserved" description="This workplace view was not issued. The original findings remain available without reinterpretation." action={<LinkButton to={`/score?session=${encodeURIComponent(sessionId)}`}>Open original report</LinkButton>} />
      : error.status === 404
      ? <ErrorState title="Report not found" description="There is no report for this assessment." action={<LinkButton to="/">Go to home</LinkButton>} />
      : <ErrorState title="This report could not be loaded" description={error.message} requestId={error.requestId} onRetry={load} />
  } else {
    const current = report.currentRole || {}
    const target = report.targetRoleEvaluation || {}
    const pathways = report.internalMobilityPathways || []
    const core = report.section3_layer1TransferableCapabilities || []
    const targetCaps = target.capabilityStatus || []
    body = (
      <div className="space-y-8">
        {report.status === 'INSUFFICIENT_EVIDENCE' && (
          <InsufficientEvidenceState
            title="Not enough evidence yet"
            description="No capability is described, and no readiness is shown, until there is enough reliable evidence."
            reasons={core.flatMap((c) => c.statusReasons || [])}
          />
        )}

        {(current.title || target.targetRoleTitle) && (
          <section aria-labelledby="roles-heading" className="space-y-1">
            <h2 id="roles-heading" className="text-lg font-semibold text-prism-ink">Roles</h2>
            {current.title && <p className="text-sm text-prism-ink-muted">Current role: {current.title}</p>}
            {target.targetRoleTitle && <p className="text-sm text-prism-ink-muted">Role being explored: {target.targetRoleTitle}</p>}
          </section>
        )}

        {targetCaps.length > 0 && (
          <section aria-labelledby="target-caps" className="space-y-3">
            <h2 id="target-caps" className="text-lg font-semibold text-prism-ink">Role capabilities</h2>
            <ul className="grid gap-2">
              {targetCaps.map((c) => (
                <li key={c.capability} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--prism-radius-md)] border border-prism-border bg-prism-surface p-3">
                  <span className="text-sm font-medium text-prism-ink">{c.name}</span>
                  <span className="flex flex-wrap gap-2">
                    <EvidenceSufficiencyBadge status={c.status} />
                    <CapabilityLevelBadge level={c.level} provisional={c.status === 'PROVISIONAL'} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {core.length > 0 && (
          <section aria-labelledby="core-caps" className="space-y-3">
            <h2 id="core-caps" className="text-lg font-semibold text-prism-ink">Core capabilities</h2>
            <div className="grid gap-3">{core.map((cap) => <CapabilityCard key={cap.id} cap={cap} />)}</div>
          </section>
        )}

        {pathways.length > 0 && (
          <section aria-labelledby="pathways" className="space-y-3">
            <h2 id="pathways" className="text-lg font-semibold text-prism-ink">Related roles</h2>
            <p className="text-sm text-prism-ink-muted">Roles that share capabilities with this one. This is not a judgement of readiness.</p>
            <div className="grid gap-3 md:grid-cols-2">
              {pathways.map((p) => (
                <Card key={p.role} className="p-4">
                  <h3 className="font-semibold text-prism-ink">{p.role}</h3>
                  {p.bridgeCompetency && <p className="mt-1 text-sm text-prism-ink-muted">Shared capability: {p.bridgeCompetency}</p>}
                </Card>
              ))}
            </div>
          </section>
        )}
      </div>
    )
  }

  return (
    <div className="prism-app min-h-screen">
      <main id="main" className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <PageHeader
          title="Workplace view"
          description={report?.candidate?.name ? `Prepared for ${report.candidate.name}.` : 'Based only on evidence from this assessment.'}
          actions={<LinkButton to={`/report/${encodeURIComponent(sessionId)}/v2`} variant="secondary" size="sm">Capability report</LinkButton>}
        />
        {body}
      </main>
    </div>
  )
}
