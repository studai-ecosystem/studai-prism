import { Lock, Building2 } from 'lucide-react'
import { StatusChip } from '../ui/Badge.jsx'
import { PERSONAL_PRIVACY_NOTE, SPONSORED_PRIVACY_NOTE } from '../../lib/copy/privacy.js'

// Who can see data in the current workspace (spec §4.3, §7.1). Text + icon,
// never colour alone.
export function PrivacyScopeBadge({ workspace }) {
  if (!workspace || workspace.type === 'PERSONAL') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-prism-ink-muted" title={PERSONAL_PRIVACY_NOTE}>
        <Lock size={14} aria-hidden="true" />
        <StatusChip tone="neutral" label="Private to you" />
      </span>
    )
  }
  const org = workspace.organizationName || workspace.name
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-prism-ink-muted" title={SPONSORED_PRIVACY_NOTE(org)}>
      <Building2 size={14} aria-hidden="true" />
      <StatusChip tone="accent" label={`Visible to ${org}`} />
    </span>
  )
}

export default PrivacyScopeBadge
