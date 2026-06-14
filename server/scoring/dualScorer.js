// Prism v2 (MASA-2) — Phase 2 Dual-Channel Scorer (orchestrator).
//
// Runs post-submit when PRISM_V2_DUAL_SCORER is on. Produces dimension scores
// from the turn-level judge panel (Channel A), computes Channel B in shadow,
// reconciles them, attaches a conformal CI, and decides release vs human-review.
// The route still clamps + recomputes the overall server-side afterwards.

import { DIMENSIONS, DIMENSION_WEIGHTS, isDualScorerEnabled, SCORER } from './dualScorerConfig.js'
import { scoreAllTurns } from './judgePanel.js'
import { aggregateDimensionScores } from './aggregate.js'
import { extractSessionFeatures } from './features.js'
import { reconcile } from './reconciler.js'
import { intervalFor } from './conformal.js'
import { loadConformalTable } from './conformalStore.js'

function weightedOverall(dimScores) {
  let sum = 0
  let wsum = 0
  for (const [dim, w] of Object.entries(DIMENSION_WEIGHTS)) {
    if (Number.isFinite(dimScores[dim])) { sum += dimScores[dim] * w; wsum += w }
  }
  return wsum > 0 ? Math.round(sum / wsum) : 0
}

// Score a session with the dual-channel pipeline.
//   ctx: { createCompletion, modelA, modelB }
//   turns: [{ text, exchangeNo, responseId, asrConfidence }]
//   refScores: dimension scores from the v1 shadow scorer (for reconciliation)
// Returns { scores, overall, channelA, channelB, reliability, action, ci, meta }.
export async function runDualScorer(ctx, turns, refScores) {
  const scoredTurns = await scoreAllTurns(ctx, turns)
  if (!scoredTurns.length) throw new Error('dual_scorer_no_turns')

  const unstable = scoredTurns.filter((t) => t.stable === false).length
  const { scores: channelA, evidenceCounts } = aggregateDimensionScores(scoredTurns)

  // Channel B (shadow): computed + stored, weight 0 in the score.
  const { features, shadowScores: channelB } = extractSessionFeatures(
    turns.map((t) => ({ text: t.text, responseMs: t.latencyMs })),
  )

  let activeChannelA = channelA
  let activeOverall = weightedOverall(channelA)
  let activeUnstable = unstable
  let activeScoredCount = scoredTurns.length
  const conformalTable = await loadConformalTable()
  let ci = intervalFor(activeOverall, conformalTable)

  // First reconciliation of Channel A against the reference (v1 shadow until
  // Channel B is trained).
  let decision = reconcile(activeChannelA, refScores || channelB, ci, { unstableTurns: activeUnstable })

  // Re-evaluation pass: a big first-pass disagreement gets ONE fresh k-vote
  // panel re-score before we either release the resolved score or escalate to
  // human review. This is the spec's "re-evaluate once, then queue" rule.
  let reevaluated = false
  if (decision.action === 'reevaluate') {
    reevaluated = true
    const reScored = await scoreAllTurns(ctx, turns)
    if (reScored.length) {
      const reUnstable = reScored.filter((t) => t.stable === false).length
      const { scores: reChannelA } = aggregateDimensionScores(reScored)
      activeChannelA = reChannelA
      activeUnstable = reUnstable
      activeScoredCount = reScored.length
      activeOverall = weightedOverall(reChannelA)
      ci = intervalFor(activeOverall, conformalTable)
    }
    decision = reconcile(activeChannelA, refScores || channelB, ci, {
      unstableTurns: activeUnstable,
      reevaluated: true,
    })
  }

  return {
    scores: activeChannelA, // authoritative dimension scores (w_A = 1, w_B = 0)
    overall: activeOverall,
    channelA: activeChannelA,
    channelB,
    features,
    evidenceCounts,
    reliability: decision.reliability,
    action: decision.action,
    reconcile: decision,
    ci,
    meta: {
      scoredTurns: activeScoredCount,
      unstableTurns: activeUnstable,
      votesPerTurn: SCORER.K_A + SCORER.K_B,
      conformalProvisional: ci.provisional,
      reevaluated,
    },
  }
}

export { isDualScorerEnabled, DIMENSIONS }
