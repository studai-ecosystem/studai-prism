// Timing policies (P3.8): the ONE place a run's duration and submission grace
// come from. The screen shows what the persisted policy says; nothing here is
// hard-coded per form elsewhere, and no policy shortens an existing run.
//
// - LEGACY_35: every non-draft run. Preserves the existing behaviour exactly:
//   the timed start IS the engine's startedAt and the engine keeps enforcing
//   its own 35-minute limit (routes/assessment.js is unchanged).
// - DRAFT_UNIVERSAL: ONLY runs on a DRAFT segment (PRISM_DRAFT_CONTENT). The
//   universal draft targets 20–25 minutes; the 30-minute maximum is PROPOSED
//   and pending review, so this policy is labelled as such and is not a
//   published measurement condition.
const MINUTE = 60_000

export const LEGACY_35 = Object.freeze({
  version: 'legacy-35.v1',
  status: 'PUBLISHED',
  durationMs: 35 * MINUTE,
  graceMs: 0,
  adjustments: Object.freeze([]),
})

export const DRAFT_UNIVERSAL = Object.freeze({
  version: 'draft-universal-25.v0-proposed',
  status: 'PROPOSED_PENDING_REVIEW',
  durationMs: 25 * MINUTE,
  graceMs: 5 * MINUTE,
  adjustments: Object.freeze([]),
})

// The legacy policy as configured: `limitMs` is the engine's configured limit
// (35 minutes in production); the stored row mirrors it so the contract and
// the engine can never disagree about a legacy run.
export function legacyPolicy(limitMs) {
  const durationMs = Number.isFinite(limitMs) && limitMs > 0 ? limitMs : LEGACY_35.durationMs
  return durationMs === LEGACY_35.durationMs ? LEGACY_35 : Object.freeze({ ...LEGACY_35, durationMs })
}

export const isLegacyPolicy = (policyOrVersion) => (typeof policyOrVersion === 'string' ? policyOrVersion : policyOrVersion?.version) === LEGACY_35.version

export function timingPolicyFor({ draft, limitMs }) {
  return draft ? DRAFT_UNIVERSAL : legacyPolicy(limitMs)
}

// Deadlines derived from a timed start under a policy (server clock only).
export function deadlinesFor(policy, startedAtMs) {
  if (!Number.isFinite(startedAtMs)) return { answerDeadlineAt: null, graceDeadlineAt: null }
  const answer = startedAtMs + policy.durationMs
  return { answerDeadlineAt: new Date(answer).toISOString(), graceDeadlineAt: new Date(answer + (policy.graceMs || 0)).toISOString() }
}

export const policyRecord = (policy) => ({
  version: policy.version, status: policy.status, durationMs: policy.durationMs, graceMs: policy.graceMs || 0, adjustments: [...(policy.adjustments || [])],
})
