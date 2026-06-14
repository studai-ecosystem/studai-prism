// Prism v2 (MASA-2) — Phase 2 Channel B: interpretable behavioral feature model.
//
// Extracted from the transcript + timing telemetry, NO LLM. Hard to game and
// nearly free. Until a model is trained against human anchors (Phase 3
// channelB_train) this runs in SHADOW MODE: features + a transparent rule-based
// score are computed and stored, but the score does NOT influence the report
// (reconciler weight w_B = 0).

import { DIMENSIONS } from './dualScorerConfig.js'
import { extractTurnFeatures } from '../lib/behavioralFeatures.js'

// Aggregate per-turn behavioral features across a candidate's turns.
//   candidateTurns: [{ text, responseMs }]
export function extractSessionFeatures(candidateTurns) {
  const turns = (candidateTurns || []).filter((t) => t && typeof t.text === 'string')
  const n = turns.length || 1

  const acc = {
    turns: turns.length,
    totalWords: 0,
    avgWords: 0,
    questionRate: 0, // questions per turn
    hedgeRate: 0,
    connectiveRate: 0,
    avgLexicalDiversity: 0,
    avgLatencyMs: 0,
    positionUpdates: 0, // "you're right" / "I'd adjust" markers (adaptivity)
  }

  const UPDATE_RE = /\b(you'?re right|good point|fair point|i'?d adjust|i would adjust|on reflection|i'?ll change|let me reconsider|that changes)\b/i
  let qSum = 0, hSum = 0, cSum = 0, ldSum = 0, latSum = 0, latN = 0
  const perDimSignal = Object.fromEntries(DIMENSIONS.map((d) => [d, 0]))

  for (const t of turns) {
    const { features, signals } = extractTurnFeatures(t.text, { responseMs: t.responseMs })
    acc.totalWords += features.wordCount
    qSum += features.questionCount
    hSum += features.hedgeCount
    cSum += features.connectiveCount
    ldSum += features.lexicalDiversity
    if (Number.isFinite(features.responseMs)) { latSum += features.responseMs; latN += 1 }
    if (UPDATE_RE.test(t.text)) acc.positionUpdates += 1
    for (const dim of DIMENSIONS) perDimSignal[dim] += signals[dim] || 0
  }

  acc.avgWords = +(acc.totalWords / n).toFixed(1)
  acc.questionRate = +(qSum / n).toFixed(3)
  acc.hedgeRate = +(hSum / n).toFixed(3)
  acc.connectiveRate = +(cSum / n).toFixed(3)
  acc.avgLexicalDiversity = +(ldSum / n).toFixed(3)
  acc.avgLatencyMs = latN ? Math.round(latSum / latN) : null

  // Transparent shadow score per dimension: average per-turn signal (0-1) → 0-100.
  const shadowScores = {}
  for (const dim of DIMENSIONS) {
    shadowScores[dim] = Math.round(Math.min(1, perDimSignal[dim] / n) * 100)
  }

  return { features: acc, shadowScores }
}
