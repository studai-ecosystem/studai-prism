import { PageHeader } from '../../../components/ui/PageHeader.jsx'
import { UnauthorizedState } from '../../../components/states/UnauthorizedState.jsx'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { EMPTY_COPY } from '../../../lib/copy/emptyStates.js'

// No assignment source exists until Phase 4, so every assignment id is
// honestly "not available" rather than a mocked briefing.
export default function AssignmentUnavailablePage({ title = 'Assessment briefing' }) {
  const { active } = useWorkspace()
  return (
    <div>
      <PageHeader title={title} context={active} breadcrumbs={[{ label: 'Assessments', to: '/app/assessments' }, { label: title }]} />
      <UnauthorizedState title={EMPTY_COPY.assignmentUnavailable.title} description={EMPTY_COPY.assignmentUnavailable.description} homeTo="/app/assessments" homeLabel="Back to assessments" />
    </div>
  )
}
