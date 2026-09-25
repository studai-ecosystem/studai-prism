import { PageHeader } from '../../../components/ui/PageHeader.jsx'
import { EmptyState } from '../../../components/states/EmptyState.jsx'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { EMPTY_COPY } from '../../../lib/copy/emptyStates.js'

export default function CampusOverviewPage() {
  const { active } = useWorkspace()
  return (
    <div>
      <PageHeader title="Overview" description="Participation and evidence across your institution." context={active} />
      <EmptyState title={EMPTY_COPY.campusCohort.title} description={EMPTY_COPY.campusCohort.description} />
    </div>
  )
}
