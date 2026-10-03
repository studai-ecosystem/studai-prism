import { Card } from '../../../components/ui/Card.jsx'
import { Button, LinkButton } from '../../../components/ui/Button.jsx'
import { EvidenceQuote } from '../../../components/evidence/EvidenceQuote.jsx'
import { EvidenceStatus } from '../../../components/evidence/EvidenceStatus.jsx'
import { REPORT_COPY } from '../../../lib/copy/report.js'

// Turns a moment into the shape EvidenceDetailDrawer / EvidenceCard read, so
// "See the moment" opens the same evidence chain as everywhere else.
export function momentAsEvidence(m) {
  return {
    id: m.id,
    kind: 'FORMAL',
    capability: { id: m.capability.id, name: m.capability.displayLabel || m.capability.name },
    assessmentTitle: m.context,
    candidateAction: { quote: m.quote, turn: m.source.turn, artifactId: m.source.artifactId },
    observedBehavior: m.observedBehavior,
    rubricAnchor: m.rubricAnchor,
    evidenceStatus: m.evidenceStatus,
    claimStatus: m.evidenceStatus === 'SUFFICIENT' ? 'SUPPORTED' : 'PROVISIONAL',
    provenance: m.provenance,
  }
}

export function practiceHref(sessionId, moment) {
  return `/app/development?source=${encodeURIComponent(sessionId)}${moment?.source?.opportunityId ? `&moment=${encodeURIComponent(moment.source.opportunityId)}` : ''}`
}

// One moment that mattered (P5.5): action -> context -> what it showed, with
// the learner's exact words. A bounded moment is labelled as one observation,
// never a level. Nothing here is a judgement of the person.
export function MomentCard({ moment, sessionId, onOpen, audience = 'OWNER', headingLevel = 3 }) {
  const H = `h${headingLevel}`
  const owner = audience === 'OWNER'
  return (
    <Card className="flex h-full flex-col gap-3 p-4" data-testid="report-moment">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-prism-ink-muted">
          {moment.capability.displayLabel || moment.capability.name}
          {moment.basis === 'BOUNDED' && <> · {REPORT_COPY.momentBounded}</>}
        </p>
        <EvidenceStatus kind="FORMAL" status={moment.evidenceStatus} />
      </div>
      <H className="text-base font-semibold text-prism-ink">{moment.observedBehavior}</H>
      <p className="text-sm text-prism-ink-muted"><span className="font-medium text-prism-ink">Where: </span>{moment.context}</p>
      <EvidenceQuote quote={moment.quote} caption={owner ? 'Your words' : 'The student\u2019s words'} />
      {moment.rubricAnchor?.criteria && <p className="text-sm text-prism-ink-muted"><span className="font-medium text-prism-ink">The level this matched: </span>{moment.rubricAnchor.criteria}</p>}
      {moment.nextBehavior && <p className="text-sm text-prism-ink-muted"><span className="font-medium text-prism-ink">A next behaviour: </span>{moment.nextBehavior}</p>}
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {onOpen && <Button size="sm" variant="secondary" onClick={() => onOpen(momentAsEvidence(moment))} aria-label={`${REPORT_COPY.seeMoment}: ${moment.observedBehavior}`}>{REPORT_COPY.seeMoment}</Button>}
        {owner && moment.nextBehavior && <LinkButton size="sm" variant="ghost" to={practiceHref(sessionId, moment)} aria-label={`${REPORT_COPY.practiseThis}: ${moment.nextBehavior}`}>{REPORT_COPY.practiseThis}</LinkButton>}
      </div>
    </Card>
  )
}

export default MomentCard
