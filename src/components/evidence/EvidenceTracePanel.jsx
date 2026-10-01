import { EvidenceCard } from './EvidenceCard.jsx'

// Evidence trace (spec 15). Kept as the name pages already import; the
// markup lives in EvidenceCard.
export function EvidenceTracePanel(props) {
  return <EvidenceCard {...props} />
}

export default EvidenceTracePanel