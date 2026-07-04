// Prism v2 (MASA-2) — Phase 2 vote aggregation (pure functions, no I/O).
//
// Channel A turns k judge votes per turn into a modal level per dimension, then
// aggregates stable turn-levels into 0-100 dimension scores. Kept side-effect
// free so it is fully unit-testable without an LLM or DB.

import { DIMENSIONS, levelToScore } from './dualScorerConfig.js'

// Modal (most frequent) level for one dimension across k votes.
// Vantage rule: if ANY vote is "NA", the dimension is "NA" for this turn.
export function modalLevel(votesForDim) {
  if (!Array.isArray(votesForDim) || votesForDim.length === 0) return 'NA'
  if (votesForDim.some((v) => v === 'NA' || v === null || v === undefined)) return 'NA'
  const counts = new Map()
  for (const v of votesForDim) {
    const n = Math.max(0, Math.min(4, Math.round(Number(v))))
    counts.set(n, (counts.get(n) || 0) + 1)
  }
  let best = null
  let bestN = -1
  for (const [level, c] of counts) {
    // Tie-break toward the lower level (conservative).
    if (c > bestN || (c === bestN && level < best)) {
      best = level
      bestN = c
    }
  }
  return best
}

// Given an array of per-vote level maps for ONE turn, return the modal level
// map { dim: 0-4|"NA" }.
export function modalLevelsForTurn(voteMaps) {
  const out = {}
  for (const dim of DIMENSIONS) {
    out[dim] = modalLevel((voteMaps || []).map((m) => m?.[dim]))
  }
  return out
}

// Recency weight: later turns count slightly more (the candidate has warmed up
// and is under more pressure). Linear ramp from 0.6 (first) to 1.0 (last).
export function recencyWeight(exchangeNo, maxExchange) {
  if (!maxExchange || maxExchange <= 1) return 1
  const t = Math.max(0, Math.min(1, (exchangeNo - 1) / (maxExchange - 1)))
  return 0.6 + 0.4 * t
}

// Aggregate STABLE rated turns into 0-100 dimension scores.
//   turns: [{ exchangeNo, levels: {dim:0-4|"NA"}, asrConfidence, stable }]
// weight = (0.5 + 0.5*asrConfidence) * recencyWeight. NA levels are skipped.
export function aggregateDimensionScores(turns) {
  const stable = (turns || []).filter((t) => t && t.stable !== false)
  const maxExchange = stable.reduce((m, t) => Math.max(m, t.exchangeNo || 0), 0)
  const scores = {}
  const evidenceCounts = {}
  for (const dim of DIMENSIONS) {
    let wsum = 0
    let acc = 0
    let n = 0
    for (const t of stable) {
      const lvl = t.levels?.[dim]
      if (lvl === 'NA' || lvl === null || lvl === undefined) continue
      const asr = Number.isFinite(t.asrConfidence) ? t.asrConfidence : 1
      const w = (0.5 + 0.5 * asr) * recencyWeight(t.exchangeNo || 1, maxExchange)
      acc += w * levelToScore(lvl)
      wsum += w
      n += 1
    }
    scores[dim] = wsum > 0 ? Math.round(acc / wsum) : 0
    evidenceCounts[dim] = n
  }
  return { scores, evidenceCounts }
}
