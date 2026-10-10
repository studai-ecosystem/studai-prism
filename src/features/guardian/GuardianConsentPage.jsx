// /guardian-consent/:token — a parent or guardian agrees (or not) before a
// learner under 18 can take a Prism assessment (PROD-READY Phase 8). DARK:
// the server answers 404 unless PRISM_UNDER18_PATH is on, and this page then
// says the link is not available. All text is DRAFT pending HA-006 / HA-005;
// the consent text itself is served with the record it belongs to.
import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Skeleton } from '../../components/ui/Skeleton.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { InlineNotice } from '../../components/ui/Notice.jsx'
import { DocumentTitle } from '../../components/ui/DocumentTitle.jsx'
import { ErrorState } from '../../components/states/index.js'
import PrismLogo from '../../components/ui/PrismLogo.jsx'
import { fetchGuardianConsent, decideGuardianConsent, withdrawGuardianConsent } from '../../api/guardian.js'
import { GUARDIAN_PAGE_COPY as C } from '../../lib/copy/guardianConsent.js'

const STATE_TEXT = { VERIFIED: C.verified, DECLINED: C.declined, WITHDRAWN: C.withdrawn, EXPIRED: C.expired }

export default function GuardianConsentPage() {
  const { token } = useParams()
  const qc = useQueryClient()
  const key = ['guardian-consent', token]
  const query = useQuery({ queryKey: key, queryFn: () => fetchGuardianConsent(token), retry: false })
  const refresh = () => qc.invalidateQueries({ queryKey: key })
  const decide = useMutation({ mutationFn: (decision) => decideGuardianConsent(token, decision), onSettled: refresh })
  const withdraw = useMutation({ mutationFn: () => withdrawGuardianConsent(token), onSettled: refresh })
  // The token is in this page's URL: never send it onward as a referrer.
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'referrer'
    meta.content = 'no-referrer'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  let body
  if (query.isPending) body = <Skeleton label="Loading the request" lines={5} />
  else if (query.error) {
    body = query.error.status === 404
      ? <ErrorState title={C.invalid} description={C.invalidBody} />
      : <ErrorState title={C.failed} requestId={query.error.requestId} onRetry={() => query.refetch()} />
  } else {
    const { consent, copy, learnerName } = query.data
    const busy = decide.isPending || withdraw.isPending
    body = (
      <section aria-labelledby="guardian-copy-title" className="space-y-4 rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-surface p-5">
        <InlineNotice tone="partial">{copy.draftNotice}</InlineNotice>
        <h2 id="guardian-copy-title" className="text-lg font-semibold text-prism-ink">{copy.title}</h2>
        <p className="text-sm text-prism-ink-subtle">{C.learner(learnerName)}</p>
        {[copy.intro, copy.whatPrismIs, copy.whatIsCollected, copy.whoSees, copy.withdraw, copy.deletion].map((t) => <p key={t} className="text-sm text-prism-ink">{t}</p>)}
        {(decide.isError || withdraw.isError) && <InlineNotice tone="blocked">{C.failed}</InlineNotice>}
        {consent.status === 'PENDING' ? (
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => decide.mutate('GRANT')} disabled={busy}>{copy.grant}</Button>
            <Button variant="secondary" onClick={() => decide.mutate('DECLINE')} disabled={busy}>{copy.decline}</Button>
          </div>
        ) : (
          <p role="status" className="text-sm font-medium text-prism-ink">{STATE_TEXT[consent.status] || ''}</p>
        )}
        {consent.status === 'VERIFIED' && <Button variant="secondary" onClick={() => withdraw.mutate()} disabled={busy}>{C.withdraw}</Button>}
      </section>
    )
  }
  return (
    <div className="prism-app min-h-screen bg-prism-canvas">
      <DocumentTitle title={C.title} />
      <header className="border-b border-prism-border bg-prism-surface px-4 py-3">
        <PrismLogo />
      </header>
      <main id="main" className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        <h1 id="page-title" tabIndex={-1} className="text-2xl font-semibold text-prism-ink focus:outline-none">{C.title}</h1>
        {body}
      </main>
    </div>
  )
}
