// Copy for the V3 support paths (PROD-READY Phase 4): human review, adjustment
// requests and the identity check. DRAFT pending counsel review (HA-005).
// Plain language; never a promise of an outcome, never a guaranteed deadline,
// never a statement about how well someone did.

export const SUPPORT_EMAIL = 'support@studai.one'

export const REVIEW_COPY = {
  title: 'Ask a person to review this report',
  intro: 'You can ask a person to review this assessment once, free of charge. The reviewer looks at what you wrote and did, and at how the report was put together.',
  turnaround: (days) => `We aim to reply within ${days} business days. This is a target, not a guarantee.`,
  reasonLabel: 'What should the reviewer look at?',
  reasonHint: 'A few sentences are enough, for example a moment you think was misread.',
  submit: 'Request the review',
  submitting: 'Sending...',
  open: 'A person is reviewing this report. You will see the outcome here.',
  requestedOn: (date) => `Requested on ${date}.`,
  outcomeTitle: 'Review outcome',
  correctedVersion: (n) => `The corrected report is version ${n}.`,
  used: 'You have used the free review for this assessment.',
  furtherNotOffered: `A further review is not offered in the app. If you think something went wrong, write to ${SUPPORT_EMAIL}.`,
  notReady: 'You can ask for a review once your report is ready.',
  sent: 'Your review request was sent.',
}

export const ACCOMMODATION_COPY = {
  title: 'Request an adjustment',
  intro: 'If you need a text-only mode, no camera check or another adjustment, tell us before you start. A person reads every request before your assessment. Adjustments never change how your answers are judged.',
  privacy: 'What you write here is seen only by you and by the people who decide adjustments. It never appears in your report or in anything your institution sees.',
  needsLabel: 'What do you need?',
  needsHint: 'Describe the adjustment in your own words. You do not need to share a diagnosis.',
  submit: 'Send request',
  update: 'Update request',
  submitting: 'Sending...',
  sent: 'Your request was sent. A person will review it before your assessment.',
  status: {
    REQUESTED: 'Waiting for a decision. Please wait for it before you start: once an assessment starts, it runs in the standard way.',
    APPROVED: 'Approved. It applies automatically when you start.',
    DENIED: `Not approved. If you would like to talk about it, write to ${SUPPORT_EMAIL}.`,
    LAPSED: 'The assessment started before a decision was made, so it ran in the standard way.',
  },
  statusLabel: { REQUESTED: 'Waiting for a decision', APPROVED: 'Approved', DENIED: 'Not approved', LAPSED: 'Not applied' },
  modes: { textOnly: 'Text-only answers', noCamera: 'No camera check', reducedProctoring: 'Reduced monitoring' },
  notRequestable: {
    ALREADY_STARTED: 'Adjustments are arranged before an assessment starts, and this one has already started. If something affected your assessment, you can ask for a human review once your report is ready.',
    CLOSED: 'This assessment has closed.',
    NOT_REQUESTABLE: `Adjustment requests are not switched on for this assessment. Write to ${SUPPORT_EMAIL} and a person will help.`,
  },
  chooseAssessment: 'Assessment',
  choosePlaceholder: 'Choose an assessment that has not started',
  noneUpcoming: 'You have no assessment waiting to start in this workspace.',
}

export const IDENTITY_COPY = {
  title: 'Identity check',
  intro: 'The identity level says how we know who took this assessment. It says nothing about how well you did.',
  currentLevel: 'Current level',
  declareLabel: 'Your full name',
  declareHint: 'As you use it for your studies. We do not ask for any document or ID number.',
  confirm: 'I confirm that I took this assessment myself.',
  submit: 'Confirm my identity',
  submitting: 'Saving...',
  declared: (date) => `You confirmed your identity on ${date}.`,
  nameDiffers: 'The name you entered is different from the name on your account. That is fine; both are kept as you entered them.',
  otherRecord: 'An identity check is already on file for this assessment.',
  levels: {
    L1: 'You can confirm this yourself here.',
    L2: 'Only your institution can record this level, from its own records. You cannot request it here.',
    L3: 'A document-based check is not available.',
  },
}

export const SUPPORT_SETTINGS_COPY = {
  title: 'Assessment support',
  description: 'Adjustments before an assessment, your human review requests, and identity checks.',
  reviewsTitle: 'Human reviews',
  noReviews: 'You have not asked for a human review.',
  adjustmentsTitle: 'Adjustment requests',
  noAdjustments: 'You have not asked for an adjustment in this workspace.',
  identityNote: 'You can confirm your identity for a finished assessment from its report page.',
  openReport: 'Open the report',
  reviewState: { OPEN: 'In review', RESOLVED: 'Reviewed' },
}
