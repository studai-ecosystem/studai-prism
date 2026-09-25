import { StatusChip } from '../ui/Badge.jsx'
import { statusCopy, reasonText } from '../../lib/copy/evidence.js'

// Evidence sufficiency for one capability (spec §33). Unknown or missing
// status renders as insufficient — gray, never red, never a number.
export function EvidenceSufficiencyBadge({ status, reasons = [], className }) {
  const { label, tone } = statusCopy(status)
  const explanation = reasons.length > 0 ? reasons.map(reasonText).join(' ') : undefined
  return (
    <span className={className} title={explanation} data-status={status || 'INSUFFICIENT_EVIDENCE'}>
      <StatusChip tone={tone} label={label} />
      {explanation && <span className="sr-only">{explanation}</span>}
    </span>
  )
}

export default EvidenceSufficiencyBadge
