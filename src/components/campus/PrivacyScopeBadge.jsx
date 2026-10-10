import { Lock, Building2 } from 'lucide-react'
import { StatusChip } from '../ui/Badge.jsx'
import { PERSONAL_PRIVACY_NOTE, SPONSORED_PRIVACY_NOTE } from '../../lib/copy/privacy.js'
import { EMPLOYER_SPONSORED_NOTE } from '../../lib/copy/employer.js'

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
  // PROD-READY Phase 9: an employer sees group summaries only.
  const employer = workspace.organizationType === 'EMPLOYER'
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-prism-ink-muted" title={employer ? EMPLOYER_SPONSORED_NOTE(org) : SPONSORED_PRIVACY_NOTE(org)}>
      <Building2 size={14} aria-hidden="true" />
      <StatusChip tone="accent" label={employer ? `Summaries to ${org}` : `Visible to ${org}`} />
    </span>
  )
}

export default PrivacyScopeBadge
