// Shared public-claim constants — single source of truth for server AND client.
//
// Audit findings C2/C22 (2026-07-04): public surfaces hardcoded scoring weights
// and validity/duration numbers that drifted from what the scoring code
// actually does. Every value that is BOTH enforced by the server and CLAIMED in
// candidate-facing copy must live here and be imported by both sides, so the
// two can never diverge again. server/test/sharedConstants.test.js locks the
// canonical values — change them here and the test forces a deliberate review.
//
// This module is plain ESM with no dependencies: the Node server imports it at
// runtime and the Vite client bundles it at build time.

export const DIMENSION_KEYS = [
  'criticalThinking',
  'collaboration',
  'communication',
  'problemSolving',
  'aiDigitalFluency',
]

// Weight of each dimension in the overall Prism Score (server-recomputed).
export const DIMENSION_WEIGHTS = {
  criticalThinking: 0.25,
  communication: 0.25,
  collaboration: 0.2,
  problemSolving: 0.2,
  aiDigitalFluency: 0.1,
}

// Candidate-facing display names for the five scored dimensions.
export const DIMENSION_LABELS = {
  criticalThinking: 'Critical Thinking',
  communication: 'Communication',
  collaboration: 'Collaboration',
  problemSolving: 'Problem Solving',
  aiDigitalFluency: 'AI & Digital Fluency',
}

// Assessment duration in minutes. The client timer counts down from this and
// the server independently enforces it (SESSION_LIMIT_MS = this + grace).
export const ASSESSMENT_MINUTES = 30

// How long an issued Prism Score remains valid, in months. Stamped into every
// issued report (report.validityMonths) and shown on every marketing surface.
export const SCORE_VALIDITY_MONTHS = 12

// Days before a candidate can take a reassessment.
export const REASSESSMENT_DAYS = 90

// Reporting-scale version stamped onto every completed assessment (Track 0.2).
// Bump ONLY when a frozen calibration/equating run changes score meaning —
// scores across different scale versions are not directly comparable.
export const SCALE_VERSION = 'prism-scale-v1'

// Consent copy version. Bump whenever the wording or scope set in
// src/pages/Briefing.jsx CONSENT_ITEMS changes; recorded with every consent
// and stamped onto the session record (audit finding C5).
export const CONSENT_VERSION = '2026-07-04.1'
