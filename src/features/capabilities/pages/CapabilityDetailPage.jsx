// /app/capabilities/:capabilityId (spec 13, P5.4, CH-26/CH-27): one capability
// bound to the latest formal snapshot that measured it. Order: what it means
// (bounded to the observed context) -> the assessed level with a SEPARATE
// evidence-state chip -> the learner's own verified moments -> one supported
// next behaviour and why it matters -> a reachable reviewed practice, an
// optional stretch, or an honest "none yet" -> scope, date, method and
// limitation -> ask for a review. Database vocabulary lives only under
// "Details". When nothing is publishable there is ONE state, never two
// versions of the same warning. Every sentence is a governed API fact.
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageHeader } from '../../../components/ui/PageHeader.jsx'
import { Card } from '../../../components/ui/Card.jsx'
import { Badge, StatusChip } from '../../../components/ui/Badge.jsx'
import { Button, LinkButton } from '../../../components/ui/Button.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'
import { CapabilityLevelBadge } from '../../../components/capability/CapabilityLevelBadge.jsx'
import { EvidenceCard } from '../../../components/evidence/EvidenceCard.jsx'
import { EvidenceDetailDrawer } from '../../../components/evidence/EvidenceDetailDrawer.jsx'
import { EvidenceTimeline } from '../../../components/evidence/EvidenceTimeline.jsx'
import { EmptyState } from '../../../components/states/index.js'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { useCapabilityDetail } from '../../student/hooks.js'
import { queryStateView, formatDate } from '../../student/QueryState.jsx'
import { reasonText } from '../../../lib/copy/evidence.js'
import { REPORT_COPY } from '../../../lib/copy/report.js'
import { CapabilityEvidenceChip } from '../../reports/components/CapabilityMap.jsx'
import { MomentCard } from '../../reports/components/MomentCard.jsx'
import { RecommendationCard } from '../../reports/components/RecommendationCard.jsx'
import { InterpretationReviewDialog } from '../../reports/components/InterpretationReviewDialog.jsx'

function Section({ id, title, children, className }) {
  return (
    <section aria-labelledby={id} className={className || 'space-y-2'}>
      <h2 id={id} className="text-base font-semibold text-prism-ink">{title}</h2>
      <div className="text-sm text-prism-ink-muted">{children}</div>
    </section>
  )
}

const crumbs = (name) => [{ label: 'Capabilities', to: '/app/capabilities' }, { label: name }]

// The single plain state shown when no band is publishable (CH-27).
const STATE_COPY = {
  BOUNDED_ONLY: { title: 'One moment observed, not a level', body: 'One verified moment is shown below. That is not enough to describe this capability as a whole, so no level is given.' },
  INSUFFICIENT: { title: 'Not enough evidence yet', body: 'This assessment did not produce enough evidence to describe this capability. That is a statement about the evidence, not about you.' },
  UNDER_REVIEW: { title: 'Under review', body: 'A person is reviewing the evidence for this before it is described. Nothing is shown until they finish.' },
  NOT_MEASURED: { title: 'Not yet measured', body: 'No completed assessment in this workspace has measured this capability.' },
}

export default function CapabilityDetailPage() {
  const { capabilityId } = useParams()
  const { active } = useWorkspace()
  const query = useCapabilityDetail(capabilityId)
  const [openEvidence, setOpenEvidence] = useState(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const state = queryStateView(query, { label: 'Loading this capability', homeTo: '/app/capabilities' })
  if (state) {
    if (query.error?.status === 404 || query.error?.code === 'NOT_FOUND') {
      return (
        <div>
          <PageHeader title="Capability" context={active} breadcrumbs={crumbs('Not available')} />
          <EmptyState title="This capability is not available" description="It may not be part of your profile, or the link may be out of date." action={<LinkButton to="/app/capabilities" variant="secondary">Back to capabilities</LinkButton>} headingLevel={2} />
        </div>
      )
    }
    return <div><PageHeader title="Capability" context={active} breadcrumbs={crumbs('Capability')} />{state}</div>
  }
  const cap = query.data
  const title = cap.displayLabel || cap.name
  const snap = cap.latestSnapshot
  const described = cap.state === 'DESCRIBED' || cap.state === 'STRETCH'
  const single = STATE_COPY[cap.state] || null
  const reasons = [...new Set((cap.statusReasons || []).map(reasonText))]
  const corrected = snap?.reason === 'REVIEW_CORRECTION'
  const scopeLabel = snap?.scope === 'SPONSORED' ? `Sponsored by ${active.organizationName || active.name || 'your institution'}` : 'Personal assessment'
  const boundedAsMoment = cap.boundedObservation && {
    ...cap.boundedObservation,
    basis: 'BOUNDED',
    capability: { ...cap.boundedObservation.capability, displayLabel: cap.displayLabel || null },
    context: `${snap?.assessmentTitle || 'Your assessment'}${Number.isInteger(cap.boundedObservation.source?.turn) ? `, exchange ${cap.boundedObservation.source.turn}` : ''}`,
    evidenceStatus: 'PROVISIONAL',
  }

  return (
    <div className="space-y-6">
      <PageHeader title={title} description={cap.displayLabel ? cap.name : undefined} context={active} breadcrumbs={crumbs(title)} />
      <Card as="article" className="space-y-6 p-6" aria-label={title} data-testid="capability-detail" data-state={cap.state}>
        <Section id="cap-meaning" title="What this means">
          <p className="text-prism-ink">{cap.definition}</p>
          {snap && <p className="mt-1">Observed in {snap.assessmentTitle || 'your assessment'}{formatDate(snap.completedAt) ? `, completed ${formatDate(snap.completedAt)}` : ''}. It describes what you did there, not who you are.</p>}
        </Section>

        <Section id="cap-level" title="What the evidence supports">
          {described ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2" data-testid="capability-level-row">
                <CapabilityLevelBadge level={cap.level} provisional={cap.status === 'PROVISIONAL'} />
                <CapabilityEvidenceChip status={cap.status} />
                {cap.review.pending && <StatusChip tone="partial" label={REPORT_COPY.reviewPending} />}
              </div>
              {cap.levelDescriptor && <p className="text-prism-ink">{cap.levelDescriptor}</p>}
              <p>{cap.evidenceSummary.text}</p>
            </div>
          ) : (
            <div data-testid="capability-single-state">
              <Callout tone={cap.state === 'UNDER_REVIEW' ? 'partial' : 'insufficient'} title={single?.title}>
                <p>{single?.body}</p>
                {cap.review.pending && <p className="mt-1">{REPORT_COPY.reviewPending}.</p>}
              </Callout>
            </div>
          )}
        </Section>

        {(cap.moments.length > 0 || boundedAsMoment || cap.evidence.length > 0) && (
          <Section id="cap-moments" title={cap.state === 'BOUNDED_ONLY' ? 'The moment that was observed' : 'What you did'} className="space-y-3">
            <p>Quotes are your exact words from the assessment, with where they happened.</p>
            {cap.moments.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {cap.moments.map((m) => <MomentCard key={m.id} moment={m} sessionId={snap?.sessionId} onOpen={setOpenEvidence} headingLevel={3} />)}
              </div>
            ) : boundedAsMoment ? (
              <MomentCard moment={boundedAsMoment} sessionId={snap?.sessionId} onOpen={setOpenEvidence} headingLevel={3} />
            ) : (
              <div className="space-y-3">
                {cap.evidence.map((e) => <EvidenceCard key={e.id} item={e} headingLevel={3} onOpen={() => setOpenEvidence(e)} />)}
              </div>
            )}
          </Section>
        )}

        {cap.nextBehavior && (
          <Section id="cap-next" title="A next behaviour">
            <p className="text-prism-ink" data-testid="capability-next-behaviour">{cap.nextBehavior}</p>
            {cap.whyItMatters && <p className="mt-1"><span className="font-medium text-prism-ink">Why it matters: </span>{cap.whyItMatters}</p>}
          </Section>
        )}

        {cap.recommendation && (
          <Section id="cap-practice" title="Practice">
            <RecommendationCard recommendation={cap.recommendation} headingLevel={3} />
          </Section>
        )}

        <Section id="cap-scope" title="Scope and limits">
          <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[max-content_1fr]">
            <dt className="font-medium text-prism-ink">Based on</dt>
            <dd>{snap ? `${snap.assessmentTitle || 'Assessment'}${formatDate(snap.completedAt) ? `, ${formatDate(snap.completedAt)}` : ''} · ${scopeLabel}` : 'Not measured yet'}</dd>
            {snap?.version && <><dt className="font-medium text-prism-ink">Report version</dt><dd>{snap.version}{corrected ? ` · ${REPORT_COPY.versionReasons.REVIEW_CORRECTION}` : ''}</dd></>}
            <dt className="font-medium text-prism-ink">Earlier observations</dt>
            <dd>{cap.history.length > 1 ? `${cap.history.length - 1} earlier ${cap.history.length - 1 === 1 ? 'assessment' : 'assessments'} measured this` : 'None'}</dd>
          </dl>
          {cap.limitation && <p className="mt-2" data-testid="capability-limitation">{cap.limitation}</p>}
          <p className="mt-2">{REPORT_COPY.growthLine} <Link to="/app/growth" className="font-medium text-prism-accent-strong underline">{REPORT_COPY.growthLink}</Link></p>
          <details className="mt-3 rounded-[var(--prism-radius-md)] border border-prism-border p-3" data-testid="capability-details">
            <summary className="cursor-pointer text-sm font-medium text-prism-ink">Details</summary>
            <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[max-content_1fr]">
              <dt className="font-medium">Capability id</dt><dd>{cap.id}</dd>
              <dt className="font-medium">Evidence state</dt><dd>{cap.status}</dd>
              {reasons.length > 0 && <><dt className="font-medium">Reasons</dt><dd>{reasons.join('; ')}</dd></>}
              {snap?.methodVersion && <><dt className="font-medium">Method</dt><dd>{snap.methodVersion}{snap.sufficiencyRulesVersion ? ` · ${snap.sufficiencyRulesVersion}` : ''}</dd></>}
              {snap?.formId && <><dt className="font-medium">Assessment form</dt><dd>{snap.formId}</dd></>}
              {snap?.sessionId && <><dt className="font-medium">Session</dt><dd>{snap.sessionId}</dd></>}
              <dt className="font-medium">Level names</dt><dd>{cap.levelLabelsStatus}</dd>
            </dl>
          </details>
        </Section>

        {snap && (
          <div className="flex flex-wrap items-center gap-2">
            {cap.layer === 'CONTEXTUAL' && <Badge tone="neutral">Role-specific</Badge>}
            <Button variant="secondary" size="sm" onClick={() => setReviewOpen(true)}>{REPORT_COPY.reviewOpen}</Button>
            <LinkButton variant="ghost" size="sm" to={`/app/reports/${encodeURIComponent(snap.sessionId)}`}>Open the full report</LinkButton>
          </div>
        )}
      </Card>

      {cap.history.length > 1 && (
        <Card className="space-y-3">
          <Section id="cap-timeline" title="Evidence over time">
            <EvidenceTimeline entries={cap.history.map((h) => ({ id: h.sessionId, title: h.assessmentTitle, date: h.completedAt, level: h.level, status: h.status }))} />
          </Section>
        </Card>
      )}

      <EvidenceDetailDrawer item={openEvidence} onClose={() => setOpenEvidence(null)} />
      {snap && (
        <InterpretationReviewDialog
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          sessionId={snap.sessionId}
          version={snap.version || undefined}
          moments={cap.moments}
          capability={{ id: cap.id, name: cap.name, displayLabel: cap.displayLabel || null }}
        />
      )}
    </div>
  )
}
