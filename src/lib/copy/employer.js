// Employer development-use (L&D) page chrome (PROD-READY Phase 9). DRAFT —
// pending HA-005 (counsel review of consent and disclosure copy) and HA-004
// (prohibited-use terms). The disclosures themselves come from the server
// (server/domain/employer/copy.js), versioned with every consent record.
// Development and structured onboarding only: the copy ceiling tests
// (server/test/campusCopyCeiling.test.js, src/features/employer/employer.test.jsx)
// scan this file and the rendered employer pages for selection wording.
export const EMPLOYER_COPY_STATUS = 'DRAFT'
// Mirrors server/domain/employer/copy.js (stored with each consent record).
export const EMPLOYER_DISCLOSURE_VERSION = 'employer-development-disclosure.v0-draft'
export const EMPLOYER_ASSESSMENT_DISCLOSURE_VERSION = 'employer-assessment-disclosure.v0-draft'

export const EMPLOYER_ROLE_LABELS = Object.freeze({
  ORG_OWNER: 'Workspace owner',
  PLACEMENT_DIRECTOR: 'Learning and development lead',
  PLACEMENT_OFFICER: 'Learning and development coordinator',
  FACULTY_MENTOR: 'Mentor',
  STUDENT: 'Employee',
})

export const EMPLOYER_SHELL_LABEL = 'Employer development workspace'

// Employee-side wording for an employer-sponsored workspace (the detailed
// disclosure itself is served by the server).
export const EMPLOYER_SPONSORED_NOTE = (org) => `${org} sees group summaries only. It sees a report of yours only if you share it.`
export const EMPLOYER_REPORT_VISIBILITY = (org) => `${org} sees only group summaries. It sees this report only if you share it with them.`
export const EMPLOYER_SHARED_VISIBILITY = 'The employee chose to share this report with your organization for a development conversation.'

// The employee-facing lists, mirrored from the server's employer join
// disclosure (employerJoinDisclosure in server/domain/employer/copy.js) for
// the in-workspace "What can they see?" panel. A vitest test keeps the two
// identical; the invitation page renders the server's own copy.
export const EMPLOYER_CAN_SEE = Object.freeze([
  'That you joined, and which group of new colleagues you are in',
  'Whether you started or completed the assessments and practice it assigned to you',
  'Group summaries of results, where small groups are hidden so no one is singled out',
  'A report of yours only if you choose to share it, for as long as you choose',
])
export const EMPLOYER_CANNOT_SEE = Object.freeze([
  'Your individual results, unless you share them',
  'Assessments you took on your own, and their reports',
  'Your personal practice and private preparation',
  'Anything you do with another organization',
  'Your activity in other StudAI products',
])
export const employerProhibitedUses = (org) => {
  const name = org || 'Your employer'
  return Object.freeze([
    `Under the draft pilot terms, ${name} may not use a Prism result as the sole or primary basis for any selection, employment, promotion or termination decision.`,
    `${name} may not rank people by their Prism results or set cut-off scores.`,
    `${name} may not see a report of yours unless you share it, and may not obtain it any other way.`,
    'This workspace has no ranking, no cut-off scores and no export of individual results.',
  ])
}
