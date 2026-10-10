// An employer section whose server flag is off: an honest page instead of a
// redirect or invented content (PROD-READY Phase 9).
import { LinkButton } from '../../../components/ui/Button.jsx'
import { EmptyState } from '../../../components/states/EmptyState.jsx'
import { EmployerPage } from '../components/EmployerPage.jsx'
import { useEmployerOrg } from '../hooks.js'

export default function EmployerNotAvailablePage({ title }) {
  const { orgId } = useEmployerOrg()
  return (
    <EmployerPage title={title}>
      <EmptyState
        title="Not available yet"
        description="This part of the workspace is not switched on yet. Nothing is missing from your data."
        action={<LinkButton to={`/employer/${orgId}/overview`}>Back to overview</LinkButton>}
      />
    </EmployerPage>
  )
}
