import { useCallback, useEffect, useState } from 'react'
import { adminFetch, adminHasPermission } from '../../lib/adminApi.js'
import { PageHeader, ErrorNotice, Notice, Toolbar, DataTable, Pill, btn, field, when, mono, actWithReason } from './ui.jsx'

// ── /admin/teamfit — team simulation administration (Phase 4) ────────────────
// Consent-gated membership; qualitative observations only (no numeric fit —
// permanent rule); removing a member never rewrites recorded simulations.

export default function AdminTeamfit() {
  const [data, setData] = useState(null)
  const [teamDetail, setTeamDetail] = useState(null)
  const [simDetail, setSimDetail] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [draft, setDraft] = useState({ name: '', members: '' })
  const canManage = adminHasPermission('teamfit:manage')

  const load = useCallback(async () => {
    setError('')
    try {
      setData(await adminFetch('/api/admin/teamfit/teams'))
    } catch (err) { setError(err.message) }
  }, [])

  useEffect(() => { load() }, [load])

  const run = async (fn, okMsg) => {
    setError(''); setNotice('')
    try {
      const r = await fn()
      if (r === null) return
      if (okMsg) setNotice(okMsg)
      if (r?.note) setNotice(r.note)
      await load()
      if (teamDetail) await openTeam({ team_id: teamDetail.team.team_id })
    } catch (err) {
      setError(err.missingConsent
        ? `${err.message} Missing: ${err.missingConsent.join(', ')}`
        : err.message)
    }
  }

  const create = (e) => {
    e.preventDefault()
    run(async () => {
      const memberSessionIds = draft.members.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
      const r = await adminFetch('/api/admin/teamfit/teams', {
        method: 'POST', body: { name: draft.name.trim(), memberSessionIds },
      })
      setShowCreate(false)
      setDraft({ name: '', members: '' })
      return r
    }, 'Team registered from consented sessions.')
  }

  const openTeam = async (team) => {
    setError(''); setSimDetail(null)
    try {
      setTeamDetail(await adminFetch(`/api/admin/teamfit/teams/${team.team_id}`))
    } catch (err) { setError(err.message) }
  }

  const openSim = async (teamfitId) => {
    setError('')
    try {
      setSimDetail(await adminFetch(`/api/admin/teamfit/sessions/${teamfitId}`))
    } catch (err) { setError(err.message) }
  }

  const removeMember = (teamId, sessionId) =>
    run(async () => {
      const reason = window.prompt('Reason for removing this member (audited; recorded simulations remain unchanged):')
      if (!reason) return null
      return adminFetch(`/api/admin/teamfit/teams/${teamId}/members/${sessionId}`, {
        method: 'DELETE', body: { reason },
      })
    })

  return (
    <div className="p-6 max-w-6xl">
      <PageHeader
        title="Team simulation"
        subtitle="Membership requires each member's own teamfit_profile_use consent. Observations are qualitative only — no numeric fit score exists, permanently.">
        {canManage && (
          <button type="button" className={btn} onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? 'Cancel' : 'Create team'}
          </button>
        )}
      </PageHeader>
      <ErrorNotice error={error} />
      <Notice>{notice}</Notice>

      {data?.simulationPlane && (
        <p className="mb-3 font-mono text-[11px] text-[var(--color-ink-muted)]">{data.simulationPlane}</p>
      )}

      {showCreate && canManage && (
        <form onSubmit={create} className="mb-4 rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <label className="font-mono text-[11px] uppercase text-[var(--color-ink-muted)]">
            Team name
            <input required className={`${field} w-full mt-1`} value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label className="block mt-3 font-mono text-[11px] uppercase text-[var(--color-ink-muted)]">
            Member session ids (2+, whitespace/comma separated — each must carry the consent scope)
            <textarea required rows={3} className={`${field} w-full mt-1 font-mono text-[12px]`} value={draft.members}
              onChange={(e) => setDraft({ ...draft, members: e.target.value })} />
          </label>
          <button type="submit" className={`${btn} mt-3`}>Register team</button>
        </form>
      )}

      <Toolbar onRefresh={load} />
      <DataTable
        rowKey={(t) => t.team_id}
        onRowClick={openTeam}
        columns={[
          { key: 'name', label: 'Team' },
          { key: 'members', label: 'Members', className: 'tabular-nums' },
          { key: 'simulations', label: 'Simulations', className: 'tabular-nums' },
          { key: 'archived_at', label: 'State', render: (t) => t.archived_at ? <Pill tone="muted">archived</Pill> : <Pill tone="ok">active</Pill> },
          { key: 'created_at', label: 'Created', render: (t) => when(t.created_at), className: 'whitespace-nowrap font-mono text-[11px]' },
          {
            key: 'actions', label: '',
            render: (t) => (canManage && !t.archived_at ? (
              <button type="button" className={btn}
                onClick={(e) => { e.stopPropagation(); run(() => actWithReason(`/api/admin/teamfit/teams/${t.team_id}/archive`, {}, 'Reason for archiving (soft — history stays readable):')) }}>
                Archive
              </button>
            ) : null),
          },
        ]}
        rows={data?.teams}
        empty="No teams registered."
      />

      {teamDetail && (
        <section className="mt-4 rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base text-[var(--color-ink)]">{teamDetail.team.name}</h2>
            <button type="button" className={btn} onClick={() => setTeamDetail(null)}>Close</button>
          </div>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-1">Members (consent evidence)</h3>
              {teamDetail.members.map((m) => (
                <p key={m.member_session_id} className="font-mono text-[11px] text-[var(--color-ink)] flex items-center gap-2 py-0.5">
                  {mono(m.member_session_id, 13)}… <span className="text-[var(--color-ink-muted)]">consent verified {when(m.consent_verified_at)}</span>
                  {canManage && !teamDetail.team.archived_at && (
                    <button type="button" className={`${btn} ml-auto`} onClick={() => removeMember(teamDetail.team.team_id, m.member_session_id)}>Remove</button>
                  )}
                </p>
              ))}
              {canManage && !teamDetail.team.archived_at && (
                <button type="button" className={`${btn} mt-2`}
                  onClick={() => run(async () => {
                    const memberSessionId = window.prompt('Session id of the consented member to add:')
                    if (!memberSessionId) return null
                    return adminFetch(`/api/admin/teamfit/teams/${teamDetail.team.team_id}/members`, {
                      method: 'POST', body: { memberSessionId: memberSessionId.trim() },
                    })
                  }, 'Member added.')}>
                  Add consented member
                </button>
              )}
            </div>
            <div>
              <h3 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-1">Simulations</h3>
              {teamDetail.simulations.length === 0 ? (
                <p className="font-sans text-[13px] text-[var(--color-ink-muted)]">None recorded.</p>
              ) : (
                teamDetail.simulations.map((s) => (
                  <button key={s.teamfit_id} type="button" onClick={() => openSim(s.teamfit_id)}
                    className="block w-full text-left font-mono text-[11px] text-[var(--color-accent)] underline py-0.5">
                    {mono(s.teamfit_id, 13)}… · {s.turn_count} turns · {s.has_observations ? 'observed' : 'no observations'} · {when(s.created_at)}
                  </button>
                ))
              )}
            </div>
          </div>
        </section>
      )}

      {simDetail && (
        <section className="mt-4 mb-10 rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
              Simulation {simDetail.session.teamfit_id} · {simDetail.session.team_name}
            </h2>
            <button type="button" className={btn} onClick={() => setSimDetail(null)}>Close</button>
          </div>
          <div className="mt-2 grid gap-4 md:grid-cols-2">
            <div className="max-h-72 overflow-y-auto space-y-2">
              {(simDetail.session.turns || []).map((turn, i) => (
                <div key={i} className="font-sans text-[13px]">
                  <span className="font-mono text-[10px] uppercase text-[var(--color-ink-muted)]">{turn.speaker || turn.name || '?'}</span>
                  <p className="text-[var(--color-ink)] whitespace-pre-wrap">{String(turn.text || turn.content || '')}</p>
                </div>
              ))}
            </div>
            <div>
              <h3 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-1">Qualitative observations</h3>
              {simDetail.session.observations?.observations?.length ? (
                simDetail.session.observations.observations.map((o, i) => (
                  <div key={i} className="mb-2 font-sans text-[13px]">
                    <p className="text-[var(--color-ink)]">{o.theme || o.observation || JSON.stringify(o)}</p>
                    {o.evidence && <p className="font-mono text-[11px] text-[var(--color-ink-muted)]">“{o.evidence}”</p>}
                  </div>
                ))
              ) : (
                <p className="font-sans text-[13px] text-[var(--color-ink-muted)]">No observations recorded.</p>
              )}
              <p className="mt-2 font-mono text-[10px] text-[var(--color-ink-muted)]">{simDetail.note}</p>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
