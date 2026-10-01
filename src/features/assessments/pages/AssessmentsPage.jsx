// /app/assessments and /app/campus/:organizationId/assignments (spec §10).
// Active / Completed / Upcoming; every card states personal or sponsored.
import { useState } from 'react'
import { PageHeader } from '../../../components/ui/PageHeader.jsx'
import { Tabs } from '../../../components/ui/Tabs.jsx'
import { LinkButton } from '../../../components/ui/Button.jsx'
import { EmptyState } from '../../../components/states/index.js'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { useStudentAssessments } from '../../student/hooks.js'
import { queryStateView } from '../../student/QueryState.jsx'
import { AssessmentAssignmentCard } from '../components/AssessmentAssignmentCard.jsx'
import { ASSESSMENT_TABS_EMPTY } from '../../../lib/copy/student.js'
import { START_ASSESSMENT_PATH } from '../../../lib/copy/emptyStates.js'

function List({ items, empty, action }) {
  if (items.length === 0) return <EmptyState title={empty.title} description={empty.description} action={action} headingLevel={2} />
  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {items.map((a) => <li key={a.id}><AssessmentAssignmentCard assignment={a} headingLevel={2} /></li>)}
    </ul>
  )
}

export default function AssessmentsPage() {
  const { active } = useWorkspace()
  const [tab, setTab] = useState('active')
  const query = useStudentAssessments()
  const personal = active.type === 'PERSONAL'
  const description = personal ? 'Assessments you bought or were given. Only you can see these results.' : 'Assessments your institution assigned to you.'
  const state = queryStateView(query, { label: 'Loading assessments' })
  if (state) return <div><PageHeader title="Assessments" description={description} context={active} />{state}</div>
  const { active: current, completed, upcoming } = query.data
  const startAction = personal ? <LinkButton to={START_ASSESSMENT_PATH} variant="primary">Start an assessment</LinkButton> : null
  return (
    <div>
      <PageHeader
        title="Assessments"
        description={description}
        context={active}
        actions={personal && current.length === 0 ? startAction : null}
      />
      <Tabs
        label="Assessments"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'active', label: `Active (${current.length})`, content: <List items={current} empty={ASSESSMENT_TABS_EMPTY.ACTIVE} action={startAction} /> },
          { id: 'completed', label: `Completed (${completed.length})`, content: <List items={completed} empty={ASSESSMENT_TABS_EMPTY.COMPLETED} /> },
          { id: 'upcoming', label: `Upcoming (${upcoming.length})`, content: <List items={upcoming} empty={ASSESSMENT_TABS_EMPTY.UPCOMING} /> },
        ]}
      />
    </div>
  )
}
