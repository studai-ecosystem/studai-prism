// /app/campus-invite/:token — join an institution without a second account
// (spec §37.2). Shows exactly what the institution can and cannot see, needs
// an explicit acknowledgement, then opens the new campus workspace.
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchOrgInvite, acceptOrgInvite, declineOrgInvite } from '../../../api/campus.js'
import { ME_QUERY_KEY } from '../../../app/providers/FeatureFlagProvider.jsx'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { useAuth } from '../../../app/providers/AuthProvider.jsx'
import { PublicLayout } from '../../../layouts/PublicLayout.jsx'
import { PageHeader, Button, Checkbox, Callout, Skeleton, LinkButton, useToast } from '../../../components/ui/index.js'
import { ErrorState } from '../../../components/states/index.js'
import { ConsentScopePanel } from '../../../components/campus/ConsentScopePanel.jsx'
import { ROLE_LABELS } from '../../../lib/copy/privacy.js'
import { homePathFor, workspaceLabel } from '../workspacePaths.js'

export default function CampusInvitePage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { workspaces, switchTo } = useWorkspace()
  const [acknowledged, setAcknowledged] = useState(false)
  const [target, setTarget] = useState(null)

  const invite = useQuery({ queryKey: ['org-invite', token], queryFn: () => fetchOrgInvite(token), retry: false })
  const accept = useMutation({
    mutationFn: () => acceptOrgInvite(token),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY })
      setTarget(result.workspaceId)
    },
  })
  const decline = useMutation({ mutationFn: () => declineOrgInvite(token) })

  // Once /me includes the new workspace, switch to it and land on its home.
  useEffect(() => {
    if (!target) return
    const ws = workspaces.find((w) => w.id === target)
    if (!ws) return
    switchTo(ws.id)
    toast.show(`Now viewing: ${workspaceLabel(ws)}`)
    navigate(homePathFor(ws), { replace: true })
  }, [target, workspaces, switchTo, toast, navigate])

  let body
  if (invite.isPending) {
    body = <Skeleton label="Loading the invitation" lines={5} />
  } else if (invite.error) {
    body = invite.error.status === 404
      ? <ErrorState title="This invitation is not valid" description="It may have been withdrawn. Ask your institution for a new link." action={<LinkButton to="/app">Go to Prism</LinkButton>} />
      : <ErrorState title="We could not load this invitation" requestId={invite.error.requestId} onRetry={() => invite.refetch()} />
  } else if (decline.isSuccess) {
    body = <Callout tone="info" title="Invitation declined">Nothing was shared. You can close this page.</Callout>
  } else {
    const inv = invite.data
    const org = inv.organizationName
    const closed = inv.expired || inv.status === 'DECLINED'
    body = (
      <div className="space-y-6">
        <PageHeader
          title={`Join ${org} on Prism`}
          description={`You have been invited as: ${ROLE_LABELS[inv.role] || inv.role}. You will use your existing Prism account${user?.email ? ` (${user.email})` : ''} — no new account is created.`}
        />
        {inv.expired && <Callout tone="partial" title="This invitation has expired">Ask your institution to send a new one.</Callout>}
        {inv.emailHint && <p className="text-sm text-prism-ink-muted">This invitation was sent to {inv.emailHint}.</p>}
        <ConsentScopePanel organizationName={org} />
        <p className="text-sm text-prism-ink-muted">You can see and revoke anything you choose to share from Sharing in your personal workspace.</p>
        {!closed && (
          <>
            <Checkbox
              id="ack"
              label={`I have read what ${org} can and cannot see`}
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            {accept.error && (
              <Callout tone="blocked" role="alert" title="We could not accept this invitation">
                {accept.error.message}
              </Callout>
            )}
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => accept.mutate()} disabled={!acknowledged} loading={accept.isPending || Boolean(target)} loadingLabel="Joining…">
                Accept and join
              </Button>
              <Button variant="secondary" onClick={() => decline.mutate()} loading={decline.isPending} loadingLabel="Declining…">
                Decline
              </Button>
            </div>
            {decline.error && <p role="alert" className="text-sm text-prism-blocked">{decline.error.message}</p>}
          </>
        )}
      </div>
    )
  }

  return <PublicLayout>{body}</PublicLayout>
}
