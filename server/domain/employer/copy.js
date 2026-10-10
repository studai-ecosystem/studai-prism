// Employer development-use (L&D) copy (PROD-READY Phase 9). DRAFT — not
// approved. Pending HA-005 (counsel review of every consent and disclosure
// string) and HA-004 (employment-law review of the prohibited-use terms).
// The workspace is dark behind PRISM_EMPLOYER_LND (registered OFF); a human
// enables it only after both items are closed and this copy is replaced by
// the approved text with a new version id.
//
// Ceiling (docs/JOB_FAMILY_SCOPE_v1.md, docs/PROHIBITED_USES_POLICY_v1.md):
// development and structured onboarding only. The prohibited-use lines below
// restate PROHIBITED_USES_POLICY_v1 items 1, 2, 3 and 9 for an employer and add
// nothing the policy does not say (P93). Every other string here is checked by
// server/test/campusCopyCeiling.test.js for selection wording.

export const EMPLOYER_COPY_STATUS = 'DRAFT'
export const EMPLOYER_COPY_PENDING_ON = Object.freeze(['HA-005', 'HA-004'])
// Stored on consent_records (types EMPLOYER_DEVELOPMENT_DISCLOSURE and
// EMPLOYER_ASSESSMENT_DISCLOSURE, migration 0063).
export const EMPLOYER_DISCLOSURE_COPY_VERSION = 'employer-development-disclosure.v0-draft'
export const EMPLOYER_ASSESSMENT_DISCLOSURE_COPY_VERSION = 'employer-assessment-disclosure.v0-draft'

const orgName = (name) => name || 'Your employer'

// What every employer surface says Prism is for.
export const EMPLOYER_PURPOSE = 'Prism is used here for development and structured onboarding: feedback on workplace capabilities and practice that helps new colleagues grow.'

// PROHIBITED_USES_POLICY_v1 items 1, 2, 3 and 9, as they apply to an employer,
// plus one statement of fact about this workspace. Every line is a negation.
export function employerProhibitedUses(organizationName) {
  const org = orgName(organizationName)
  return Object.freeze([
    `Under the draft pilot terms, ${org} may not use a Prism result as the sole or primary basis for any selection, employment, promotion or termination decision.`,
    `${org} may not rank people by their Prism results or set cut-off scores.`,
    `${org} may not see a report of yours unless you share it, and may not obtain it any other way.`,
    'This workspace has no ranking, no cut-off scores and no export of individual results.',
  ])
}

// Shown before an employee joins (org invite) — the employer equivalent of
// the campus §36 panel.
export function employerJoinDisclosure(organizationName) {
  const org = orgName(organizationName)
  return Object.freeze({
    status: EMPLOYER_COPY_STATUS,
    pendingOn: EMPLOYER_COPY_PENDING_ON,
    copyVersion: EMPLOYER_DISCLOSURE_COPY_VERSION,
    heading: `${org} uses Prism for development and structured onboarding.`,
    purpose: EMPLOYER_PURPOSE,
    canSee: Object.freeze([
      'That you joined, and which group of new colleagues you are in',
      'Whether you started or completed the assessments and practice it assigned to you',
      'Group summaries of results, where small groups are hidden so no one is singled out',
      'A report of yours only if you choose to share it, for as long as you choose',
    ]),
    cannotSee: Object.freeze([
      'Your individual results, unless you share them',
      'Assessments you took on your own, and their reports',
      'Your personal practice and private preparation',
      'Anything you do with another organization',
      'Your activity in other StudAI products',
    ]),
    prohibitedUses: employerProhibitedUses(organizationName),
    revoke: 'You can stop sharing a report at any time from Sharing. The employer then cannot open it again.',
    acknowledge: `I have read what ${org} can and cannot see`,
    draftNotice: 'Draft text pending legal review.',
  })
}

// Shown on the briefing of an employer-sponsored assessment.
export function employerAssessmentDisclosure(organizationName) {
  const org = orgName(organizationName)
  return Object.freeze({
    status: EMPLOYER_COPY_STATUS,
    pendingOn: EMPLOYER_COPY_PENDING_ON,
    copyVersion: EMPLOYER_ASSESSMENT_DISCLOSURE_COPY_VERSION,
    heading: `${org} sponsors this assessment for your development.`,
    lines: Object.freeze([
      `${org} can see that you were assigned this assessment and whether you completed it.`,
      `${org} cannot see your report unless you choose to share it with them.`,
      'Your result counts towards group summaries only where the group is large enough that no one is singled out.',
    ]),
    prohibitedUses: employerProhibitedUses(organizationName),
    acknowledge: `I understand what ${org} can and cannot see`,
    draftNotice: 'Draft text pending legal review.',
  })
}

// Staff-facing notes on the employer surfaces (served with each view).
export const EMPLOYER_STAFF_COPY = Object.freeze({
  status: EMPLOYER_COPY_STATUS,
  pendingOn: EMPLOYER_COPY_PENDING_ON,
  purpose: EMPLOYER_PURPOSE,
  peopleNote: 'People are listed by name only. Prism shows participation here, never results.',
  sharedReportsNote: 'You see a report only while its owner shares it with your organization. When they stop sharing, it disappears from this list.',
  reportNotice: 'Shared by the employee for a development conversation. Use it to plan support and practice, never as the sole or primary basis for an employment decision.',
  insightsNote: 'Group summaries only. Groups below the minimum size are hidden so no one is singled out.',
  exportNote: 'Exports contain group summaries only. Individual results cannot be exported.',
  catalogNote: 'Only assessments within the published job-family scope can be sponsored.',
})
