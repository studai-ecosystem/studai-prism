// P8.8 — unit economics as a pure function of ACTUAL delivery figures.
//
//   Net collected revenue = collected amount - taxes payable - refunds/credits
//   Direct delivery cost  = dialogue + evaluation + verification + audio
//                         + variable infrastructure + payment fees
//                         + allocated review/support + retry/recovery
//   Contribution          = net collected revenue - direct delivery cost
//   Contribution margin   = contribution / net collected revenue
//
// Honesty rules: an unknown component (null/undefined) makes the total
// PARTIAL, never zero; margin is null for a zero or unknown denominator; the
// same fee is never counted twice (one key per category); planning
// hypotheses and historical revenue are labelled by the caller via `basis`.
export const COST_KEYS = Object.freeze(['dialogue', 'evaluation', 'verification', 'audio', 'infrastructure', 'paymentFees', 'reviewSupport', 'retryRecovery'])
export const REVENUE_KEYS = Object.freeze(['collected', 'taxes', 'refunds'])

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const round = (v) => (v == null ? null : +v.toFixed(4))

function sum(obj, keys) {
  let total = 0
  const unknown = []
  for (const k of keys) {
    const v = num(obj?.[k])
    if (v == null) unknown.push(k)
    else total += v
  }
  return { total, unknown }
}

export function netRevenue({ collected, taxes, refunds } = {}) {
  const c = num(collected)
  if (c == null) return { amount: null, status: 'unknown', unknown: ['collected'] }
  const t = num(taxes)
  const r = num(refunds)
  const unknown = [t == null ? 'taxes' : null, r == null ? 'refunds' : null].filter(Boolean)
  return { amount: round(c - (t || 0) - (r || 0)), status: unknown.length ? 'partial' : 'known', unknown }
}

export function directCost(costs = {}) {
  const extra = Object.keys(costs).filter((k) => !COST_KEYS.includes(k))
  if (extra.length) throw new TypeError(`unknown cost component(s): ${extra.join(', ')} (one key per category; nothing is counted twice)`)
  const { total, unknown } = sum(costs, COST_KEYS)
  if (unknown.length === COST_KEYS.length) return { amount: null, status: 'unknown', unknown }
  return { amount: round(total), status: unknown.length ? 'partial' : 'known', unknown }
}

export function contribution({ netRevenue: rev, costs, basis = 'ACTUAL' } = {}) {
  const revenue = rev && typeof rev === 'object' && 'amount' in rev ? rev : netRevenue(rev || {})
  const cost = directCost(costs || {})
  const known = revenue.status === 'known' && cost.status === 'known'
  const amount = revenue.amount == null || cost.amount == null ? null : round(revenue.amount - cost.amount)
  const margin = amount == null || !revenue.amount || revenue.amount <= 0 || !known ? null : round(amount / revenue.amount)
  return {
    basis: basis === 'HYPOTHESIS' ? 'HYPOTHESIS' : 'ACTUAL',
    netRevenue: revenue,
    directCost: cost,
    contribution: amount,
    contributionMargin: margin,
    status: known ? 'known' : (amount == null ? 'unknown' : 'partial'),
    note: known ? null : 'One or more components are unknown; totals are partial and margin is withheld.',
  }
}

// p50 / p95 of per-run costs (null-safe; unknown runs are excluded and counted).
export function costPercentiles(values = []) {
  const known = values.map(num).filter((v) => v != null).sort((a, b) => a - b)
  const at = (p) => (known.length ? known[Math.min(known.length - 1, Math.floor(p * known.length))] : null)
  return { n: known.length, unknown: values.length - known.length, p50: round(at(0.5)), p95: round(at(0.95)) }
}
