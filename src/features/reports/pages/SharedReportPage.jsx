// /shared/:token — a report the student chose to share by private link
// (spec §14.5, §36.3). Public, read-only, and limited to what the student
// allowed (summary or full). The token stays in the URL only; it is never
// logged by the server and never stored by the browser.
import { useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Skeleton } from '../../../components/ui/Skeleton.jsx'
import { DocumentTitle } from '../../../components/ui/DocumentTitle.jsx'
import { ErrorState } from '../../../components/states/index.js'
import PrismLogo from '../../../components/ui/PrismLogo.jsx'
import { useSharedReport } from '../hooks.js'
import { ReportView } from '../components/ReportView.jsx'
import { formatDate } from '../../student/QueryState.jsx'
import { REPORT_COPY } from '../../../lib/copy/report.js'

export default function SharedReportPage() {
  const { token } = useParams()
  const [params] = useSearchParams()
  const query = useSharedReport(token, { version: params.get('version') })
  // The token is in this page's URL: never send it onward as a referrer.
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'referrer'
    meta.content = 'no-referrer'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])
  let body
  if (query.isPending && query.fetchStatus === 'paused') body = <ErrorState title="You appear to be offline" description="The report will load when your connection is back." onRetry={() => query.refetch()} />
  else if (query.isPending) body = <Skeleton label="Loading the shared report" lines={6} />
  else if (query.error) {
    body = query.error.status === 404 || query.error.code === 'NOT_FOUND'
      ? <ErrorState title={REPORT_COPY.sharedInvalid} description={REPORT_COPY.sharedInvalidBody} />
      : query.error.code === 'NETWORK_ERROR'
        ? <ErrorState title="You appear to be offline" description="Check your connection and try again." onRetry={() => query.refetch()} />
        : <ErrorState title="This report could not be loaded" requestId={query.error.requestId} onRetry={() => query.refetch()} />
  } else {
    const d = query.data
    body = (
      <ReportView
        audience="SHARE_LINK"
        report={d.report}
        versionNumber={d.version.number}
        visibilityText={`Shared by the student${d.share?.expiresAt ? ` until ${formatDate(d.share.expiresAt)}` : ''}. ${d.report.disclosure === 'SUMMARY' ? 'They chose to share a summary only.' : 'They chose to share the full report.'}`}
      />
    )
  }
  return (
    <div className="prism-app min-h-screen bg-prism-canvas">
      <DocumentTitle title={REPORT_COPY.sharedTitle} />
      <header className="border-b border-prism-border bg-prism-surface px-4 py-3">
        <PrismLogo />
      </header>
      <main id="main" className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <h1 id="page-title" tabIndex={-1} className="text-2xl font-semibold text-prism-ink focus:outline-none">{REPORT_COPY.sharedTitle}</h1>
        {body}
      </main>
    </div>
  )
}
