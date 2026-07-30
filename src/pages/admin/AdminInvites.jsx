import { useCallback, useEffect, useState } from 'react'
import { adminFetch, adminHasPermission } from '../../lib/adminApi.js'
import { PageHeader, ErrorNotice, Notice, Pill, btn, field, mono } from './ui.jsx'

// ── /admin/invites — group assessment invite links ────────────────────────────
// An invite link admits up to N signed-in candidates (default 10) to start one
// assessment each inside a time window — the college cohort flow. The link
// token is displayed ONCE at creation; copy it before leaving the page.

function fmt(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) } catch { return '—' }
}

const STATUS_TONE = { active: 'ok', scheduled: 'info', exhausted: 'warn', expired: 'muted', revoked: 'danger' }

export default function AdminInvites() {
  const [invites, setInvites] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [creating, setCreating] = useState(false)
  const [createdLink, setCreatedLink] = useState(null) // { url, invite }
  const [form, setForm] = useState({ label: '', maxUses: 10, expiresAt: '' })
  const [detail, setDetail] = useState(null) // { invite, redemptions }
  const canManage = adminHasPermission('invites:manage')

  const reload = useCallback(async () => {
    setError('')
    try {
      const r = await adminFetch('/api/admin/invites')
      setInvites(r.invites || [])
    } catch (err) { setError(err.message) }
  }, [])
  useEffect(() => { reload() }, [reload])

  const handleCreate = async (e) => {
    e.preventDefault()
    setError(''); setNotice(''); setCreatedLink(null)
    try {
      const r = await adminFetch('/api/admin/invites', {
        method: 'POST',
        body: JSON.stringify({
          label: form.label,
          maxUses: Number(form.maxUses),
          expiresAt: new Date(form.expiresAt).toISOString(),
        }),
      })
      setCreatedLink({ url: `${window.location.origin}${r.path}`, invite: r.invite })
      setCreating(false)
      setForm({ label: '', maxUses: 10, expiresAt: '' })
      reload()
    } catch (err) { setError(err.message) }
  }

  const handleRevoke = async (invite) => {
    const reason = window.prompt(`Reason for revoking "${invite.label}" (audited):`)
    if (!reason) return
    setError(''); setNotice('')
    try {
      await adminFetch(`/api/admin/invites/${invite.inviteId}/revoke`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      })
      setNotice('Invite revoked. Unused seats can no longer be redeemed.')
      reload()
    } catch (err) { setError(err.message) }
  }

  const openDetail = async (invite) => {
    setError('')
    try {
      setDetail(await adminFetch(`/api/admin/invites/${invite.inviteId}`))
    } catch (err) { setError(err.message) }
  }

  return (
    <div className="p-6 max-w-6xl">
      <PageHeader
        title="Group assessment invites"
        subtitle="One link, a seat limit, a time window. Redeemed sessions are real candidates — they count for calibration.">
        {canManage && (
          <button type="button" className={btn} onClick={() => { setCreating((v) => !v); setCreatedLink(null) }}>
            {creating ? 'Cancel' : 'Create invite link'}
          </button>
        )}
      </PageHeader>
      <ErrorNotice error={error} />
      <Notice>{notice}</Notice>

      {createdLink && (
        <div className="mb-4 rounded-[10px] border border-[var(--color-accent)] bg-[var(--color-surface)] p-4">
          <p className="text-sm font-semibold text-[var(--color-ink)]">
            Invite created — copy this link now. It is shown only once.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <code className={`${mono} text-[13px] break-all flex-1`}>{createdLink.url}</code>
            <button
              type="button"
              className={btn}
              onClick={() => navigator.clipboard?.writeText(createdLink.url).then(() => setNotice('Link copied.'))}
            >
              Copy
            </button>
          </div>
          <p className="text-[12px] text-[var(--color-ink-muted)] mt-2">
            {createdLink.invite.label} · {createdLink.invite.maxUses} seats · closes {fmt(createdLink.invite.expiresAt)}
          </p>
        </div>
      )}

      {creating && (
        <form onSubmit={handleCreate} className="mb-6 rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 flex flex-col gap-3 max-w-md">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">Label (college · batch)</span>
            <input className={field} required value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="e.g. IIT Madras — Placement batch 2027" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">Seats (1–100)</span>
            <input className={field} type="number" min={1} max={100} required value={form.maxUses}
              onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">Link closes at</span>
            <input className={field} type="datetime-local" required value={form.expiresAt}
              onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} />
          </label>
          <div>
            <button type="submit" className={btn}>Create link</button>
          </div>
        </form>
      )}

      <div className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-[var(--color-line)]">
              {['Label', 'Status', 'Seats', 'Window', 'Created', ''].map((h) => (
                <th key={h} className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invites.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--color-ink-muted)]">No invites yet.</td></tr>
            )}
            {invites.map((inv) => (
              <tr key={inv.inviteId} className="border-b border-[var(--color-line)] last:border-0">
                <td className="px-4 py-2.5 text-[var(--color-ink)]">{inv.label}</td>
                <td className="px-4 py-2.5"><Pill tone={STATUS_TONE[inv.status] || 'muted'}>{inv.status}</Pill></td>
                <td className={`px-4 py-2.5 ${mono} tabular-nums`}>{inv.usedCount}/{inv.maxUses}</td>
                <td className="px-4 py-2.5 text-[12px] text-[var(--color-ink-muted)]">{fmt(inv.startsAt)} → {fmt(inv.expiresAt)}</td>
                <td className="px-4 py-2.5 text-[12px] text-[var(--color-ink-muted)]">{fmt(inv.createdAt)}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <button type="button" className="underline text-[13px] mr-3" onClick={() => openDetail(inv)}>Roster</button>
                  {canManage && !inv.revokedAt && (
                    <button type="button" className="underline text-[13px] text-[var(--color-danger)]" onClick={() => handleRevoke(inv)}>Revoke</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="mt-6 rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-[var(--color-ink)]">Roster — {detail.invite.label}</p>
            <button type="button" className="underline text-[13px]" onClick={() => setDetail(null)}>Close</button>
          </div>
          {detail.redemptions.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--color-ink-muted)]">No redemptions yet.</p>
          ) : (
            <table className="w-full text-sm mt-3">
              <thead>
                <tr className="text-left border-b border-[var(--color-line)]">
                  {['Candidate', 'Session', 'Redeemed'].map((h) => (
                    <th key={h} className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.redemptions.map((r) => (
                  <tr key={r.redemptionId} className="border-b border-[var(--color-line)] last:border-0">
                    <td className="px-3 py-2">{r.userEmail || '—'}</td>
                    <td className={`px-3 py-2 ${mono} text-[12px]`}>{r.sessionId}</td>
                    <td className="px-3 py-2 text-[12px] text-[var(--color-ink-muted)]">{fmt(r.redeemedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
