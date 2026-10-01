// /app/reports/:sessionId — Student Report V3 (spec §14). The server decides
// everything shown: capability cards are validated claims or statements of
// insufficient evidence, evidence items cite this session, development has at
// most three evidence-backed priorities. The student can share (link or
// institution, with expiry and disclosure level), revoke, and export a PDF.
import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../../../components/ui/PageHeader.jsx'
import { Button, LinkButton } from '../../../components/ui/Button.jsx'
import { Card } from '../../../components/ui/Card.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'
import { Modal } from '../../../components/ui/Modal.jsx'
import { UnauthorizedState } from '../../../components/states/index.js'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { useFeatureFlags } from '../../../app/providers/FeatureFlagProvider.jsx'
import { queryStateView, formatDate } from '../../student/QueryState.jsx'
import { useStudentReport, useDeleteShare } from '../hooks.js'
import { ReportView } from '../components/ReportView.jsx'
import { ShareReportDialog } from '../components/ShareReportDialog.jsx'
import { downloadReportPdf } from '../../../lib/reportPdf.js'
import { track } from '../../../lib/telemetry.js'
import { REPORT_COPY } from '../../../lib/copy/report.js'

function visibilityText(data) {
  const v = data.privacy?.visibility
  if (v === 'OWNER_AND_SPONSOR') return REPORT_COPY.visibility.OWNER_AND_SPONSOR(data.report.header.sponsor?.name || 'Your institution')
  return REPORT_COPY.visibility[v] || null
}

function ActiveShares({ shares, sessionId }) {
  const remove = useDeleteShare(sessionId)
  const [confirm, setConfirm] = useState(null)
  const [done, setDone] = useState('')
  const headingRef = useRef(null)
  return (
    <Card className="space-y-3 p-5" aria-labelledby="shares-title">
      <h2 id="shares-title" ref={headingRef} tabIndex={-1} className="text-base font-semibold text-prism-ink focus:outline-none">{REPORT_COPY.share.active}</h2>
      <p role="status" className="sr-only">{done}</p>
      {shares.length === 0 ? <p className="text-sm text-prism-ink-muted">{REPORT_COPY.share.none}</p> : (
        <ul className="divide-y divide-prism-border">
          {shares.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" data-testid="active-share">
              <span>
                {s.recipientType === 'LINK' ? 'Private link' : s.organizationName || 'Your institution'} · {s.disclosureLevel === 'FULL' ? 'Full report' : 'Summary only'} · until {formatDate(s.expiresAt)}
              </span>
              <Button size="sm" variant="secondary" onClick={() => setConfirm(s)} aria-label={`${REPORT_COPY.share.revoke} ${s.recipientType === 'LINK' ? 'private link' : s.organizationName || 'institution share'}`}>
                {REPORT_COPY.share.revoke}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <LinkButton to="/app/sharing" variant="ghost" size="sm">{REPORT_COPY.share.manage}</LinkButton>
      <Modal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title="Revoke this share?"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>Keep it</Button>
            <Button
              loading={remove.isPending}
              onClick={async () => {
                try {
                  await remove.mutateAsync(confirm.id)
                  // Re-announce on every revoke (a changed string is read again).
                  setDone((d) => (d === REPORT_COPY.share.revoked ? `${REPORT_COPY.share.revoked}.` : REPORT_COPY.share.revoked))
                  setConfirm(null)
                  // The row (and its button) is gone: keep focus in this section.
                  setTimeout(() => headingRef.current?.focus(), 0)
                } catch {
                  // Shown below from the mutation state.
                }
              }}
            >
              {REPORT_COPY.share.revoke}
            </Button>
          </>
        )}
      >
        <p className="text-sm">Anyone using it will no longer be able to see this report.</p>
        {remove.error && <Callout tone="blocked" role="alert" title="Not revoked">{remove.error.message}</Callout>}
      </Modal>
    </Card>
  )
}

export default function StudentReportPage() {
  const { sessionId } = useParams()
  const [params] = useSearchParams()
  const wsParam = params.get('ws')
  const { workspaces, active, switchTo } = useWorkspace()
  const { loading: meLoading } = useFeatureFlags()
  const target = wsParam ? workspaces.find((w) => w.id === wsParam && w.type === 'CAMPUS_STUDENT') : null
  useEffect(() => {
    if (target && target.id !== active.id) switchTo(target.id)
  }, [target, active.id, switchTo])
  const aligned = !wsParam || Boolean(target && active.id === target.id)
  const query = useStudentReport(sessionId, { enabled: aligned && !meLoading })
  const [shareOpen, setShareOpen] = useState(false)
  const [pdfError, setPdfError] = useState(null)

  useEffect(() => {
    if (query.data) track('report_viewed', { sessionId, scope: query.data.report.header.scope })
  }, [query.data, sessionId])

  const listPath = active.type === 'CAMPUS_STUDENT' ? `/app/campus/${active.organizationId}/assignments` : '/app/assessments'
  const header = <PageHeader title={REPORT_COPY.title} context={active} breadcrumbs={[{ label: 'Assessments', to: listPath }, { label: 'Report' }]} />

  if (wsParam && !meLoading && !target) return <div>{header}<UnauthorizedState title={REPORT_COPY.notAvailable} homeTo={listPath} /></div>
  const err = query.error
  if (err?.code === 'REPORT_NOT_READY' || err?.code === 'REPORT_UNDER_REVIEW') {
    const ready = err.code === 'REPORT_NOT_READY'
    return (
      <div className="space-y-6">
        {header}
        <Callout tone={ready ? 'info' : 'partial'} title={ready ? REPORT_COPY.notReadyTitle : REPORT_COPY.underReviewTitle}>
          <p>{ready ? REPORT_COPY.notReadyBody : REPORT_COPY.underReviewBody}</p>
          <LinkButton className="mt-3" to={listPath} variant="secondary">Back to assessments</LinkButton>
        </Callout>
      </div>
    )
  }
  const state = !aligned ? queryStateView({ isPending: true, fetchStatus: 'idle' }, { label: 'Loading your report' }) : queryStateView(query, { label: 'Loading your report', homeTo: listPath })
  if (state) return <div>{header}{state}</div>

  const data = query.data
  // A personal report can be shared with the student's institutions; a
  // sponsored report is already visible to its sponsor, so only a link is offered.
  const organizations = data.report.header.scope === 'PERSONAL'
    ? workspaces.filter((w) => w.type === 'CAMPUS_STUDENT').map((w) => ({ id: w.organizationId, name: w.organizationName || w.name }))
    : []
  const actions = (
    <>
      {data.privacy?.canShare && <Button variant="primary" onClick={() => setShareOpen(true)}>{REPORT_COPY.share.open}</Button>}
      <Button
        variant="secondary"
        onClick={async () => {
          setPdfError(null)
          try {
            await downloadReportPdf(data.report, {
              visibility: visibilityText(data),
              versionNumber: data.version.number,
              identityText: REPORT_COPY.identity[data.report.header.verification.identityAssurance] || REPORT_COPY.identity.NOT_RECORDED,
            })
          } catch { setPdfError('The PDF could not be created. Try again.') }
        }}
      >
        {REPORT_COPY.pdf}
      </Button>
    </>
  )

  return (
    <div className="space-y-6">
      {header}
      {pdfError && <Callout tone="blocked" role="alert" title="Download failed">{pdfError}</Callout>}
      <ReportView report={data.report} versionNumber={data.version.number} visibilityText={visibilityText(data)} actions={actions} />
      {data.privacy?.canShare && <ActiveShares shares={data.privacy.activeShares} sessionId={sessionId} />}
      {data.privacy?.canShare && <ShareReportDialog open={shareOpen} onClose={() => setShareOpen(false)} sessionId={sessionId} organizations={organizations} />}
    </div>
  )
}
