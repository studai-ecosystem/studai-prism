import { useCallback, useEffect, useState } from 'react'
import { Loader2, UserPlus, ShieldCheck, CheckCircle2, XCircle } from 'lucide-react'
import { adminFetch, adminHasPermission, currentAdmin } from '../../lib/adminApi.js'
import { askText } from './ui.jsx'

// ── /admin/admins — administrator management (Phase 1) ───────────────────────
// List, invite, role grant/revoke, account state, dual-approval queue. Actions
// the current role cannot perform are hidden AND the server re-checks anyway
// (the UI is never the security boundary).

const field =
  'w-full rounded-[6px] border border-[var(--prism-border)] bg-[var(--prism-surface)] px-3 py-2 ' +
  'font-sans text-sm text-[var(--prism-ink)] outline-none focus:border-[var(--prism-signal)]'
const label = 'block font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--prism-ink-muted)] mb-1'
const btn =
  'inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--prism-border)] px-3 py-1.5 ' +
  'font-sans text-[13px] text-[var(--prism-ink)] hover:border-[var(--prism-signal)] disabled:opacity-50'

const STATE_STYLE = {
  active: 'text-[var(--status-positive-ink)] border-[var(--status-positive-ink)]',
  invited: 'text-[var(--status-info-ink)] border-[var(--status-info-ink)]',
  suspended: 'text-[var(--status-partial-ink)] border-[var(--status-partial-ink)]',
  locked: 'text-[var(--status-blocked-ink)] border-[var(--status-blocked-ink)]',
  deactivated: 'text-[var(--prism-ink-muted)] border-[var(--prism-border)]',
}

export default function AdminAdmins() {
  const canManage = adminHasPermission('admins:manage')
  const canDecide = adminHasPermission('approvals:decide')
  const me = currentAdmin()

  const [admins, setAdmins] = useState(null)
  const [roles, setRoles] = useState([])
  const [approvals, setApprovals] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showInvite, setShowInvite] = useState(false)
  const [invite, setInvite] = useState({ email: '', name: '', roleKey: '', temporaryPassword: '' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const [a, r, ap] = await Promise.all([
        adminFetch('/api/admin/admins'),
        adminFetch('/api/admin/admins/roles'),
        adminFetch('/api/admin/admins/approvals').catch(() => ({ approvals: [] })),
      ])
      setAdmins(a.admins)
      setRoles(r.roles)
      setApprovals(ap.approvals)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const submitInvite = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const body = {
        email: invite.email.trim(),
        name: invite.name.trim(),
        roleKeys: invite.roleKey ? [invite.roleKey] : [],
        temporaryPassword: invite.temporaryPassword,
      }
      await adminFetch('/api/admin/admins', { method: 'POST', body })
      setNotice(`Invited ${body.email}. Relay the temporary password out-of-band; they must change it and enrol MFA at first login.`)
      setShowInvite(false)
      setInvite({ email: '', name: '', roleKey: '', temporaryPassword: '' })
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const changeState = async (admin, state) => {
    const reason = await askText(`Reason for setting ${admin.email} to ${state}? (recorded in the audit trail)`)
    if (!reason) return
    setError('')
    try {
      await adminFetch(`/api/admin/admins/${admin.admin_id}/state`, { method: 'POST', body: { state, reason } })
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const decide = async (approval, decision) => {
    const reason = await askText(`Reason to mark this request ${decision}?`)
    if (!reason) return
    setError('')
    try {
      await adminFetch(`/api/admin/admins/approvals/${approval.approval_id}/decide`, {
        method: 'POST', body: { decision, reason },
      })
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  if (!admins && !error) {
    return (
      <div className="p-8 flex items-center gap-2 font-sans text-sm text-[var(--prism-ink-muted)]">
        <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Loading administrators…
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display text-xl text-[var(--prism-ink)]">Administrators</h1>
          <p className="font-mono text-[11px] text-[var(--prism-ink-muted)]">
            Role grants are enforced server-side. Elevation to super administrator requires dual approval.
          </p>
        </div>
        {canManage && (
          <button type="button" className={btn} onClick={() => setShowInvite((v) => !v)}>
            <UserPlus size={14} aria-hidden="true" /> Invite administrator
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-[6px] border border-[var(--status-blocked-ink)] bg-[var(--status-blocked-soft)] px-3 py-2 font-sans text-[13px] text-[var(--status-blocked-ink)]">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-4 rounded-[6px] border border-[var(--status-positive-ink)] bg-[var(--status-positive-soft)] px-3 py-2 font-sans text-[13px] text-[var(--prism-ink)]">
          {notice}
        </p>
      )}

      {showInvite && canManage && (
        <form onSubmit={submitInvite} className="mb-6 rounded-[10px] border border-[var(--prism-border)] bg-[var(--prism-surface)] p-4 grid gap-3 md:grid-cols-2">
          <div>
            <label className={label} htmlFor="inv-email">Email</label>
            <input id="inv-email" type="email" required className={field}
              value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
          </div>
          <div>
            <label className={label} htmlFor="inv-name">Name</label>
            <input id="inv-name" className={field}
              value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
          </div>
          <div>
            <label className={label} htmlFor="inv-role">Initial role</label>
            <select id="inv-role" className={field}
              value={invite.roleKey} onChange={(e) => setInvite({ ...invite, roleKey: e.target.value })}>
              <option value="">No role yet</option>
              {roles.filter((r) => !['super_admin', 'break_glass'].includes(r.roleKey)).map((r) => (
                <option key={r.roleKey} value={r.roleKey}>{r.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="inv-pwd">Temporary password (12+ chars, relayed out-of-band)</label>
            <input id="inv-pwd" type="text" required minLength={12} className={field}
              value={invite.temporaryPassword} onChange={(e) => setInvite({ ...invite, temporaryPassword: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <button type="submit" disabled={busy} className={btn}>
              {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <ShieldCheck size={14} aria-hidden="true" />}
              Create invitation
            </button>
          </div>
        </form>
      )}

      <div className="rounded-[10px] border border-[var(--prism-border)] bg-[var(--prism-surface)] overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[var(--prism-border)]">
              {['Administrator', 'Roles', 'State', 'Last sign-in', canManage ? 'Actions' : null].filter(Boolean).map((h) => (
                <th key={h} className="px-4 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--prism-ink-muted)]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(admins || []).map((a) => (
              <tr key={a.admin_id} className="border-b border-[var(--prism-border)] last:border-0 align-top">
                <td className="px-4 py-2.5">
                  <p className="font-sans text-[13px] text-[var(--prism-ink)]">{a.name || '—'}</p>
                  <p className="font-mono text-[11px] text-[var(--prism-ink-muted)]">{a.email}</p>
                </td>
                <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--prism-ink)]">
                  {(a.roles || []).join(', ') || '—'}
                  {a.is_break_glass && <span className="ml-1 text-[var(--status-blocked-ink)]">(break-glass)</span>}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`inline-block rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${STATE_STYLE[a.state] || STATE_STYLE.deactivated}`}>
                    {a.state}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--prism-ink-muted)] whitespace-nowrap">
                  {a.last_login_at ? new Date(a.last_login_at).toLocaleString() : 'never'}
                </td>
                {canManage && (
                  <td className="px-4 py-2.5">
                    {a.admin_id === me?.id ? (
                      <span className="font-mono text-[11px] text-[var(--prism-ink-muted)]">you — self-service only</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {a.state !== 'active' && a.state !== 'invited' && (
                          <button type="button" className={btn} onClick={() => changeState(a, 'active')}>Reactivate</button>
                        )}
                        {a.state === 'active' && (
                          <button type="button" className={btn} onClick={() => changeState(a, 'suspended')}>Suspend</button>
                        )}
                        {a.state !== 'deactivated' && (
                          <button type="button" className={btn} onClick={() => changeState(a, 'deactivated')}>Deactivate</button>
                        )}
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Approvals queue ─────────────────────────────────────────────── */}
      <section className="mt-8 mb-10">
        <h2 className="font-display text-base text-[var(--prism-ink)] mb-2">Approval requests</h2>
        <div className="rounded-[10px] border border-[var(--prism-border)] bg-[var(--prism-surface)]">
          {approvals.length === 0 ? (
            <p className="p-4 font-sans text-sm text-[var(--prism-ink-muted)]">No approval requests.</p>
          ) : (
            approvals.map((ap) => (
              <div key={ap.approval_id} className="p-4 border-b border-[var(--prism-border)] last:border-0 flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-mono text-[12px] text-[var(--prism-ink)]">{ap.action}
                    {ap.entity_id && <span className="text-[var(--prism-ink-muted)]"> · {String(ap.entity_id).slice(0, 8)}</span>}
                  </p>
                  <p className="font-sans text-[13px] text-[var(--prism-ink-muted)]">
                    “{ap.requested_reason}” — {ap.requested_by_email}, {new Date(ap.created_at).toLocaleString()}
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] mt-1 text-[var(--prism-ink-muted)]">
                    {ap.status}{ap.decided_by_email ? ` by ${ap.decided_by_email}` : ''}
                  </p>
                </div>
                {ap.status === 'pending' && canDecide && ap.requested_by !== me?.id && (
                  <div className="flex gap-1.5">
                    <button type="button" className={btn} onClick={() => decide(ap, 'approved')}>
                      <CheckCircle2 size={13} aria-hidden="true" /> Approve
                    </button>
                    <button type="button" className={btn} onClick={() => decide(ap, 'rejected')}>
                      <XCircle size={13} aria-hidden="true" /> Reject
                    </button>
                  </div>
                )}
                {ap.status === 'pending' && ap.requested_by === me?.id && (
                  <p className="font-mono text-[11px] text-[var(--prism-ink-muted)]">awaiting a different super administrator</p>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
