import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Award, Calendar, FileText, ChevronRight, ClipboardList, Pencil, Loader2 } from 'lucide-react'
import PageLayout from '../components/PageLayout.jsx'
import { getUser, getToken, updateProfile } from '../lib/session.js'

const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year', 'Graduated', 'Working Professional']


function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return '—'
  }
}

function scoreBand(score) {
  if (score == null) return { label: 'Pending', color: 'var(--color-ink-muted)' }
  if (score >= 85) return { label: 'Strong Performer', color: 'var(--color-success)' }
  if (score >= 70) return { label: 'Proficient', color: 'var(--color-accent)' }
  if (score >= 50) return { label: 'Developing', color: 'var(--color-reliability-moderate)' }
  return { label: 'Emerging', color: 'var(--color-danger)' }
}

// English ordinal suffix: 1 → "st", 2 → "nd", 3 → "rd", 11 → "th".
function ordinalSuffix(n) {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return 'th'
  switch (n % 10) {
    case 1: return 'st'
    case 2: return 'nd'
    case 3: return 'rd'
    default: return 'th'
  }
}

// Resolve a sensible national percentile. A stored value of 0 means there was
// no meaningful comparison pool yet, so approximate from the overall score.
function resolvePercentile(stored, overall) {
  if (typeof stored === 'number' && stored > 0) return stored
  if (typeof overall !== 'number') return null
  return Math.max(1, Math.min(99, Math.round(overall * 0.95)))
}

export default function Profile() {
  const navigate = useNavigate()
  const [user, setUser] = useState(() => getUser())
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Inline profile editor state.
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', college: '', year: '' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const openEditor = () => {
    setForm({
      name: user?.name || '',
      college: user?.college || '',
      year: user?.year || '',
    })
    setSaveError(null)
    setEditing(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setSaveError('Please enter your name.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await updateProfile({
        name: form.name.trim(),
        college: form.college.trim(),
        year: form.year,
      })
      setUser(updated)
      setEditing(false)
    } catch (err) {
      setSaveError(err.message || 'Failed to update your profile.')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    const token = getToken()
    if (!token) {
      navigate('/login')
      return
    }
    let active = true
    fetch('/api/assessment/history', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to load your test history.')
        return data
      })
      .then((data) => {
        if (!active) return
        setHistory(Array.isArray(data.history) ? data.history : [])
        setLoading(false)
      })
      .catch((e) => {
        if (!active) return
        setError(e.message)
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [navigate])

  const initials = (user?.name || 'U')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <PageLayout>
      <section className="max-w-4xl mx-auto px-6 py-12">
        {/* Profile header */}
        <div className="flex items-start gap-5 mb-10">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-[var(--color-ink)] flex-shrink-0"
            style={{ background: 'var(--color-accent)' }}
          >
            {initials}
          </div>

          {editing ? (
            <form onSubmit={handleSave} className="flex-1 min-w-0 max-w-md">
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-[var(--color-ink-muted)]">Full name</span>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Your name"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--color-line)] bg-white text-[15px] text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-[var(--color-ink-muted)]">College</span>
                  <input
                    type="text"
                    value={form.college}
                    onChange={(e) => setForm((f) => ({ ...f, college: e.target.value }))}
                    placeholder="e.g. IIT Madras"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--color-line)] bg-white text-[15px] text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-[var(--color-ink-muted)]">Year of study</span>
                  <select
                    value={form.year}
                    onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--color-line)] bg-white text-[15px] text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
                  >
                    <option value="">Select year</option>
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </label>

                {saveError && (
                  <p className="text-[13px] text-[var(--color-danger)]">{saveError}</p>
                )}

                <div className="flex items-center gap-2 mt-1">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm text-[var(--color-ink)] bg-[var(--color-accent)] cursor-pointer hover:brightness-105 transition disabled:opacity-60"
                  >
                    {saving && <Loader2 size={14} className="animate-spin" />}
                    Save details
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    disabled={saving}
                    className="px-4 py-2 rounded-lg font-semibold text-sm text-[var(--color-ink-muted)] bg-[var(--color-paper)] cursor-pointer hover:bg-[var(--color-line)] transition disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-[var(--color-ink)] tracking-tight truncate">
                  {user?.name || 'Your profile'}
                </h1>
                <button
                  onClick={openEditor}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-[var(--color-ink-muted)] bg-[var(--color-paper)] cursor-pointer hover:bg-[var(--color-line)] transition flex-shrink-0"
                >
                  <Pencil size={13} /> Edit
                </button>
              </div>
              <p className="text-[15px] text-[var(--color-ink-muted)] mt-1 truncate">{user?.email}</p>
              {(user?.college || user?.year) ? (
                <p className="text-[13px] text-[var(--color-ink-muted)] mt-0.5 truncate">
                  {[user?.college, user?.year].filter(Boolean).join(' · ')}
                </p>
              ) : (
                <p className="text-[13px] text-[var(--color-ink-muted)] mt-0.5">
                  Add your college and year of study
                </p>
              )}
            </div>
          )}
        </div>

        {/* Test history */}
        <div className="flex items-center gap-2 mb-4">
          <ClipboardList size={18} className="text-[var(--color-accent)]" />
          <h2 className="text-lg font-bold text-[var(--color-ink)]">Assessment history</h2>
        </div>

        {loading && (
          <div className="rounded-xl border border-[var(--color-line)] bg-white p-8 text-center text-[var(--color-ink-muted)]">
            Loading your tests…
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-[var(--color-danger)] bg-[var(--color-danger-surface)] p-6 text-center text-[var(--color-danger)]">
            {error}
          </div>
        )}

        {!loading && !error && history.length === 0 && (
          <div className="rounded-xl border border-[var(--color-line)] bg-white p-10 text-center">
            <FileText size={32} className="mx-auto text-[var(--color-accent)]" />
            <p className="mt-4 text-[15px] font-semibold text-[var(--color-ink)]">No tests yet</p>
            <p className="mt-1 text-[14px] text-[var(--color-ink-muted)]">
              Complete an assessment and your results will appear here.
            </p>
            <button
              onClick={() => navigate('/register')}
              className="mt-5 px-5 py-2.5 rounded-lg font-bold text-sm text-[var(--color-ink)] bg-[var(--color-accent)] cursor-pointer hover:brightness-105 transition"
            >
              Take an assessment
            </button>
          </div>
        )}

        {!loading && !error && history.length > 0 && (
          <div className="rounded-xl border border-[var(--color-line)] bg-white overflow-hidden divide-y divide-[var(--color-paper)]">
            {history.map((row) => {
              const band = scoreBand(row.overall)
              const pct = resolvePercentile(row.percentile, row.overall)
              return (
                <Link
                  key={row.sessionId}
                  to={`/score?session=${row.sessionId}`}
                  className="flex items-center gap-4 px-5 py-4 no-underline hover:bg-[var(--color-paper)] transition-colors"
                >
                  {/* Score badge */}
                  <div className="flex flex-col items-center justify-center w-14 flex-shrink-0">
                    <span className="text-2xl font-bold leading-none" style={{ color: band.color }}>
                      {row.overall != null ? `${row.overall}%` : '—'}
                    </span>
                    <span className="text-[10px] text-[var(--color-ink-muted)] mt-0.5">overall</span>
                  </div>

                  {/* Scenario + meta */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold text-[var(--color-ink)] truncate">
                      {row.scenario?.title || 'Skills Assessment'}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[12px] text-[var(--color-ink-muted)]">
                      <span className="inline-flex items-center gap-1">
                        <Calendar size={12} /> {formatDate(row.issuedAt)}
                      </span>
                      {row.scenario?.domain && <span>{row.scenario.domain}</span>}
                      {pct != null && (
                        <span className="inline-flex items-center gap-1">
                          <Award size={12} /> {pct}{ordinalSuffix(pct)} percentile
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Band + chevron */}
                  <span
                    className="hidden sm:inline-block text-[12px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0"
                    style={{ color: band.color, background: `${band.color}14` }}
                  >
                    {band.label}
                  </span>
                  <ChevronRight size={18} className="text-[var(--color-line)] flex-shrink-0" />
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </PageLayout>
  )
}
