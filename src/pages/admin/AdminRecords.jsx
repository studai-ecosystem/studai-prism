import { useState } from 'react'
import { Link } from 'react-router-dom'
import { adminFetch, adminHasPermission } from '../../lib/adminApi.js'
import {
  useAdminList, PageHeader, ErrorNotice, Notice, Toolbar, DataTable, Pager,
  Pill, btn, field, when, mono,
} from './ui.jsx'

// ── /admin/records — consents, verifications, integrity events (Phase 2) ─────
// One component, three modes (routes /admin/consents, /admin/verifications,
// /admin/integrity). Verification identity fields stay masked unless the role
// holds verifications:read_pii — and unmasked views are audited server-side.

export default function AdminRecords({ mode }) {
  if (mode === 'consents') return <Consents />
  if (mode === 'verifications') return <Verifications />
  return <Integrity />
}

function Consents() {
  const { data, error, busy, setPage, reload } = useAdminList('/api/admin/records/consents')
  return (
    <div className="p-6 max-w-5xl">
      <PageHeader title="Consent records" subtitle="Read-only. Withdrawals arrive via the privacy workflow (Phase 6)." />
      <ErrorNotice error={error} />
      <Toolbar onRefresh={reload} busy={busy} />
      <DataTable
        busy={busy}
        rowKey={(c) => c.sessionId}
        columns={[
          {
            key: 'sessionId', label: 'Session', className: 'font-mono text-[12px]',
            render: (c) => <Link className="text-[var(--color-accent)] underline" to={`/admin/sessions/${c.sessionId}`}>{mono(c.sessionId, 13)}…</Link>,
          },
          { key: 'scopes', label: 'Scopes', render: (c) => (c.scopes || []).join(', ') || '—' },
          { key: 'consentVersion', label: 'Version', className: 'font-mono text-[11px]' },
          { key: 'at', label: 'Given', render: (c) => when(c.at), className: 'whitespace-nowrap font-mono text-[11px]' },
        ]}
        rows={data?.rows}
        empty="No consent records."
      />
      <Pager data={data} onPage={setPage} />
    </div>
  )
}

function Verifications() {
  const { data, error, busy, params, setFilter, setPage, reload } = useAdminList('/api/admin/records/verifications')
  const [detail, setDetail] = useState(null)
  const [detailError, setDetailError] = useState('')
  const canPii = adminHasPermission('verifications:read_pii')

  const openDetail = async (sessionId) => {
    setDetailError('')
    try {
      setDetail(await adminFetch(`/api/admin/records/verifications/${sessionId}`))
    } catch (err) {
      setDetailError(err.message)
    }
  }

  return (
    <div className="p-6 max-w-5xl">
      <PageHeader
        title="Identity verification"
        subtitle={canPii
          ? 'Your role can view identity fields — every unmasked view is written to the audit trail.'
          : 'Identity fields are masked for your role.'}
      />
      <ErrorNotice error={error || detailError} />
      <Toolbar onRefresh={reload} busy={busy}>
        <select aria-label="Status" className={field} value={params.status || ''} onChange={(e) => setFilter({ status: e.target.value || undefined })}>
          <option value="">All statuses</option>
          <option value="verified">Verified</option>
          <option value="flagged">Flagged</option>
        </select>
      </Toolbar>
      {detail && (
        <Notice>
          {detail.pii === 'unmasked'
            ? `${detail.verification.fullName} · DOB ${detail.verification.dob} · Aadhaar •••• ${detail.verification.aadhaarLast4} · roll ${detail.verification.rollNumber || '—'} (this view was audited)`
            : 'Masked view — your role does not include verifications:read_pii.'}
        </Notice>
      )}
      <DataTable
        busy={busy}
        rowKey={(v) => v.sessionId}
        columns={[
          {
            key: 'sessionId', label: 'Session', className: 'font-mono text-[12px]',
            render: (v) => <Link className="text-[var(--color-accent)] underline" to={`/admin/sessions/${v.sessionId}`}>{mono(v.sessionId, 13)}…</Link>,
          },
          { key: 'status', label: 'Status', render: (v) => <Pill tone={v.status === 'verified' ? 'ok' : 'warn'}>{v.status || '—'}</Pill> },
          { key: 'nameMatch', label: 'Name match', render: (v) => (v.nameMatch ? 'yes' : 'no') },
          { key: 'matchScore', label: 'Match score', render: (v) => v.matchScore ?? '—', className: 'tabular-nums' },
          { key: 'at', label: 'Verified', render: (v) => when(v.at), className: 'whitespace-nowrap font-mono text-[11px]' },
          {
            key: 'actions', label: '',
            render: (v) => (
              <button type="button" className={btn} onClick={() => openDetail(v.sessionId)}>
                {canPii ? 'View identity (audited)' : 'View detail'}
              </button>
            ),
          },
        ]}
        rows={data?.rows}
        empty="No verification records."
      />
      <Pager data={data} onPage={setPage} />
    </div>
  )
}

function Integrity() {
  const { data, error, busy, params, setFilter, setPage, reload } = useAdminList('/api/admin/records/events')
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const canReview = adminHasPermission('integrity:review')

  const review = async (e, decision) => {
    setActionError(''); setNotice('')
    const note = window.prompt(`Note for marking this ${e.type} as ${decision} (audited):`)
    if (note === null) return
    try {
      await adminFetch('/api/admin/records/events/review', {
        method: 'POST',
        body: { sessionId: e.sessionId, eventType: e.type, eventAt: e.at, decision, note },
      })
      setNotice('Reviewer decision recorded.')
      reload()
    } catch (err) {
      setActionError(err.message)
    }
  }

  return (
    <div className="p-6 max-w-6xl">
      <PageHeader
        title="Proctoring & integrity"
        subtitle="Events never auto-invalidate a candidate — human review decides. Invalidation is a separate session action."
      />
      <ErrorNotice error={error || actionError} />
      <Notice>{notice}</Notice>
      <Toolbar onRefresh={reload} busy={busy}>
        <input
          aria-label="Session id filter" placeholder="Filter by session id…" className={`${field} w-72`}
          defaultValue={params.sessionId || ''}
          onKeyDown={(e) => { if (e.key === 'Enter') setFilter({ sessionId: e.currentTarget.value.trim() || undefined }) }}
        />
        <select aria-label="Event type" className={field} value={params.type || ''} onChange={(e) => setFilter({ type: e.target.value || undefined })}>
          <option value="">All types</option>
          {['tab_switch', 'fullscreen_exit', 'paste', 'face_absent', 'multiple_faces', 'looking_away', 'screenshot_attempt', 'display_mode', 'app_blur'].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </Toolbar>
      <DataTable
        busy={busy}
        rowKey={(e) => `${e.sessionId}|${e.type}|${e.at}`}
        columns={[
          {
            key: 'sessionId', label: 'Session', className: 'font-mono text-[12px]',
            render: (e) => <Link className="text-[var(--color-accent)] underline" to={`/admin/sessions/${e.sessionId}`}>{mono(e.sessionId, 13)}…</Link>,
          },
          { key: 'type', label: 'Event', className: 'font-mono text-[12px]' },
          { key: 'at', label: 'When', render: (e) => when(e.at), className: 'whitespace-nowrap font-mono text-[11px]' },
          {
            key: 'review', label: 'Reviewer decision',
            render: (e) => (e.review
              ? <span className="font-sans text-[13px]"><Pill tone={e.review.decision === 'false_positive' ? 'ok' : e.review.decision === 'escalated' ? 'danger' : 'warn'}>{e.review.decision}</Pill> <span className="text-[var(--color-ink-muted)]">{e.review.reviewer}</span></span>
              : <Pill tone="muted">unreviewed</Pill>),
          },
          {
            key: 'actions', label: '',
            render: (e) => (canReview ? (
              <span className="flex gap-1.5">
                <button type="button" className={btn} onClick={() => review(e, 'false_positive')}>False positive</button>
                <button type="button" className={btn} onClick={() => review(e, 'confirmed')}>Confirm</button>
                <button type="button" className={btn} onClick={() => review(e, 'escalated')}>Escalate</button>
              </span>
            ) : null),
          },
        ]}
        rows={data?.rows}
        empty="No integrity events match."
      />
      <Pager data={data} onPage={setPage} />
    </div>
  )
}
