import { useCallback, useEffect, useState } from 'react'
import { adminFetch } from '../../lib/adminApi.js'
import { PageHeader, ErrorNotice, Pill, btn, mono } from './ui.jsx'

// ── /admin/margin — charter §23 contribution-margin dashboard ────────────────
// HONESTY RULES (server-enforced, mirrored here): unknown costs render as
// UNKNOWN, never zero or blank; margins are UNKNOWN unless every input is
// measured; this page never states or implies profitability.

function Money({ value }) {
  if (!value || value.status === 'unknown') {
    return <span className="text-[var(--color-ink-muted)]" title={value?.note || value?.reason || 'not measured'}>UNKNOWN</span>
  }
  const amount = value.amount === null ? 'UNKNOWN' : `${value.currency === 'INR' ? '₹' : '$'}${Number(value.amount).toLocaleString('en-IN')}`
  if (value.status === 'partial') {
    return <span title={value.note}>{amount} <Pill tone="warn">partial</Pill></span>
  }
  return <span title={value.note || ''}>{amount}</span>
}

const CHANNEL_LABEL = {
  b2c_paid: 'B2C (voluntary individual, ₹499)',
  institution_sponsored: 'Institution-sponsored (candidates never pay)',
  other: 'Other (dev/review grants)',
}

export default function AdminMargin() {
  const [summary, setSummary] = useState(null)
  const [cohorts, setCohorts] = useState([])
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setError('')
    try {
      setSummary(await adminFetch('/api/admin/margin/summary'))
      const c = await adminFetch('/api/admin/margin/cohorts')
      setCohorts(c.cohorts || [])
    } catch (err) { setError(err.message) }
  }, [])
  useEffect(() => { reload() }, [reload])

  const exportCsv = async () => {
    setError('')
    try {
      const { rows } = await adminFetch('/api/admin/margin/export')
      const header = 'session_id,issued_at,channel,revenue_inr,ai_cost_usd'
      const csv = [header, ...rows.map((r) =>
        [r.sessionId, r.issuedAt, r.channel, r.revenueInr, r.aiCostUsd].join(','))].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'prism-margin-export.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) { setError(err.message) }
  }

  return (
    <div className="p-6 max-w-6xl">
      <PageHeader
        title="Contribution margin"
        subtitle="Per-assessment cost and revenue accounting. UNKNOWN means not measured — it is never rendered as zero, and no profitability conclusion may be drawn until every category is measured (charter §23).">
        <button type="button" className={btn} onClick={exportCsv}>Finance export (CSV)</button>
      </PageHeader>
      <ErrorNotice error={error} />

      {summary && (
        <>
          <div className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-[var(--color-line)]">
                  {['Channel', 'Starts', 'Completions', 'Not completed', 'Revenue', 'Revenue / completion'].map((h) => (
                    <th key={h} className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.channels.map((c) => (
                  <tr key={c.channel} className="border-b border-[var(--color-line)] last:border-0">
                    <td className="px-4 py-2.5">{CHANNEL_LABEL[c.channel] || c.channel}</td>
                    <td className={`px-4 py-2.5 ${mono} tabular-nums`}>{c.starts}</td>
                    <td className={`px-4 py-2.5 ${mono} tabular-nums`}>{c.completions}</td>
                    <td className={`px-4 py-2.5 ${mono} tabular-nums`}>{c.notCompleted}</td>
                    <td className="px-4 py-2.5"><Money value={c.revenue} /></td>
                    <td className="px-4 py-2.5"><Money value={c.revenuePerCompletion} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 mb-6">
            <div className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">AI cost (measured)</p>
              <p className="text-lg mt-1"><Money value={summary.aiCostUsd} /></p>
            </div>
            <div className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">Gross margin</p>
              <p className="text-lg mt-1"><Money value={summary.grossMargin} /></p>
              <p className="text-[11px] text-[var(--color-ink-muted)] mt-1">{summary.grossMargin.scope}</p>
            </div>
            <div className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">Contribution margin</p>
              <p className="text-lg mt-1"><Money value={summary.contributionMargin} /></p>
              <p className="text-[11px] text-[var(--color-ink-muted)] mt-1">{summary.contributionMargin.reason}</p>
            </div>
          </div>

          <div className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 mb-6">
            <p className="font-semibold text-[var(--color-ink)] mb-2">Cost categories (§23)</p>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1 text-sm">
              {summary.costCategories.map((c) => (
                <div key={c.key} className="flex items-center justify-between border-b border-[var(--color-line)] last:border-0 py-1.5">
                  <span>{c.label}</span>
                  <Pill tone={c.status === 'instrumented' ? 'ok' : 'muted'}>
                    {c.status === 'instrumented' ? 'measured' : 'UNKNOWN — not instrumented'}
                  </Pill>
                </div>
              ))}
            </div>
            <p className="text-[12px] text-[var(--color-ink-muted)] mt-3">{summary.disclaimer}</p>
          </div>
        </>
      )}

      <div className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-[var(--color-line)]">
              {['Cohort', 'Institution', 'Seats', 'Completions', 'Review allowance', 'AI cost', 'Revenue', 'Margin'].map((h) => (
                <th key={h} className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohorts.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-[var(--color-ink-muted)]">No cohorts yet.</td></tr>
            )}
            {cohorts.map((c) => (
              <tr key={c.inviteId} className="border-b border-[var(--color-line)] last:border-0">
                <td className="px-4 py-2.5">{c.label}</td>
                <td className="px-4 py-2.5">{c.institution || '—'}</td>
                <td className={`px-4 py-2.5 ${mono} tabular-nums`}>{c.used}/{c.seats}</td>
                <td className={`px-4 py-2.5 ${mono} tabular-nums`}>{c.completions}</td>
                <td className={`px-4 py-2.5 ${mono} tabular-nums`}>{c.reviewAllowance ?? '—'}</td>
                <td className="px-4 py-2.5"><Money value={c.aiCostUsd} /></td>
                <td className="px-4 py-2.5"><Money value={c.revenue} /></td>
                <td className="px-4 py-2.5"><Money value={c.margin} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
