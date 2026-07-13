import { useCallback, useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { adminFetch, adminHasPermission } from '../../lib/adminApi.js'
import { PageHeader, ErrorNotice, Notice, Toolbar, SearchBox, DataTable, Pill, btn, btnDanger, field, when, mono } from './ui.jsx'

// ── /admin/credentials — credential console (Phase 4) ────────────────────────
// Signed contents have NO edit control anywhere: revoke and reissue
// (supersession) are the only lifecycle verbs. The private key never appears.

const STATUS_TONE = { active: 'ok', revoked: 'danger', superseded: 'warn' }

export default function AdminCredentials() {
  const [data, setData] = useState(null)
  const [filters, setFilters] = useState({ q: '', status: '' })
  const [detail, setDetail] = useState(null)
  const [signingKey, setSigningKey] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const canIssue = adminHasPermission('credentials:issue')
  const canRevoke = adminHasPermission('credentials:revoke')

  const load = useCallback(async () => {
    setError('')
    try {
      const qs = new URLSearchParams()
      if (filters.q) qs.set('q', filters.q)
      if (filters.status) qs.set('status', filters.status)
      const [list, key] = await Promise.all([
        adminFetch(`/api/admin/credentials?${qs}`),
        adminFetch('/api/admin/credentials/signing-key'),
      ])
      setData(list)
      setSigningKey(key)
    } catch (err) { setError(err.message) }
  }, [filters])

  useEffect(() => { load() }, [load])

  const run = async (fn, okMsg) => {
    setError(''); setNotice('')
    try {
      const r = await fn()
      if (r === null) return
      if (r?.shareToken) {
        setNotice(`Issued ${r.credentialId}. Share token (SHOWN ONCE — relay to the candidate): ${r.shareToken}`)
      } else if (okMsg) setNotice(okMsg)
      setDetail(null)
      await load()
    } catch (err) { setError(err.message) }
  }

  const issue = () =>
    run(async () => {
      const sessionId = window.prompt('Session id with a completed report to certify:')
      if (!sessionId) return null
      return adminFetch(`/api/admin/credentials/session/${sessionId.trim()}/issue`, { method: 'POST', body: {} })
    })

  const revoke = (credentialId) =>
    run(async () => {
      const reason = window.prompt('Reason for REVOCATION (10+ characters — recorded on the credential and both audit trails):')
      if (!reason) return null
      return adminFetch(`/api/admin/credentials/${credentialId}/revoke`, { method: 'POST', body: { reason } })
    }, 'Credential revoked. Public status endpoints reflect it immediately.')

  const reissue = (credentialId) =>
    run(async () => {
      const reason = window.prompt('Reason for REISSUE (10+ characters — creates a superseding credential; the old one stays in the chain):')
      if (!reason) return null
      return adminFetch(`/api/admin/credentials/${credentialId}/reissue`, { method: 'POST', body: { reason } })
    })

  const openDetail = async (row) => {
    setError('')
    try {
      setDetail(await adminFetch(`/api/admin/credentials/${row.credential_id}`))
    } catch (err) { setError(err.message) }
  }

  return (
    <div className="p-6 max-w-6xl">
      <PageHeader
        title="Credentials"
        subtitle="Signed contents (bundle, hash, signature, key id, issue date) are immutable — there is no edit control, by design. Revoke or reissue.">
        {canIssue && <button type="button" className={btn} onClick={issue}>Issue for session…</button>}
      </PageHeader>
      <ErrorNotice error={error} />
      <Notice>{notice}</Notice>

      {/* Signing key panel — public parts only. */}
      {signingKey && (
        <div className="mb-4 rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 flex items-start gap-3">
          <KeyRound size={16} className="text-[var(--color-accent)] mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-sans text-sm text-[var(--color-ink)]">
              Signing key {signingKey.configured
                ? <><span className="font-mono text-[12px]">{signingKey.keyId}</span> · {signingKey.algorithm} · <Pill tone={signingKey.glassBox ? 'ok' : 'warn'}>{signingKey.glassBox ? 'glass-box on' : 'glass-box off'}</Pill></>
                : <Pill tone="danger">not configured</Pill>}
            </p>
            {signingKey.lastIssue && (
              <p className="font-mono text-[11px] text-[var(--color-ink-muted)]">last issue {when(signingKey.lastIssue.issued_at)}</p>
            )}
            <p className="mt-1 font-mono text-[10px] text-[var(--color-ink-muted)]">{signingKey.note}</p>
          </div>
        </div>
      )}

      <Toolbar onRefresh={load}>
        <SearchBox value={filters.q} onChange={(q) => setFilters({ ...filters, q })} placeholder="Credential or session id…" />
        <select aria-label="Status" className={field} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All statuses</option>
          {['active', 'revoked', 'superseded'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Toolbar>

      <DataTable
        rowKey={(c) => c.credential_id}
        onRowClick={openDetail}
        columns={[
          { key: 'credential_id', label: 'Credential', render: (c) => `${mono(c.credential_id, 13)}…`, className: 'font-mono text-[12px]' },
          { key: 'session_id', label: 'Session', render: (c) => `${mono(c.session_id, 13)}…`, className: 'font-mono text-[11px]' },
          { key: 'status', label: 'Status', render: (c) => <Pill tone={STATUS_TONE[c.status]}>{c.status}</Pill> },
          { key: 'schema_version', label: 'Schema', className: 'font-mono text-[11px]' },
          { key: 'key_id', label: 'Key', render: (c) => mono(c.key_id, 8), className: 'font-mono text-[11px]' },
          { key: 'verification_count', label: 'Verifies', className: 'tabular-nums' },
          { key: 'issued_at', label: 'Issued', render: (c) => when(c.issued_at), className: 'whitespace-nowrap font-mono text-[11px]' },
          {
            key: 'actions', label: '',
            render: (c) => (canRevoke ? (
              <span className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                {c.status === 'active' && (
                  <button type="button" className={btnDanger} onClick={() => revoke(c.credential_id)}>Revoke</button>
                )}
                <button type="button" className={btn} onClick={() => reissue(c.credential_id)}>Reissue</button>
              </span>
            ) : null),
          },
        ]}
        rows={data?.credentials}
        empty="No credentials issued."
      />

      {detail && (
        <section className="mt-4 mb-10 rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
              {detail.credential.credentialId}
            </h2>
            <button type="button" className={btn} onClick={() => setDetail(null)}>Close</button>
          </div>
          <div className="mt-2 grid gap-4 md:grid-cols-2">
            <div>
              <p className="font-sans text-sm text-[var(--color-ink)]">
                Integrity: {detail.integrity.verified
                  ? <Pill tone="ok">hash + signature verified</Pill>
                  : <Pill tone="danger">verification failed</Pill>}
              </p>
              <p className="mt-1 font-mono text-[11px] text-[var(--color-ink-muted)] break-all">bundle hash {detail.credential.bundleHash}</p>
              {detail.credential.revokedReason && (
                <p className="mt-1 font-sans text-[13px] text-[var(--color-danger)]">revoked: “{detail.credential.revokedReason}”</p>
              )}
              <p className="mt-2 font-mono text-[11px] text-[var(--color-ink-muted)]">
                public verification: <span className="select-all">{detail.publicVerifyPath}</span>
              </p>
              <h3 className="mt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">Chain</h3>
              {detail.chain.map((c) => (
                <p key={c.credential_id} className="font-mono text-[11px] text-[var(--color-ink)]">
                  {mono(c.credential_id, 13)}… <Pill tone={STATUS_TONE[c.status]}>{c.status}</Pill> {when(c.issued_at)}
                </p>
              ))}
            </div>
            <div>
              <h3 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">Recent public verifications</h3>
              {detail.verifications.length === 0 ? (
                <p className="font-sans text-[13px] text-[var(--color-ink-muted)]">None recorded.</p>
              ) : (
                detail.verifications.map((v, i) => (
                  <p key={i} className="font-mono text-[11px] text-[var(--color-ink)]">
                    {v.refererHost || 'direct'} · {v.uaFamily || '?'} · {v.disclosure} · {when(v.at)}
                  </p>
                ))
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
