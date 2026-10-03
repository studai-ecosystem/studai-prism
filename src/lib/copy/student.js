// Governed student-application copy (spec §9–§18, §40). One module so copy
// review (HA-C005) touches a single file. Plain language; no internal terms,
// no scores, no percentages.

export const PRIMARY_ACTION_COPY = {
  ASSESSMENT_DUE: { eyebrow: 'Due soon', cta: 'Open briefing' },
  ASSESSMENT_IN_PROGRESS: { eyebrow: 'Saved assessment', cta: 'Resume saved assessment', description: 'Your progress is saved. Resuming continues the same assessment under the same timing; it does not use another assessment.' },
  ASSESSMENT_READY: { eyebrow: 'Ready to start', cta: 'Open briefing' },
  ASSESSMENT_PROCESSING: {
    eyebrow: 'Review in progress',
    title: 'Your work is saved; review is continuing',
    description: 'Your responses were received and the report is being prepared. There is nothing you need to do. Check History for the current status.',
    cta: 'Check status',
  },
  ASSESSMENT_TECHNICAL_FAILED: {
    eyebrow: 'Review did not finish',
    title: 'A technical problem stopped this assessment before a report could be written',
    description: 'Nothing you did is lost. Open the assessment to let the review try again. If that does not work, contact support and quote the reference below.',
    cta: 'Open assessment',
    support: 'Contact support',
  },
  REPORT_READY: { eyebrow: 'Report ready', cta: 'Open my report' },
  PREPARATION_IN_PROGRESS: {
    eyebrow: 'Private preparation',
    title: 'Return to your private preparation',
    description: 'Your preparation is saved and visible only to you. It is practice, not a formal assessment, and never changes your results.',
    cta: 'Return to your private preparation',
  },
  PRACTICE_AVAILABLE: {
    eyebrow: 'Practice available',
    description: 'Practice is labelled as practice and never changes your formal results.',
    cta: 'Start practice',
  },
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

// New-learner intention chooser (P3.3): what each path is for, and whether it
// is available now. Prepare is stated as not yet available rather than hidden.
export const INTENT_COPY = {
  heading: 'What would you like to do?',
  UNDERSTAND: {
    title: 'Understand',
    description: 'Take a formal assessment: a workplace simulation that shows how you reason, communicate and work with others, with the evidence behind every conclusion.',
    cta: 'Take the assessment',
  },
  PRACTISE: {
    title: 'Practise',
    description: 'Short development missions with coaching. Practice is labelled as practice and never changes your formal results.',
    cta: 'See practice missions',
  },
  PREPARE: {
    title: 'Prepare',
    description: 'Private preparation for a specific role or interview. This is not yet available; it opens when the preparation experience is ready.',
    unavailable: 'Not yet available',
  },
}

export const NAV_UNAVAILABLE_NOTE = 'Not yet available. Prepare opens when the preparation experience is ready.'

export const ASSESSMENT_STATUS_COPY = {
  NOT_STARTED: { label: 'Not started', tone: 'neutral' },
  IN_PROGRESS: { label: 'In progress', tone: 'partial' },
  COMPLETED: { label: 'Completed', tone: 'positive' },
  EXPIRED: { label: 'Closed — not completed', tone: 'insufficient' },
  UPCOMING: { label: 'Opens later', tone: 'neutral' },
}

export const CTA_COPY = { START: 'Open briefing', VIEW_BRIEFING: 'View briefing', RESUME: 'Resume', VIEW_REPORT: 'View report' }

// History projection (P1.2): every status is a stored fact, never a verdict.
export const HISTORY_STATUS_COPY = {
  ACTIVE: { label: 'In progress', tone: 'partial' },
  COMPLETED: { label: 'Completed', tone: 'positive' },
  PROCESSING: { label: 'Processing', tone: 'neutral', note: 'Your responses were received. The report is being prepared.' },
  TECHNICAL_FAILED: { label: 'Review did not finish', tone: 'insufficient', note: 'A technical problem stopped this before a report could be written. Nothing you did is lost.' },
  UNDER_REVIEW: { label: 'Under review', tone: 'neutral', note: 'A person is reviewing this result. It is not included in your capabilities until the review is finished.' },
  LEGACY: { label: 'Legacy report', tone: 'neutral', note: 'This report was issued by an earlier version of Prism and is shown as it was originally written.' },
  ABANDONED: { label: 'Not finished', tone: 'neutral' },
}
export const HISTORY_ACTION_COPY = { VIEW_REPORT: 'View report', RESUME: 'Resume', RECOVER: 'Recover', VIEW: 'Open' }
export const HISTORY_LEGACY_ACTION = 'Original report'
// P7: preparation and self-reported notes are their own modes, never mixed
// with formal items and never evidence of capability.
export const HISTORY_MODE_LABEL = { FORMAL: 'Formal assessment', PRACTICE: 'Practice', PREPARATION: 'Private preparation', SELF_REPORT: 'Your own note (self-reported)' }
// Preparation and notes are not assessments: their scope badge says so, and a
// finished one is "Finished" / "Noted", never "Completed" like a formal run.
export const HISTORY_PRIVATE_SCOPE_LABEL = 'Personal · Private to you'
export const HISTORY_PRIVATE_STATUS = {
  PREPARATION: { label: 'Finished', tone: 'neutral' },
  SELF_REPORT: { label: 'Self-reported', tone: 'insufficient' },
}
export const HISTORY_DATE_UNKNOWN = 'Date not recorded'
export const HISTORY_EMPTY = { title: 'No history yet', description: 'Completed assessments, reports, practice attempts and private preparation appear here once they exist. Nothing has been removed.' }

// P7 private preparation copy (CH-34, CH-35).
export const PREPARATION_COPY = {
  privateLabel: 'Personal preparation · Private to you',
  notFormalLabel: 'Not a formal assessment',
  privateNote: 'Private to you. This stays in your personal workspace and never changes a formal result or appears in a campus report.',
  contextBeforeDetails: 'Before you enter anything: this preparation is personal even though your account also belongs to a college. Nothing you write here is visible to your institution. Sponsored practice is a separate choice in your campus workspace, and what you do there is visible to the sponsor as its policy states.',
  omitNote: 'Leave out names, private employer or customer information, credentials and sensitive details about other people. We remove emails, phone numbers and links, but that is help, not a guarantee.',
  assistanceLabel: 'AI assistance',
  suggestionLabel: 'AI suggestion — not your line',
  learnerLabel: 'You wrote',
  observedLabel: 'Prism observed in your rehearsal',
  allowanceNote: 'No limit on preparations. Each rehearsal allows 40 of your lines and 5 AI suggestions.',
  cardIntro: 'A short plan to use before the real conversation. Suggestions are AI assistance based on what you wrote; saving a plan is not a measure of how the conversation will go, and it is never a credential.',
  cardEditedNote: 'You adjusted this card. It is still assistance you edited, not an observation.',
  observationsIntro: 'What you did in the rehearsal, quoting your own lines. The counterpart agreeing or not is not the measure.',
  observationsEmpty: 'No specific behaviour could be quoted from your lines in this rehearsal.',
  applicationTitle: 'One thing to try outside Prism',
  applicationNote: 'Suggested from the practice target you chose. Edit it, dismiss it, or keep it. A reminder stays inside Prism; nothing is sent anywhere.',
  reminderLabel: 'Remind me in Prism to record how it went',
  selfReportLabel: 'Self-reported',
  selfReportNote: 'Your own account. It is kept separately from assessments and cannot change a formal result.',
  checkinPrompt: 'Did you try it? What happened? What next?',
  deleteConfirm: 'Delete this preparation, its rehearsal, card and linked notes? This cannot be undone.',
  cardError: {
    NO_LEARNER_TURNS: 'No card was written because the rehearsal had nothing from you yet.',
    CARD_NOT_CONFIGURED: 'The card writer is not available right now, so no card was written.',
    UNPARSEABLE_OUTPUT: 'The card could not be written in a usable form, so nothing was saved. Your rehearsal is kept.',
    TIMEOUT: 'Writing the card took too long, so nothing was saved. Your rehearsal is kept.',
    PROVIDER_ERROR: 'The card could not be written because of a technical problem. Your rehearsal is kept.',
    DISCARDED_BY_LEARNER: 'You discarded the card. Your rehearsal is kept.',
  },
  replyError: {
    PARTICIPANT_NOT_CONFIGURED: 'The practice counterpart is not available right now. What you wrote is saved.',
    EMPTY_REPLY: 'The counterpart did not reply this time. What you wrote is saved.',
    TIMEOUT: 'The counterpart took too long to reply. What you wrote is saved.',
    PROVIDER_ERROR: 'The counterpart could not reply because of a technical problem. What you wrote is saved.',
  },
  assistError: {
    ASSIST_NOT_CONFIGURED: 'Suggestions are not available right now.',
    EMPTY_REPLY: 'No suggestion came back this time.',
    TIMEOUT: 'The suggestion took too long. Nothing was used up.',
    PROVIDER_ERROR: 'The suggestion could not be written because of a technical problem. Nothing was used up.',
  },
}

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
  EVIDENCE_NOT_SUFFICIENT_FOR_COMPARISON: {
    title: 'Not enough evidence to show a change yet',
    description: 'These assessments are approved as comparable, but a change is shown only when both of them gathered enough evidence for the same capability.',
  },
  FORM_RETIRED: {
    title: 'These assessments cannot be compared any more',
    description: 'One of the assessment forms has been retired, so a direct comparison is no longer approved. Each result stays as its own dated snapshot.',
  },
  REPORT_CORRECTION_PENDING: {
    title: 'A report is being reviewed',
    description: 'One of these reports has an open review. No comparison is shown until the review is decided; the results stay as separate snapshots.',
  },
  TOO_CLOSE_IN_TIME: {
    title: 'These assessments are too close together',
    description: 'The approved comparison rule asks for more time between the two assessments. Each result stays as its own dated snapshot.',
  },
}

export const GROWTH_COPY = {
  directions: { HIGHER: 'Higher level than before', SAME: 'Same level as before', LOWER: 'Lower level than before' },
  uncertainty: 'How precise this change is has not been validated yet, so no margin is shown.',
  notCompared: {
    EVIDENCE_NOT_SUFFICIENT_IN_BOTH: 'Not enough evidence in both assessments',
    NOT_MEASURED_IN_BOTH: 'Not measured in both assessments',
    DIFFERENT_EVIDENCE_RULES: 'The evidence rules changed between the assessments',
    UNKNOWN_LEVEL: 'The level could not be read',
  },
  formApproved: 'These two assessment forms are approved as comparable.',
  reassessmentNotComparable: 'This reassessment will not show a change yet: its assessment forms are not yet approved as comparable. Your results will still be reported.',
  timelineTitle: 'Timeline',
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
    draftLabel: 'Draft content',
    draftNote: 'Draft content is still under review. It is available here for practice only and is never recommended automatically.',
    guided: 'Guided',
    freshChallenge: 'Fresh challenge',
    freshChallengeAction: (family) => `Fresh challenge for ${family}`,
    freshChallengeHelp: 'An unfamiliar setting for the same capability, with hints off. Feedback follows once you submit.',
    allowanceRemaining: (remaining, total) => `${remaining} of ${total} practice attempts remaining`,
    allowanceNone: 'Your practice allowance is used up. Finished attempts stay readable.',
    replayTitle: 'Try that moment again',
    replayHelp: 'Starts a separate practice attempt from the moment you came from. Your assessment and its report stay unchanged.',
    replayAction: 'Try that moment again',
    ungrouped: 'Other capabilities',
    // P6.1 catalogue card facts and the goal filter.
    availability: { REVIEWED: 'Reviewed', DRAFT: 'Draft' },
    untimedNote: 'untimed',
    startAction: 'Open mission',
    chooseGoal: 'Choose a different goal',
    allGoals: 'All capabilities',
    behavioursLabel: 'Target behaviour',
    situationLabel: 'Situation',
    freshSetting: 'Has an unfamiliar-setting version',
  },
  player: {
    practiceLabel: 'Practice mission',
    whatIsChecked: 'What will be checked',
    submitConfirmTitle: 'Submit this attempt?',
    submitConfirmBody: 'You will see feedback for each behaviour. You cannot edit this attempt afterwards, but you can start a new one.',
    resultTitle: 'Feedback',
    retry: 'Try again',
    backToHistory: 'Back to history',
    originNote: 'Started from a moment in one of your assessments. This practice is recorded separately and does not change that assessment or its report.',
    uncoachedNote: 'Fresh challenge: hints are off for this attempt, and so are examples, so the feedback shows what you do without coaching. It is still practice, in a setting you have not seen before.',
    stimulusTitle: 'What you were shown',
    stimulusNote: 'Copied from the moment you came from, so you can try another approach. Your earlier answer is not shown or compared.',
    whyItMatters: 'Why it matters',
    reflect: 'Take a moment',
    observedTitle: 'What was observed',
    nextTitle: 'Next',
    freshChallengeNext: 'Try a fresh challenge for this capability',
    results: { OBSERVED: 'Shown', NOT_OBSERVED: 'Not shown yet', UNCERTAIN: 'Could not be checked', COPIED_ASSISTANCE: 'Matches an example' },
    unavailable: 'Part of the feedback could not be produced right now. Nothing was guessed: those behaviours are not counted either way.',
    // P6.5 first view, focus feedback, examples and comparison.
    firstView: { target: 'Target behaviour', scene: 'The situation', task: 'What to do', duration: (minutes) => `About ${minutes} minutes, untimed`, allowanceUnlimited: 'No limit on attempts here', facts: 'What you know' },
    transferNote: 'A different setting for the same behaviours.',
    focusObserved: 'One thing you did',
    focusSource: { AUTOMATIC_CHECK: 'Source: an automatic check of your work', MEANING_CHECK: 'Source: a meaning check of your own words', EVALUATOR: 'Source: the structured evaluator, quoting your words' },
    focusNext: 'One thing to change next',
    focusAllMet: 'Every checked behaviour was shown in this attempt.',
    focusIncomplete: 'The review could not be completed. Your work is kept and nothing was guessed.',
    yourWords: 'Your words',
    allChecks: 'All checks in this attempt',
    examplesAction: 'Show examples',
    examplesTitle: 'Tips and examples',
    examplesNote: 'Examples are teaching support written for this mission. If your next attempt repeats one, that part is shown as matching the example and is not counted as your own.',
    exampleKind: { EXAMPLE: 'Example', COUNTEREXAMPLE: 'What not to do' },
    comparisonTitle: 'Compared with your earlier attempt',
    newlyMet: 'Shown now, not before',
    noLongerMet: 'Shown before, not now',
    nothingChanged: 'The same behaviours were shown in both attempts.',
    copiedNote: 'This matches the example you were shown, so it is not counted as your own.',
  },
}
