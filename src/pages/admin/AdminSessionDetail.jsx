import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { adminFetch, adminHasPermission } from '../../lib/adminApi.js'
import { PageHeader, ErrorNotice, Notice, Pill, btn, btnDanger, when, actWithReason } from './ui.jsx'

// ── /admin/sessions/:id — session file (Phase 2) ─────────────────────────────
// Summary · Conversation (blinded) · Integrity · Decisions · Related · Actions.
// Disabled actions explain WHY they are unavailable (record-page standard §32).

export default function AdminSessionDetail() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showTurns, setShowTurns] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      setData(await adminFetch(`/api/admin/sessions/${id}`))
    } catch (err) {
      setError(err.message)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  if (!data && !error) {
    return (
      <div className="p-8 flex items-center gap-2 font-sans text-sm text-[var(--color-ink-muted)]">
        <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Loading session…
      </div>
    )
  }
  if (error && !data) return <div className="p-6"><ErrorNotice error={error} /></div>

  const { summary, report, conversation, entitlement, consent, integrity, decisions, dispute, credential, adminState, notes } = data
  const canReview = adminHasPermission('sessions:review')
  const canInvalidate = adminHasPermission('sessions:invalidate')

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
    <div className="p-6 max-w-5xl">
      <PageHeader title={`Session ${id.slice(0, 13)}…`} subtitle={`${summary.scenarioId || 'unknown scenario'} · ${summary.language}`}>
        {summary.completedAt ? <Pill tone="ok">completed</Pill> : <Pill tone="info">active</Pill>}
        {adminState?.reviewState === 'held' && <Pill tone="warn">review hold</Pill>}
        {adminState?.invalid && <Pill tone="danger">invalid</Pill>}
        {summary.isSynthetic && <Pill tone="muted">synthetic</Pill>}
      </PageHeader>
      <ErrorNotice error={error} />
      <Notice>{notice}</Notice>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Summary */}
        <section className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-2">Summary</h2>
          <dl className="font-sans text-sm text-[var(--color-ink)] space-y-1">
            <div><dt className="inline text-[var(--color-ink-muted)]">Candidate: </dt><dd className="inline font-mono text-[12px]">{summary.userEmail || summary.userId || 'anonymous'}</dd></div>
            <div><dt className="inline text-[var(--color-ink-muted)]">Started: </dt><dd className="inline">{when(summary.startedAt)}</dd></div>
            <div><dt className="inline text-[var(--color-ink-muted)]">Completed: </dt><dd className="inline">{when(summary.completedAt)}</dd></div>
            <div><dt className="inline text-[var(--color-ink-muted)]">Exchanges: </dt><dd className="inline tabular-nums">{summary.exchangeCount ?? '—'}</dd></div>
            <div><dt className="inline text-[var(--color-ink-muted)]">Consent version: </dt><dd className="inline font-mono text-[12px]">{summary.consentVersion || '—'}</dd></div>
            <div><dt className="inline text-[var(--color-ink-muted)]">Scale version: </dt><dd className="inline font-mono text-[12px]">{summary.scaleVersion || '—'}</dd></div>
            <div><dt className="inline text-[var(--color-ink-muted)]">Entitlement: </dt><dd className="inline">{entitlement ? `${entitlement.mode}${entitlement.consumed ? ' (consumed)' : ''}` : '—'}</dd></div>
          </dl>
          {summary.flagsActive && (
            <p className="mt-2 font-mono text-[10px] text-[var(--color-ink-muted)] break-all">
              flags at test time: {JSON.stringify(summary.flagsActive)}
            </p>
          )}
        </section>

        {/* Scoring */}
        <section className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-2">Scoring</h2>
          {report ? (
            <>
              <p className="font-display text-3xl text-[var(--color-ink)] tabular-nums">{report.overall ?? '—'}</p>
              <dl className="mt-2 font-sans text-[13px] text-[var(--color-ink)] space-y-0.5">
                {Object.entries(report.scores || {}).filter(([k]) => k !== 'overall').map(([k, v]) => (
                  <div key={k} className="flex justify-between"><dt className="text-[var(--color-ink-muted)]">{k}</dt><dd className="tabular-nums">{v}</dd></div>
                ))}
              </dl>
              <p className="mt-2 font-mono text-[11px] text-[var(--color-ink-muted)]">
                reliability: {report.reliability?.level || '—'} · percentile: {report.percentile ?? 'n/a'}
              </p>
              {report.correction && (
                <p className="mt-1 font-mono text-[11px] text-[var(--color-reliability-moderate)]">
                  corrected v{report.correction.version} — was {report.correction.previousOverall}. Reason: {report.correction.reason}
                </p>
              )}
              <p className="mt-2">
                <Link to={`/admin/reports/${id}`} className="font-sans text-[13px] text-[var(--color-accent)] underline">Open report administration →</Link>
              </p>
            </>
          ) : (
            <p className="font-sans text-sm text-[var(--color-ink-muted)]">No report issued{summary.completedAt ? ' — scoring may have failed; reprocess lands with Phase 3 scientific administration.' : ' (session still active).'}</p>
          )}
        </section>
      </div>

      {/* Conversation */}
      <section className="mt-4 rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
            Conversation {conversation ? `(${conversation.source === 'blinded_transcript' ? 'blinded research transcript' : 'live session'})` : ''}
          </h2>
          {conversation && (
            <button type="button" className={btn} onClick={() => setShowTurns((v) => !v)}>
              {showTurns ? 'Hide' : `Show ${conversation.turns?.length ?? 0} turns`}
            </button>
          )}
        </div>
        {!conversation && <p className="mt-2 font-sans text-sm text-[var(--color-ink-muted)]">No transcript available (live history is freed at completion; no blinded transcript was captured).</p>}
        {conversation && showTurns && (
          <div className="mt-3 space-y-2 max-h-96 overflow-y-auto">
            {conversation.turns.map((turn, i) => {
              const speaker = turn.speaker || turn.role || 'unknown'
              const text = turn.text || turn.content || ''
              const isCandidate = speaker === 'candidate' || speaker === 'user'
              return (
                <div key={i} className="font-sans text-[13px]">
                  <span className={`font-mono text-[10px] uppercase tracking-[0.08em] ${isCandidate ? 'text-[var(--color-accent)]' : 'text-[var(--color-ink-muted)]'}`}>
                    {turn.name || speaker}
                  </span>
                  {/* Candidate text is untrusted data — rendered as text, never HTML. */}
                  <p className="text-[var(--color-ink)] whitespace-pre-wrap">{String(text)}</p>
                </div>
              )
            })}
          </div>
        )}
        <p className="mt-2 font-mono text-[10px] text-[var(--color-ink-muted)]">Transcripts are evidence — there is no edit function, by design.</p>
      </section>

      {/* Integrity + decisions */}
      <div className="grid gap-4 md:grid-cols-2 mt-4">
        <section className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-2">Integrity events ({integrity.events.length})</h2>
          {integrity.events.length === 0 ? <p className="font-sans text-sm text-[var(--color-ink-muted)]">None recorded.</p> : (
            <div className="max-h-64 overflow-y-auto space-y-1">
              {integrity.events.map((e, i) => (
                <p key={i} className="font-mono text-[11px] text-[var(--color-ink)]">
                  {e.type} <span className="text-[var(--color-ink-muted)]">{when(e.at)}</span>
                </p>
              ))}
            </div>
          )}
          <p className="mt-2 font-mono text-[10px] text-[var(--color-ink-muted)]">
            Events never auto-invalidate a candidate — review them in Governance → Integrity.
          </p>
        </section>

        <section className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-2">Decision trail ({decisions.length})</h2>
          {decisions.length === 0 ? <p className="font-sans text-sm text-[var(--color-ink-muted)]">No telemetry decisions recorded.</p> : (
            <div className="max-h-64 overflow-y-auto space-y-1">
              {decisions.map((d, i) => (
                <p key={i} className="font-mono text-[11px] text-[var(--color-ink)]">
                  {d.event_type} <span className="text-[var(--color-ink-muted)]">{when(d.created_at)}</span>
                </p>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Related + actions */}
      <div className="grid gap-4 md:grid-cols-2 mt-4 mb-10">
        <section className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-2">Related records</h2>
          <ul className="font-sans text-[13px] text-[var(--color-ink)] space-y-1">
            <li>Consent: {consent ? `${(consent.scopes || []).length} scopes · ${when(consent.at)}` : '—'}</li>
            <li>Dispute: {dispute ? <Link className="text-[var(--color-accent)] underline" to={`/admin/disputes/${id}`}>{dispute.status}</Link> : 'none'}</li>
            <li>Credential: {credential ? `${credential.status} · ${when(credential.issuedAt)}` : 'none'}</li>
          </ul>
          <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mt-3 mb-1">Notes</h2>
          {notes.length === 0 ? <p className="font-sans text-[13px] text-[var(--color-ink-muted)]">No notes.</p> :
            notes.map((n) => (
              <p key={n.note_id} className="font-sans text-[13px] text-[var(--color-ink)] py-1 border-b border-[var(--color-line)] last:border-0">
                {n.body} <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">— {n.author}, {when(n.created_at)}</span>
              </p>
            ))}
        </section>

        <section className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-2">Safe actions</h2>
          <div className="flex flex-wrap gap-2">
            {canReview && adminState?.reviewState !== 'held' && (
              <button type="button" className={btn}
                onClick={() => run(() => actWithReason(`/api/admin/sessions/${id}/review`, { action: 'hold' }, 'Reason for review hold (audited):'), 'Session placed in human review.')}>
                Place in review
              </button>
            )}
            {canReview && adminState?.reviewState === 'held' && (
              <button type="button" className={btn}
                onClick={() => run(() => actWithReason(`/api/admin/sessions/${id}/review`, { action: 'release' }, 'Reason for release (audited):'), 'Released from review.')}>
                Release from review
              </button>
            )}
            {canInvalidate && !adminState?.invalid && (
              <button type="button" className={btnDanger}
                onClick={() => run(() => actWithReason(`/api/admin/sessions/${id}/invalidate`, {}, 'Reason for marking INVALID — 10+ characters, audited, also excludes from calibration:'), 'Session marked invalid.')}>
                Mark invalid
              </button>
            )}
            {canInvalidate && (
              <button type="button" className={btn}
                onClick={() => run(() => actWithReason(`/api/admin/sessions/${id}/exclude-calibration`, { excluded: !adminState?.excludedFromCalibration }, 'Reason (audited):'), 'Calibration exclusion updated.')}>
                {adminState?.excludedFromCalibration ? 'Re-include in calibration' : 'Exclude from calibration'}
              </button>
            )}
            <button type="button" className={btn}
              onClick={() => run(async () => {
                const body = window.prompt('Internal note:')
                if (!body) return null
                return adminFetch(`/api/admin/sessions/${id}/notes`, { method: 'POST', body: { body } })
              }, 'Note added.')}>
              Add note
            </button>
          </div>
          <p className="mt-3 font-mono text-[10px] text-[var(--color-ink-muted)] leading-relaxed">
            Not available here, by design: transcript editing (never exists) · direct score editing
            (never exists — use the dual-approved report supersession) · scoring reprocess (ships with
            Phase 3 scientific administration) · privacy erasure (Phase 6 workflow with dry-run).
          </p>
        </section>
      </div>
    </div>
  )
}
