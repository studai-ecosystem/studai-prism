// Feature-flag registry catalogue (Control Centre Phase 5, plan §24).
//
// THE ONE LAW (unchanged, CI-enforced): the console NEVER assigns a PRISM_*
// environment variable at runtime. This registry records what exists, who
// owns it, how risky it is, and which change requests were approved — the
// actual flip is an operator env action, afterwards VERIFIED against the
// live environment via markApplied.
//
// Science-gated flags (in lib/flagMap.js) additionally carry flip-check
// preconditions: a production enable request is REFUSED while its verdict is
// NO-GO ("do not allow a flag to activate if its required data gate is
// missing" — prompt §24).

import { query } from '../db/pool.js'
import { FLAG_MAP, checkFlag } from './flagMap.js'

// Operational + science flags. Science flags are always HIGH risk; their
// data_gate text mirrors the flip-check preconditions (which do the real
// enforcement).
export const FLAG_CATALOGUE = [
  // Science-gated (flip-check governed — see lib/flagMap.js)
  { key: 'PRISM_V2_EXECUTIVE', risk: 'high', owner: 'psychometrics', description: 'Executive engine: adaptive probe steering + evidence ledger.', dataGate: 'flip-check: steering study result in registry' },
  { key: 'PRISM_V2_DUAL_SCORER', risk: 'high', owner: 'psychometrics', description: 'Dual-channel scorer + conformal CI.', dataGate: 'flip-check: human-agreement study + frozen calibration' },
  { key: 'PRISM_V2_EQUATING', risk: 'high', owner: 'psychometrics', description: 'Per-scenario score equating.', dataGate: 'flip-check: frozen+applied equate run' },
  { key: 'PRISM_V2_EARLY_STOP', risk: 'high', owner: 'psychometrics', description: 'Adaptive early-stop rule.', dataGate: 'flip-check: executive engine preconditions' },
  { key: 'PRISM_PRESSURE', risk: 'high', owner: 'psychometrics', description: 'Pressure probes (executive-only).', dataGate: 'flip-check: adversarial study result' },
  { key: 'PRISM_STANDARDIZED_CORE', risk: 'high', owner: 'psychometrics', description: 'Standardized assessment core (charter §8): versioned anchor probes delivered verbatim at fixed exchanges, per-dimension evidence floors, adaptivity only after the floor.', dataGate: 'charter Phase 6 release decision — human flip (HA-020); AI & Digital Fluency reports Insufficient evidence until this is live' },
  // Charter Phase 3 governance gates — ALL default OFF pending human-action
  // register approvals. ONE LAW: humans flip.
  { key: 'PRISM_IDENTITY_L3', risk: 'high', owner: 'governance', description: 'Identity-assurance Level 3 (charter §9): reports/credentials may claim identity-verified status from the OCR/Aadhaar workflow.', dataGate: 'legal/privacy approval of the identity-verification workflow (HA-007); until then verified sessions report at most Level 2' },
  { key: 'PRISM_UNDER18_PATH', risk: 'high', owner: 'governance', description: 'Under-18 guardian-consent path (charter §12; PROD-READY Phase 8, AGE_GATING_POLICY_v1 addendum): registration with a guardian email, an emailed single-use link, guardian agree/decline/withdraw (/api/guardian-consent, /api/auth/guardian-consent), migration 0062. Copy is DRAFT. Off = registration requires the 18+ confirmation exactly as before and every guardian route is 404.', dataGate: 'guardian-consent decision memo + DPDP counsel approval (HA-005/HA-006)' },
  { key: 'PRISM_PROCTOR_PHONE_CAM', risk: 'high', owner: 'governance', description: 'Phone second-camera proctoring step (charter §14: OFF by default for development-use pilots).', dataGate: 'documented buyer need + legal review + approved governance (HA-005/HA-020)' },
  { key: 'PRISM_PROCTOR_GAZE', risk: 'high', owner: 'governance', description: 'Gaze interpretation (looking-away events) from on-device face analysis (charter §14: OFF by default).', dataGate: 'documented buyer need + legal review + approved governance (HA-005/HA-020)' },
  { key: 'PRISM_DEMOGRAPHICS', risk: 'high', owner: 'governance', description: 'Fairness-research demographic collection (charter §15). The framework (separated storage, suppression, UNDERPOWERED labelling) exists; NOTHING writes candidate_demographics while this is off — CI-enforced.', dataGate: 'DPDP counsel approval (HA-005) + independent ethics review (HA-012); the write path lands in the same commit as that evidence' },
  { key: 'PRISM_RETENTION_ENFORCEMENT', risk: 'high', owner: 'governance', description: 'Scheduled retention enforcement (charter §16). Off = dry-runs and deliberate audited runs only; on = daily enforcement passes with receipts.', dataGate: 'counsel-approved retention schedule (HA-003) + operator decision — automated deletion is a human call (HA-020)' },
  { key: 'PRISM_LANG', risk: 'high', owner: 'product', description: 'Multilingual assessment (hi/hi-en/ta), provisional scoring.', dataGate: 'flip-check: DIF adequately powered per language' },
  { key: 'PRISM_VELOCITY', risk: 'high', owner: 'product', description: 'Skill-velocity growth trajectories.', dataGate: 'flip-check: test-retest reliability per dimension' },
  { key: 'PRISM_REPLAY', risk: 'high', owner: 'product', description: 'Practice replay (formative only).', dataGate: 'flip-check: glass-box + isolation re-verified' },
  { key: 'PRISM_TEAMFIT', risk: 'high', owner: 'product', description: 'Team-fit simulation (qualitative only).', dataGate: 'flip-check: replay preconditions' },
  // Operational
  { key: 'PRISM_V2_TELEMETRY', risk: 'medium', owner: 'engineering', description: 'Phase 0 telemetry (item logging + audit trail).', dataGate: 'DATABASE_URL + migrations' },
  { key: 'PRISM_GLASS_BOX', risk: 'medium', owner: 'engineering', description: 'Credential issuance (signed evidence bundles).', dataGate: 'Ed25519 signing key configured' },
  { key: 'PRISM_ADMIN_CONSOLE', risk: 'medium', owner: 'engineering', description: 'This admin control centre.', dataGate: 'DATABASE_URL + migration 0011 + seeded super admin' },
  { key: 'PRISM_ADMIN_PROMPT_REGISTRY', risk: 'high', owner: 'psychometrics', description: 'Prompt runtime served from the DB registry instead of files.', dataGate: 'registry seeded; drift report clean' },
  { key: 'PRISM_CMS_DB', risk: 'medium', owner: 'content', description: 'Public content served from the DB CMS instead of content.json.', dataGate: 'CMS seeded from content.json' },
  { key: 'PRISM_TTS_NEURAL', risk: 'low', owner: 'engineering', description: 'Amazon Polly neural voices for personas.', dataGate: 'POLLY_TTS_ENABLED + IAM polly:SynthesizeSpeech' },
  { key: 'PRISM_PG_STORE', risk: 'high', owner: 'engineering', description: 'v1 store on PostgreSQL instead of JSON files.', dataGate: 'staging smoke of the full candidate flow (audit C13 runbook)' },
  { key: 'PRISM_DUMMY_PAYMENTS', risk: 'medium', owner: 'business', description: 'Trial mode: free dummy entitlements instead of Razorpay.', dataGate: 'business decision only' },
  { key: 'PRISM_SKIP_VERIFICATION', risk: 'medium', owner: 'business', description: 'Trial mode: bypass identity verification steps (consent never skipped).', dataGate: 'business decision only' },
  { key: 'PRISM_DRIFT_HARD', risk: 'high', owner: 'psychometrics', description: 'Judge-drift hard gate: block credential issuance on drifted judge.', dataGate: 'calibration-v1 frozen' },
  { key: 'PRISM_STUDY_STEERING_AB', risk: 'high', owner: 'research', description: 'Study 1 A/B arm assignment at session start.', dataGate: 'pilot start (human checklist)' },
  // Prism Campus + Personal V1 (spec §49). ALL default OFF; humans flip (HA-C001).
  { key: 'PRISM_APP_SHELL_V3', risk: 'medium', owner: 'product', description: 'Campus V1: new /app/* application shell and student pages.', dataGate: 'internal QA of the shell at 4 widths + axe clean (HA-C001)' },
  { key: 'PRISM_EVIDENCE_FAIL_CLOSED', risk: 'high', owner: 'psychometrics', description: 'Campus V1: V3 evidence-status vocabulary (SUFFICIENT / PROVISIONAL / INSUFFICIENT_EVIDENCE / HUMAN_REVIEW_REQUIRED) on surfaces. Fabrication removal itself is unconditional.', dataGate: 'provisional sufficiency thresholds approved (HA-C002) + operator flip (HA-C001)' },
  { key: 'PRISM_STUDENT_REPORT_V3', risk: 'high', owner: 'psychometrics', description: 'Campus V1: Student Report V3 route and /api/v1 report endpoint.', dataGate: 'evidence fail-closed live + claim registry review (HA-C002) + operator flip (HA-C001)' },
  { key: 'PRISM_ASSESSMENT_WORKSPACE_V3', risk: 'medium', owner: 'engineering', description: 'Campus V1: Assessment Workspace V3 player and /api/v1 session endpoints.', dataGate: 'Journey E (network interruption) green + operator flip (HA-C001)' },
  { key: 'PRISM_CAMPUS_ENABLED', risk: 'high', owner: 'product', description: 'Campus V1: every organization/campus route and campus UI.', dataGate: 'DATABASE_URL + campus migrations + legal review of disclosure copy (HA-C005) + operator flip (HA-C001)' },
  { key: 'PRISM_CAMPUS_ANALYTICS', risk: 'high', owner: 'psychometrics', description: 'Campus V1: aggregate campus analytics with small-group suppression.', dataGate: 'PRISM_CAMPUS_ENABLED live + suppression and aggregate-reporting policy review (HA-C010) + operator flip (HA-C001)' },
  { key: 'PRISM_DEVELOPMENT_V2', risk: 'high', owner: 'psychometrics', description: 'Campus V1: Development Engine V2 missions, plans and interventions (practice evidence only).', dataGate: 'mission evaluator prompt review + operator flip (HA-C001)' },
  { key: 'PRISM_GROWTH_ENABLED', risk: 'high', owner: 'psychometrics', description: 'Campus V1: reassessment cycles and growth comparison (approved-equivalent forms only).', dataGate: 'form equivalence approved (HA-C004) + operator flip (HA-C001)' },
  { key: 'PRISM_ROLE_EXPLORATION_V2', risk: 'medium', owner: 'product', description: 'Campus V1: Explore Roles V2 (self-reported vs demonstrated, no percentages).', dataGate: 'copy review + operator flip (HA-C001)' },
  { key: 'PRISM_PREPARATION_V1', risk: 'medium', owner: 'product', description: 'P7: private preparation (sanitized intent, untimed rehearsal, action card) and SELF_REPORT check-ins; PERSONAL workspace only, never formal evidence.', dataGate: 'DATABASE_URL + 0047 + participant/action-card prompt review + privacy review of retention copy + operator flip (HA-C001)' },
  // PROD-READY Phase 4: /api/v1 human-review, pre-start accommodation and
  // identity-check routes for V3 sessions (the legacy routes are closed for
  // them, K104), their admin accommodation plane and UI entry points. Default OFF.
  { key: 'PRISM_V3_SUPPORT_ROUTES', risk: 'medium', owner: 'product', description: 'V3 support routes: one free human review per assessment (§11), accommodation requests before the start (§13), Level 1 identity self-declaration (§9; Level 3 not offered).', dataGate: 'PRISM_APP_SHELL_V3 live + migration 0058 + staff assigned to the review and accommodation queues (reports:review, accommodations:manage) + draft copy reviewed by counsel (HA-005) + operator flip (HA-C001)' },
  // PROD-READY Phase 5: PostgreSQL-backed background job runner (no Redis) —
  // CSV-import invite emails, assignment reminders, seat release after a
  // window passes, scheduled retention passes (those still need
  // PRISM_RETENTION_ENFORCEMENT) and the admin job-queue view. Default OFF.
  { key: 'PRISM_JOB_WORKER', risk: 'medium', owner: 'engineering', description: 'Background job worker in the API container (one per replica, FOR UPDATE SKIP LOCKED): queued CSV-import invite emails, assignment reminder emails per reminder policy, release of RESERVED seats after an assignment window passes, recurring scans, and the /api/admin/job-queue dead-letter view. Off = CSV invites are sent inside the request as before and nothing is scheduled.', dataGate: 'DATABASE_URL + migration 0059 + SMTP and PUBLIC_APP_URL verified in the environment + an operator watching dead letters (runbook: PERFORMANCE_REVIEW addendum 2026-10-10) + operator flip' },
  // PROD-READY Phase 6: materialised per-session sufficiency decisions for
  // campus analytics and growth outcomes (0060). Server-only; the views are
  // identical with it on or off, only the cost per request changes. Default OFF.
  { key: 'PRISM_ANALYTICS_DECISION_CACHE', risk: 'medium', owner: 'engineering', description: 'Serve campus analytics and growth-outcome decisions from the materialised per-session cache (session_decision_cache, 0060) instead of recomputing the sufficiency decisions per request. Rows are invalidated in the same transaction as any evidence, session, report, admin-hold or erasure write (version counter triggers) and by any change to the sufficiency rules, level labels or catalog (fingerprint). Used only when the v1 store is PostgreSQL (PRISM_PG_STORE). Off = computed per request as before.', dataGate: 'DATABASE_URL + PRISM_PG_STORE=true + migration 0060 + the Phase 6 load-test results reviewed (PERFORMANCE_REVIEW addendum 2026-10-10) + operator flip' },
  // PROD-READY Phase 8: sales readiness. Default OFF.
  { key: 'PRISM_PILOT_REPORT_EXPORT', risk: 'medium', owner: 'psychometrics', description: 'Admin export of the pilot technical report for one organization (POST /api/admin/organizations/:orgId/pilot-report, Markdown or JSON) filled from live aggregates with small-group suppression; PROVISIONAL / INSUFFICIENT shown as computed; never an individual result. Needs organizations:read + exports:create; every export is ledgered and audited.', dataGate: 'docs/commercial/PILOT_TECHNICAL_REPORT_TEMPLATE_v1.md reviewed by the psychometrics lead (HA-008) + aggregate-reporting policy review (HA-C010) + operator flip' },
  { key: 'PRISM_DEMO_MODE', risk: 'medium', owner: 'business', description: 'Allows server/db/seedDemoOrg.js --demo to write a synthetic demo organization when NODE_ENV=production, and only into PRISM_DEMO_DATABASE_URL (must differ from DATABASE_URL). Demo organizations are marked (organizations.is_demo, 0061), isolated from real ones by triggers, excluded from calibration and the rating queue, and every screen shows a "Demo data" banner. Off = the seed refuses in production.', dataGate: 'a separate demo database and deployment (never the production database) + business decision to run sales demos + operator flip in that environment only' },
  // PROD-READY Phase 9: employer development-use (L&D) workspace. Default OFF.
  { key: 'PRISM_EMPLOYER_LND', risk: 'high', owner: 'governance', description: 'Employer development-use (L&D) workspace on the campus machinery: an EMPLOYER organization invites its own new hires or fresher cohorts, sponsors assessments, sees an individual report only when the employee shares it (share grant), sees small-group-suppressed cohort aggregates and assigns development missions (/api/v1/employer/*). Selection features do not exist by design: no ranking, no sorting or filtering by level, no cut-offs, no export of individual results, job families limited to JOB_FAMILY_SCOPE_v1. Also gates the candidate-consented StudAI Hire evidence hand-off INTERFACE (/api/v1/integrations/hire/handoff), which answers 501 until a human decision connects it. Employer copy is DRAFT. Off = every employer route is 404, employer organizations open no workspace and their invites are not valid; campus behaviour is unchanged.', dataGate: 'PRISM_CAMPUS_ENABLED live + employer disclosure/consent copy approved by counsel (HA-005) + employer prohibited-use terms approved (HA-004) + HIRE_HANDOFF decision recorded in the human-action register before any connection (ECOSYSTEM_SEPARATION_POLICY_v1 rule 2) + operator flip (HA-C001)' },
  // Campus Phase 12 validation tooling (not a product surface). Default OFF.
  { key: 'PRISM_V3_RATING_QUEUE', risk: 'medium', owner: 'psychometrics', description: 'Blinded human double-rating queue for V3 evidence units (/api/validation, /api/admin/validation, /rater/evidence).', dataGate: 'DATABASE_URL + 0039 + qualified raters + rating protocol approved by the psychometrics lead (HA-C008)' },
]

export async function seedFlagRegistry() {
  let inserted = 0
  for (const f of FLAG_CATALOGUE) {
    const r = await query(
      `INSERT INTO feature_flags (flag_key, description, owner, risk, data_gate)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (flag_key) DO UPDATE SET
         description = EXCLUDED.description, owner = EXCLUDED.owner,
         risk = EXCLUDED.risk, data_gate = EXCLUDED.data_gate
       RETURNING (xmax = 0) AS inserted`,
      [f.key, f.description, f.owner, f.risk, f.dataGate],
    )
    if (r?.rows?.[0]?.inserted) inserted += 1
  }
  return { inserted }
}

export function liveFlagState(flagKey) {
  return process.env[flagKey] === 'true' ? 'on' : 'off'
}

export function isScienceGated(flagKey) {
  return Object.prototype.hasOwnProperty.call(FLAG_MAP, flagKey)
}

// Flip-check verdict for science-gated flags; null for operational flags.
export async function gateVerdict(flagKey) {
  if (!isScienceGated(flagKey)) return null
  try {
    return await checkFlag(flagKey)
  } catch {
    return { verdict: 'ESCALATE', reasons: ['flip-check errored — treat as NO-GO'] }
  }
}
