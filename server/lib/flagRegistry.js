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
