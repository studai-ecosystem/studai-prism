// Campus V1 claims register (spec §45, §58 item 29; C12.02). Every
// scientific or privacy claim a campus surface could imply, with what would
// earn it. All are PENDING: the agent never changes a status — a human does,
// with a frozen analysis or a signed review (the HA ids below). Surfaces must
// not state any of these (claimsCeiling.test.js + campusClaims.test.js).
export const CAMPUS_CLAIM_STATUSES = Object.freeze(['PENDING', 'SUPPORTED', 'NOT_SUPPORTED'])

export const CAMPUS_CLAIMS = Object.freeze([
  { id: 'CAMPUS-LEVEL-LABELS', statement: 'Capability level labels (Early evidence to Strongly demonstrated) correspond to calibrated performance standards.', evidenceRequired: 'Standard-setting study and approved level cut points.', humanAction: 'HA-C002' },
  { id: 'CAMPUS-SUFFICIENCY', statement: 'The evidence sufficiency rules decide correctly when there is enough evidence to report a level.', evidenceRequired: 'Approved sufficiency thresholds checked against human-rated sessions.', humanAction: 'HA-C002' },
  { id: 'CAMPUS-AI-HUMAN-AGREEMENT', statement: 'AI judgements of evidence agree with trained human raters.', evidenceRequired: 'A frozen evidence_agreement_v3 run with enough double-rated items per capability, reviewed by the psychometrics lead.', humanAction: 'HA-C008' },
  { id: 'CAMPUS-RELIABILITY', statement: 'Results are consistent across forms and over short retest intervals.', evidenceRequired: 'Retest and alternate-form reliability studies.', humanAction: 'HA-C008' },
  { id: 'CAMPUS-FORM-EQUIVALENCE', statement: 'Different assessment forms measure a capability on the same scale.', evidenceRequired: 'Equating evidence and an approved form-equivalence decision per pair.', humanAction: 'HA-C004' },
  { id: 'CAMPUS-GROWTH', statement: 'A change between baseline and reassessment reflects a real change in capability.', evidenceRequired: 'Approved form equivalence plus a growth study with measurement error accounted for.', humanAction: 'HA-C004' },
  { id: 'CAMPUS-PRACTICE-TRANSFER', statement: 'Practice missions improve formally assessed capability.', evidenceRequired: 'A controlled comparison of formal reassessment outcomes with and without practice.', humanAction: 'HA-C009' },
  { id: 'CAMPUS-FAIRNESS', statement: 'Results do not differ unfairly across student groups (language, gender, region, disability).', evidenceRequired: 'DIF and fairness review on a sufficiently large, consented sample.', humanAction: 'HA-C008' },
  { id: 'CAMPUS-PREDICTIVE', statement: 'Results predict placement or workplace outcomes.', evidenceRequired: 'A criterion study with outcome data agreed with partner institutions or employers.', humanAction: 'HA-C008' },
  { id: 'CAMPUS-AGGREGATE-PRIVACY', statement: 'Aggregate campus reporting cannot be used to identify an individual student.', evidenceRequired: 'Privacy review of the suppression rules, participation counts and exports.', humanAction: 'HA-C010' },
].map((c) => Object.freeze({ ...c, status: 'PENDING' })))
