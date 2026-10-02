import { useEffect } from 'react'
import { Outlet, useParams } from 'react-router-dom'
import { AppShell } from './AppShell.jsx'
import { SponsoredByCard } from '../components/campus/SponsoredByCard.jsx'
import { PreferencesEffect } from '../features/settings/PreferencesEffect.jsx'
import { Skeleton } from '../components/ui/Skeleton.jsx'
import { STUDENT_NAV_FOOTER, STUDENT_BOTTOM_NAV, CAMPUS_STUDENT_NAV, studentNavFor } from '../components/navigation/navConfig.js'
import { useWorkspace, PERSONAL_FALLBACK } from '../app/providers/WorkspaceProvider.jsx'
import { useFeatureFlags } from '../app/providers/FeatureFlagProvider.jsx'

// Personal + campus-student application shell. Inside a campus student
// workspace only the sponsored sections (spec §6.3) are offered, scoped to the
// organization; personal routes always run in the PERSONAL workspace so the
// two datasets are never mixed (spec §4.3).
export function StudentShell({ children }) {
  const { organizationId } = useParams()
  const { active, switchTo } = useWorkspace()
  const { flags } = useFeatureFlags()

  useEffect(() => {
    if (!organizationId && active.type !== 'PERSONAL') switchTo(PERSONAL_FALLBACK.id)
  }, [organizationId, active.type, switchTo])

  const campusScope = (items) => items.map((i) => ({ ...i, to: `/app/campus/${organizationId}/${i.to}` }))

  const items = organizationId ? campusScope(CAMPUS_STUDENT_NAV) : studentNavFor(flags)
  const bottom = organizationId ? campusScope(CAMPUS_STUDENT_NAV) : STUDENT_BOTTOM_NAV
  const footer = organizationId ? STUDENT_NAV_FOOTER.filter((i) => i.id === 'help') : STUDENT_NAV_FOOTER
  // Never render a personal page while another workspace is still active:
  // its first queries would carry the wrong workspace header.
  const switching = !organizationId && active.type !== 'PERSONAL'

  return (
    <AppShell navLabel="Primary" items={items} footerItems={footer} bottomItems={bottom}>
      <PreferencesEffect />
      {organizationId && active.type === 'CAMPUS_STUDENT' && <SponsoredByCard organizationName={active.organizationName || active.name} />}
      {switching ? <Skeleton label="Switching to your personal workspace" /> : (children || <Outlet />)}
    </AppShell>
  )
}

export default StudentShell
