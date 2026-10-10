// Under-18 guardian-consent page chrome (PROD-READY Phase 8). DRAFT — pending
// HA-006 (under-18 decision) and HA-005 (DPDP counsel review). The consent
// text itself comes from the server (server/domain/guardian/copy.js), versioned
// with the record. The page is reachable only while PRISM_UNDER18_PATH is on.
export const GUARDIAN_PAGE_COPY_STATUS = 'DRAFT'
export const GUARDIAN_PAGE_COPY = Object.freeze({
  title: 'Consent for a learner under 18',
  invalid: 'This link is not available',
  invalidBody: 'The link may be mistyped, or this request is no longer open. The learner can send a new one.',
  learner: (name) => (name ? `Learner: ${name}` : 'Learner: name not given'),
  verified: 'You have agreed. You can withdraw your consent at any time with this link.',
  declined: 'You did not agree. The learner cannot start an assessment.',
  withdrawn: 'You have withdrawn your consent. The learner cannot start another assessment.',
  expired: 'This link has expired. The learner can send a new one.',
  withdraw: 'Withdraw consent',
  failed: 'That did not work. Please try again.',
})
