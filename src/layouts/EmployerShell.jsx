import { useParams } from 'react-router-dom'
import { AppShell } from './AppShell.jsx'
import { employerNavFor, STUDENT_NAV_FOOTER } from '../components/navigation/navConfig.js'
import { useWorkspace } from '../app/providers/WorkspaceProvider.jsx'
import { EMPLOYER_SHELL_LABEL } from '../lib/copy/employer.js'

// Employer development-use (L&D) shell (PROD-READY Phase 9; server-dark:
// PRISM_EMPLOYER_LND). The campus administration shell with the employer
// navigation, filtered by the permissions the server returned.
export function EmployerShell({ children }) {
  const { organizationId } = useParams()
  const { active } = useWorkspace()
  const items = employerNavFor(organizationId, active.permissions || [])
  const footer = STUDENT_NAV_FOOTER.filter((i) => i.id === 'help')
  return (
    <AppShell navLabel={EMPLOYER_SHELL_LABEL} items={items} footerItems={footer}>
      {children}
    </AppShell>
  )
}

export default EmployerShell
