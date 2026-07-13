import { useCallback, useEffect, useState } from 'react'
import { adminFetch, adminHasPermission } from '../../lib/adminApi.js'
import { PageHeader, ErrorNotice, Notice, Toolbar, DataTable, Pill, btn, btnDanger, field, when, actWithReason } from './ui.jsx'

// ── /admin/content — CMS (Phase 5): blog, careers, applications ──────────────

const POST_TONE = { draft: 'info', published: 'ok', scheduled: 'warn', archived: 'muted' }
const JOB_TONE = { draft: 'info', open: 'ok', closed: 'warn', archived: 'muted' }
const APP_TONE = { new: 'info', reviewing: 'warn', interviewing: 'warn', rejected: 'muted', hired: 'ok', withdrawn: 'muted' }

export default function AdminContent() {
  const [tab, setTab] = useState('Blog')
  return (
    <div className="p-6 max-w-6xl">
      <PageHeader
        title="Content"
        subtitle="Every edit is versioned; published material archives, never hard-deletes. Research/static pages remain code-rendered (a separate product decision)."
      />
      <nav className="flex gap-1.5 mb-4" aria-label="Content tabs">
        {['Blog', 'Careers', 'Applications'].map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`rounded-[6px] px-3 py-1.5 font-sans text-[13px] border ${
              tab === t ? 'border-[var(--color-accent)] text-[var(--color-ink)] bg-[var(--color-surface)]'
                        : 'border-[var(--color-line)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'}`}>
            {t}
          </button>
        ))}
      </nav>
      {tab === 'Blog' && <BlogTab />}
      {tab === 'Careers' && <CareersTab />}
      {tab === 'Applications' && <ApplicationsTab />}
    </div>
  )
}

function BlogTab() {
  const [data, setData] = useState(null)
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const canWrite = adminHasPermission('content:write')
  const canPublish = adminHasPermission('content:publish')

  const load = useCallback(async () => {
    setError('')
    try { setData(await adminFetch('/api/admin/content/posts')) } catch (err) { setError(err.message) }
  }, [])
  useEffect(() => { load() }, [load])

  const run = async (fn, okMsg) => {
    setError(''); setNotice('')
    try {
      const r = await fn()
      if (r === null) return
      if (okMsg) setNotice(okMsg)
      await load()
      if (detail) openPost({ postId: detail.post.postId })
    } catch (err) { setError(err.message) }
  }

  const openPost = async (row) => {
    setError('')
    try { setDetail(await adminFetch(`/api/admin/content/posts/${row.postId}`)) } catch (err) { setError(err.message) }
  }

  const createDraft = () =>
    run(async () => {
      const slug = window.prompt('Slug (a-z, 0-9, hyphens):')
      if (!slug) return null
      const title = window.prompt('Title:')
      if (!title) return null
      return adminFetch('/api/admin/content/posts', { method: 'POST', body: { slug: slug.trim(), title: title.trim() } })
    }, 'Draft created.')

  const setStatus = (post, status) =>
    run(async () => {
      let scheduledFor
      if (status === 'scheduled') {
        scheduledFor = window.prompt('Publish at (ISO datetime, e.g. 2026-08-01T09:00:00Z):')
        if (!scheduledFor) return null
      }
      const reason = window.prompt(`Reason for ${status} (audited):`)
      if (reason === null) return null
      return adminFetch(`/api/admin/content/posts/${post.postId}/status`, {
        method: 'POST', body: { status, scheduledFor, reason },
      })
    }, `Post ${status}.`)

  const saveBody = () =>
    run(async () => {
      const changeNote = window.prompt('Change note (goes in the version history):')
      if (changeNote === null) return null
      return adminFetch(`/api/admin/content/posts/${detail.post.postId}`, {
        method: 'PATCH',
        body: {
          title: detail.post.title, summary: detail.post.summary, body: detail.post.body,
          dateLabel: detail.post.dateLabel, author: detail.post.author, changeNote,
        },
      })
    }, 'Saved — new version recorded.')

  return (
    <>
      <ErrorNotice error={error} />
      <Notice>{notice}</Notice>
      {data?.servingFrom && <p className="mb-3 font-mono text-[11px] text-[var(--color-ink-muted)]">Public serving: {data.servingFrom}</p>}
      <Toolbar onRefresh={load}>
        {canWrite && <button type="button" className={btn} onClick={createDraft}>New draft</button>}
      </Toolbar>
      <DataTable
        rowKey={(p) => p.postId}
        onRowClick={openPost}
        columns={[
          { key: 'slug', label: 'Slug', className: 'font-mono text-[12px]' },
          { key: 'title', label: 'Title' },
          { key: 'status', label: 'Status', render: (p) => <Pill tone={POST_TONE[p.status]}>{p.status}</Pill> },
          { key: 'version', label: 'v', className: 'tabular-nums' },
          { key: 'publishedAt', label: 'Published', render: (p) => when(p.publishedAt), className: 'whitespace-nowrap font-mono text-[11px]' },
          {
            key: 'actions', label: '',
            render: (p) => (
              <span className="flex gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
                {canPublish && p.status !== 'published' && p.status !== 'archived' && (
                  <button type="button" className={btn} onClick={() => setStatus(p, 'published')}>Publish</button>
                )}
                {canPublish && p.status === 'draft' && (
                  <button type="button" className={btn} onClick={() => setStatus(p, 'scheduled')}>Schedule</button>
                )}
                {canPublish && p.status === 'published' && (
                  <button type="button" className={btn} onClick={() => setStatus(p, 'draft')}>Unpublish</button>
                )}
                {canPublish && p.status !== 'archived' && (
                  <button type="button" className={btn} onClick={() => setStatus(p, 'archived')}>Archive</button>
                )}
                {canWrite && p.status === 'draft' && !p.publishedAt && (
                  <button type="button" className={btnDanger}
                    onClick={() => run(async () => {
                      if (!window.confirm('Hard-delete this never-published draft? This is the only hard delete in the CMS.')) return null
                      return adminFetch(`/api/admin/content/posts/${p.postId}`, { method: 'DELETE' })
                    }, 'Draft deleted.')}>
                    Delete draft
                  </button>
                )}
              </span>
            ),
          },
        ]}
        rows={data?.posts}
        empty="No posts."
      />
      {detail && (
        <section className="mt-4 rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-display text-base text-[var(--color-ink)]">{detail.post.slug} · v{detail.post.version}</h2>
            <span className="flex gap-1.5">
              {canWrite && <button type="button" className={btn} onClick={saveBody}>Save (new version)</button>}
              <button type="button" className={btn} onClick={() => setDetail(null)}>Close</button>
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-2 mb-2">
            {['title', 'dateLabel', 'summary', 'author'].map((k) => (
              <label key={k} className="font-mono text-[10px] uppercase text-[var(--color-ink-muted)]">
                {k}
                <input className={`${field} w-full mt-1`} value={detail.post[k] || ''}
                  disabled={!canWrite}
                  onChange={(e) => setDetail({ ...detail, post: { ...detail.post, [k]: e.target.value } })} />
              </label>
            ))}
          </div>
          <label className="font-mono text-[10px] uppercase text-[var(--color-ink-muted)]">
            Body (markdown)
            <textarea rows={10} className={`${field} w-full mt-1 font-mono text-[12px]`} value={detail.post.body || ''}
              disabled={!canWrite}
              onChange={(e) => setDetail({ ...detail, post: { ...detail.post, body: e.target.value } })} />
          </label>
          <h3 className="mt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">Version history</h3>
          {detail.versions.map((v) => (
            <p key={v.version_id} className="font-sans text-[13px] text-[var(--color-ink)] py-0.5">
              v{v.version} — “{v.change_note}” <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">{v.changed_by || 'import'} · {when(v.created_at)}</span>
            </p>
          ))}
        </section>
      )}
    </>
  )
}

function CareersTab() {
  const [jobs, setJobs] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const canWrite = adminHasPermission('content:write')
  const canPublish = adminHasPermission('content:publish')

  const load = useCallback(async () => {
    setError('')
    try { setJobs((await adminFetch('/api/admin/content/jobs-list')).jobs) } catch (err) { setError(err.message) }
  }, [])
  useEffect(() => { load() }, [load])

  const run = async (fn, okMsg) => {
    setError(''); setNotice('')
    try {
      const r = await fn()
      if (r === null) return
      if (okMsg) setNotice(okMsg)
      await load()
    } catch (err) { setError(err.message) }
  }

  return (
    <>
      <ErrorNotice error={error} />
      <Notice>{notice}</Notice>
      <Toolbar onRefresh={load}>
        {canWrite && (
          <button type="button" className={btn}
            onClick={() => run(async () => {
              const slug = window.prompt('Role slug (a-z, 0-9, hyphens):')
              if (!slug) return null
              const title = window.prompt('Role title:')
              if (!title) return null
              return adminFetch('/api/admin/content/jobs-list', { method: 'POST', body: { slug: slug.trim(), title: title.trim() } })
            }, 'Role created as draft.')}>
            New role
          </button>
        )}
      </Toolbar>
      <DataTable
        rowKey={(j) => j.job_id}
        columns={[
          { key: 'slug', label: 'Slug', className: 'font-mono text-[12px]' },
          { key: 'title', label: 'Title' },
          { key: 'location', label: 'Location' },
          { key: 'status', label: 'Status', render: (j) => <Pill tone={JOB_TONE[j.status]}>{j.status}</Pill> },
          { key: 'application_count', label: 'Applications', className: 'tabular-nums' },
          {
            key: 'actions', label: '',
            render: (j) => (canPublish ? (
              <span className="flex gap-1.5">
                {j.status !== 'open' && j.status !== 'archived' && (
                  <button type="button" className={btn}
                    onClick={() => run(() => actWithReason(`/api/admin/content/jobs-list/${j.job_id}/status`, { status: 'open' }, 'Reason for opening (audited):'), 'Role opened.')}>Open</button>
                )}
                {j.status === 'open' && (
                  <button type="button" className={btn}
                    onClick={() => run(() => actWithReason(`/api/admin/content/jobs-list/${j.job_id}/status`, { status: 'closed' }, 'Reason for closing (audited):'), 'Role closed.')}>Close</button>
                )}
                {j.status !== 'archived' && (
                  <button type="button" className={btn}
                    onClick={() => run(() => actWithReason(`/api/admin/content/jobs-list/${j.job_id}/status`, { status: 'archived' }, 'Reason for archiving (audited):'), 'Role archived.')}>Archive</button>
                )}
              </span>
            ) : null),
          },
        ]}
        rows={jobs}
        empty="No roles."
      />
    </>
  )
}

function ApplicationsTab() {
  const [apps, setApps] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [status, setStatus] = useState('')
  const canManage = adminHasPermission('content:applications')

  const load = useCallback(async () => {
    setError('')
    try {
      const qs = status ? `?status=${status}` : ''
      setApps((await adminFetch(`/api/admin/content/applications${qs}`)).applications)
    } catch (err) { setError(err.message) }
  }, [status])
  useEffect(() => { load() }, [load])

  const run = async (fn, okMsg) => {
    setError(''); setNotice('')
    try {
      const r = await fn()
      if (r === null) return
      if (okMsg) setNotice(okMsg)
      await load()
    } catch (err) { setError(err.message) }
  }

  if (!canManage) return <p className="font-sans text-sm text-[var(--color-ink-muted)]">Your role does not include application processing.</p>

  return (
    <>
      <ErrorNotice error={error} />
      <Notice>{notice}</Notice>
      <Toolbar onRefresh={load}>
        <select aria-label="Status" className={field} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {['new', 'reviewing', 'interviewing', 'rejected', 'hired', 'withdrawn'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Toolbar>
      <DataTable
        rowKey={(a) => a.application_id}
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'email', label: 'Email', className: 'font-mono text-[12px]' },
          { key: 'job_title', label: 'Role' },
          { key: 'status', label: 'Status', render: (a) => <Pill tone={APP_TONE[a.status]}>{a.status}</Pill> },
          { key: 'created_at', label: 'Applied', render: (a) => when(a.created_at), className: 'whitespace-nowrap font-mono text-[11px]' },
          {
            key: 'actions', label: '',
            render: (a) => (
              <span className="flex gap-1.5 flex-wrap">
                <select aria-label="Set status" className={field} value={a.status}
                  onChange={(e) => run(() => adminFetch(`/api/admin/content/applications/${a.application_id}/status`, { method: 'POST', body: { status: e.target.value } }), 'Status updated.')}>
                  {['new', 'reviewing', 'interviewing', 'rejected', 'hired', 'withdrawn'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button type="button" className={btnDanger}
                  onClick={() => run(async () => {
                    const reason = window.prompt('Retention reason for deleting this application (it carries applicant PII):')
                    if (!reason) return null
                    return adminFetch(`/api/admin/content/applications/${a.application_id}`, { method: 'DELETE', body: { reason } })
                  }, 'Application deleted per retention policy.')}>
                  Delete (retention)
                </button>
              </span>
            ),
          },
        ]}
        rows={apps}
        empty="No applications."
      />
    </>
  )
}
