// Candidate-consented evidence hand-off to StudAI Hire — INTERFACE ONLY
// (PROD-READY Phase 9; docs/production/HIRE_HANDOFF_INTERFACE.md).
//
// Mirrors the SSO provider pattern (domain/auth/providers): status() says
// NOT_CONFIGURED and every action fails with NOT_IMPLEMENTED (HTTP 501). No
// network call exists in this module, and none may be added until:
//   - a written decision on Prism → Hire data sharing is recorded in the
//     human-action register (ECOSYSTEM_SEPARATION_POLICY_v1 rule 2: "any
//     future data sharing requires a written decision") — HA-025;
//   - counsel has approved the hand-off consent text (HA-005) and the
//     prohibited-use terms that bind the receiving employer (HA-004).
//
// A Prism result is not a hiring screen. The hand-off, if ever connected, is
// evidence the CANDIDATE chooses to carry into a development conversation;
// nobody else can start it, there is no pull or query API, and it is revocable.
//
// Relationship to POST /api/ecosystem/handover-token (live since Phase 1S):
// that route hands over the signed-in IDENTITY only (account id, email, name,
// and an optional credential reference the candidate already holds) so the
// candidate lands signed in on Hire. It carries no evidence and must never be
// extended to carry any: evidence can only travel through this interface,
// with its consent record and revocation. See the contract document.
import { ApiError } from '../../http/errors.js'
import { NOT_SOLE_BASIS_POLICY, JOB_FAMILY_SCOPE } from '../../../lib/sharedConstants.js'

export const HIRE_HANDOFF_CONTRACT_VERSION = 'hire-evidence-handoff.v0-draft'
export const HIRE_HANDOFF_PENDING_ON = Object.freeze(['HA-025', 'HA-005', 'HA-004'])
// A hand-off lives no longer than a report share (reports/v3 MAX_SHARE_DAYS).
export const HIRE_HANDOFF_MAX_DAYS = 180

// Exactly what WOULD be shared — and what never is. Field lists are the
// contract; a future implementation must not send a field not listed here.
export const HIRE_HANDOFF_CONTRACT = Object.freeze({
  version: HIRE_HANDOFF_CONTRACT_VERSION,
  status: 'NOT_CONNECTED',
  pendingOn: HIRE_HANDOFF_PENDING_ON,
  purpose: 'Evidence the candidate chooses to share for a development conversation. Not a hiring screen.',
  initiatedBy: 'CANDIDATE_ONLY',
  consent: Object.freeze({
    required: true,
    consentType: 'HIRE_EVIDENCE_HANDOFF',
    recordFields: Object.freeze(['userId', 'reportSessionId', 'reportVersion', 'disclosureLevel', 'copyVersion', 'grantedAt', 'expiresAt', 'withdrawnAt']),
    maxDays: HIRE_HANDOFF_MAX_DAYS,
    note: 'One consent record per hand-off, written before anything is sent; a new migration adds the consent type when the interface is connected.',
  }),
  payload: Object.freeze({
    handoffId: 'uuid (Prism-generated, one per hand-off)',
    contractVersion: HIRE_HANDOFF_CONTRACT_VERSION,
    subject: 'ecosystemPersonId only (the id the identity hand-over already uses); no email, name or phone in the evidence payload',
    report: 'reportVersion, issuedAt and a verification reference the candidate already holds',
    disclosureLevel: 'SUMMARY by default; FULL (evidence quotes) only when the candidate chooses it for this hand-off',
    capabilities: 'per capability: id, public name, evidence status (SUFFICIENT / PROVISIONAL / INSUFFICIENT_EVIDENCE / HUMAN_REVIEW_REQUIRED) and the provisional level label only where the status allows one',
    integrity: 'tri-status only (conditions met / review recommended / invalidated)',
    scope: `job-family scope version ${JOB_FAMILY_SCOPE.version} and the families of the assessment`,
    notices: 'not-sole-basis policy, pilot notice and the development-use statement, always',
  }),
  neverShared: Object.freeze([
    'raw transcripts (never, even with consent: BUYER_ACCESS_SPEC_v1 lists them as never available to any recipient)',
    'composite score, percentile, ranking or any comparison with other people',
    'raw integrity telemetry or events',
    'accommodation type, needs or reason; demographic data',
    'contact details (email, phone) inside the evidence payload',
    'results sponsored by an employer or institution unless the candidate owns and shares that report',
    'practice, private preparation, role exploration and cohort data',
  ]),
  revocation: Object.freeze({
    byCandidate: 'at any time, from Sharing; Prism records withdrawnAt and sends a revocation notice',
    onAccountErasure: 'every hand-off is revoked and a revocation notice is sent before the account is erased',
    receiverDuty: 'Hire stops showing the evidence and deletes the payload (deadline PENDING, HA-025)',
    semantics: 'a revoked hand-off renders its status, never a stale copy (same rule as a revoked credential)',
  }),
  notSoleBasis: NOT_SOLE_BASIS_POLICY,
})

const NOT_AVAILABLE = 'Sharing evidence with StudAI Hire is not available.'

export const hireEvidenceHandoff = Object.freeze({
  id: 'studai-hire',
  kind: 'EVIDENCE_HANDOFF',
  name: 'StudAI Hire (candidate-consented evidence hand-off)',
  status: () => 'NOT_CONFIGURED',
  describe: () => ({ status: 'NOT_CONFIGURED', contract: HIRE_HANDOFF_CONTRACT }),
  begin: () => { throw new ApiError('NOT_IMPLEMENTED', NOT_AVAILABLE, { details: { pendingOn: HIRE_HANDOFF_PENDING_ON } }) },
  revoke: () => { throw new ApiError('NOT_IMPLEMENTED', NOT_AVAILABLE, { details: { pendingOn: HIRE_HANDOFF_PENDING_ON } }) },
})

export function listEvidenceHandoffs() {
  return [{ id: hireEvidenceHandoff.id, kind: hireEvidenceHandoff.kind, name: hireEvidenceHandoff.name, status: hireEvidenceHandoff.status() }]
}
