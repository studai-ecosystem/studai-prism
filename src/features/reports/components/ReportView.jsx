import { useEffect, useMemo, useRef, useState } from 'react'
import { Tabs } from '../../../components/ui/Tabs.jsx'
import { Card } from '../../../components/ui/Card.jsx'
import { Badge } from '../../../components/ui/Badge.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'
import { Button, LinkButton } from '../../../components/ui/Button.jsx'
import { EmptyState } from '../../../components/ui/EmptyState.jsx'
import { EvidenceCard } from '../../../components/evidence/EvidenceCard.jsx'
import { EvidenceCoverage } from '../../../components/evidence/EvidenceCoverage.jsx'
import { EvidenceDetailDrawer } from '../../../components/evidence/EvidenceDetailDrawer.jsx'
import { CapabilityLevelBadge } from '../../../components/capability/CapabilityLevelBadge.jsx'
import { Link } from 'react-router-dom'
import { ReportCapabilityCard } from './ReportCapabilityCard.jsx'
import { DevelopmentPriorityCard } from './DevelopmentPriorityCard.jsx'
import { CapabilityMap } from './CapabilityMap.jsx'
import { MomentCard, practiceHref } from './MomentCard.jsx'
import { ReportVersionHistory } from './ReportVersionHistory.jsx'
import { REPORT_COPY, reportCopyFor } from '../../../lib/copy/report.js'
import { formatDate } from '../../student/QueryState.jsx'

// The report body shared by the student, sponsor and share-link views
// (spec §14, P5.2). First screen, in order: a plain statement bounded to this
// assessment, the Capability Map (band and evidence state separately), the
// Moments that mattered, one next useful practice; then the details tabs
// (Evidence, Development, Methodology with version history and review). A
// summary-only share has no quotes, so no moments, evidence or development.
// `audience` picks second-person copy for the student, neutral copy otherwise.
export function ReportView({ report, versionNumber, visibilityText, actions = null, audience = 'OWNER', canReview = false }) {
  const [tab, setTab] = useState('summary')
  const [capabilityFilter, setCapabilityFilter] = useState(null)
  const [focusTarget, setFocusTarget] = useState(null)
  const [openEvidence, setOpenEvidence] = useState(null)
  const filterRef = useRef(null)
  const evidenceHeadingRef = useRef(null)
  const copy = reportCopyFor(audience)
  const h = report.header
  const full = report.disclosure === 'FULL'
  const owner = audience === 'OWNER'
  const evidenceByCapability = useMemo(() => {
    const m = new Map()
    for (const e of report.evidence) m.set(e.capability.id, (m.get(e.capability.id) || 0) + 1)
    return m
  }, [report.evidence])
  const shownEvidence = capabilityFilter ? report.evidence.filter((e) => e.capability.id === capabilityFilter) : report.evidence
  const shownCards = capabilityFilter ? report.summary.capabilities.filter((c) => c.id === capabilityFilter) : report.summary.capabilities
  const filterCap = report.summary.capabilities.find((c) => c.id === capabilityFilter)
  const filterName = filterCap ? filterCap.displayLabel || filterCap.name : null
  const moments = full ? (report.moments || []).slice(0, 3) : []
  const priorities = report.development?.priorities || []

  // Keyboard focus follows the in-page action (the control that was pressed
  // is gone once the tab or filter changes).
  useEffect(() => {
    if (!focusTarget) return
    const el = focusTarget === 'filter' ? filterRef.current : evidenceHeadingRef.current
    el?.focus()
    setFocusTarget(null)
  }, [focusTarget, tab, capabilityFilter])
  const detailTab = full ? 'evidence' : 'capabilities'
  const seeEvidence = (capId) => { setCapabilityFilter(capId); setTab(detailTab); setFocusTarget('filter') }
  const showAll = () => { setCapabilityFilter(null); setFocusTarget('heading') }

  // Next useful practice (P5.6): the first evidence-backed development
  // priority, else a bounded moment's next behaviour. Nothing is invented.
  const nextMoment = moments.find((m) => m.nextBehavior) || null
  const nextPractice = priorities[0]
    ? { title: priorities[0].name, behavior: priorities[0].behaviorToImprove, why: priorities[0].claim, level: priorities[0].currentLevel, moment: moments.find((m) => m.capability.id === priorities[0].capabilityId) || null }
    : nextMoment ? { title: nextMoment.capability.displayLabel || nextMoment.capability.name, behavior: nextMoment.nextBehavior, why: nextMoment.observedBehavior, level: null, moment: nextMoment } : null

  const summary = (
    <div className="space-y-8">
      {report.plainStatement && (
        <p className="text-lg leading-relaxed text-prism-ink" data-testid="report-plain-statement">{report.plainStatement}</p>
      )}
      <CapabilityMap capabilities={report.summary.capabilities} onSelect={seeEvidence} headingLevel={2} collapseInsufficient />
      {report.coverage?.notes?.length > 0 && (
        <section aria-labelledby="report-coverage-title" className="rounded-md border border-prism-border bg-prism-surface p-3 text-sm" data-testid="report-coverage">
          <h2 id="report-coverage-title" className="font-semibold text-prism-ink">What this report covers</h2>
          <ul className="mt-1 space-y-0.5 text-prism-ink-muted">
            {report.coverage.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </section>
      )}
      {report.summary.describedCount === 0 && (
        <div data-testid="report-none-described">
          <Callout tone="insufficient" title="Not enough evidence yet">
            <p>{REPORT_COPY.mapNoneDescribed}</p>
            {owner && <p className="mt-1">{copy.noDescribed}</p>}
          </Callout>
        </div>
      )}
      {full && (
        <section className="space-y-3" aria-labelledby="report-moments-title" data-testid="report-moments">
          <div>
            <h2 id="report-moments-title" className="text-lg font-semibold text-prism-ink">{REPORT_COPY.momentsTitle}</h2>
            <p className="text-sm text-prism-ink-muted">{owner ? REPORT_COPY.momentsIntro : REPORT_COPY.momentsIntroOther}</p>
          </div>
          {moments.length === 0 ? <p className="text-sm text-prism-ink-muted">{REPORT_COPY.momentsNone}</p> : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {moments.map((m) => <MomentCard key={m.id} moment={m} sessionId={report.sessionId} audience={audience} onOpen={setOpenEvidence} headingLevel={3} />)}
            </div>
          )}
        </section>
      )}
      {full && (
        <section className="space-y-3" aria-labelledby="report-next-title" data-testid="report-next-practice">
          <h2 id="report-next-title" className="text-lg font-semibold text-prism-ink">{REPORT_COPY.nextTitle}</h2>
          {nextPractice ? (
            <Card className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-semibold text-prism-ink">{nextPractice.title}</p>
                {nextPractice.level && <CapabilityLevelBadge level={nextPractice.level} provisional />}
              </div>
              {nextPractice.behavior && <p className="text-sm text-prism-ink"><span className="font-medium">What to practise: </span>{nextPractice.behavior}</p>}
              {nextPractice.why && <p className="text-sm text-prism-ink-muted"><span className="font-medium text-prism-ink">{REPORT_COPY.nextWhy}: </span>{nextPractice.why}</p>}
              <p className="text-xs text-prism-ink-subtle">{REPORT_COPY.missionsLater}</p>
              {owner && (
                <div className="flex flex-wrap gap-2">
                  <LinkButton size="sm" variant="primary" to={practiceHref(report.sessionId, nextPractice.moment)}>{REPORT_COPY.practiseThis}</LinkButton>
                  {priorities.length > 0 && <Button size="sm" variant="ghost" onClick={() => setTab('development')}>{REPORT_COPY.focusTeaser}</Button>}
                </div>
              )}
            </Card>
          ) : <p className="text-sm text-prism-ink-muted">{REPORT_COPY.nextNone}</p>}
        </section>
      )}
      <div className="space-y-2 rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-subtle p-4" data-testid="report-glance">
        <EvidenceCoverage items={report.summary.capabilities} />
        <p className="text-sm text-prism-ink-muted">
          {REPORT_COPY.growthLine}
          {owner && <> <Link to="/app/growth" className="font-medium text-prism-accent-strong underline">{REPORT_COPY.growthLink}</Link></>}
        </p>
      </div>
    </div>
  )

  // Capability detail cards: in the Evidence tab (full report) or their own
  // tab (summary share). One filter serves both.
  const detailHead = (
    <>
      <p className="text-sm text-prism-ink-muted">{full ? copy.evidenceIntro : REPORT_COPY.summaryIntro}</p>
      {capabilityFilter && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <p ref={filterRef} tabIndex={-1} role="status" className="focus:outline-none">Showing {full ? 'evidence' : 'details'} for <strong>{filterName}</strong></p>
          <Button size="sm" variant="ghost" onClick={showAll}>Show all {full ? 'evidence' : 'capabilities'}</Button>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {shownCards.map((c) => (
          <ReportCapabilityCard key={c.id} cap={c} audience={audience} evidenceCount={evidenceByCapability.get(c.id) || 0} onSeeEvidence={full ? seeEvidence : null} headingLevel={3} />
        ))}
      </div>
    </>
  )

  const capabilitiesTab = (
    <section className="space-y-4" aria-labelledby="report-capabilities-title">
      <h2 id="report-capabilities-title" ref={evidenceHeadingRef} tabIndex={-1} className="text-lg font-semibold text-prism-ink focus:outline-none">Capabilities</h2>
      {detailHead}
    </section>
  )

  const evidence = (
    <section className="space-y-4" aria-labelledby="report-evidence-title">
      <h2 id="report-evidence-title" ref={evidenceHeadingRef} tabIndex={-1} className="text-lg font-semibold text-prism-ink focus:outline-none">Evidence</h2>
      {detailHead}
      {shownEvidence.length === 0
        ? <EmptyState title={REPORT_COPY.noEvidence} headingLevel={3} />
        : shownEvidence.map((e) => (
          <div key={e.id} className="space-y-1" data-testid="report-evidence">
            <EvidenceCard item={e} headingLevel={3} audience={audience} onOpen={() => setOpenEvidence(e)} />
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
      {priorities.length
        ? priorities.map((p, i) => <DevelopmentPriorityCard key={p.capabilityId} priority={p} index={i} />)
        : <EmptyState title="No priorities yet" description={REPORT_COPY.noPriorities} headingLevel={3} />}
    </section>
  )

  const methodology = (
    <section className="space-y-4 text-sm" aria-labelledby="report-methodology-title">
      <h2 id="report-methodology-title" className="text-lg font-semibold text-prism-ink">Methodology</h2>
      <p className="text-prism-ink-muted">{REPORT_COPY.methodologyIntro}</p>
      <ul className="list-disc space-y-1 pl-5 text-prism-ink">{REPORT_COPY.methodology.map((m) => <li key={m}>{m}</li>)}</ul>
      <details className="rounded-[var(--prism-radius-md)] border border-prism-border p-3">
        <summary className="cursor-pointer text-sm font-medium text-prism-ink">{REPORT_COPY.technicalDetails}</summary>
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs text-prism-ink-muted sm:grid-cols-[max-content_1fr]">
          <dt className="font-medium">Report version</dt><dd>{report.methodology.builderVersion}{versionNumber ? ` · version ${versionNumber}` : ''}</dd>
          <dt className="font-medium">Evidence rules</dt><dd>{report.methodology.sufficiencyRulesVersion}</dd>
          {report.methodology.formId && <><dt className="font-medium">Assessment form</dt><dd>{report.methodology.formId}</dd></>}
        </dl>
      </details>
      {canReview && owner && <ReportVersionHistory sessionId={report.sessionId} currentVersion={versionNumber} moments={moments} />}
    </section>
  )

  const tabs = [
    { id: 'summary', label: REPORT_COPY.tabs.summary, content: summary },
    ...(full
      ? [{ id: 'evidence', label: REPORT_COPY.tabs.evidence, content: evidence }, { id: 'development', label: REPORT_COPY.tabs.development, content: development }]
      : [{ id: 'capabilities', label: REPORT_COPY.tabs.capabilities, content: capabilitiesTab }]),
    { id: 'methodology', label: REPORT_COPY.tabs.methodology, content: methodology },
  ]

  return (
    <div className="space-y-6">
      <Card className="space-y-3 p-5" data-testid="report-header">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            {h.candidateName && <p className="text-lg font-semibold text-prism-ink">{h.candidateName}</p>}
            <p className="text-sm text-prism-ink">{h.assessment.title}{h.scenarioTitle && h.scenarioTitle !== h.assessment.title ? ` — ${h.scenarioTitle}` : ''}</p>
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
            {report.methodology.levelLabelsStatus === 'PROVISIONAL' && <Badge tone="neutral">Level names are provisional</Badge>}
          </div>
        </div>
        {visibilityText && <p className="text-sm text-prism-ink-muted" data-testid="report-visibility">{visibilityText}</p>}
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </Card>
      <Tabs tabs={tabs} value={tabs.some((t) => t.id === tab) ? tab : 'summary'} onChange={setTab} label="Report sections" />
      <EvidenceDetailDrawer item={openEvidence} onClose={() => setOpenEvidence(null)} audience={audience} />
    </div>
  )
}

export default ReportView
