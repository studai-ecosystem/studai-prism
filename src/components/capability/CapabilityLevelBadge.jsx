import { StatusChip } from '../ui/Badge.jsx'
import { LEVEL_BAND_LABELS } from '../../lib/copy/evidence.js'

const BAND_TONES = { EARLY: 'neutral', DEVELOPING: 'neutral', DEMONSTRATED: 'accent', STRONG: 'accent' }

// A described capability level (band + label). No level → "Insufficient
// evidence" in gray. Never renders a numeric score or percentage.
export function CapabilityLevelBadge({ level, provisional = false, className }) {
  const band = level?.band
  if (!band || band === 'INSUFFICIENT' || !LEVEL_BAND_LABELS[band]) {
    return <StatusChip tone="insufficient" label="Insufficient evidence" className={className} />
  }
  const label = level.label || LEVEL_BAND_LABELS[band]
  return (
    <StatusChip
      tone={BAND_TONES[band]}
      label={provisional ? `${label} (provisional)` : label}
      className={className}
    />
  )
}

export default CapabilityLevelBadge
