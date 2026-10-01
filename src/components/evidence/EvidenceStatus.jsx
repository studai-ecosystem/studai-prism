import { Badge } from '../ui/Badge.jsx'
import { EvidenceSufficiencyBadge } from './EvidenceSufficiencyBadge.jsx'

// What kind of evidence this is and how much of it there is. Practice
// evidence is only ever labelled as practice and carries no sufficiency.
export function EvidenceStatus({ kind = 'FORMAL', status, reasons = [] }) {
  const practice = kind === 'PRACTICE'
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Badge tone={practice ? 'neutral' : 'accent'}>{practice ? 'Practice evidence' : 'Formal assessment'}</Badge>
      {!practice && <EvidenceSufficiencyBadge status={status} reasons={reasons} />}
    </span>
  )
}

export default EvidenceStatus