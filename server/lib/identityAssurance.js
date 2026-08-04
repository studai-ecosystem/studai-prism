// Charter §9 — identity-assurance levels (Phase 3).
//
// Three levels, stamped onto every NEW report and credential:
//   L1 self-declared        — account + candidate-entered identity (default).
//   L2 institution-verified — a RECORDED institution-verification event with
//                             the responsible authority named. An invite link
//                             alone NEVER proves identity (charter §9).
//   L3 identity-verified    — the identity-verification workflow (OCR/Aadhaar
//                             machinery) PLUS the PRISM_IDENTITY_L3 flag.
//                             The flag stays OFF pending legal/privacy
//                             approval (HA-007) — until then a session with a
//                             'verified' record still reports at most L2/L1,
//                             and no surface claims the workflow is legally
//                             approved.
//
// ONE LAW: the agent flips no flags; PRISM_IDENTITY_L3 is a human decision.

import { query, isDbConfigured } from '../db/pool.js'
import { getVerification } from './store.js'
import { ASSURANCE_LEVELS } from './sharedConstants.js'

export function isIdentityL3Enabled() {
  return process.env.PRISM_IDENTITY_L3 === 'true'
}

// The recorded §9 L2 event for a session, or null. Requires the telemetry DB;
// without one, no L2 event can exist (JSON-store deployments report L1/L3).
export async function getInstitutionVerification(sessionId) {
  if (!isDbConfigured()) return null
  const r = await query(
    'SELECT verification_id, authority, method, note, created_at FROM institution_verifications WHERE session_id = $1',
    [sessionId],
  ).catch(() => null)
  return r?.rows?.[0] || null
}

// Derive the assurance level for a session (called at report issuance and at
// credential assembly). Pure precedence: L3 (gated) > L2 (recorded event) > L1.
export async function assuranceForSession(sessionId) {
  const now = new Date().toISOString()
  if (isIdentityL3Enabled()) {
    const verification = await getVerification(sessionId).catch(() => null)
    if (verification && verification.status === 'verified') {
      return {
        level: 'L3',
        label: ASSURANCE_LEVELS.L3.label,
        basis: 'identity-verification workflow (verified record on file)',
        recordedAt: now,
      }
    }
  }
  const institutional = await getInstitutionVerification(sessionId)
  if (institutional) {
    return {
      level: 'L2',
      label: ASSURANCE_LEVELS.L2.label,
      basis: `institution verification event ${institutional.verification_id} (${institutional.method}) by ${institutional.authority}`,
      recordedAt: now,
    }
  }
  return {
    level: 'L1',
    label: ASSURANCE_LEVELS.L1.label,
    basis: 'candidate account and self-declared identity',
    recordedAt: now,
  }
}
