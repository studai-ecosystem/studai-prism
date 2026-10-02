import { useState } from 'react'
import { Button } from '../../../components/ui/Button.jsx'
import { Skeleton } from '../../../components/ui/Skeleton.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'
import { useReportVersions } from '../hooks.js'
import { InterpretationReviewDialog } from './InterpretationReviewDialog.jsx'
import { REPORT_COPY } from '../../../lib/copy/report.js'
import { formatDate } from '../../student/QueryState.jsx'

// Version history + review request (P5.1, P5.7). Owner only: lists the
// immutable versions with their reasons and any open review cases, and
// opens the review dialog. Stored facts only; an unknown date stays unknown.
export function ReportVersionHistory({ sessionId, currentVersion, moments = [] }) {
  const query = useReportVersions(sessionId)
  const [open, setOpen] = useState(false)
  const R = REPORT_COPY
  return (
    <section className="space-y-3" aria-labelledby="report-versions-title" data-testid="report-versions">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id="report-versions-title" className="text-base font-semibold text-prism-ink">{R.versionsTitle}</h3>
          <p className="text-sm text-prism-ink-muted">{R.versionsIntro}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>{R.reviewOpen}</Button>
      </div>
      {query.isPending && <Skeleton label="Loading version history" lines={2} />}
      {query.error && <Callout tone="partial" title="Version history unavailable"><p>{query.error.message}</p><Button size="sm" variant="secondary" className="mt-2" onClick={() => query.refetch()}>Try again</Button></Callout>}
      {query.data && (
        <>
          {query.data.versions.length === 0 ? <p className="text-sm text-prism-ink-muted">{R.versionsNone}</p> : (
            <ol className="divide-y divide-prism-border rounded-[var(--prism-radius-md)] border border-prism-border text-sm">
              {query.data.versions.map((v) => (
                <li key={v.version} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" data-testid="report-version">
                  <span className="font-medium text-prism-ink">Version {v.version}{v.version === currentVersion ? ' (shown)' : ''}</span>
                  <span className="text-prism-ink-muted">
                    {[R.versionReasons[v.reason] || v.reason || null, v.priorVersion ? `replaces version ${v.priorVersion}` : null, formatDate(v.issuedAt || v.createdAt) ? `issued ${formatDate(v.issuedAt || v.createdAt)}` : 'issue date not recorded'].filter(Boolean).join(' · ')}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {query.data.reviews.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-prism-ink-subtle">{R.reviewRequests}</h4>
              <ul className="space-y-1 text-sm text-prism-ink-muted">
                {query.data.reviews.map((r) => (
                  <li key={r.id} data-testid="report-review">{R.reviewCategories[r.category] || r.category} · version {r.version} · {R.reviewStates[r.state] || r.state}{formatDate(r.createdAt) ? ` · ${formatDate(r.createdAt)}` : ''}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      <InterpretationReviewDialog open={open} onClose={() => setOpen(false)} sessionId={sessionId} version={currentVersion} moments={moments} />
    </section>
  )
}

export default ReportVersionHistory
