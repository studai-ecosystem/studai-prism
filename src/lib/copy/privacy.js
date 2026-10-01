// Governed campus privacy/disclosure copy (spec §11, §36). One module so the
// legal/privacy review (HA-C005) touches a single file. The version string is
// stored with every consent record (server: domain/sharing/copyVersions.js).
export const CAMPUS_DISCLOSURE_VERSION = 'campus-disclosure.v1-draft'

// Spec §36.1 — what the institution can see, when authorised.
export const CAMPUS_CAN_SEE = Object.freeze([
  'Whether you have started or completed assessments it assigned to you',
  'Results of assessments it sponsored',
  'Development activities it assigned, and whether you completed them',
  'Reassessment results it sponsored, when they are valid to compare',
  'Group-level summaries that never single you out',
])

// Spec §36.2 — what it cannot see unless you share it.
export const CAMPUS_CANNOT_SEE = Object.freeze([
  'Assessments you bought yourself, and their reports',
  'Your private role exploration',
  'Your personal practice',
  'Anything you do with another institution or employer',
  'Your activity in other StudAI products',
])

export const ROLE_LABELS = Object.freeze({
  ORG_OWNER: 'Organization owner',
  PLACEMENT_DIRECTOR: 'Placement director',
  PLACEMENT_OFFICER: 'Placement officer',
  DEPARTMENT_COORDINATOR: 'Department coordinator',
  FACULTY_MENTOR: 'Faculty mentor',
  STUDENT: 'Student',
})

export const PERSONAL_PRIVACY_NOTE = 'Only you can see this workspace.'
export const SPONSORED_PRIVACY_NOTE = (org) => `${org} can see sponsored results here. Your personal results stay private.`
