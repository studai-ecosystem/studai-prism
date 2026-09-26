// Agreement between human raters, and between humans and the AI judge, on
// V3 evidence units (spec §45; C12.01). Quadratically-weighted Cohen's kappa
// (server/lib/kappa.js; mirrored by calibration/jobs/evidence_agreement_v3.py).
// Fail closed: below the minimum number of pairs no coefficient is reported,
// and no result here ever changes a claim — the claims register stays
// PENDING until a human reviews a frozen analysis (HA-C008).
import { quadraticWeightedKappa } from '../../lib/kappa.js'

export const MIN_PAIRS = 30
export const AGREEMENT_METHOD = 'Quadratically weighted Cohen\'s kappa on rubric levels 1-5. Human-human: the first two independent ratings of each item. Human-AI: the first human rating against the AI judge level. "Cannot rate" ratings are excluded. No coefficient is reported below the minimum number of pairs.'

const toCategory = (level) => level - 1 // 1..5 → 0..4

export function agreementReport(items, ratings, { minPairs = MIN_PAIRS } = {}) {
  const byItem = new Map()
  for (const r of [...ratings].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.raterId).localeCompare(String(b.raterId)))) {
    if (r.cannotRate || !Number.isInteger(r.level)) continue
    if (!byItem.has(r.itemId)) byItem.set(r.itemId, [])
    byItem.get(r.itemId).push(r)
  }
  const caps = new Map()
  const cap = (id) => {
    if (!caps.has(id)) caps.set(id, { hh: [[], []], ha: [[], []], items: 0 })
    return caps.get(id)
  }
  for (const item of items) {
    const c = cap(item.capabilityId)
    c.items += 1
    const rs = byItem.get(item.id) || []
    if (rs.length >= 2) { c.hh[0].push(toCategory(rs[0].level)); c.hh[1].push(toCategory(rs[1].level)) }
    if (rs.length >= 1 && Number.isInteger(item.aiLevel)) { c.ha[0].push(toCategory(rs[0].level)); c.ha[1].push(toCategory(item.aiLevel)) }
  }
  const coef = ([a, b]) => (a.length >= minPairs ? quadraticWeightedKappa(a, b) : null)
  const capabilities = [...caps.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([capabilityId, c]) => ({
    capabilityId,
    items: c.items,
    humanHuman: { pairs: c.hh[0].length, kappa: coef(c.hh), status: c.hh[0].length >= minPairs ? 'COMPUTED' : 'INSUFFICIENT_DATA' },
    humanAi: { pairs: c.ha[0].length, kappa: coef(c.ha), status: c.ha[0].length >= minPairs ? 'COMPUTED' : 'INSUFFICIENT_DATA' },
  }))
  return {
    minPairs,
    method: AGREEMENT_METHOD,
    items: items.length,
    ratings: ratings.length,
    capabilities,
    claimStatus: 'PENDING',
    note: 'Descriptive only. A validation claim needs a preregistered, frozen analysis reviewed by the psychometrics lead (HA-C008).',
  }
}
