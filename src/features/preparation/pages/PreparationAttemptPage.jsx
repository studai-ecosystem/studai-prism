// /app/prepare/:attemptId (P7). One private preparation: confirm the
// sanitized situation, rehearse untimed, then the action card.
import { useParams } from 'react-router-dom'
import { PageHeader } from '../../../components/ui/PageHeader.jsx'
import { Panel } from '../../../components/ui/Card.jsx'
import { Button, LinkButton } from '../../../components/ui/Button.jsx'
import { Callout, InlineNotice } from '../../../components/ui/Notice.jsx'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { queryStateView } from '../../student/QueryState.jsx'
import { PREPARATION_COPY } from '../../../lib/copy/student.js'
import { usePreparation, usePreparationActions } from '../hooks.js'
import { RehearsalView } from '../components/RehearsalView.jsx'
import { ActionCardView } from '../components/ActionCardView.jsx'

export default function PreparationAttemptPage() {
  const { attemptId } = useParams()
  const { active } = useWorkspace()
  const query = usePreparation(attemptId)
  const actions = usePreparationActions()
  const header = <PageHeader title="Prepare" description={PREPARATION_COPY.privateLabel} context={active} />
  const state = queryStateView(query, { label: 'Loading your preparation', homeTo: '/app/prepare' })
  if (state) return <div>{header}{state}</div>
  const attempt = query.data
  return (
    <div className="space-y-6">
      {header}
      {attempt.state === 'DRAFT' && (
        <Panel title="Confirm the situation first" description="This is the sanitized text the rehearsal will use.">
          <dl className="space-y-2 text-sm">
            <div><dt className="text-prism-ink-muted">Situation</dt><dd className="font-medium text-prism-ink">{attempt.situationLabel}</dd></div>
            <div><dt className="text-prism-ink-muted">Counterpart</dt><dd className="text-prism-ink">{attempt.intent.audience}</dd></div>
            <div><dt className="text-prism-ink-muted">Goal</dt><dd className="text-prism-ink">{attempt.intent.goal}</dd></div>
            {attempt.intent.constraints && <div><dt className="text-prism-ink-muted">Constraints</dt><dd className="text-prism-ink">{attempt.intent.constraints}</dd></div>}
          </dl>
          {actions.confirm.error && <InlineNotice tone="blocked" className="mt-3">{actions.confirm.error.message}</InlineNotice>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => actions.confirm.mutate({ id: attempt.id, edits: null })} loading={actions.confirm.isPending} loadingLabel="Starting…">Confirm and start rehearsal</Button>
            <LinkButton to="/app/prepare" variant="ghost">Back</LinkButton>
          </div>
        </Panel>
      )}
      {attempt.state === 'REHEARSING' && <RehearsalView attempt={attempt} actions={actions} />}
      {attempt.state === 'COMPLETED' && <ActionCardView attempt={attempt} checkin={actions.checkin} />}
      {attempt.state === 'ABANDONED' && (
        <>
          <Callout tone="insufficient" title="This preparation was stopped">No card was written. What you wrote in the rehearsal is kept.</Callout>
          <LinkButton to="/app/prepare" variant="secondary">Back</LinkButton>
        </>
      )}
    </div>
  )
}
