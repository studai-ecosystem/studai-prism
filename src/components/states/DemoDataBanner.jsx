import { FlaskConical } from 'lucide-react'
import { useDemoData } from '../../app/providers/FeatureFlagProvider.jsx'

// PROD-READY Phase 8: persistent banner on every screen while the signed-in
// account belongs to a synthetic demo organization (organizations.is_demo,
// migration 0061). Demo accounts can only belong to demo organizations, so the
// banner shows on student, campus admin and report screens alike. It cannot be
// dismissed: nobody should mistake generated data for real results.
export const DEMO_BANNER_TITLE = 'Demo data.'
export const DEMO_BANNER_MESSAGE = 'Everything on this screen is synthetic: generated names, responses and numbers, not real students or results.'

export function DemoDataBanner({ demo }) {
  const fromAccount = useDemoData()
  if (!(demo ?? fromAccount)) return null
  return (
    <div
      role="note"
      aria-label="Demo data"
      data-testid="demo-data-banner"
      className="flex items-center gap-2 border-b border-prism-partial-soft bg-prism-partial-soft px-4 py-2 text-sm text-prism-ink"
    >
      <FlaskConical size={16} aria-hidden="true" className="shrink-0 text-prism-partial" />
      <span><strong className="font-semibold">{DEMO_BANNER_TITLE}</strong> {DEMO_BANNER_MESSAGE}</span>
    </div>
  )
}

export default DemoDataBanner
