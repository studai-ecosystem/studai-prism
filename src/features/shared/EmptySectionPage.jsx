import { PageHeader } from '../../components/ui/PageHeader.jsx'
import { EmptyState } from '../../components/states/EmptyState.jsx'
import { LinkButton } from '../../components/ui/Button.jsx'
import { useWorkspace } from '../../app/providers/WorkspaceProvider.jsx'

// Honest page frame used while a section has no data source yet: a real
// header with the active context and an explanatory empty state — never
// sample or placeholder numbers.
export function EmptySectionPage({ title, description, empty, action }) {
  const { active } = useWorkspace()
  return (
    <div aria-labelledby="page-title">
      <PageHeader title={title} description={description} context={active} />
      <EmptyState
        title={empty.title}
        description={empty.description}
        action={action ? <LinkButton to={action.to} variant="primary">{action.label}</LinkButton> : null}
      />
    </div>
  )
}

export default EmptySectionPage
