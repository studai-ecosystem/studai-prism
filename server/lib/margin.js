// Charter §23 — per-assessment contribution-margin computation.
//
// HONESTY LAWS (test-enforced):
//   • UNKNOWN is a first-class value: any cost with no instrumentation or no
//     configured rate renders as {status:'unknown', amount:null} — NEVER zero.
//   • Revenue is INR (paise, Razorpay); AI costs are USD. Margins that mix the
//     two are UNKNOWN unless MARGIN_FX_INR_PER_USD is explicitly configured.
//   • Contribution margin includes categories that are not instrumented yet
//     (infrastructure, gateway fees, support, refunds…) — so it is UNKNOWN
//     until every category is either measured or explicitly allocated.
//   • No profitability claims: this module reports numbers and their status,
//     nothing else. See docs/commercial/CONTRIBUTION_MARGIN_METHODOLOGY_v1.md.

import { query } from '../db/pool.js'

// The §23 category registry. instrumented=false categories exist so the
// dashboard SHOWS them as unknown instead of silently omitting them.
export const COST_CATEGORIES = Object.freeze([
  { key: 'conversation_model', label: 'Conversation model (AI)', instrumented: true, tasks: ['opening', 'conversation'] },
  { key: 'judge_panel', label: 'Judge panel (AI)', instrumented: true, tasks: ['judge_full'] },
  { key: 'micro_rater', label: 'Micro-rater / estimator (AI)', instrumented: true, tasks: ['micro_rater', 'entry_estimator', 'calibration'] },
  { key: 'stt', label: 'Speech-to-text (AI)', instrumented: true, tasks: ['speech_to_text'] },
  { key: 'tts', label: 'Text-to-speech (Polly)', instrumented: false, tasks: [] },
  { key: 'infrastructure', label: 'Infrastructure allocation', instrumented: false, tasks: [] },
  { key: 'payment_gateway_fee', label: 'Payment-gateway fee', instrumented: false, tasks: [] },
  { key: 'email_pdf', label: 'Email / PDF delivery', instrumented: false, tasks: [] },
  { key: 'human_review', label: 'Human review', instrumented: false, tasks: [] },
  { key: 'support', label: 'Support allocation', instrumented: false, tasks: [] },
  { key: 'refunds', label: 'Refunds', instrumented: false, tasks: [] },
])

export const UNKNOWN = Object.freeze({ status: 'unknown', amount: null })

export function known(amount, currency) {
  return { status: 'known', amount: +Number(amount).toFixed(6), currency }
}

// Sum a list of {cost, hasUnknown} fragments into an honest money value:
// any unknown fragment poisons the total to partial/unknown status.
export function sumKnown(fragments, currency) {
  let total = 0
  let sawKnown = false
  let sawUnknown = false
  for (const f of fragments) {
    if (f == null) { sawUnknown = true; continue }
    total += Number(f) || 0
    sawKnown = true
  }
  if (!sawKnown) return UNKNOWN
  if (sawUnknown) return { status: 'partial', amount: +total.toFixed(6), currency, note: 'known components only — at least one component is unknown' }
  return { ...known(total, currency) }
}

export function fxRate(env = process.env) {
  const rate = Number(env.MARGIN_FX_INR_PER_USD)
  return Number.isFinite(rate) && rate > 0 ? rate : null
}

// Margin arithmetic that refuses to fabricate: revenue INR, costs USD.
// Returns UNKNOWN unless both sides are fully known AND an FX rate exists.
export function computeMargin({ revenueInr, costUsd, env = process.env }) {
  if (!revenueInr || revenueInr.status !== 'known') return { ...UNKNOWN, reason: 'revenue unknown' }
  if (!costUsd || costUsd.status !== 'known') return { ...UNKNOWN, reason: 'cost not fully known' }
  const rate = fxRate(env)
  if (!rate) return { ...UNKNOWN, reason: 'no FX rate configured (MARGIN_FX_INR_PER_USD)' }
  const costInr = costUsd.amount * rate
  const margin = revenueInr.amount - costInr
  return {
    status: 'known',
    amount: +margin.toFixed(2),
    currency: 'INR',
    note: 'revenue minus KNOWN costs only — categories marked unknown are excluded',
  }
}

function categoryFor(task) {
  return COST_CATEGORIES.find((c) => c.tasks.includes(task))?.key || 'other_ai'
}

// ── Per-assessment rollup ────────────────────────────────────────────────────
// AI costs grouped into §23 categories. A NULL estimated_cost_usd row means an
// unpriced model call → that category (and the total) becomes partial/unknown.
export async function rollupSessionCosts(sessionId) {
  const r = await query(
    `SELECT task, COUNT(*) AS calls,
            SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
            SUM(estimated_cost_usd) AS cost_usd,
            COUNT(*) FILTER (WHERE estimated_cost_usd IS NULL) AS unpriced
       FROM ai_usage_events WHERE session_id = $1 GROUP BY task`,
    [sessionId],
  )
  const byCategory = {}
  for (const cat of COST_CATEGORIES) {
    byCategory[cat.key] = cat.instrumented
      ? { ...UNKNOWN, note: 'no usage recorded' }
      : { ...UNKNOWN, note: 'not instrumented' }
  }
  const fragments = []
  for (const row of r?.rows || []) {
    const key = categoryFor(row.task)
    const unpriced = Number(row.unpriced) > 0
    const cost = row.cost_usd === null ? null : Number(row.cost_usd)
    fragments.push(unpriced ? null : cost)
    byCategory[key] = unpriced
      ? { status: 'partial', amount: cost === null ? null : +cost.toFixed(6), currency: 'USD', note: `${row.unpriced} call(s) had no configured rate` }
      : known(cost || 0, 'USD')
    byCategory[key].calls = Number(row.calls)
    byCategory[key].inputTokens = Number(row.input_tokens) || 0
    byCategory[key].outputTokens = Number(row.output_tokens) || 0
  }
  // Categories that will never be known from this table stay unknown and are
  // included when deciding the total's status.
  const notInstrumented = COST_CATEGORIES.filter((c) => !c.instrumented).map(() => null)
  const aiTotal = sumKnown(fragments, 'USD')
  const fullTotal = sumKnown([...fragments, ...notInstrumented], 'USD')
  return { sessionId, byCategory, aiCostUsd: aiTotal, totalCostUsd: fullTotal }
}

// ── Channel + cohort summaries ───────────────────────────────────────────────

const CHANNEL_SQL = `CASE WHEN p.mode = 'paid' THEN 'b2c_paid'
                          WHEN p.mode = 'invite' THEN 'institution_sponsored'
                          ELSE 'other' END`

export async function summarizeMargin({ from = null, to = null } = {}) {
  const params = []
  const range = []
  if (from) { params.push(from); range.push(`s.started_at >= (EXTRACT(EPOCH FROM $${params.length}::timestamptz) * 1000)`) }
  if (to) { params.push(to); range.push(`s.started_at <= (EXTRACT(EPOCH FROM $${params.length}::timestamptz) * 1000)`) }
  const where = range.length ? `WHERE ${range.join(' AND ')}` : ''

  const sessions = await query(
    `SELECT ${CHANNEL_SQL} AS channel,
            COUNT(*) AS starts,
            COUNT(*) FILTER (WHERE s.completed_at IS NOT NULL) AS completions,
            SUM(CASE WHEN p.mode = 'paid' THEN COALESCE(p.amount, 0) ELSE 0 END)
              FILTER (WHERE s.completed_at IS NOT NULL) AS paid_revenue_paise
       FROM v1_sessions s
       LEFT JOIN v1_payments p ON p.session_id = s.session_id
       ${where}
       GROUP BY 1 ORDER BY 1`,
    params,
  )

  const aiCosts = await query(
    `SELECT COUNT(DISTINCT u.session_id) AS sessions_with_usage,
            SUM(u.estimated_cost_usd) AS cost_usd,
            COUNT(*) FILTER (WHERE u.estimated_cost_usd IS NULL) AS unpriced
       FROM ai_usage_events u`,
    [],
  )
  const costRow = aiCosts?.rows?.[0] || {}
  const aiCostUsd = Number(costRow.unpriced) > 0
    ? { status: 'partial', amount: costRow.cost_usd === null ? null : +Number(costRow.cost_usd).toFixed(4), currency: 'USD', note: `${costRow.unpriced} call(s) unpriced` }
    : (costRow.cost_usd === null ? { ...UNKNOWN, note: 'no usage recorded' } : known(Number(costRow.cost_usd), 'USD'))

  const channels = (sessions?.rows || []).map((row) => {
    const completions = Number(row.completions)
    const starts = Number(row.starts)
    // Institution-sponsored revenue is contracted offline — not instrumented.
    const revenue = row.channel === 'b2c_paid'
      ? known(Number(row.paid_revenue_paise || 0) / 100, 'INR')
      : { ...UNKNOWN, note: 'institution billing is contracted offline — not instrumented' }
    return {
      channel: row.channel,
      starts,
      completions,
      notCompleted: starts - completions,
      completionRate: starts > 0 ? +(completions / starts).toFixed(3) : null,
      revenue,
      revenuePerCompletion: revenue.status === 'known' && completions > 0
        ? known(revenue.amount / completions, 'INR')
        : UNKNOWN,
    }
  })

  const b2c = channels.find((c) => c.channel === 'b2c_paid')
  const grossMargin = computeMargin({
    revenueInr: b2c?.revenue,
    costUsd: aiCostUsd.status === 'known' ? aiCostUsd : null,
  })

  return {
    generatedAt: new Date().toISOString(),
    window: { from, to },
    channels,
    aiCostUsd,
    costCategories: COST_CATEGORIES.map((c) => ({
      key: c.key, label: c.label,
      status: c.instrumented ? 'instrumented' : 'not_instrumented',
    })),
    grossMargin: { ...grossMargin, scope: 'b2c revenue vs KNOWN AI costs only' },
    contributionMargin: {
      ...UNKNOWN,
      reason: 'not all cost categories are instrumented — see costCategories',
    },
    disclaimer: 'UNKNOWN means not measured. No profitability conclusion may be drawn from this dashboard until every category is measured or explicitly allocated (charter §23).',
  }
}

export async function marginByCohort() {
  const r = await query(
    `SELECT i.invite_id, i.label, i.institution, i.plan, i.max_uses, i.used_count,
            COUNT(rep.session_id) AS completions,
            SUM(u.cost_usd) AS ai_cost_usd,
            SUM(u.unpriced) AS unpriced
       FROM assessment_invites i
       LEFT JOIN invite_redemptions r2 ON r2.invite_id = i.invite_id
       LEFT JOIN v1_reports rep ON rep.session_id = r2.session_id
       LEFT JOIN LATERAL (
         SELECT SUM(estimated_cost_usd) AS cost_usd,
                COUNT(*) FILTER (WHERE estimated_cost_usd IS NULL) AS unpriced
           FROM ai_usage_events WHERE session_id = r2.session_id
       ) u ON TRUE
       GROUP BY i.invite_id ORDER BY i.created_at DESC LIMIT 200`,
    [],
  )
  return (r?.rows || []).map((row) => {
    const plan = row.plan || null
    const allowancePct = Number(plan?.reviewAllowancePct)
    return {
      inviteId: row.invite_id,
      label: row.label,
      institution: row.institution || '',
      plan,
      seats: Number(row.max_uses),
      used: Number(row.used_count),
      completions: Number(row.completions),
      reviewAllowance: Number.isFinite(allowancePct)
        ? Math.ceil((Number(row.max_uses) * allowancePct) / 100)
        : null,
      aiCostUsd: Number(row.unpriced) > 0
        ? { status: 'partial', amount: row.ai_cost_usd === null ? null : +Number(row.ai_cost_usd).toFixed(4), currency: 'USD', note: `${row.unpriced} unpriced call(s)` }
        : (row.ai_cost_usd === null ? { ...UNKNOWN, note: 'no usage recorded' } : known(Number(row.ai_cost_usd), 'USD')),
      revenue: { ...UNKNOWN, note: 'institution billing contracted offline — not instrumented' },
      margin: { ...UNKNOWN, reason: 'cohort revenue not instrumented' },
    }
  })
}

// Finance-ready CSV: one row per completed assessment with channel + AI cost.
export async function financeExportRows({ limit = 5000 } = {}) {
  const r = await query(
    `SELECT rep.session_id, rep.issued_at, ${CHANNEL_SQL} AS channel,
            CASE WHEN p.mode = 'paid' THEN COALESCE(p.amount, 0) END AS paid_paise,
            u.cost_usd, u.unpriced
       FROM v1_reports rep
       LEFT JOIN v1_payments p ON p.session_id = rep.session_id
       LEFT JOIN LATERAL (
         SELECT SUM(estimated_cost_usd) AS cost_usd,
                COUNT(*) FILTER (WHERE estimated_cost_usd IS NULL) AS unpriced
           FROM ai_usage_events WHERE session_id = rep.session_id
       ) u ON TRUE
       ORDER BY rep.issued_at DESC LIMIT $1`,
    [Math.min(Number(limit) || 5000, 5000)],
  )
  return (r?.rows || []).map((row) => ({
    sessionId: row.session_id,
    issuedAt: row.issued_at instanceof Date ? row.issued_at.toISOString() : row.issued_at,
    channel: row.channel,
    revenueInr: row.paid_paise === null || row.paid_paise === undefined ? 'UNKNOWN' : (Number(row.paid_paise) / 100).toFixed(2),
    aiCostUsd: Number(row.unpriced) > 0 || row.cost_usd === null ? 'UNKNOWN' : Number(row.cost_usd).toFixed(6),
  }))
}
