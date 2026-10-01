import { Button } from '../ui/Button.jsx'
import { cx } from '../../lib/cx.js'
import { EvidenceStatus } from './EvidenceStatus.jsx'
import { EvidenceThread } from './EvidenceThread.jsx'
import { EvidenceQuote } from './EvidenceQuote.jsx'
import { EvidenceSource } from './EvidenceSource.jsx'

export function evidenceSteps(item, audience = 'OWNER') {
  const owner = audience === 'OWNER'
  const action = item.candidateAction
  return [
    {
      label: owner ? 'What you did' : 'What the student did',
      value: action?.quote
        ? <EvidenceQuote quote={action.quote} caption={owner ? 'Your words' : 'The student\u2019s words'} />
        : action?.artifactId ? 'Worked in a scenario document' : action?.turn != null ? `${owner ? 'Your' : 'Their'} reply at exchange ${action.turn}` : null,
    },
    { label: 'Observed behaviour', value: item.observedBehavior },
    { label: 'Capability', value: item.capability?.name },
    { label: 'Described behaviour at this level', value: item.rubricAnchor?.criteria },
  ]
}

// One piece of evidence, connected end to end. Practice evidence is dashed and
// labelled so it can never be mistaken for formal assessment evidence.
export function EvidenceCard({ item, headingLevel = 3, dateLabel, onOpen, audience = 'OWNER', children }) {
  const H = `h${headingLevel}`
  const practice = item.kind === 'PRACTICE'
  return (
    <article
      className={cx('rounded-[var(--prism-radius-lg)] border bg-prism-surface p-4', practice ? 'border-dashed border-prism-border' : 'border-prism-border')}
      data-kind={item.kind}
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <H className="text-sm font-semibold text-prism-ink">{item.capability?.name || 'Evidence'}</H>
        <EvidenceStatus kind={item.kind} status={item.evidenceStatus} />
      </header>
      <EvidenceThread steps={evidenceSteps(item, audience)} />
      <p className="mt-3 text-xs text-prism-ink-subtle">
        <EvidenceSource label="Source" title={item.assessmentTitle} where={item.provenance?.source === 'WORK_MATERIAL' ? 'Work material' : item.provenance?.turn != null ? `Exchange ${item.provenance.turn}` : null} />
        {dateLabel && <> &middot; {dateLabel}</>}
      </p>
      {children}
      {onOpen && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={onOpen} aria-label={`Details for ${item.capability?.name || 'this evidence'}`}>
          Details
        </Button>
      )}
    </article>
  )
}

export default EvidenceCard