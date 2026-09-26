// Campus sections whose phase has not shipped yet: an honest page instead of
// a redirect or invented content.
import { LinkButton } from '../../../components/ui/Button.jsx'
import { EmptyState } from '../../../components/states/EmptyState.jsx'
import { CampusPage } from '../components/CampusPage.jsx'
import { useCampusOrg } from '../hooks.js'

export default function CampusNotYetAvailablePage({ title }) {
  const { orgId } = useCampusOrg()
  return (
    <CampusPage title={title}>
      <EmptyState
        title="Not available yet"
        description="This part of Prism Campus is still being built. Nothing is missing from your data."
        action={<LinkButton to={`/campus/${orgId}/overview`}>Back to overview</LinkButton>}
      />
    </CampusPage>
  )
}
