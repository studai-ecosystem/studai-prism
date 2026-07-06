// Track 6.3 — human-rating workbench (rater-facing).
//
// Deliberately utilitarian: token sign-in → training transcripts (IRR gate) →
// blinded double-rating queue. Raters NEVER see AI scores, other raters'
// ratings, or candidate identity — only conversation turns + the rubric.

import { useState, useEffect, useCallback } from 'react'

const DIMENSION_LABELS = {
  criticalThinking: 'Critical Thinking',
  communication: 'Communication',
  collaboration: 'Collaboration',
  problemSolving: 'Problem Solving',
  aiDigitalFluency: 'AI & Digital Fluency',
}
const LEVELS = [0, 1, 2, 3, 4, 'NA']

function api(path, token, opts = {}) {
  return fetch(`/api/studies/rater/${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'x-rater-token': token, ...(opts.headers || {}) },
  }).then(async (r) => {
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`)
    return data
  })
}

function Transcript({ turns }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[var(--color-line)] bg-white p-4 max-h-[50vh] overflow-y-auto">
      {(turns || []).map((t, i) => (
        <div key={i} className={t.speaker === 'candidate' ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)]'}>
          <span className="font-sans text-xs font-bold uppercase tracking-wide">
            {t.speaker === 'candidate' ? 'Candidate' : t.name || 'Avatar'}
          </span>
          <p className="font-sans text-sm leading-relaxed">{t.text}</p>
        </div>
      ))}
    </div>
  )
}

function RubricForm({ dimensions, onSubmit, submitting }) {
  const [levels, setLevels] = useState({})
  return (
    <div className="mt-4 flex flex-col gap-3">
      {dimensions.map((dim) => (
        <div key={dim} className="flex items-center justify-between gap-3">
          <span className="font-sans text-sm font-semibold text-[var(--color-ink)]">{DIMENSION_LABELS[dim] || dim}</span>
          <div className="flex gap-1">
            {LEVELS.map((lvl) => (
              <button
                key={String(lvl)}
                type="button"
                onClick={() => setLevels((p) => ({ ...p, [dim]: lvl }))}
                className={`px-3 py-1.5 rounded-lg border font-sans text-sm ${
                  levels[dim] === lvl
                    ? 'bg-[var(--color-ink)] text-[var(--color-accent)] border-[var(--color-ink)]'
                    : 'bg-white text-[var(--color-ink-muted)] border-[var(--color-line)] hover:border-[var(--color-accent)]'
                }`}
              >
                {String(lvl)}
              </button>
            ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        disabled={submitting || dimensions.some((d) => levels[d] === undefined)}
        onClick={() => onSubmit(levels)}
        className="mt-2 self-end px-6 py-2.5 rounded-xl bg-[var(--color-ink)] font-sans text-sm font-semibold text-[var(--color-accent)] disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : 'Submit rating'}
      </button>
    </div>
  )
}

export default function RaterWorkbench() {
  const [token, setToken] = useState(() => sessionStorage.getItem('prismRaterToken') || '')
  const [me, setMe] = useState(null)
  const [item, setItem] = useState(null) // { kind: 'training'|'queue', ... }
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadNext = useCallback(async (tok) => {
    setError('')
    const profile = await api('me', tok)
    setMe(profile)
    if (profile.trainingAnswered < profile.trainingTotal) {
      const t = await api('training/next', tok)
      setItem(t.done ? null : { kind: 'training', ref: t.ref })
      setMessage(t.done ? '' : `Training transcript ${profile.trainingAnswered + 1} of ${profile.trainingTotal} — rate it against the rubric.`)
      return
    }
    if (profile.status !== 'qualified') {
      setItem(null)
      setMessage(`Training complete, but your agreement (κ=${profile.trainingKappa ?? '—'}) is below the ${profile.threshold} gate. Contact the study admin.`)
      return
    }
    const q = await api('queue/next', tok)
    setItem(q.done ? null : { kind: 'queue', session: q.session })
    setMessage(q.done ? 'Queue empty — no sessions awaiting rating. Check back later.' : 'Blinded session — rate the CANDIDATE only.')
  }, [])

  useEffect(() => {
    if (token) loadNext(token).catch((e) => setError(e.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSignIn = async () => {
    sessionStorage.setItem('prismRaterToken', token)
    try { await loadNext(token) } catch (e) { setError(e.message) }
  }

  const handleSubmit = async (levels) => {
    setSubmitting(true)
    setError('')
    try {
      if (item.kind === 'training') {
        const r = await api(`training/${item.ref.ref_id}`, token, { method: 'POST', body: JSON.stringify({ levels }) })
        if (r.gate) setMessage(r.gate.qualified ? `Qualified! κ=${r.gate.kappa}` : `Training κ=${r.gate.kappa} — below the gate.`)
      } else {
        await api(`rate/${item.session.session_id}`, token, { method: 'POST', body: JSON.stringify({ levels }) })
      }
      await loadNext(token)
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-paper)] text-[var(--color-ink)] px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-serif text-3xl mb-1">Prism Rating Workbench</h1>
        <p className="font-sans text-sm text-[var(--color-ink-muted)] mb-6">
          Blinded human rating (0–4 per dimension, NA when a dimension had no opportunity). You will never see AI scores.
        </p>

        {!me ? (
          <div className="flex gap-2">
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Rater access token"
              className="flex-1 rounded-xl border border-[var(--color-line)] px-4 py-3 font-sans text-sm"
            />
            <button onClick={handleSignIn} className="px-6 rounded-xl bg-[var(--color-ink)] font-sans text-sm font-semibold text-[var(--color-accent)]">
              Enter
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4 font-sans text-xs text-[var(--color-ink-muted)]">
              Signed in as <b>{me.handle}</b> · status: <b>{me.status}</b>
              {me.trainingKappa != null && <> · training κ: <b>{me.trainingKappa}</b></>}
            </div>
            {message && <p className="mb-3 font-sans text-sm text-[var(--color-ink)]">{message}</p>}
            {item && (
              <>
                <Transcript turns={item.kind === 'training' ? item.ref.transcript : item.session.turns} />
                <RubricForm dimensions={me.dimensions || []} onSubmit={handleSubmit} submitting={submitting} />
              </>
            )}
          </>
        )}
        {error && <p className="mt-4 font-sans text-sm text-red-600">{error}</p>}
      </div>
    </div>
  )
}
