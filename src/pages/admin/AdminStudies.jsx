import { useCallback, useEffect, useState } from 'react'
import { adminFetch, adminHasPermission } from '../../lib/adminApi.js'
import { PageHeader, ErrorNotice, Notice, Toolbar, DataTable, Pill, btn, field, when, mono } from './ui.jsx'

// ── /admin/studies — Study Runner administration (Phase 3) ───────────────────
// Preregistrations are editable ONLY before activation. Arm assignments are
// immutable; results are append-only supersession chains (DB triggers).

const STATUS_TONE = { preregistered: 'info', active: 'ok', complete: 'muted', abandoned: 'danger' }

export default function AdminStudies() {
  const [data, setData] = useState(null)
  const [results, setResults] = useState(null) // {studyKey, rows}
  const [ratings, setRatings] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [draft, setDraft] = useState({ studyKey: '', title: '', hypothesis: '', preregisteredMetric: '', protocolDoc: '' })
  const [showRating, setShowRating] = useState(false)
  const [rating, setRating] = useState({ sessionId: '', sourceOrg: '', exerciseType: '', raterRole: '', score: '', notes: '', supersedes: '' })
  const canManage = adminHasPermission('studies:manage')
  const canCompute = adminHasPermission('studies:compute')

  const load = useCallback(async () => {
    setError('')
    try {
      const [s, er] = await Promise.all([
        adminFetch('/api/admin/studies'),
        adminFetch('/api/admin/studies/external-ratings/list'),
      ])
      setData(s)
      setRatings(er.ratings)
    } catch (err) { setError(err.message) }
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

  const create = (e) => {
    e.preventDefault()
    run(async () => {
      const r = await adminFetch('/api/admin/studies', { method: 'POST', body: draft })
      setShowCreate(false)
      setDraft({ studyKey: '', title: '', hypothesis: '', preregisteredMetric: '', protocolDoc: '' })
      return r
    }, 'Preregistration created. It is editable until activation, then immutable.')
  }

  const transition = (study, status) =>
    run(async () => {
      const reason = window.prompt(`Reason for moving '${study.study_key}' to ${status} (audited):`)
      if (!reason) return null
      return adminFetch(`/api/admin/studies/${study.study_key}/status`, { method: 'POST', body: { status, reason } })
    }, `Study moved to ${status}.`)

  const editStudy = (study) =>
    run(async () => {
      const title = window.prompt('New title (editable only while preregistered):', study.title)
      if (title === null) return null
      const reason = window.prompt('Reason for the amendment (audited):')
      if (!reason) return null
      return adminFetch(`/api/admin/studies/${study.study_key}`, { method: 'PATCH', body: { title, reason } })
    }, 'Preregistration amended.')

  const openResults = async (study) => {
    setError('')
    try {
      const r = await adminFetch(`/api/admin/studies/${study.study_key}/results`)
      setResults({ studyKey: study.study_key, rows: r.results, note: r.note })
    } catch (err) { setError(err.message) }
  }

  const submitRating = (e) => {
    e.preventDefault()
    run(async () => {
      const body = { ...rating, score: Number(rating.score) }
      if (!body.supersedes) delete body.supersedes
      const r = await adminFetch('/api/admin/studies/external-ratings', { method: 'POST', body })
      setShowRating(false)
      setRating({ sessionId: '', sourceOrg: '', exerciseType: '', raterRole: '', score: '', notes: '', supersedes: '' })
      return r
    }, 'External rating recorded (append-only).')
  }

  return (
    <div className="p-6 max-w-6xl">
      <PageHeader
        title="Studies"
        subtitle="Arm assignments are immutable and results append-only — both enforced by database triggers, not just this console.">
        {canManage && (
          <button type="button" className={btn} onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? 'Cancel' : 'New preregistration'}
          </button>
        )}
      </PageHeader>
      <ErrorNotice error={error} />
      <Notice>{notice}</Notice>

      {showCreate && canManage && (
        <form onSubmit={create} className="mb-4 rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 grid gap-3 md:grid-cols-2">
          {[
            ['studyKey', 'Study key (a-z, 0-9, _)'], ['title', 'Title'], ['hypothesis', 'Hypothesis'],
            ['preregisteredMetric', 'Preregistered metric'], ['protocolDoc', 'Protocol document path'],
          ].map(([k, label]) => (
            <label key={k} className="font-mono text-[11px] uppercase text-[var(--color-ink-muted)]">
              {label}
              <input required className={`${field} w-full mt-1`} value={draft[k]}
                onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
            </label>
          ))}
          <div className="md:col-span-2">
            <button type="submit" className={btn}>Preregister</button>
            <span className="ml-3 font-mono text-[10px] text-[var(--color-ink-muted)]">
              Every field is a scientific commitment — hypothesis and metric lock at activation.
            </span>
          </div>
        </form>
      )}

      <DataTable
        rowKey={(s) => s.study_key}
        onRowClick={openResults}
        columns={[
          { key: 'study_key', label: 'Key', className: 'font-mono text-[12px]' },
          { key: 'title', label: 'Title' },
          { key: 'status', label: 'Status', render: (s) => <Pill tone={STATUS_TONE[s.status]}>{s.status}</Pill> },
          { key: 'real_sessions', label: 'Real sessions', className: 'tabular-nums' },
          { key: 'result_count', label: 'Results', className: 'tabular-nums' },
          {
            key: 'actions', label: '',
            render: (s) => (
              <span className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
                {canManage && s.status === 'preregistered' && (
                  <>
                    <button type="button" className={btn} onClick={() => editStudy(s)}>Amend</button>
                    <button type="button" className={btn} onClick={() => transition(s, 'active')}>Activate</button>
                  </>
                )}
                {canManage && s.status === 'active' && (
                  <>
                    <button type="button" className={btn} onClick={() => transition(s, 'complete')}>Complete</button>
                    <button type="button" className={btn} onClick={() => transition(s, 'abandoned')}>Abandon</button>
                  </>
                )}
                {canCompute && s.study_key === 'steering_ab' && (
                  <button type="button" className={btn}
                    onClick={() => run(() => adminFetch('/api/admin/studies/steering_ab/compute', { method: 'POST', body: {} }), 'Metric computed — appended to the result chain.')}>
                    Compute metric
                  </button>
                )}
              </span>
            ),
          },
        ]}
        rows={data?.studies}
        empty="No studies registered."
      />

      {results && (
        <section className="mt-4 rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
              Results — {results.studyKey}
            </h2>
            <button type="button" className={btn} onClick={() => setResults(null)}>Close</button>
          </div>
          <p className="mt-1 font-mono text-[10px] text-[var(--color-ink-muted)]">{results.note}</p>
          {results.rows.length === 0 ? (
            <p className="mt-2 font-sans text-sm text-[var(--color-ink-muted)]">No results yet — honest pending.</p>
          ) : (
            results.rows.map((r) => (
              <div key={r.result_id} className="mt-2 border-b border-[var(--color-line)] last:border-0 pb-2 font-sans text-[13px]">
                <span className="font-mono text-[12px] text-[var(--color-ink)]">{r.metric_name}</span>
                <span className="text-[var(--color-ink-muted)]"> · n={r.n} · {r.analysis_version} · {when(r.computed_at)}</span>
                {r.superseded_by && <Pill tone="warn">superseded</Pill>}
              </div>
            ))
          )}
        </section>
      )}

      {/* ── External ratings ────────────────────────────────────────────── */}
      <div className="mt-8 flex items-center justify-between">
        <h2 className="font-display text-base text-[var(--color-ink)]">External ratings (transferability anchors)</h2>
        {canManage && (
          <button type="button" className={btn} onClick={() => setShowRating((v) => !v)}>
            {showRating ? 'Cancel' : 'Add rating'}
          </button>
        )}
      </div>

      {showRating && canManage && (
        <form onSubmit={submitRating} className="mt-3 rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 grid gap-3 md:grid-cols-3">
          {[
            ['sessionId', 'Prism session id', true], ['sourceOrg', 'Source organisation', true],
            ['exerciseType', 'Exercise type', true], ['raterRole', 'Rater role', false],
            ['score', 'Score 0–100', true], ['supersedes', 'Supersedes rating id (correction only)', false],
          ].map(([k, label, req]) => (
            <label key={k} className="font-mono text-[11px] uppercase text-[var(--color-ink-muted)]">
              {label}
              <input required={req} className={`${field} w-full mt-1`} value={rating[k]}
                onChange={(e) => setRating({ ...rating, [k]: e.target.value })} />
            </label>
          ))}
          <label className="md:col-span-3 font-mono text-[11px] uppercase text-[var(--color-ink-muted)]">
            Notes
            <input className={`${field} w-full mt-1`} value={rating.notes}
              onChange={(e) => setRating({ ...rating, notes: e.target.value })} />
          </label>
          <div className="md:col-span-3">
            <button type="submit" className={btn}>Record rating</button>
            <span className="ml-3 font-mono text-[10px] text-[var(--color-ink-muted)]">
              Append-only: corrections supersede — existing ratings are never edited.
            </span>
          </div>
        </form>
      )}

      <div className="mt-3 mb-10">
        <DataTable
          rowKey={(r) => r.rating_id}
          columns={[
            { key: 'session_id', label: 'Session', render: (r) => `${mono(r.session_id, 13)}…`, className: 'font-mono text-[11px]' },
            { key: 'source_org', label: 'Source' },
            { key: 'exercise_type', label: 'Exercise' },
            { key: 'rater_role', label: 'Role', render: (r) => r.rater_role || '—' },
            { key: 'score', label: 'Score', className: 'tabular-nums' },
            {
              key: 'superseded', label: 'Chain',
              render: (r) => r.superseded ? <Pill tone="warn">superseded</Pill> : r.supersedes ? <Pill tone="info">correction</Pill> : <Pill tone="ok">current</Pill>,
            },
            { key: 'created_at', label: 'Recorded', render: (r) => when(r.created_at), className: 'whitespace-nowrap font-mono text-[11px]' },
          ]}
          rows={ratings}
          empty="No external ratings recorded."
        />
      </div>
    </div>
  )
}
