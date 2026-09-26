// Governed student-application copy (spec §9–§18, §40). One module so copy
// review (HA-C005) touches a single file. Plain language; no internal terms,
// no scores, no percentages.

export const PRIMARY_ACTION_COPY = {
  ASSESSMENT_DUE: { eyebrow: 'Due soon', cta: 'Open briefing' },
  ASSESSMENT_IN_PROGRESS: { eyebrow: 'In progress', cta: 'Resume' },
  ASSESSMENT_READY: { eyebrow: 'Ready to start', cta: 'Open briefing' },
  REPORT_READY: { eyebrow: 'Report ready', cta: 'View report' },
  CAPABILITY_SUMMARY: {
    eyebrow: 'Nothing due right now',
    title: 'Your capability profile',
    description: 'Review what your completed assessments show and where to focus next.',
    cta: 'View capabilities',
  },
  GET_STARTED: {
    eyebrow: 'Get started',
    title: 'Take your first Prism assessment',
    description: 'A workplace simulation that shows how you reason, communicate and work with others, with the evidence behind every conclusion.',
    cta: 'Start an assessment',
  },
  NOTHING_ASSIGNED: {
    eyebrow: 'Nothing assigned yet',
    title: 'No assessments from your institution yet',
    description: 'When your institution assigns an assessment, it appears here with its due date.',
  },
}

export const ASSESSMENT_STATUS_COPY = {
  NOT_STARTED: { label: 'Not started', tone: 'neutral' },
  IN_PROGRESS: { label: 'In progress', tone: 'partial' },
  COMPLETED: { label: 'Completed', tone: 'positive' },
  EXPIRED: { label: 'Closed — not completed', tone: 'insufficient' },
  UPCOMING: { label: 'Opens later', tone: 'neutral' },
}

export const CTA_COPY = { START: 'Open briefing', VIEW_BRIEFING: 'View briefing', RESUME: 'Resume', VIEW_REPORT: 'View report' }

export const ASSESSMENT_TABS_EMPTY = {
  ACTIVE: { title: 'Nothing to take right now', description: 'Assessments you can start or resume appear here.' },
  COMPLETED: { title: 'No completed assessments yet', description: 'Finished assessments and their reports appear here.' },
  UPCOMING: { title: 'Nothing scheduled', description: 'Assessments that open later appear here with their start date.' },
}

export const SCOPE_LABEL = {
  PERSONAL: 'Personal assessment',
  SPONSORED: (sponsor) => `Sponsored by ${sponsor || 'your institution'}`,
}

export const INTEGRITY_COPY = {
  STANDARD: {
    label: 'Standard',
    requirements: [
      'Work on your own, in one sitting if you can.',
      'Keep this browser tab open while you work.',
    ],
  },
  PROCTORED: {
    label: 'Proctored',
    requirements: [
      'Work on your own, in one sitting.',
      'Identity and room checks run before you start.',
      'Keep this browser tab open while you work.',
    ],
  },
}

export const NOT_MEASURED_COPY = {
  PERSONALITY: 'Your personality type',
  INTELLIGENCE: 'Intelligence or IQ',
  EMOTION_OR_TONE: 'Your facial expressions, voice tone or emotions',
  APPEARANCE: 'Your appearance or background',
  ACADEMIC_RECORD: 'Your grades or degree',
  EMPLOYER_FIT: 'Whether a particular employer should hire you',
}

export const BRIEFING_COPY = {
  howItWorks: 'You join a short workplace scenario as a team member. Colleagues ask for your view and push back; you reply in your own words. Prism records what you do and say, and describes capabilities only where there is enough evidence.',
  howItWorksArtifacts: 'Some steps include working documents, such as a dashboard or a budget, that you can review and change.',
  allowedTools: [
    'Notes on paper or in a separate document',
    'A calculator',
  ],
  notAllowed: [
    'Another person helping you',
    'Copying answers from an AI tool',
  ],
  accommodations: 'If you need extra time, a text-only mode or another adjustment, ask us before you start. A person reviews every request, and adjustments never change how your answers are judged.',
  personalScope: 'This is a personal assessment. Only you can see the result unless you choose to share it.',
  systemCheckIntro: 'Check your device before you start. Nothing is recorded during this check.',
}

// Spec §11 sponsored disclosure. Version stored with the consent record.
export const SPONSORED_DISCLOSURE_VERSION = 'campus-assessment-disclosure.v1-draft'
export const SPONSORED_DISCLOSURE = (org) => [
  `This assessment is sponsored by ${org}.`,
  `${org} can access this sponsored assessment result and program-related development progress.`,
  'Your personal Prism assessments and private activity are not shared automatically.',
]

export const START_REASON_COPY = {
  ACKNOWLEDGEMENT_REQUIRED: 'Confirm you have read who can see this assessment to continue.',
  SPONSORED_START_UNAVAILABLE: 'Sponsored assessments start from the new assessment workspace, which is not open yet. Your institution will tell you when to begin.',
  ENTITLEMENT_REQUIRED: 'Your institution has not made a place available for you yet. Contact your placement team.',
  ENTITLEMENT_EXPIRED: 'Your institution’s access to this assessment has ended. Contact your placement team.',
  ENTITLEMENT_EXHAUSTED: 'All places your institution bought for this assessment are in use. Contact your placement team.',
  NOT_A_MEMBER: 'You are no longer a member of this institution.',
  NOT_OPEN: 'This assessment has not opened yet.',
  CLOSED: 'This assessment has closed.',
  COMPLETED: 'You have completed this assessment.',
  IN_PROGRESS: 'You have already started this assessment.',
}

export const GROWTH_REASON_COPY = {
  NEEDS_COMPARABLE_REASSESSMENT: {
    title: 'Growth appears after a comparable reassessment',
    description: 'Prism only shows change between assessments that are approved as comparable. You need a later assessment on an approved form first.',
  },
  FORMS_NOT_VALIDATED_FOR_COMPARISON: {
    title: 'These assessments cannot be compared yet',
    description: 'A later assessment exists, but these forms are not yet validated for direct growth comparison.',
  },
}

export const RIASEC_COPY = {
  R: { label: 'Hands-on, practical work', hint: 'Building, fixing or operating things' },
  I: { label: 'Investigating and analysing', hint: 'Working out why things happen' },
  A: { label: 'Creating and designing', hint: 'Writing, design or new ideas' },
  S: { label: 'Helping and teaching people', hint: 'Supporting, coaching or explaining' },
  E: { label: 'Leading and persuading', hint: 'Making the case and getting things moving' },
  C: { label: 'Organising and keeping things accurate', hint: 'Plans, records and processes' },
}

export const DEVELOPMENT_COPY = {
  focusIntro: 'Based on your latest completed assessment. Practice never changes your formal results.',
  noPlan: {
    title: 'No development focus yet',
    description: 'After an assessment with enough evidence, the capabilities to work on first appear here — up to three at a time.',
  },
  missionsSoon: {
    title: 'Practice missions',
    description: 'Practice missions are not available here yet. When they are, practice evidence is always labelled separately from formal results.',
  },
  missions: {
    recommendedTitle: 'Recommended for your priorities',
    noRecommended: 'No practice mission matches your current priorities yet. You can still try any mission below.',
    catalogueTitle: 'All practice missions',
    campusCatalogueEmpty: 'Your institution has not assigned any practice missions here yet.',
    completedTitle: 'Your practice attempts',
    practiceNote: 'Practice feedback checks specific behaviours in your work. It is not a formal assessment and never changes your formal results.',
    campusPrivacy: (institution) => `${institution} sees only whether you started and finished each assigned mission — never your answers or feedback.`,
  },
  player: {
    practiceLabel: 'Practice mission',
    whatIsChecked: 'What will be checked',
    submitConfirmTitle: 'Submit this attempt?',
    submitConfirmBody: 'You will see feedback for each behaviour. You cannot edit this attempt afterwards, but you can start a new one.',
    resultTitle: 'Feedback',
    retry: 'Try again',
    results: { OBSERVED: 'Shown', NOT_OBSERVED: 'Not shown yet', UNCERTAIN: 'Could not be checked' },
    unavailable: 'Part of the feedback could not be produced right now. Nothing was guessed: those behaviours are not counted either way.',
  },
}
