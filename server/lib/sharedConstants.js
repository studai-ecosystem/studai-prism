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
// Charter §7.1 (2026-08-04): the public label for the `collaboration` key is
// `Collaborative Behaviour` — one simulated interaction demonstrates behaviour,
// it does not establish general collaboration ability.
export const DIMENSION_LABELS = {
  criticalThinking: 'Critical Thinking',
  communication: 'Communication',
  collaboration: 'Collaborative Behaviour',
  problemSolving: 'Problem Solving',
  aiDigitalFluency: 'AI & Digital Fluency',
}

// Public construct definitions (charter §7.1 / §17). The collaboration wording
// is charter-fixed verbatim; the others are honest behaviour-level definitions
// (no ability-level claims). Governed here so public copy cannot drift.
export const DIMENSION_PUBLIC_DEFINITIONS = {
  criticalThinking: 'Reasoning demonstrated while examining information, assumptions and trade-offs in a simulated workplace interaction.',
  communication: 'Clarity and structure demonstrated while expressing and adapting a position in a simulated workplace interaction.',
  collaboration: 'Behaviour demonstrated while responding to other participants in a simulated workplace interaction.',
  problemSolving: 'Behaviour demonstrated while working a situation toward a concrete next step in a simulated workplace interaction.',
  aiDigitalFluency: 'Judgement demonstrated when reasoning about the use of AI or digital tools in a simulated workplace situation. Scored only when the session included the standardized direct probe.',
}

// Charter §7.2 / §8: the first-class result rendered for a dimension whose
// evidence floor was not met. Never fabricate a numerical score to fill it.
export const INSUFFICIENT_EVIDENCE_LABEL = 'Insufficient evidence'

// ── Charter §2: pilot positioning (verbatim policy strings) ──────────────────
// Rendered on marketing, report, verification and institutional surfaces, and
// included in report emails. Tests pin their presence.
export const PILOT_NOTICE =
  'Prism is in its pilot validation phase: an evidence-based workplace-readiness assessment for graduating students, used for development and structured interview preparation — not automated rejection.'
export const NOT_SOLE_BASIS_POLICY =
  'Prism must not be used as the sole basis for an adverse educational or employment decision.'

// ── Charter §3: governed job-family scope and scenario mapping ───────────────
// The versioned scope document (docs/JOB_FAMILY_SCOPE_v1.md) is the ceiling for
// all public and institutional copy. This mapping is a documented content
// alignment ONLY — there are no scientifically framed job-family weights and
// none may be added without job-analysis + validation evidence.
export const JOB_FAMILY_SCOPE = {
  version: 'job-family-scope-v1',
  document: 'docs/JOB_FAMILY_SCOPE_v1.md',
  families: {
    'graduate-business-operations': 'Graduate Business Operations',
    'customer-facing-growth': 'Customer-Facing Growth',
  },
  scenarios: {
    'group-project': { families: ['graduate-business-operations', 'customer-facing-growth'], usage: 'standard' },
    'fest-budget': { families: ['graduate-business-operations'], usage: 'standard' },
    'clinic-triage': { families: ['graduate-business-operations', 'customer-facing-growth'], usage: 'standard' },
    'delayed-launch': { families: ['graduate-business-operations'], usage: 'standard' },
    'supplier-failure': { families: ['graduate-business-operations'], usage: 'standard' },
    'brand-crisis': { families: ['customer-facing-growth'], usage: 'standard' },
    'ethical-ai': { families: ['graduate-business-operations'], usage: 'sparing-advanced' },
    'team-restructure': { families: ['graduate-business-operations'], usage: 'sparing-advanced' },
  },
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

// Entitlement modes whose sessions are REAL candidates (calibration-eligible).
// 'paid' = direct purchase; 'invite' = admin-issued group assessment link
// (college cohorts). Everything else (dummy/dev/admin_grant) stays synthetic.
export const REAL_ENTITLEMENT_MODES = ['paid', 'invite']

// Consent copy version. Bump whenever the wording or scope set in
// src/pages/Briefing.jsx CONSENT_ITEMS changes; recorded with every consent
// and stamped onto the session record (audit finding C5).
// 2026-07-05.1: research_calibration now explicitly covers interaction-
// pattern signals (response timing, typing rhythm, revision counts) — Track 3.1.
export const CONSENT_VERSION = '2026-07-05.1'
