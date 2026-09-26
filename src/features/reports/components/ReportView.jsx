import { useEffect, useMemo, useRef, useState } from 'react'
import { Tabs } from '../../../components/ui/Tabs.jsx'
import { Card } from '../../../components/ui/Card.jsx'
import { Badge } from '../../../components/ui/Badge.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { EmptyState } from '../../../components/ui/EmptyState.jsx'
import { EvidenceTracePanel } from '../../../components/evidence/EvidenceTracePanel.jsx'
import { ReportCapabilityCard } from './ReportCapabilityCard.jsx'
import { DevelopmentPriorityCard } from './DevelopmentPriorityCard.jsx'
import { REPORT_COPY, reportCopyFor } from '../../../lib/copy/report.js'
import { formatDate } from '../../student/QueryState.jsx'

// The report body shared by the student, sponsor and share-link views
// (spec §14): header facts, then Summary / Evidence / Development /
// Methodology. A summary-only share shows just the Summary and Methodology.
// `audience` picks second-person copy for the student, neutral copy otherwise.
export function ReportView({ report, versionNumber, visibilityText, actions = null, audience = 'OWNER' }) {
  const [tab, setTab] = useState('summary')
  const [capabilityFilter, setCapabilityFilter] = useState(null)
  const [focusTarget, setFocusTarget] = useState(null)
  const filterRef = useRef(null)
  const evidenceHeadingRef = useRef(null)
  const copy = reportCopyFor(audience)
  const h = report.header
  const full = report.disclosure === 'FULL'
  const evidenceByCapability = useMemo(() => {
    const m = new Map()
    for (const e of report.evidence) m.set(e.capability.id, (m.get(e.capability.id) || 0) + 1)
    return m
  }, [report.evidence])
  const shownEvidence = capabilityFilter ? report.evidence.filter((e) => e.capability.id === capabilityFilter) : report.evidence
  const filterName = report.summary.capabilities.find((c) => c.id === capabilityFilter)?.name

  // Keyboard focus follows the in-page action (the control that was pressed
  // is gone once the tab or filter changes).
  useEffect(() => {
    if (!focusTarget) return
    const el = focusTarget === 'filter' ? filterRef.current : evidenceHeadingRef.current
    el?.focus()
    setFocusTarget(null)
  }, [focusTarget, tab, capabilityFilter])
  const seeEvidence = (capId) => { setCapabilityFilter(capId); setTab('evidence'); setFocusTarget('filter') }
  const showAll = () => { setCapabilityFilter(null); setFocusTarget('heading') }

  const summary = (
    <section className="space-y-4" aria-labelledby="report-summary-title">
      <h2 id="report-summary-title" className="text-lg font-semibold text-prism-ink">Capabilities</h2>
      <p className="text-sm text-prism-ink-muted">{REPORT_COPY.summaryIntro}</p>
      {report.summary.describedCount === 0 && <Callout tone="insufficient" title="Not enough evidence yet">{copy.noDescribed}</Callout>}
      <div className="grid gap-4 lg:grid-cols-2">
        {report.summary.capabilities.map((c) => (
          <ReportCapabilityCard key={c.id} cap={c} audience={audience} evidenceCount={evidenceByCapability.get(c.id) || 0} onSeeEvidence={full ? seeEvidence : null} headingLevel={3} />
        ))}
      </div>
    </section>
  )

  const evidence = (
    <section className="space-y-4" aria-labelledby="report-evidence-title">
      <h2 id="report-evidence-title" ref={evidenceHeadingRef} tabIndex={-1} className="text-lg font-semibold text-prism-ink focus:outline-none">Evidence</h2>
      <p className="text-sm text-prism-ink-muted">{copy.evidenceIntro}</p>
      {capabilityFilter && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <p ref={filterRef} tabIndex={-1} role="status" className="focus:outline-none">Showing evidence for <strong>{filterName}</strong></p>
          <Button size="sm" variant="ghost" onClick={showAll}>Show all evidence</Button>
        </div>
      )}
      {shownEvidence.length === 0
        ? <EmptyState title={REPORT_COPY.noEvidence} headingLevel={3} />
        : shownEvidence.map((e) => (
          <div key={e.id} className="space-y-1" data-testid="report-evidence">
            <EvidenceTracePanel item={e} headingLevel={3} />
            <p className="px-1 text-xs text-prism-ink-subtle">
              {e.claimStatus === 'SUPPORTED' ? 'Supported claim' : 'Provisional claim'} · {e.provenance.reviewedBy === 'AI_AND_HUMAN' ? 'Reviewed by AI and a person' : 'Reviewed by AI, not yet by a person'}
              {e.provenance.source === 'WORK_MATERIAL' ? ` · ${copy.fromWorkMaterials}` : ''}
            </p>
          </div>
        ))}
    </section>
  )

  const development = (
    <section className="space-y-4" aria-labelledby="report-development-title">
      <h2 id="report-development-title" className="text-lg font-semibold text-prism-ink">Development priorities</h2>
      <p className="text-sm text-prism-ink-muted">{REPORT_COPY.developmentIntro}</p>
      {report.development?.priorities.length
        ? report.development.priorities.map((p, i) => <DevelopmentPriorityCard key={p.capabilityId} priority={p} index={i} />)
        : <EmptyState title="No priorities yet" description={REPORT_COPY.noPriorities} headingLevel={3} />}
    </section>
  )

  const methodology = (
    <section className="space-y-3 text-sm" aria-labelledby="report-methodology-title">
      <h2 id="report-methodology-title" className="text-lg font-semibold text-prism-ink">Methodology</h2>
      <p className="text-prism-ink-muted">{REPORT_COPY.methodologyIntro}</p>
      <ul className="list-disc space-y-1 pl-5 text-prism-ink">{REPORT_COPY.methodology.map((m) => <li key={m}>{m}</li>)}</ul>
      <dl className="grid gap-x-4 gap-y-1 text-xs text-prism-ink-muted sm:grid-cols-[max-content_1fr]">
        <dt className="font-medium">Report version</dt><dd>{report.methodology.builderVersion}{versionNumber ? ` · version ${versionNumber}` : ''}</dd>
        <dt className="font-medium">Evidence rules</dt><dd>{report.methodology.sufficiencyRulesVersion}</dd>
        {report.methodology.formId && <><dt className="font-medium">Assessment form</dt><dd>{report.methodology.formId}</dd></>}
      </dl>
    </section>
  )

  const tabs = [
    { id: 'summary', label: REPORT_COPY.tabs.summary, content: summary },
    ...(full ? [{ id: 'evidence', label: REPORT_COPY.tabs.evidence, content: evidence }, { id: 'development', label: REPORT_COPY.tabs.development, content: development }] : []),
    { id: 'methodology', label: REPORT_COPY.tabs.methodology, content: methodology },
  ]

  return (
    <div className="space-y-6">
      <Card className="space-y-3 p-5" data-testid="report-header">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            {h.candidateName && <p className="text-lg font-semibold text-prism-ink">{h.candidateName}</p>}
            <p className="text-sm text-prism-ink">{h.assessment.title}{h.scenarioTitle ? ` — ${h.scenarioTitle}` : ''}</p>
            <p className="text-xs text-prism-ink-muted">
              {[
                formatDate(h.completedAt) && `Completed ${formatDate(h.completedAt)}`,
                REPORT_COPY.identity[h.verification.identityAssurance] || REPORT_COPY.identity.NOT_RECORDED,
                versionNumber ? `Report version ${versionNumber}` : null,
              ].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={h.scope === 'SPONSORED' ? 'accent' : 'neutral'}>{h.sponsor ? `Sponsored by ${h.sponsor.name}` : 'Personal assessment'}</Badge>
            {!full && <Badge tone="neutral">Summary only</Badge>}
          </div>
        </div>
        {visibilityText && <p className="text-sm text-prism-ink-muted" data-testid="report-visibility">{visibilityText}</p>}
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </Card>
      <Tabs tabs={tabs} value={tabs.some((t) => t.id === tab) ? tab : 'summary'} onChange={setTab} label="Report sections" />
    </div>
  )
}

export default ReportView
