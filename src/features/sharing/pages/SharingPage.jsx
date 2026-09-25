// /app/sharing (spec §14.5, §36): everything you have shared, with its
// recipient, what it covers, when it expires — and revoke. Creating a share
// happens from a report (Phase 6).
import { useState } from 'react'
import { PageHeader } from '../../../components/ui/PageHeader.jsx'
import { Card } from '../../../components/ui/Card.jsx'
import { StatusChip } from '../../../components/ui/Badge.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { Modal } from '../../../components/ui/Modal.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'
import { useToast } from '../../../components/ui/Toast.jsx'
import { EmptyState } from '../../../components/states/index.js'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { useShareGrants, useRevokeShareGrant } from '../../student/hooks.js'
import { queryStateView, formatDate } from '../../student/QueryState.jsx'
import { EMPTY_COPY } from '../../../lib/copy/emptyStates.js'

const STATUS = { ACTIVE: { tone: 'positive', label: 'Active' }, EXPIRED: { tone: 'insufficient', label: 'Expired' }, REVOKED: { tone: 'neutral', label: 'Revoked' } }
const RESOURCE = { ASSESSMENT_REPORT: 'Assessment report', CAPABILITY_PROFILE: 'Capability profile', EVIDENCE_ITEM: 'Evidence item' }
const LEVEL = { SUMMARY: 'summary', FULL: 'full detail' }

function recipientLabel(g) {
  return g.recipient.type === 'ORGANIZATION' ? g.recipient.organizationName || 'An institution' : 'Anyone with the link'
}

export default function SharingPage() {
  const { active } = useWorkspace()
  const toast = useToast()
  const grants = useShareGrants()
  const revoke = useRevokeShareGrant()
  const [confirming, setConfirming] = useState(null)

  const header = <PageHeader title="Sharing" description="You decide who sees your results and for how long. Revoking takes effect immediately." context={active} />
  const state = queryStateView(grants, { label: 'Loading what you have shared' })
  if (state) return <div>{header}{state}</div>
  const items = grants.data.items

  const doRevoke = () => {
    const g = confirming
    revoke.mutate(g.id, {
      onSuccess: () => {
        setConfirming(null)
        toast.show(`Access for ${recipientLabel(g)} revoked`)
      },
    })
  }

  return (
    <div className="space-y-6">
      {header}
      {items.length === 0 ? (
        <EmptyState title={EMPTY_COPY.sharing.title} description={EMPTY_COPY.sharing.description} headingLevel={2} />
      ) : (
        <ul className="space-y-3">
          {items.map((g) => {
            const s = STATUS[g.status]
            return (
              <li key={g.id}>
                <Card as="article" className="flex flex-wrap items-start justify-between gap-3 p-4" aria-label={`Shared with ${recipientLabel(g)}`}>
                  <div className="min-w-0 space-y-1">
                    <h2 className="text-sm font-semibold text-prism-ink">{recipientLabel(g)}</h2>
                    <ul className="text-sm text-prism-ink-muted">
                      {g.resources.map((r) => <li key={`${r.resourceType}:${r.resourceId}`}>{RESOURCE[r.resourceType] || 'Result'} — {LEVEL[r.disclosureLevel]}</li>)}
                    </ul>
                    <p className="text-xs text-prism-ink-subtle">
                      Shared {formatDate(g.createdAt)} · {g.status === 'REVOKED' ? `Revoked ${formatDate(g.revokedAt)}` : `${g.status === 'EXPIRED' ? 'Expired' : 'Expires'} ${formatDate(g.expiresAt)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusChip tone={s.tone} label={s.label} />
                    {g.status === 'ACTIVE' && <Button variant="secondary" size="sm" onClick={() => setConfirming(g)}>Revoke<span className="sr-only"> access for {recipientLabel(g)}</span></Button>}
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
      <Modal
        open={Boolean(confirming)}
        onClose={() => setConfirming(null)}
        title="Revoke access?"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setConfirming(null)}>Cancel</Button>
            <Button variant="primary" disabled={revoke.isPending} onClick={doRevoke}>{revoke.isPending ? 'Revoking…' : 'Revoke access'}</Button>
          </>
        )}
      >
        <p className="text-sm text-prism-ink">{confirming ? `${recipientLabel(confirming)} will no longer be able to see what you shared.` : ''}</p>
        {revoke.error && <Callout tone="blocked" role="alert" title="We could not revoke this share">{revoke.error.message}</Callout>}
      </Modal>
    </div>
  )
}
