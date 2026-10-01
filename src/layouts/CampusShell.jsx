import { useParams } from 'react-router-dom'
import { AppShell } from './AppShell.jsx'
import { campusNavFor } from '../components/navigation/navConfig.js'
import { useWorkspace } from '../app/providers/WorkspaceProvider.jsx'
import { STUDENT_NAV_FOOTER } from '../components/navigation/navConfig.js'

// Campus administration shell (spec §19.1). Navigation is filtered by the
// permissions the server returned for the active campus workspace.
export function CampusShell({ children }) {
  const { organizationId } = useParams()
  const { active } = useWorkspace()
  const items = campusNavFor(organizationId, active.permissions || [])
  const footer = STUDENT_NAV_FOOTER.filter((i) => i.id === 'help')
  return (
    <AppShell navLabel="Campus administration" items={items} footerItems={footer}>
      {children}
    </AppShell>
  )
}

export default CampusShell
