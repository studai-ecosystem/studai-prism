import { Drawer } from '../ui/Drawer.jsx'
import { Button } from '../ui/Button.jsx'
import { EvidenceThread } from './EvidenceThread.jsx'
import { EvidenceStatus } from './EvidenceStatus.jsx'
import { EvidenceSource } from './EvidenceSource.jsx'
import { evidenceSteps } from './EvidenceCard.jsx'

const CLAIM = { SUPPORTED: 'Supported claim', PROVISIONAL: 'Provisional claim' }
const REVIEW = { AI_AND_HUMAN: 'Reviewed by AI and a person', AI: 'Reviewed by AI, not yet by a person' }

// The full record behind one piece of evidence, including how it was reviewed.
// Technical identifiers stay out of sight; only what a person can act on shows.
export function EvidenceDetailDrawer({ item, onClose, audience = 'OWNER' }) {
  return (
    <Drawer open={Boolean(item)} onClose={onClose} title={item?.capability?.name || 'Evidence'} footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      {item && (
        <div className="space-y-4 text-sm">
          <EvidenceStatus kind={item.kind} status={item.evidenceStatus} />
          <EvidenceThread steps={evidenceSteps(item, audience)} />
          <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[max-content_1fr]">
            <dt className="font-medium text-prism-ink">Source</dt>
            <dd className="text-prism-ink-muted"><EvidenceSource title={item.assessmentTitle} where={item.provenance?.turn != null ? `Exchange ${item.provenance.turn}` : null} /></dd>
            {item.claimStatus && <><dt className="font-medium text-prism-ink">Claim</dt><dd className="text-prism-ink-muted">{CLAIM[item.claimStatus] || 'Provisional claim'}</dd></>}
            {item.provenance?.reviewedBy && <><dt className="font-medium text-prism-ink">Review</dt><dd className="text-prism-ink-muted">{REVIEW[item.provenance.reviewedBy] || REVIEW.AI}</dd></>}
          </dl>
        </div>
      )}
    </Drawer>
  )
}

export default EvidenceDetailDrawer