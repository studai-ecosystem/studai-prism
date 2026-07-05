// Track 6 — study registry, immutable A/B assignment, append-only results.
//
// All functions are telemetry-DB-gated (no-op / null without DATABASE_URL),
// mirroring lib/telemetry.js: studies never block the candidate flow.

import { randomUUID, createHash } from 'node:crypto'
import { query, isDbConfigured } from '../db/pool.js'
import { isTelemetryEnabled } from './telemetry.js'
import { kappaFromLevelMaps } from './kappa.js'
import logger from './logger.js'

// ── T6.1 registry ─────────────────────────────────────────────────────────────
// The six pre-registered studies. Hypotheses and metrics are frozen here and
// in /docs/studies — changing them after data collection is a protocol
// violation, not an edit.
export const PREREGISTERED_STUDIES = [
  {
    study_key: 'steering_ab',
    title: 'Executive steering vs lite director — evidence density (Vantage replication A)',
    hypothesis: 'Executive-steered conversations elicit a higher rate of scoreable skill evidence per turn than lite-director conversations.',
    preregistered_metric: 'mean non-NA micro-rater level rate per turn per arm; fraction of sessions with >=1 scoreable turn per dimension',
    protocol_doc: 'docs/studies/STEERING_AB_PROTOCOL.md',
  },
  {
    study_key: 'human_llm_agreement',
    title: 'Human–LLM vs human–human rater agreement (Vantage replication B)',
    hypothesis: 'Quadratically-weighted kappa between the judge panel and qualified human raters is not lower than kappa between pairs of qualified human raters.',
    preregistered_metric: 'quadratically-weighted Cohen kappa: panel-vs-human and human-vs-human, per dimension, on double-rated sessions',
    protocol_doc: 'docs/studies/HUMAN_LLM_AGREEMENT_PROTOCOL.md',
  },
  {
    study_key: 'test_retest',
    title: 'Test–retest reliability on equated forms',
    hypothesis: 'Dimension scores on equated forms separated by the study window correlate at r >= 0.7.',
    preregistered_metric: 'Pearson r per dimension between attempt 1 and attempt 2 scores on equated forms; SEM',
    protocol_doc: 'docs/studies/TEST_RETEST_PROTOCOL.md',
  },
  {
    study_key: 'adversarial_evasion',
    title: 'LLM-assisted cheating — detection evasion rate',
    hypothesis: 'Instructed LLM-assisted candidates are distinguishable from honest candidates using behavioral timing features.',
    preregistered_metric: 'evasion rate at a fixed false-positive rate (5%) on held-out labeled sessions',
    protocol_doc: 'docs/studies/ADVERSARIAL_PROTOCOL.md',
  },
  {
    study_key: 'sim_to_real_transfer',
    title: 'Simulation-to-reality transfer',
    hypothesis: 'Prism dimension scores correlate positively with human-rated live group-exercise scores for the same candidates.',
    preregistered_metric: 'Pearson/Spearman correlation per dimension between Prism scores and external live-exercise ratings',
    protocol_doc: 'docs/studies/TRANSFER_PROTOCOL.md',
  },
  {
    study_key: 'multilingual_dif',
    title: 'Multilingual fairness (DIF across language groups)',
    hypothesis: 'Item difficulty does not differ materially across language groups after matching on ability.',
    preregistered_metric: 'per-item DIF flags (Mantel-Haenszel / logistic) across language groups; fraction of items flagged',
    protocol_doc: 'docs/studies/MULTILINGUAL_DIF_PROTOCOL.md',
  },
]

// Idempotent registry seed (ON CONFLICT DO NOTHING — a registered study's
// hypothesis/metric is never silently rewritten by code).
export async function seedStudies() {
  if (!isDbConfigured()) return { total: PREREGISTERED_STUDIES.length, inserted: 0 }
  let inserted = 0
  for (const s of PREREGISTERED_STUDIES) {
    const r = await query(
      `INSERT INTO studies (study_id, study_key, title, hypothesis, preregistered_metric, protocol_doc)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (study_key) DO NOTHING`,
      [randomUUID(), s.study_key, s.title, s.hypothesis, s.preregistered_metric, s.protocol_doc],
    )
    inserted += r?.rowCount ?? 0
  }
  return { total: PREREGISTERED_STUDIES.length, inserted }
}

export async function getStudyByKey(studyKey) {
  if (!isDbConfigured()) return null
  const r = await query('SELECT * FROM studies WHERE study_key = $1', [studyKey])
  return r?.rows?.[0] || null
}

// ── T6.3 rater-training exemplars ────────────────────────────────────────────
// AUTHORED transcripts with expert-set reference levels. These are training
// material for human raters (rubric exemplars), not measurement data: they
// never enter item_responses, calibration or any study metric. Fixed UUIDs →
// idempotent seed. Reference levels follow /server/prompts/judge_turn.v1.md
// anchors and MUST be reviewed by the rubric owner before real rater
// onboarding (flagged in docs/studies/HUMAN_LLM_AGREEMENT_PROTOCOL.md).
export const TRAINING_REFS = [
  {
    ref_id: '7f0a6f10-0000-4000-8000-000000000001',
    transcript: [
      { speaker: 'avatar', name: 'Karthik', text: 'The sound system quote came in. It is 30,000 — more than half our remaining budget. The food stalls will walk if we spend that. What do we do?' },
      { speaker: 'candidate', text: 'Before deciding, how many students said music was their main reason for coming, versus food? If we do not know, I would split the difference: negotiate the sound quote down to 20,000 — vendors usually pad quotes — and guarantee the stalls 25,000. We keep both, and I will tell each side exactly why they are not getting everything, so nobody feels tricked. If the vendor will not move, we drop to the mid-range system: a slightly worse speaker hurts less than empty food stalls.' },
    ],
    reference_levels: { criticalThinking: 3, communication: 3, collaboration: 2, problemSolving: 4, aiDigitalFluency: 0 },
  },
  {
    ref_id: '7f0a6f10-0000-4000-8000-000000000002',
    transcript: [
      { speaker: 'avatar', name: 'Nurse Latha', text: 'Sixty patients waiting, two doctors, and this elderly walk-in looks seriously unwell. Booked patients are already angry. What is the rule?' },
      { speaker: 'candidate', text: 'ok just see everyone in order' },
      { speaker: 'avatar', name: 'Mr. Joshi', text: 'So the walk-in waits behind all sixty of us, even if he collapses?' },
      { speaker: 'candidate', text: 'yes rules are rules' },
    ],
    reference_levels: { criticalThinking: 0, communication: 1, collaboration: 0, problemSolving: 0, aiDigitalFluency: 0 },
  },
  {
    ref_id: '7f0a6f10-0000-4000-8000-000000000003',
    transcript: [
      { speaker: 'avatar', name: 'Rohan Mehta', text: 'Engineering needs six weeks. The client walks in two. Marketing already announced the date. Pick something.' },
      { speaker: 'candidate', text: 'I hear that rushing risks quality — that concern is fair. Could we ship only the client-facing module in two weeks and schedule the rest? I would ask an AI code-review pass on the rushed module and have a senior engineer verify anything it flags, since AI review alone can miss context. Then I would call the client myself: here is what you get in two weeks, here is the date for the rest, in writing. If engineering says even the module is impossible, I take the client call today rather than promise and miss.' },
    ],
    reference_levels: { criticalThinking: 3, communication: 4, collaboration: 3, problemSolving: 3, aiDigitalFluency: 3 },
  },
]

export async function seedTrainingRefs() {
  if (!isDbConfigured()) return { total: TRAINING_REFS.length, inserted: 0 }
  let inserted = 0
  for (const t of TRAINING_REFS) {
    const r = await query(
      `INSERT INTO rater_training_refs (ref_id, transcript, reference_levels)
       VALUES ($1,$2,$3) ON CONFLICT (ref_id) DO NOTHING`,
      [t.ref_id, JSON.stringify(t.transcript), JSON.stringify(t.reference_levels)],
    )
    inserted += r?.rowCount ?? 0
  }
  return { total: TRAINING_REFS.length, inserted }
}

// ── T6.2 A/B assignment ──────────────────────────────────────────────────────
// Deterministic per (study, session): SHA-256 of the ids picks the arm, so a
// retried insert can never flip arms; the DB trigger forbids updates anyway.
export function armFor(studyId, sessionId, arms = ['executive', 'lite']) {
  const h = createHash('sha256').update(`${studyId}:${sessionId}`).digest()
  return arms[h[0] % arms.length]
}

// Assigns (or returns the existing) arm for a session in the steering study.
// Telemetry-gated + never throws — assignment failure degrades to "no study".
export async function assignSteeringArm(sessionId, { isSynthetic = false } = {}) {
  if (process.env.PRISM_STUDY_STEERING_AB !== 'true') return null
  if (!isTelemetryEnabled()) return null
  try {
    const study = await getStudyByKey('steering_ab')
    if (!study || (study.status !== 'active' && study.status !== 'preregistered')) return null
    const arm = armFor(study.study_id, sessionId)
    await query(
      `INSERT INTO study_sessions (study_id, session_id, arm, is_synthetic)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (study_id, session_id) DO NOTHING`,
      [study.study_id, sessionId, arm, Boolean(isSynthetic)],
    )
    const r = await query(
      'SELECT arm FROM study_sessions WHERE study_id = $1 AND session_id = $2',
      [study.study_id, sessionId],
    )
    return r?.rows?.[0]?.arm || arm
  } catch (err) {
    logger.captureException(err, { msg: 'study_assignment_failed', sessionId })
    return null
  }
}

// ── T6.4 append-only results ─────────────────────────────────────────────────
export async function recordStudyResult({ studyKey, metricName, value, detail, n, analysisVersion, supersedes = null }) {
  if (!isDbConfigured()) return null
  const study = await getStudyByKey(studyKey)
  if (!study) throw new Error(`unknown study: ${studyKey}`)
  const resultId = randomUUID()
  await query(
    `INSERT INTO study_results (result_id, study_id, metric_name, value, detail, n, analysis_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [resultId, study.study_id, metricName, value ?? null, detail ? JSON.stringify(detail) : null, n ?? null, analysisVersion || null],
  )
  if (supersedes) {
    await query(
      'UPDATE study_results SET superseded_by = $2 WHERE result_id = $1 AND superseded_by IS NULL',
      [supersedes, resultId],
    )
  }
  return resultId
}

// ── T6.3 IRR gate (pure) ──────────────────────────────────────────────────────
// A rater qualifies when their quadratically-weighted kappa against the
// reference levels across ALL training transcripts meets the documented
// threshold. Below it, their ratings are excluded automatically (403 on rate).
export const TRAINING_KAPPA_THRESHOLD = 0.6

export function evaluateTrainingKappa(answerLevelMaps, referenceLevelMaps, dimensions) {
  const kappa = kappaFromLevelMaps(answerLevelMaps, referenceLevelMaps, dimensions)
  return { kappa, qualified: kappa !== null && kappa >= TRAINING_KAPPA_THRESHOLD }
}

// ── Study-1 preregistered metric (evidence density) ──────────────────────────
// Computed from item_responses.micro_levels for sessions assigned to each arm.
// Excludes synthetic sessions BY DEFAULT (RULE 3).
export async function computeSteeringEvidenceDensity({ includeSynthetic = false } = {}) {
  if (!isDbConfigured()) return null
  const study = await getStudyByKey('steering_ab')
  if (!study) return null
  const r = await query(
    `SELECT ss.arm,
            COUNT(DISTINCT ss.session_id)::int AS sessions,
            COUNT(ir.response_id)::int AS turns,
            AVG(CASE WHEN ir.micro_levels IS NOT NULL THEN
              (SELECT COUNT(*) FROM jsonb_each_text(ir.micro_levels) kv WHERE kv.value ~ '^[0-4]$')::numeric / 5
            END) AS mean_nonna_rate
       FROM study_sessions ss
       LEFT JOIN item_responses ir ON ir.session_id = ss.session_id
      WHERE ss.study_id = $1
        AND ($2 OR ss.is_synthetic = FALSE)
      GROUP BY ss.arm`,
    [study.study_id, includeSynthetic],
  )
  const byArm = {}
  for (const row of r?.rows || []) {
    byArm[row.arm] = {
      sessions: row.sessions,
      turns: row.turns,
      meanNonNaRate: row.mean_nonna_rate === null ? null : Number(row.mean_nonna_rate),
    }
  }
  return byArm
}
