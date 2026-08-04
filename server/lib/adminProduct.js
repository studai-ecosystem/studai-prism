// Shared helpers for Control Centre Phase 2 product administration.
//
//   * sanitizeCorrectionScores — the SAME clamp + weighted-overall recompute the
//     scoring pipeline applies (sharedConstants source of truth), so a reviewed
//     score correction can never produce an out-of-range or mis-weighted report.
//   * maskEmail / maskVerification — field-level PII controls (plan §5): roles
//     without *:read_pii see masked values; unmasked access is audited.
//   * DISPUTE_TRANSITIONS — the §10 dispute state machine, enforced server-side.

import { DIMENSION_KEYS, DIMENSION_WEIGHTS } from './sharedConstants.js'

function clampScore(n) {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(100, v))
}

// Returns {scores} with every dimension clamped 0–100 and overall recomputed
// server-side from the canonical weights. Rejects unknown score keys hard —
// a correction cannot smuggle new fields into a report (mass-assignment guard).
//
// Charter §7.2/§8: `nullDimensions` lists dimensions the report issued as
// `Insufficient evidence`. A correction can NEVER give them a number (that
// would fabricate evidence) — they must stay null, and the recomputed overall
// renormalizes the canonical weights over the scored dimensions (the same
// arithmetic the issuance pipeline applies to its internal composite).
export function sanitizeCorrectionScores(input, { nullDimensions = [] } = {}) {
  if (!input || typeof input !== 'object') throw new Error('scores object required')
  const unknown = Object.keys(input).filter((k) => !DIMENSION_KEYS.includes(k))
  if (unknown.length) throw new Error(`unknown score keys: ${unknown.join(', ')}`)
  const fabricated = nullDimensions.filter((k) => input[k] != null)
  if (fabricated.length) {
    throw new Error(`cannot score dimensions reported as Insufficient evidence: ${fabricated.join(', ')}`)
  }
  const missing = DIMENSION_KEYS.filter((k) => input[k] == null && !nullDimensions.includes(k))
  if (missing.length) throw new Error(`missing score keys: ${missing.join(', ')}`)
  const clean = {}
  for (const key of DIMENSION_KEYS) {
    clean[key] = nullDimensions.includes(key) ? null : clampScore(input[key])
  }
  const scored = DIMENSION_KEYS.filter((k) => typeof clean[k] === 'number')
  const weightSum = scored.reduce((s, k) => s + DIMENSION_WEIGHTS[k], 0)
  clean.overall = clampScore(
    scored.reduce((sum, key) => sum + clean[key] * DIMENSION_WEIGHTS[key], 0) / (weightSum || 1),
  )
  return clean
}

export function maskEmail(email) {
  const s = String(email || '')
  const at = s.indexOf('@')
  if (at <= 0) return s ? '***' : ''
  const local = s.slice(0, at)
  const domain = s.slice(at)
  return `${local[0]}${'*'.repeat(Math.max(2, Math.min(6, local.length - 1)))}${domain}`
}

// Masked verification view: status signals only, zero identity fields.
export function maskVerification(v) {
  if (!v) return null
  return {
    sessionId: v.sessionId,
    nameMatch: Boolean(v.nameMatch),
    matchScore: typeof v.matchScore === 'number' ? v.matchScore : null,
    status: v.status || null,
    at: v.at || null,
    pii: 'masked',
  }
}

// §10 dispute workflow — allowed transitions from each state. Terminal states
// can only be reopened; reopened behaves like an open dispute.
export const DISPUTE_STATES = [
  'open', 'assigned', 'evidence_gathering', 'human_review',
  'awaiting_candidate', 'decision_proposed', 'resolved', 'rejected', 'reopened',
]

export const DISPUTE_TRANSITIONS = {
  open: ['assigned', 'rejected'],
  assigned: ['evidence_gathering', 'human_review', 'awaiting_candidate', 'rejected'],
  evidence_gathering: ['human_review', 'awaiting_candidate', 'decision_proposed', 'rejected'],
  human_review: ['evidence_gathering', 'awaiting_candidate', 'decision_proposed'],
  awaiting_candidate: ['evidence_gathering', 'human_review', 'decision_proposed', 'rejected'],
  decision_proposed: ['resolved', 'rejected', 'human_review'],
  resolved: ['reopened'],
  rejected: ['reopened'],
  reopened: ['assigned', 'evidence_gathering', 'human_review', 'rejected'],
}

export function canTransitionDispute(from, to) {
  return Boolean(DISPUTE_TRANSITIONS[from]?.includes(to))
}

// Coarse mapping to the candidate-store 3-state status (v1_disputes CHECK).
export function coarseDisputeStatus(state) {
  if (state === 'resolved' || state === 'rejected') return 'resolved'
  if (state === 'human_review' || state === 'decision_proposed') return 'in_review'
  return 'open'
}
