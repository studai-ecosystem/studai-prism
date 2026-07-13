import { useCallback, useEffect, useState } from 'react'
import { adminFetch, adminHasPermission } from '../../lib/adminApi.js'
import { PageHeader, ErrorNotice, Notice, Pill, btn, field, when } from './ui.jsx'

// ── /admin/prompts — Prompt Registry (Phase 3) ───────────────────────────────
// draft → testing → approved → production (dual-approved) → deprecated /
// rolled_back. Production templates are immutable; corrections are new
// versions. Runtime stays file-based unless PRISM_ADMIN_PROMPT_REGISTRY=true.

const STATUS_TONE = {
  draft: 'info', testing: 'warn', approved: 'info',
  production: 'ok', deprecated: 'muted', rolled_back: 'danger',
}

export default function AdminPrompts() {
  const [data, setData] = useState(null)
  const [detail, setDetail] = useState(null) // {prompt, versions}
  const [version, setVersion] = useState(null) // full version incl. template
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [draftForm, setDraftForm] = useState(null) // {version, template}
  const canManage = adminHasPermission('prompts:manage')
  const canPublish = adminHasPermission('prompts:publish')

  const load = useCallback(async () => {
    setError('')
    try {
      setData(await adminFetch('/api/admin/prompts'))
    } catch (err) { setError(err.message) }
  }, [])

  useEffect(() => { load() }, [load])

  const openPrompt = async (name) => {
    setError(''); setVersion(null)
    try {
      setDetail(await adminFetch(`/api/admin/prompts/${name}`))
    } catch (err) { setError(err.message) }
  }

  const openVersion = async (versionId) => {
    setError('')
    try {
      setVersion((await adminFetch(`/api/admin/prompts/versions/${versionId}`)).version)
    } catch (err) { setError(err.message) }
  }

  const run = async (fn, okMsg) => {
    setError(''); setNotice('')
    try {
      const r = await fn()
      if (r === null) return
      if (okMsg) setNotice(okMsg)
      if (r?.note) setNotice(r.note)
      await load()
      if (detail) await openPrompt(detail.prompt.name)
    } catch (err) { setError(err.message) }
  }

  const transition = (v, status) =>
    run(async () => {
      let reason
      if (status === 'production') {
        reason = window.prompt('Reason for PUBLISHING to production (10+ chars — requires a pre-approved "publish_prompt" request for this version id):')
        if (!reason) return null
      }
      return adminFetch(`/api/admin/prompts/versions/${v.version_id}/status`, {
        method: 'POST', body: { status, ...(reason ? { reason } : {}) },
      })
    }, `Version moved to ${status}.`)

  const rollback = (v) =>
    run(async () => {
      const toVersionId = window.prompt('Version id of the DEPRECATED predecessor to re-promote:')
      if (!toVersionId) return null
      const reason = window.prompt('Reason for the rollback (10+ chars, audited):')
      if (!reason) return null
      return adminFetch(`/api/admin/prompts/versions/${v.version_id}/rollback`, {
        method: 'POST', body: { toVersionId: toVersionId.trim(), reason },
      })
    }, 'Rolled back.')

  const createDraft = (e) => {
    e.preventDefault()
    run(async () => {
      const r = await adminFetch(`/api/admin/prompts/${detail.prompt.name}/versions`, {
        method: 'POST', body: { version: draftForm.version.trim(), template: draftForm.template },
      })
      setDraftForm(null)
      return r
    }, 'Draft version created.')
  }

  const saveDraft = () =>
    run(() => adminFetch(`/api/admin/prompts/versions/${version.version_id}`, {
      method: 'PATCH', body: { template: version.template },
    }), 'Draft saved.')

  return (
    <div className="p-6 max-w-6xl">
      <PageHeader
        title="Prompt registry"
        subtitle={`Runtime source: ${data?.runtime || '…'}. Production templates are never edited in place — corrections are new versions.`}
      />
      <ErrorNotice error={error} />
      <Notice>{notice}</Notice>

      {data?.drift?.length > 0 && (
        <div className="mb-4 rounded-[10px] border border-[var(--color-reliability-moderate)] bg-[var(--color-warn-surface)] p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-reliability-moderate)]">File ↔ registry drift</p>
          {data.drift.map((d, i) => (
            <p key={i} className="font-sans text-[13px] text-[var(--color-ink)]">{d.file}: {d.problem}</p>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <section className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-2 h-fit">
          {(data?.prompts || []).map((p) => (
            <button key={p.prompt_id} type="button" onClick={() => openPrompt(p.name)}
              className={`w-full text-left rounded-[6px] px-3 py-2 font-mono text-[12px] hover:bg-[var(--color-paper)] ${detail?.prompt?.name === p.name ? 'bg-[var(--color-paper)] text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)]'}`}>
              {p.name}
              <span className="float-right tabular-nums">{p.version_count}v</span>
            </button>
          ))}
        </section>

        <section>
          {!detail ? (
            <p className="font-sans text-sm text-[var(--color-ink-muted)] p-4">Select a prompt to inspect its versions.</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-display text-base text-[var(--color-ink)]">{detail.prompt.name}</h2>
                {canManage && (
                  <button type="button" className={btn}
                    onClick={() => setDraftForm(draftForm ? null : { version: '', template: '' })}>
                    {draftForm ? 'Cancel' : 'New draft version'}
                  </button>
                )}
              </div>

              {draftForm && (
                <form onSubmit={createDraft} className="mb-3 rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
                  <label className="font-mono text-[11px] uppercase text-[var(--color-ink-muted)]">
                    Version identifier (immutable — e.g. v2)
                    <input required pattern="v\d+" className={`${field} w-40 mt-1 block`} value={draftForm.version}
                      onChange={(e) => setDraftForm({ ...draftForm, version: e.target.value })} />
                  </label>
                  <label className="block mt-3 font-mono text-[11px] uppercase text-[var(--color-ink-muted)]">
                    Template ({'{{PLACEHOLDERS}}'} auto-extracted)
                    <textarea required rows={8} className={`${field} w-full mt-1 font-mono text-[12px]`} value={draftForm.template}
                      onChange={(e) => setDraftForm({ ...draftForm, template: e.target.value })} />
                  </label>
                  <button type="submit" className={`${btn} mt-3`}>Create draft</button>
                </form>
              )}

              <div className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] divide-y divide-[var(--color-line)]">
                {detail.versions.map((v) => (
                  <div key={v.version_id} className="p-3 flex items-center gap-3 flex-wrap">
                    <button type="button" className="font-mono text-[12px] text-[var(--color-accent)] underline" onClick={() => openVersion(v.version_id)}>
                      {v.version} · {v.language}
                    </button>
                    <Pill tone={STATUS_TONE[v.status]}>{v.status}</Pill>
                    <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">{v.source} · {when(v.created_at)}</span>
                    <span className="flex gap-1.5 ml-auto">
                      {canManage && v.status === 'draft' && (
                        <button type="button" className={btn} onClick={() => transition(v, 'testing')}>→ testing</button>
                      )}
                      {canManage && v.status === 'testing' && (
                        <>
                          <button type="button" className={btn} onClick={() => transition(v, 'approved')}>→ approved</button>
                          <button type="button" className={btn} onClick={() => transition(v, 'draft')}>back to draft</button>
                        </>
                      )}
                      {canPublish && v.status === 'approved' && (
                        <button type="button" className={btn} onClick={() => transition(v, 'production')}>Publish (dual-approved)</button>
                      )}
                      {canPublish && v.status === 'production' && (
                        <button type="button" className={btn} onClick={() => rollback(v)}>Roll back…</button>
                      )}
                    </span>
                  </div>
                ))}
              </div>

              {version && (
                <div className="mt-3 rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
                      {version.name} {version.version} ({version.language}) · {version.status}
                      {version.variables?.length ? ` · vars: ${version.variables.join(', ')}` : ''}
                    </p>
                    <span className="flex gap-1.5">
                      {canManage && version.status === 'draft' && (
                        <button type="button" className={btn} onClick={saveDraft}>Save draft</button>
                      )}
                      <button type="button" className={btn} onClick={() => setVersion(null)}>Close</button>
                    </span>
                  </div>
                  {version.status === 'draft' && canManage ? (
                    <textarea rows={14} className={`${field} w-full font-mono text-[12px]`} value={version.template}
                      onChange={(e) => setVersion({ ...version, template: e.target.value })} />
                  ) : (
                    <pre className="max-h-96 overflow-auto rounded-[6px] bg-[var(--color-paper)] p-3 font-mono text-[11px] whitespace-pre-wrap text-[var(--color-ink)]">
                      {version.template}
                    </pre>
                  )}
                  {version.status !== 'draft' && (
                    <p className="mt-2 font-mono text-[10px] text-[var(--color-ink-muted)]">
                      This version is immutable ({version.status}). Corrections are new draft versions.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
