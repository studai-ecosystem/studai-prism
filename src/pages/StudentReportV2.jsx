// src/pages/StudentReportV2.jsx — evidence-grounded capability report (legacy
// V2 route). Fail closed (spec §33): every status, level and quote comes from
// the server; missing data renders as insufficient evidence, never a number.
import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchStudentReportV2 } from '../api/assessment.js'
import { PageHeader, Card, Callout, Skeleton, LinkButton } from '../components/ui/index.js'
import { ErrorState, InsufficientEvidenceState } from '../components/states/index.js'
import { CapabilityCard } from '../components/reports/CapabilityCard.jsx'

function useReport(sessionId) {
  const [state, setState] = useState({ loading: true, report: null, error: null })
  const load = useCallback(async () => {
    setState({ loading: true, report: null, error: null })
    try {
      setState({ loading: false, report: await fetchStudentReportV2(sessionId), error: null })
    } catch (error) {
      setState({ loading: false, report: null, error })
    }
  }, [sessionId])
  useEffect(() => { if (sessionId) load() }, [sessionId, load])
  return { ...state, reload: load }
}

function CapabilitySection({ id, title, description, caps }) {
  if (!caps || caps.length === 0) return null
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div>
        <h2 id={id} className="text-lg font-semibold text-prism-ink">{title}</h2>
        {description && <p className="text-sm text-prism-ink-muted">{description}</p>}
      </div>
      <div className="grid gap-3">
        {caps.map((cap) => <CapabilityCard key={cap.id} cap={cap} />)}
      </div>
    </section>
  )
}

function sufficiencyLine(counts, noun) {
  if (!counts || !counts.total) return null
  const described = (counts.sufficient || 0) + (counts.provisional || 0)
  return `${described} of ${counts.total} ${noun} have enough evidence to describe.`
}

export default function StudentReportV2() {
  const { sessionId } = useParams()
  const { loading, report, error, reload } = useReport(sessionId)

  let body
  if (loading) {
    body = <Skeleton label="Loading your report" lines={6} />
  } else if (error) {
    body = error.status === 404
      ? <ErrorState title="Report not found" description="There is no report for this assessment. It may not have been completed yet." action={<LinkButton to="/">Go to home</LinkButton>} />
      : <ErrorState title="This report could not be loaded" description={error.message} requestId={error.requestId} onRetry={reload} />
  } else {
    const sec2 = report.section2_methodologicalIntegrity || {}
    const sec3 = report.section3_layer1TransferableCapabilities || []
    const sec4 = report.section4_layer2RoleCapabilities || []
    const sec5 = report.section5_appliedWorkDemonstration || {}
    const sec7 = report.section7_careerExploration || {}
    const sec8 = report.section8_roleNeighborhood || {}
    const sec9 = report.section9_strengthsAndGrowth || {}
    const verifyUrl = report.section12_verification?.credentialVerificationUrl || null
    const insufficient = report.status === 'INSUFFICIENT_EVIDENCE'
    const allReasons = [...sec3, ...sec4].flatMap((c) => c.statusReasons || [])
    const lines = [
      sufficiencyLine(sec2.evidenceSufficiency?.coreTransferable, 'core capabilities'),
      sufficiencyLine(sec2.evidenceSufficiency?.roleCapabilities, 'role capabilities'),
    ].filter(Boolean)

    body = (
      <div className="space-y-8">
        {insufficient ? (
          <InsufficientEvidenceState
            title="Not enough evidence yet to describe your capabilities"
            reasons={allReasons}
            headingLevel={2}
          />
        ) : (
          <Callout tone="partial" title="Provisional report">
            These descriptions are provisional. They are based only on evidence from this assessment, and the
            level descriptions are still being reviewed.
          </Callout>
        )}

        {lines.length > 0 && (
          <section aria-labelledby="evidence-summary" className="space-y-1">
            <h2 id="evidence-summary" className="text-lg font-semibold text-prism-ink">Evidence summary</h2>
            {lines.map((l) => <p key={l} className="text-sm text-prism-ink-muted">{l}</p>)}
            {sec2.alternateAdministration && <p className="text-sm text-prism-ink-muted">{sec2.alternateAdministration}.</p>}
          </section>
        )}

        <CapabilitySection id="core-caps" title="Core capabilities" description="Capabilities that apply across many kinds of work." caps={sec3} />
        <CapabilitySection id="role-caps" title="Role capabilities" description={sec5.jobFamilyName ? `Capabilities specific to ${sec5.jobFamilyName}.` : null} caps={sec4} />

        {sec5.scenarioTitle && (
          <section aria-labelledby="applied-work" className="space-y-1">
            <h2 id="applied-work" className="text-lg font-semibold text-prism-ink">Assessment</h2>
            <p className="text-sm text-prism-ink-muted">{sec5.scenarioTitle}</p>
          </section>
        )}

        <section aria-labelledby="strengths" className="space-y-3">
          <h2 id="strengths" className="text-lg font-semibold text-prism-ink">Strengths and development areas</h2>
          {(sec9.strengths || []).length === 0 && (sec9.growthOpportunities || []).length === 0 ? (
            <p className="text-sm text-prism-ink-muted">No strengths or development areas are described until there is enough evidence for them.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-prism-ink">Strengths</h3>
                <ul className="mt-2 space-y-2 text-sm text-prism-ink">
                  {(sec9.strengths || []).map((s) => <li key={s.claimId}>{s.text}{s.status === 'PROVISIONAL' ? ' (provisional)' : ''}</li>)}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-prism-ink">Development areas</h3>
                <ul className="mt-2 space-y-2 text-sm text-prism-ink">
                  {(sec9.growthOpportunities || []).map((g) => <li key={g.claimId}>{g.text}{g.status === 'PROVISIONAL' ? ' (provisional)' : ''}</li>)}
                </ul>
              </div>
            </div>
          )}
        </section>

        <section aria-labelledby="roles" className="space-y-3">
          <h2 id="roles" className="text-lg font-semibold text-prism-ink">Roles to explore</h2>
          {(sec7.roles || []).length === 0 ? (
            <p className="text-sm text-prism-ink-muted">Roles are suggested here only when your assessment evidence supports them.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {sec7.roles.map((r) => (
                <Card key={r.roleId} className="space-y-2 p-4">
                  <h3 className="font-semibold text-prism-ink">{r.title}</h3>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-prism-ink">
                    {(r.whyShown || []).map((w) => <li key={w.statement}>{w.statement}</li>)}
                  </ul>
                  {(r.unknowns || []).length > 0 && (
                    <p className="text-sm text-prism-ink-muted">Not yet known: {r.unknowns.map((u) => u.name).join(', ')}.</p>
                  )}
                  {r.nextStep?.label && <p className="text-sm text-prism-ink-muted">Next step: {r.nextStep.label}</p>}
                </Card>
              ))}
            </div>
          )}
        </section>

        {(sec8.edges || []).length > 0 && (
          <section aria-labelledby="neighbours" className="space-y-3">
            <h2 id="neighbours" className="text-lg font-semibold text-prism-ink">Roles related to this assessment&apos;s job family</h2>
            <p className="text-sm text-prism-ink-muted">These roles share capabilities with the job family you were assessed for. They are not matched to your result.</p>
            <ul className="grid gap-2 text-sm md:grid-cols-2">
              {sec8.edges.map((e) => (
                <li key={e.targetRole} className="rounded-[var(--prism-radius-md)] border border-prism-border p-3">
                  <span className="font-medium text-prism-ink">{e.targetRole}</span>
                  {e.bridgeCompetency && <span className="block text-prism-ink-muted">Shared capability: {e.bridgeCompetency}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {verifyUrl && (
          <p className="text-sm text-prism-ink-muted">
            Anyone you share it with can check this credential at <Link className="text-prism-accent-strong underline" to={verifyUrl}>its verification page</Link>.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="prism-app min-h-screen">
      <main id="main" className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <PageHeader
          title="Capability report"
          description={report?.candidate?.name ? `Prepared for ${report.candidate.name}.` : 'Based only on evidence from this assessment.'}
          actions={report ? <LinkButton to={`/report/${encodeURIComponent(sessionId)}/employee`} variant="secondary" size="sm">Workplace view</LinkButton> : null}
        />
        {body}
      </main>
    </div>
  )
}
