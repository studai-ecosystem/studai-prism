// Governed customer-facing copy for evidence sufficiency (spec §33, §40).
// Server reason codes → plain language. Unknown codes fall back to a generic
// explanation; nothing here states or implies a score.
export const SUFFICIENCY_STATUS_COPY = {
  SUFFICIENT: { label: 'Sufficient evidence', tone: 'positive' },
  PROVISIONAL: { label: 'Provisional', tone: 'partial' },
  HUMAN_REVIEW_REQUIRED: { label: 'Awaiting review', tone: 'neutral' },
  INSUFFICIENT_EVIDENCE: { label: 'Insufficient evidence', tone: 'insufficient' },
}

export const SUFFICIENCY_REASON_COPY = {
  NO_EVIDENCE: 'No evidence was recorded for this capability.',
  NO_ADMISSIBLE_EVIDENCE: 'The evidence recorded could not be checked against what you actually did.',
  BELOW_MINIMUM_EVIDENCE_UNITS: 'Not enough separate pieces of evidence yet.',
  BELOW_MINIMUM_INDEPENDENT_OPPORTUNITIES: 'This capability was observed in too few separate moments.',
  BELOW_REQUIRED_ANCHOR_COVERAGE: 'The evidence does not yet cover the described behaviours for this capability.',
  NO_JUDGE_AGREEMENT: 'Independent reviewers have not yet confirmed this evidence.',
  BELOW_MINIMUM_JUDGE_AGREEMENT: 'Independent reviewers did not agree closely enough yet.',
  JUDGE_DISAGREEMENT: 'Reviewers disagreed, so a person will review this evidence.',
  JUDGE_DISAGREEMENT_PENDING_REVIEW: 'Reviewers disagreed, so a person will review this evidence.',
  HUMAN_REVIEW_PENDING: 'A person needs to review this evidence before it is described.',
  INCLUDES_PROVISIONAL_UNITS: 'Some evidence is still provisional.',
  INCLUDES_LEGACY_EVIDENCE: 'Some evidence comes from an earlier version of the assessment.',
  RUBRIC_NOT_CALIBRATED: 'The scoring guide for this capability is still being calibrated.',
  RULES_NOT_APPROVED: 'The rules for describing this capability are still provisional.',
  HUMAN_REVIEW_REQUIRED: 'A person needs to review this evidence before it is described.',
}

export const GENERIC_REASON = 'There is not yet enough reliable evidence to describe this capability.'

export function reasonText(code) {
  return SUFFICIENCY_REASON_COPY[code] || GENERIC_REASON
}

export function statusCopy(status) {
  return SUFFICIENCY_STATUS_COPY[status] || SUFFICIENCY_STATUS_COPY.INSUFFICIENT_EVIDENCE
}

// Provisional level vocabulary (HA-C002). The server sends the label; this is
// the display fallback only.
export const LEVEL_BAND_LABELS = {
  EARLY: 'Early evidence',
  DEVELOPING: 'Developing',
  DEMONSTRATED: 'Demonstrated',
  STRONG: 'Strongly demonstrated',
}
