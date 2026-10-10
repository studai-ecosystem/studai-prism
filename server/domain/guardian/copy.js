// Under-18 guardian-consent copy (PROD-READY Phase 8). DRAFT — not approved.
// Pending HA-006 (the under-18 decision: guardian consent or explicit
// exclusion) and HA-005 (DPDP counsel review of consent and disclosure copy).
// The path is dark behind PRISM_UNDER18_PATH (registered OFF); a human enables
// it only after both items are closed and this copy is replaced by the
// approved text with a new version id.
//
// Scope ceiling (docs/JOB_FAMILY_SCOPE_v1.md, PROHIBITED_USES_POLICY_v1.md):
// development use only — never a hiring screen, ranking, pass/fail cut-off or
// job-performance prediction.

export const GUARDIAN_CONSENT_COPY_STATUS = 'DRAFT'
export const GUARDIAN_CONSENT_PENDING_ON = Object.freeze(['HA-006', 'HA-005'])
export const GUARDIAN_CONSENT_COPY_VERSION = 'guardian-consent-u18-v0-draft'

// The declaration written to the learner's account once a guardian has
// consented. Its version and basis say exactly what it is: not a learner's
// 18+ confirmation, a guardian's consent for a learner under 18.
export const GUARDIAN_DECLARATION_VERSION = 'guardian-consent-u18-v0-draft'
export const GUARDIAN_DECLARATION_BASIS = 'GUARDIAN_CONSENT'

// Days a guardian link stays valid for a decision (withdrawal stays possible).
export const GUARDIAN_LINK_DAYS = 14

export const GUARDIAN_CONSENT_COPY = Object.freeze({
  status: GUARDIAN_CONSENT_COPY_STATUS,
  version: GUARDIAN_CONSENT_COPY_VERSION,
  pendingOn: GUARDIAN_CONSENT_PENDING_ON,
  title: 'Consent for a learner under 18 to use Prism (draft)',
  intro: 'A learner who told us they are under 18 named you as their parent or guardian. They can take a Prism assessment only if you agree.',
  whatPrismIs: 'Prism is a development tool: it gives the learner feedback on workplace capabilities from a practice scenario. It is not an exam, a ranking, a pass/fail test or a hiring decision, and it does not predict job performance.',
  whatIsCollected: 'We keep your email address, the version of this text you saw, and whether and when you agreed, declined or withdrew. We do not ask for your name, an identity document or anyone\'s date of birth.',
  whoSees: 'The learner sees their own report. Their institution sees it only if the learner chooses to share it, and otherwise only group totals that hide small groups.',
  withdraw: 'You can withdraw your consent at any time with the same link. The learner then cannot start another assessment until consent is given again.',
  deletion: 'Your email address and this record are deleted when the learner\'s account is deleted. A request that is never answered is deleted 30 days after it lapses (period pending review).',
  grant: 'I am this learner\'s parent or guardian and I agree',
  decline: 'I do not agree',
  learnerPending: 'We have asked your parent or guardian to agree before you can start an assessment.',
  draftNotice: 'Draft text pending legal review. Not in use.',
})
