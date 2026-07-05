// Track 0.3 — re-assessment eligibility.
//
// Quarter-over-quarter comparison is only psychometrically legitimate when
// attempts are spaced (otherwise "growth" is practice-effect noise). Pure
// logic here; the route wires it to the candidate's report history.
//
//   PRISM_REASSESSMENT_GAP_DAYS   minimum days between attempts (default 90;
//                                 0 disables). Skipped entirely under
//                                 PRISM_DUMMY_PAYMENTS (trial mode) so free
//                                 preview flows are never blocked.

import { REASSESSMENT_DAYS } from './sharedConstants.js'

export function configuredGapDays() {
  const raw = process.env.PRISM_REASSESSMENT_GAP_DAYS
  if (raw === undefined || raw === '') return REASSESSMENT_DAYS
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : REASSESSMENT_DAYS
}

// Given the most recent completed-report timestamp, returns null when a new
// attempt is allowed, or { blockedUntil, daysRemaining } when inside the gap.
export function reassessmentBlock(lastIssuedAt, gapDays, now = Date.now()) {
  if (!lastIssuedAt || !Number.isFinite(gapDays) || gapDays <= 0) return null
  const last = new Date(lastIssuedAt).getTime()
  if (!Number.isFinite(last)) return null
  const blockedUntil = last + gapDays * 24 * 60 * 60 * 1000
  if (now >= blockedUntil) return null
  return {
    blockedUntil: new Date(blockedUntil).toISOString(),
    daysRemaining: Math.ceil((blockedUntil - now) / (24 * 60 * 60 * 1000)),
  }
}
