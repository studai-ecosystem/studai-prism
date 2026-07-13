import { useCallback, useEffect, useState } from 'react'
import { adminFetch, adminHasPermission } from '../../lib/adminApi.js'
import { PageHeader, ErrorNotice, Notice, Toolbar, DataTable, Pill, btn, field, when, actWithReason } from './ui.jsx'

// ── /admin/raters — human-rater administration (Phase 3) ─────────────────────
// Tokens are shown exactly once. Hashes are never revealed. Training
// references: draft → active → retired; only active ones train raters.

export default function AdminRaters() {
  const [data, setData] = useState(null)
  const [refs, setRefs] = useState(null)
  const [irr, setIrr] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showRefForm, setShowRefForm] = useState(false)
  const [refDraft, setRefDraft] = useState({ transcript: '', levels: {} })
  const canManage = adminHasPermission('raters:manage')

  const load = useCallback(async () => {
    setError('')
    try {
      const [r, t, i] = await Promise.all([
        adminFetch('/api/admin/raters'),
        adminFetch('/api/admin/raters/training-refs'),
        adminFetch('/api/admin/raters/irr'),
      ])
      setData(r)
      setRefs(t.refs)
      setIrr(i)
    } catch (err) { setError(err.message) }
  }, [])

  useEffect(() => { load() }, [load])

  const run = async (fn, okMsg) => {
    setError(''); setNotice('')
    try {
      const r = await fn()
      if (r === null) return
      if (r?.token) setNotice(`Token (shown once — relay securely): ${r.token}`)
      else if (okMsg) setNotice(okMsg)
      await load()
    } catch (err) { setError(err.message) }
  }

  const createRater = () =>
    run(async () => {
      const handle = window.prompt('Rater handle (no PII — an operator-chosen pseudonym):')
      if (!handle) return null
      return adminFetch('/api/admin/raters', { method: 'POST', body: { handle: handle.trim() } })
    })

  const submitRef = () =>
    run(async () => {
      let transcript
      try {
        transcript = JSON.parse(refDraft.transcript)
      } catch {
        throw new Error('Transcript must be valid JSON: [{"speaker":"avatar","text":"…"},{"speaker":"candidate","text":"…"}]')
      }
      const referenceLevels = Object.fromEntries(
        Object.entries(refDraft.levels).map(([k, v]) => [k, Number(v)]),
      )
      const r = await adminFetch('/api/admin/raters/training-refs', {
        method: 'POST', body: { transcript, referenceLevels },
      })
      setShowRefForm(false)
      setRefDraft({ transcript: '', levels: {} })
      return r
    }, 'Training reference created as DRAFT — activate it after rubric-owner review.')

  const DIMS = ['criticalThinking', 'communication', 'collaboration', 'problemSolving', 'aiDigitalFluency']

  return (
    <div className="p-6 max-w-6xl">
      <PageHeader
        title="Raters"
        subtitle={`Training gate: weighted κ ≥ ${data?.threshold ?? '—'} across ${data?.trainingTotal ?? '—'} active references. Tokens are hashed; nothing here reveals them.`}>
        {canManage && <button type="button" className={btn} onClick={createRater}>Create rater</button>}
      </PageHeader>
      <ErrorNotice error={error} />
      <Notice>{notice}</Notice>

      <DataTable
        rowKey={(r) => r.rater_id}
        columns={[
          { key: 'handle', label: 'Handle', className: 'font-mono text-[12px]' },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'qualified' ? 'ok' : r.status === 'suspended' ? 'danger' : 'info'}>{r.status}</Pill> },
          { key: 'training_kappa', label: 'Training κ', render: (r) => r.training_kappa != null ? Number(r.training_kappa).toFixed(3) : '—', className: 'tabular-nums font-mono text-[11px]' },
          { key: 'training_answered', label: 'Training progress', render: (r) => `${r.training_answered}/${data?.trainingTotal ?? '—'}`, className: 'tabular-nums' },
          { key: 'sessions_rated', label: 'Sessions rated', className: 'tabular-nums' },
          { key: 'last_rated_at', label: 'Last activity', render: (r) => when(r.last_rated_at), className: 'whitespace-nowrap font-mono text-[11px]' },
          {
            key: 'actions', label: '',
            render: (r) => (canManage ? (
              <span className="flex flex-wrap gap-1.5">
                <button type="button" className={btn}
                  onClick={() => run(() => actWithReason(`/api/admin/raters/${r.rater_id}/rotate-token`, {}, 'Reason for rotating this token (audited):'))}>
                  Rotate token
                </button>
                {r.status !== 'suspended' ? (
                  <button type="button" className={btn}
                    onClick={() => run(() => actWithReason(`/api/admin/raters/${r.rater_id}/state`, { state: 'suspended' }, 'Reason for suspension (audited):'), 'Rater suspended.')}>
                    Suspend
                  </button>
                ) : (
                  <button type="button" className={btn}
                    onClick={() => run(() => actWithReason(`/api/admin/raters/${r.rater_id}/state`, { state: 'reactivate' }, 'Reason for reactivation (audited):'), 'Rater reactivated to their earned status.')}>
                    Reactivate
                  </button>
                )}
                <button type="button" className={btn}
                  onClick={() => run(() => actWithReason(`/api/admin/raters/${r.rater_id}/reset-training`, {}, 'Reason for resetting training (audited):'), 'Training reset — answers wiped, back to training.')}>
                  Reset training
                </button>
              </span>
            ) : null),
          },
        ]}
        rows={data?.raters}
        empty="No raters yet."
      />

      {/* ── Training references ─────────────────────────────────────────── */}
      <div className="mt-8 flex items-center justify-between">
        <h2 className="font-display text-base text-[var(--color-ink)]">Training references</h2>
        {canManage && (
          <button type="button" className={btn} onClick={() => setShowRefForm((v) => !v)}>
            {showRefForm ? 'Cancel' : 'New reference (draft)'}
          </button>
        )}
      </div>

      {showRefForm && (
        <div className="mt-3 rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <label className="block font-mono text-[11px] uppercase text-[var(--color-ink-muted)]">
            Transcript JSON (blinded — no scores, no identity)
            <textarea rows={5} className={`${field} w-full mt-1 font-mono text-[12px]`}
              value={refDraft.transcript}
              onChange={(e) => setRefDraft({ ...refDraft, transcript: e.target.value })}
              placeholder='[{"speaker":"avatar","text":"…"},{"speaker":"candidate","text":"…"}]' />
          </label>
          <div className="grid gap-2 md:grid-cols-5 mt-3">
            {DIMS.map((d) => (
              <label key={d} className="font-mono text-[10px] uppercase text-[var(--color-ink-muted)]">
                {d}
                <input type="number" min="0" max="4" className={`${field} w-full mt-1 tabular-nums`}
                  value={refDraft.levels[d] ?? ''}
                  onChange={(e) => setRefDraft({ ...refDraft, levels: { ...refDraft.levels, [d]: e.target.value } })} />
              </label>
            ))}
          </div>
          <button type="button" className={`${btn} mt-3`} onClick={submitRef}>Create draft reference</button>
        </div>
      )}

      <div className="mt-3">
        <DataTable
          rowKey={(r) => r.ref_id}
          columns={[
            { key: 'ref_id', label: 'Reference', render: (r) => `${String(r.ref_id).slice(0, 8)}…`, className: 'font-mono text-[12px]' },
            { key: 'rubric_version', label: 'Rubric', className: 'font-mono text-[11px]' },
            { key: 'turn_count', label: 'Turns', className: 'tabular-nums' },
            { key: 'answer_count', label: 'Answers', className: 'tabular-nums' },
            { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'active' ? 'ok' : r.status === 'draft' ? 'info' : 'muted'}>{r.status}</Pill> },
            { key: 'created_at', label: 'Created', render: (r) => when(r.created_at), className: 'whitespace-nowrap font-mono text-[11px]' },
            {
              key: 'actions', label: '',
              render: (r) => (canManage ? (
                <span className="flex gap-1.5">
                  {r.status === 'draft' && (
                    <button type="button" className={btn}
                      onClick={() => run(() => actWithReason(`/api/admin/raters/training-refs/${r.ref_id}/status`, { status: 'active' }, 'Rubric-owner review note (audited):'), 'Reference activated — it now trains raters.')}>
                      Activate
                    </button>
                  )}
                  {r.status === 'active' && (
                    <button type="button" className={btn}
                      onClick={() => run(() => actWithReason(`/api/admin/raters/training-refs/${r.ref_id}/status`, { status: 'retired' }, 'Reason for retiring (audited):'), 'Reference retired.')}>
                      Retire
                    </button>
                  )}
                </span>
              ) : null),
            },
          ]}
          rows={refs}
          empty="No training references."
        />
      </div>

      {/* ── IRR ─────────────────────────────────────────────────────────── */}
      <h2 className="mt-8 font-display text-base text-[var(--color-ink)]">Inter-rater reliability (human–human)</h2>
      <div className="mt-2 mb-10">
        <DataTable
          rowKey={(p) => `${p.raterA}|${p.raterB}`}
          columns={[
            { key: 'raterA', label: 'Rater A', render: (p) => `${String(p.raterA).slice(0, 8)}…`, className: 'font-mono text-[11px]' },
            { key: 'raterB', label: 'Rater B', render: (p) => `${String(p.raterB).slice(0, 8)}…`, className: 'font-mono text-[11px]' },
            { key: 'sharedSessions', label: 'Shared sessions', className: 'tabular-nums' },
            {
              key: 'kappa', label: 'Weighted κ',
              render: (p) => (
                <span className={`tabular-nums font-mono text-[12px] ${p.kappa >= (irr?.threshold ?? 0.6) ? 'text-[var(--color-success)]' : 'text-[var(--color-reliability-moderate)]'}`}>
                  {p.kappa != null ? Number(p.kappa).toFixed(3) : '—'}
                </span>
              ),
            },
          ]}
          rows={irr?.humanHumanPairs}
          empty="No overlapping double-rated sessions yet."
        />
      </div>
    </div>
  )
}
