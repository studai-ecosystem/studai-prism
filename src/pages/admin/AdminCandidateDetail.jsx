import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { adminFetch, adminHasPermission } from '../../lib/adminApi.js'
import { PageHeader, ErrorNotice, Notice, Pill, btn, btnDanger, field, when, actWithReason } from './ui.jsx'

// ── /admin/candidates/:id — candidate 360° (Phase 2) ─────────────────────────
// Tabs: Overview · Assessments · Reports · Payments · Consent · Verification ·
// Credentials · Audit. Actions are permission-gated in the UI AND re-checked
// server-side. There is deliberately no score-edit control anywhere here.

const TABS = ['Overview', 'Assessments', 'Reports', 'Payments', 'Consent', 'Verification', 'Credentials', 'Audit']

export default function AdminCandidateDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState('Overview')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ name: '', college: '', year: '' })

  const load = useCallback(async () => {
    setError('')
    try {
      const d = await adminFetch(`/api/admin/users/${id}`)
      setData(d)
      setDraft({ name: d.user.name, college: d.user.college, year: d.user.year })
    } catch (err) {
      setError(err.message)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  if (!data && !error) {
    return (
      <div className="p-8 flex items-center gap-2 font-sans text-sm text-[var(--color-ink-muted)]">
        <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Loading candidate…
      </div>
    )
  }
  if (error && !data) {
    return <div className="p-6"><ErrorNotice error={error} /></div>
  }

  const { user, sessions, reports, perSession, timeline, credentials, notes, audit } = data
  const canWrite = adminHasPermission('users:write')
  const canSuspend = adminHasPermission('users:suspend')
  const canGrant = adminHasPermission('payments:grant')

  const run = async (fn, okMsg) => {
    setError('')
    setNotice('')
    try {
      const r = await fn()
      if (r === null) return // prompt cancelled
      if (okMsg) setNotice(okMsg)
      if (r?.temporaryPassword) {
        setNotice(`Temporary password (shown once): ${r.temporaryPassword}`)
      }
      if (r?.entitlement?.sessionId) {
        setNotice(`Entitlement granted. Session id (relay to candidate): ${r.entitlement.sessionId}`)
      }
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const saveProfile = async () => {
    await run(async () => {
      const reason = window.prompt('Reason for this profile edit (audited):')
      if (!reason) return null
      return adminFetch(`/api/admin/users/${id}`, { method: 'PATCH', body: { ...draft, reason } })
    }, 'Profile updated.')
    setEditing(false)
  }

  return (
    <div className="p-6 max-w-5xl">
      <PageHeader
        title={user.name || user.email}
        subtitle={`candidate ${user.id.slice(0, 8)} · ${user.candidateId ? `spine ${user.candidateId.slice(0, 8)}` : 'no candidate spine yet'}`}
      >
        <Pill tone={user.accountState === 'suspended' ? 'danger' : 'ok'}>{user.accountState}</Pill>
      </PageHeader>
      <ErrorNotice error={error} />
      <Notice>{notice}</Notice>

      <nav className="flex gap-1.5 mb-4 flex-wrap" aria-label="Candidate tabs">
        {TABS.map((t) => (
          <button
            key={t} type="button" onClick={() => setTab(t)}
            className={`rounded-[6px] px-3 py-1.5 font-sans text-[13px] border ${
              tab === t
                ? 'border-[var(--color-accent)] text-[var(--color-ink)] bg-[var(--color-surface)]'
                : 'border-[var(--color-line)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === 'Overview' && (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-2">Profile</h2>
            {editing ? (
              <div className="grid gap-2">
                {['name', 'college', 'year'].map((k) => (
                  <label key={k} className="font-mono text-[11px] uppercase text-[var(--color-ink-muted)]">
                    {k}
                    <input className={`${field} w-full mt-1`} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
                  </label>
                ))}
                <div className="flex gap-2 mt-1">
                  <button type="button" className={btn} onClick={saveProfile}>Save (reason required)</button>
                  <button type="button" className={btn} onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <dl className="font-sans text-sm text-[var(--color-ink)] space-y-1">
                <div><dt className="inline text-[var(--color-ink-muted)]">Email: </dt><dd className="inline font-mono text-[12px]">{user.email}</dd></div>
                <div><dt className="inline text-[var(--color-ink-muted)]">College: </dt><dd className="inline">{user.college || '—'}</dd></div>
                <div><dt className="inline text-[var(--color-ink-muted)]">Year: </dt><dd className="inline">{user.year || '—'}</dd></div>
                <div><dt className="inline text-[var(--color-ink-muted)]">Created: </dt><dd className="inline">{when(user.createdAt)}</dd></div>
              </dl>
            )}
            {!editing && canWrite && (
              <button type="button" className={`${btn} mt-3`} onClick={() => setEditing(true)}>Edit profile</button>
            )}
            <p className="mt-2 font-mono text-[10px] text-[var(--color-ink-muted)]">
              Email changes require a verified workflow (Phase 6) — not editable here.
            </p>
          </section>

          <section className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-2">Account actions</h2>
            <div className="flex flex-wrap gap-2">
              {canSuspend && user.accountState !== 'suspended' && (
                <button type="button" className={btnDanger}
                  onClick={() => run(() => actWithReason(`/api/admin/users/${id}/state`, { state: 'suspended' }, 'Reason for suspension (audited):'), 'Account suspended; live sign-ins revoked.')}>
                  Suspend account
                </button>
              )}
              {canSuspend && user.accountState === 'suspended' && (
                <button type="button" className={btn}
                  onClick={() => run(() => actWithReason(`/api/admin/users/${id}/state`, { state: 'active' }, 'Reason for reactivation (audited):'), 'Account reactivated.')}>
                  Reactivate
                </button>
              )}
              {canSuspend && (
                <button type="button" className={btn}
                  onClick={() => run(() => actWithReason(`/api/admin/users/${id}/revoke-sessions`, {}, 'Reason for revoking sign-ins (audited):'), 'All candidate sign-ins revoked.')}>
                  Revoke sign-ins
                </button>
              )}
              {canWrite && (
                <button type="button" className={btn}
                  onClick={() => run(() => actWithReason(`/api/admin/users/${id}/reset-password`, {}, 'Reason for password reset (audited):'))}>
                  Reset password
                </button>
              )}
              {canGrant && (
                <button type="button" className={btn}
                  onClick={() => run(() => actWithReason(`/api/admin/users/${id}/entitlement`, {}, 'Reason for granting a free assessment (audited):'))}>
                  Grant assessment
                </button>
              )}
            </div>
            <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mt-4 mb-2">Support notes</h2>
            {notes.length === 0 ? (
              <p className="font-sans text-sm text-[var(--color-ink-muted)]">No notes.</p>
            ) : (
              notes.map((n) => (
                <p key={n.note_id} className="font-sans text-[13px] text-[var(--color-ink)] border-b border-[var(--color-line)] last:border-0 py-1.5">
                  {n.body} <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">— {n.author}, {when(n.created_at)}</span>
                </p>
              ))
            )}
            <button type="button" className={`${btn} mt-2`}
              onClick={() => run(async () => {
                const body = window.prompt('Note (internal, never shown to the candidate):')
                if (!body) return null
                return adminFetch(`/api/admin/users/${id}/notes`, { method: 'POST', body: { body } })
              }, 'Note added.')}>
              Add note
            </button>
          </section>
        </div>
      )}

      {tab === 'Assessments' && (
        <section className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] divide-y divide-[var(--color-line)]">
          {sessions.length === 0 ? <p className="p-4 font-sans text-sm text-[var(--color-ink-muted)]">No sessions.</p> :
            sessions.map((s) => (
              <button key={s.sessionId} type="button" onClick={() => navigate(`/admin/sessions/${s.sessionId}`)}
                className="w-full text-left p-3 hover:bg-[var(--color-paper)] flex items-center justify-between gap-3 flex-wrap">
                <span className="font-mono text-[12px] text-[var(--color-ink)]">{s.sessionId.slice(0, 13)}…</span>
                <span className="font-sans text-[13px] text-[var(--color-ink-muted)]">{s.scenarioId || '—'} · {s.language}</span>
                <Pill tone={s.completedAt ? 'ok' : 'info'}>{s.completedAt ? 'completed' : 'active'}</Pill>
                <span className="font-mono text-[11px] text-[var(--color-ink-muted)]">{when(s.startedAt)}</span>
              </button>
            ))}
        </section>
      )}

      {tab === 'Reports' && (
        <section className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] divide-y divide-[var(--color-line)]">
          {reports.length === 0 ? <p className="p-4 font-sans text-sm text-[var(--color-ink-muted)]">No reports issued.</p> :
            reports.map((r) => (
              <div key={r.sessionId} className="p-3 flex items-center justify-between gap-3 flex-wrap">
                <Link to={`/admin/reports/${r.sessionId}`} className="font-mono text-[12px] text-[var(--color-accent)] underline">
                  {r.sessionId.slice(0, 13)}…
                </Link>
                <span className="font-display text-lg text-[var(--color-ink)] tabular-nums">{r.overall ?? '—'}</span>
                {r.correction && <Pill tone="warn">corrected v{r.correction.version}</Pill>}
                {r.flaggedForReview && <Pill tone="warn">flagged</Pill>}
                <span className="font-mono text-[11px] text-[var(--color-ink-muted)]">{when(r.issuedAt)}</span>
              </div>
            ))}
        </section>
      )}

      {tab === 'Payments' && (
        <section className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] divide-y divide-[var(--color-line)]">
          {sessions.length === 0 ? <p className="p-4 font-sans text-sm text-[var(--color-ink-muted)]">No entitlements.</p> :
            sessions.map((s) => {
              const ent = perSession[s.sessionId]?.entitlement
              if (!ent) return null
              return (
                <div key={s.sessionId} className="p-3 flex items-center justify-between gap-3 flex-wrap font-sans text-[13px]">
                  <span className="font-mono text-[12px]">{s.sessionId.slice(0, 13)}…</span>
                  <Pill tone={ent.mode === 'paid' ? 'ok' : 'muted'}>{ent.mode}</Pill>
                  <span className="tabular-nums">{ent.amount != null ? `₹${(ent.amount / 100).toFixed(2)}` : '—'}</span>
                  <span className="font-mono text-[11px] text-[var(--color-ink-muted)]">{ent.paymentId || 'no payment id'}</span>
                  <Pill tone={ent.consumed ? 'muted' : 'info'}>{ent.consumed ? 'consumed' : 'unused'}</Pill>
                </div>
              )
            })}
        </section>
      )}

      {tab === 'Consent' && (
        <section className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] divide-y divide-[var(--color-line)]">
          {sessions.every((s) => !perSession[s.sessionId]?.consent) ? (
            <p className="p-4 font-sans text-sm text-[var(--color-ink-muted)]">No consent records.</p>
          ) : (
            sessions.map((s) => {
              const c = perSession[s.sessionId]?.consent
              if (!c) return null
              return (
                <div key={s.sessionId} className="p-3 font-sans text-[13px]">
                  <p className="font-mono text-[12px] text-[var(--color-ink)]">{s.sessionId.slice(0, 13)}… · v{c.version || '?'} · {when(c.at)}</p>
                  <p className="text-[var(--color-ink-muted)] mt-1">{(c.scopes || []).join(', ') || 'no scopes'}</p>
                  <p className="font-mono text-[10px] text-[var(--color-ink-muted)] mt-1">Consent records are read-only. Withdrawals arrive via the privacy workflow (Phase 6).</p>
                </div>
              )
            })
          )}
        </section>
      )}

      {tab === 'Verification' && (
        <section className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] divide-y divide-[var(--color-line)]">
          {sessions.every((s) => !perSession[s.sessionId]?.verification) ? (
            <p className="p-4 font-sans text-sm text-[var(--color-ink-muted)]">No verification records.</p>
          ) : (
            sessions.map((s) => {
              const v = perSession[s.sessionId]?.verification
              if (!v) return null
              return (
                <div key={s.sessionId} className="p-3 font-sans text-[13px] flex items-center gap-3 flex-wrap">
                  <span className="font-mono text-[12px]">{s.sessionId.slice(0, 13)}…</span>
                  <Pill tone={v.status === 'verified' ? 'ok' : 'warn'}>{v.status || 'unknown'}</Pill>
                  <span>name match: {v.nameMatch ? 'yes' : 'no'}</span>
                  {v.pii === 'masked'
                    ? <Pill tone="muted">identity fields masked</Pill>
                    : <span className="font-mono text-[11px] text-[var(--color-ink-muted)]">{v.fullName} · DOB {v.dob} · Aadhaar •••• {v.aadhaarLast4}</span>}
                </div>
              )
            })
          )}
        </section>
      )}

      {tab === 'Credentials' && (
        <section className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] divide-y divide-[var(--color-line)]">
          {credentials.length === 0 ? <p className="p-4 font-sans text-sm text-[var(--color-ink-muted)]">No credentials issued.</p> :
            credentials.map((c) => (
              <div key={c.credential_id} className="p-3 flex items-center gap-3 flex-wrap font-sans text-[13px]">
                <span className="font-mono text-[12px]">{String(c.credential_id).slice(0, 13)}…</span>
                <Pill tone={c.status === 'active' ? 'ok' : c.status === 'revoked' ? 'danger' : 'warn'}>{c.status}</Pill>
                <span className="font-mono text-[11px] text-[var(--color-ink-muted)]">{c.schema_version} · {when(c.issued_at)}</span>
                <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">Lifecycle actions live in the credential console (Phase 4).</span>
              </div>
            ))}
        </section>
      )}

      {tab === 'Audit' && (
        <section className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] divide-y divide-[var(--color-line)]">
          {audit.length === 0 ? <p className="p-4 font-sans text-sm text-[var(--color-ink-muted)]">No admin events for this candidate.</p> :
            audit.map((a, i) => (
              <div key={i} className="p-3 font-sans text-[13px] flex items-center gap-3 flex-wrap">
                <span className="font-mono text-[12px] text-[var(--color-ink)]">{a.action}</span>
                <span className="text-[var(--color-ink-muted)]">{a.admin_email}</span>
                {a.reason && <span className="text-[var(--color-ink-muted)]">“{a.reason}”</span>}
                <span className="font-mono text-[11px] text-[var(--color-ink-muted)]">{when(a.created_at)}</span>
              </div>
            ))}
          {timeline.length > 0 && (
            <div className="p-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-1">Assessment timeline (pseudonymous spine)</p>
              {timeline.map((t) => (
                <p key={t.session_id} className="font-mono text-[11px] text-[var(--color-ink-muted)]">
                  #{t.attempt_no} {t.scenario_key} · {t.scale_version} · {t.language} {t.is_synthetic ? '· synthetic' : ''} · {when(t.completed_at)}
                </p>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
