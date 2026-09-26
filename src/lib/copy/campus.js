// Campus administration copy (spec §19–§25, §37.1). Plain language, no
// internal terms, no numbers without meaning.
export const ASSESSMENT_STATUS_LABELS = Object.freeze({
  NONE: 'Not assigned',
  ASSIGNED: 'Not started',
  ACKNOWLEDGED: 'Briefing read',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  EXPIRED: 'Window closed',
  WITHDRAWN: 'Withdrawn',
})
export const ASSESSMENT_STATUS_TONES = Object.freeze({
  NONE: 'neutral', ASSIGNED: 'neutral', ACKNOWLEDGED: 'accent', IN_PROGRESS: 'partial', COMPLETED: 'positive', EXPIRED: 'insufficient', WITHDRAWN: 'insufficient',
})
export const MEMBER_STATUS_LABELS = Object.freeze({ ACTIVE: 'Enrolled', INVITED: 'Invited', SUSPENDED: 'Suspended', REMOVED: 'Removed' })
export const ASSIGNMENT_STATUS_LABELS = Object.freeze({ DRAFT: 'Draft', SCHEDULED: 'Scheduled', ACTIVE: 'Open', CLOSED: 'Closed', CANCELLED: 'Cancelled' })
export const PROGRAM_STATUS_LABELS = Object.freeze({ DRAFT: 'Draft', ACTIVE: 'Active', COMPLETED: 'Completed', ARCHIVED: 'Archived' })

export const IMPORT_ERROR_TEXT = Object.freeze({
  EMAIL_MISSING: 'Email is missing',
  EMAIL_INVALID: 'Email is not valid',
  DUPLICATE_IN_FILE: 'This email appears earlier in the file',
  UNKNOWN_COHORT: 'Cohort not found (or not one you manage)',
  COHORT_MISSING: 'No cohort given and no default cohort chosen',
})
export const IMPORT_ACTION_TEXT = Object.freeze({
  INVITE: 'Will be invited',
  ALREADY_MEMBER: 'Already enrolled — will be added to the cohort',
  ERROR: 'Will be skipped',
})
export const IMPORT_OUTCOME_TEXT = Object.freeze({ INVITED: 'Invited', SKIPPED: 'Skipped', FAILED: 'Failed' })

export const AUDIT_ACTION_TEXT = Object.freeze({
  'structure.created': 'Added to academic structure',
  'cohort.created': 'Created a cohort',
  'cohort.updated': 'Edited a cohort',
  'cohort.archived': 'Archived a cohort',
  'cohort.members_moved': 'Moved students between cohorts',
  'cohort.member_removed': 'Removed a student from a cohort',
  'import.previewed': 'Checked a student file',
  'import.committed': 'Imported students',
  'program.created': 'Created a program',
  'program.updated': 'Edited a program',
  'assignment.launched': 'Assigned an assessment',
  'assignment.closed': 'Closed an assessment window',
  'assignment.cancelled': 'Cancelled an assessment',
  'role.changed': 'Changed a team role',
  'member.removed': 'Removed a team member',
  'invite.resent': 'Sent an invitation again',
  'report.exported': 'Exported the student directory',
  'onboarding.completed': 'Completed setup',
  'intervention.assigned': 'Assigned practice missions to a cohort',
  'intervention.completed': 'Marked an intervention as completed',
  'intervention.cancelled': 'Cancelled an intervention',
})

export const STUDENT_DETAIL_PRIVACY = 'This view contains only data available to this organization. Personal Prism activity is excluded unless the student explicitly shares it.'

export const ONBOARDING_STEP_COPY = Object.freeze({
  profile: { title: 'Organization profile', body: 'Check your organization name and type. Contact StudAI to change them.' },
  structure: { title: 'Academic structure', body: 'Add campuses, departments, programs and batches so cohorts can be organised.' },
  team: { title: 'Invite your team', body: 'Invite placement staff, coordinators and mentors. Each role sees only what it needs.' },
  students: { title: 'Import students', body: 'Upload a CSV. You will see every problem row before anything is sent.' },
  program: { title: 'Create a program', body: 'A program groups cohorts, assessments and development for a period.' },
  assessment: { title: 'Choose an assessment', body: 'Pick from the approved assessments. Assessment content cannot be edited.' },
  schedule: { title: 'Set the schedule', body: 'Choose when the assessment window opens and closes.' },
  privacy: { title: 'Review privacy', body: 'Read exactly what students are told your institution can and cannot see.' },
  launch: { title: 'Launch', body: 'Assign the assessment. Students are notified in Prism and by email.' },
})
