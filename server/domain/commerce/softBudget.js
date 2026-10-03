// P8.8 — soft cost budgets. A soft budget can raise an alert and limit NEW
// starts; it can never interrupt a run that is already active and paid for,
// weaken evidence criteria or swap the evaluator. Pure function; the caller
// supplies the spend figures it actually measured (USD) and the budget from
// operations configuration (PRISM_SOFT_BUDGET_USD). Unknown spend is unknown,
// never zero: without a measured figure the budget cannot be judged.
export const SOFT_BUDGET_FLAG = 'PRISM_SOFT_BUDGET_USD'
export const SOFT_BUDGET_STATES = Object.freeze(['UNCONFIGURED', 'UNKNOWN_SPEND', 'OK', 'ALERT', 'NEW_STARTS_LIMITED'])
export const ALERT_RATIO = 0.8

const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)

export function readSoftBudget(env = process.env) {
  const raw = env[SOFT_BUDGET_FLAG]
  if (raw == null || String(raw).trim() === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function evaluateSoftBudget({ spentUsd, budgetUsd = readSoftBudget(), activeRun = false } = {}) {
  const base = { interruptActiveRun: false, activeRunProtected: Boolean(activeRun), evidenceCriteriaChanged: false, evaluatorChanged: false }
  const budget = num(budgetUsd)
  if (budget == null) return { ...base, state: 'UNCONFIGURED', allowNewStart: true, alert: false, ratio: null }
  const spent = num(spentUsd)
  if (spent == null) return { ...base, state: 'UNKNOWN_SPEND', allowNewStart: true, alert: true, ratio: null, note: 'Spend is not measured; the budget cannot be judged and nothing is limited.' }
  const ratio = +(spent / budget).toFixed(4)
  if (ratio >= 1) return { ...base, state: 'NEW_STARTS_LIMITED', allowNewStart: false, alert: true, ratio, note: 'The soft budget is spent: new starts are limited transparently; active paid runs continue to completion.' }
  if (ratio >= ALERT_RATIO) return { ...base, state: 'ALERT', allowNewStart: true, alert: true, ratio }
  return { ...base, state: 'OK', allowNewStart: true, alert: false, ratio }
}
