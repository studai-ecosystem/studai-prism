// Phase 3 Stage 3 — THE STUDY→FLAG→CLAIM MAP, as executable law.
//
// "A flag flips to default-on, and a claim ships to a public surface, ONLY
// when the study registry contains the immutable result that backs it. If a
// proposed flip is not on this map, STOP and escalate to a human."
//
// The verifier below is the agent's half of a flip: it checks preconditions
// against the LIVE registry and returns GO / NO-GO with citations. It never
// executes a flip — humans flip; this refuses to bless what the registry
// cannot back.

import { query, isDbConfigured } from '../db/pool.js'

// Latest non-superseded result for a study, or null.
async function latestResult(studyKey, metricName = null) {
  const r = await query(
    `SELECT r.metric_name, r.value, r.detail, r.n, r.analysis_version, r.computed_at
       FROM study_results r JOIN studies s ON s.study_id = r.study_id
      WHERE s.study_key = $1 AND r.superseded_by IS NULL
        ${metricName ? 'AND r.metric_name = $2' : ''}
      ORDER BY r.computed_at DESC LIMIT 1`,
    metricName ? [studyKey, metricName] : [studyKey],
  ).catch(() => null)
  return r?.rows?.[0] || null
}

async function frozenCalibration(runType) {
  const r = await query(
    'SELECT run_id FROM calibration_runs WHERE run_type = $1 AND frozen = TRUE ORDER BY created_at DESC LIMIT 1',
    [runType],
  ).catch(() => null)
  return r?.rows?.[0]?.run_id || null
}

// The map. Each precondition returns { met, evidence } from the live DB.
export const FLAG_MAP = {
  PRISM_V2_EXECUTIVE: {
    claimCeiling: 'Adaptive conversation steering, validated to increase skill-evidence density in our published study',
    trackGate: 'Phase 1 / S1 protocol (docs/studies/STEERING_AB_PROTOCOL.md)',
    preconditions: [
      {
        name: 'S1 result positive (steering_ab in registry, immutable)',
        check: async () => {
          const res = await latestResult('steering_ab')
          const positive = res?.detail?.conclusion === 'positive'
          return { met: Boolean(res && positive), evidence: res ? `latest: ${res.metric_name} (${res.analysis_version}, n=${res.n}) conclusion=${res.detail?.conclusion ?? 'not stated'}` : 'no steering_ab result in registry' }
        },
      },
    ],
  },
  PRISM_V2_DUAL_SCORER: {
    claimCeiling: 'AI evaluation with human-expert-level agreement (κ=X.XX, N=YYY, see Technical Manual)',
    trackGate: 'Phase 2 / S2 protocol (docs/studies/HUMAN_LLM_AGREEMENT_PROTOCOL.md)',
    preconditions: [
      {
        name: 'S2 κ_HL ≥ κ_HH − 0.05 on every dimension',
        check: async () => {
          const res = await latestResult('human_llm_agreement')
          const ok = res?.detail?.non_inferior_all_dimensions === true
          return { met: Boolean(ok), evidence: res ? `latest: ${res.metric_name} n=${res.n} non_inferior_all_dimensions=${res.detail?.non_inferior_all_dimensions}` : 'no human_llm_agreement result in registry' }
        },
      },
      {
        name: 'calibration-run v1 frozen',
        check: async () => {
          const runId = await frozenCalibration('irt')
          return { met: Boolean(runId), evidence: runId ? `frozen irt run ${runId}` : 'no frozen IRT calibration run' }
        },
      },
    ],
  },
  CONFORMAL_CI: {
    claimCeiling: 'Score ± calibrated confidence interval (90% coverage, validated)',
    trackGate: 'Phase 2 conformal (Stage 2.4)',
    preconditions: [
      {
        name: 'conformal coverage validated at 90% on held-out pairs',
        check: async () => {
          const runId = await frozenCalibration('conformal')
          return { met: Boolean(runId), evidence: runId ? `frozen conformal run ${runId}` : 'no frozen conformal run — ±6 provisional fallback stays' }
        },
      },
    ],
  },
  CERTIFIED_LANGUAGE: {
    claimCeiling: '"Certified" restored to public copy',
    trackGate: 'Stage 3 map row: dual scorer live + calibration v1 + external review complete',
    preconditions: [
      { name: 'PRISM_V2_DUAL_SCORER preconditions met', check: async () => checkFlag('PRISM_V2_DUAL_SCORER').then((r) => ({ met: r.verdict === 'GO', evidence: `dual-scorer verdict: ${r.verdict}` })) },
      {
        name: 'external psychometrician review recorded in registry',
        check: async () => {
          const res = await latestResult('human_llm_agreement', 'external_review_complete')
          return { met: Boolean(res), evidence: res ? `review recorded ${res.computed_at}` : 'no external_review_complete result row' }
        },
      },
    ],
  },
  PRISM_VELOCITY: {
    claimCeiling: 'Growth measurement — trajectory claims only per Track 1 N/threshold rules',
    trackGate: 'Track 1 gates (server/psychometrics/GROWTH.md)',
    preconditions: [
      {
        name: 'S3 test-retest reliability adequate (r ≥ 0.7 per dimension)',
        check: async () => {
          const res = await latestResult('test_retest')
          const ok = res?.detail?.all_dimensions_reliable === true
          return { met: Boolean(ok), evidence: res ? `latest: n=${res.n} all_dimensions_reliable=${res.detail?.all_dimensions_reliable}` : 'no test_retest result in registry' }
        },
      },
    ],
  },
  PRISM_PRESSURE: {
    claimCeiling: 'Published adversarial robustness: current evasion rate X% (open benchmark)',
    trackGate: 'Track 3 gates / S4 protocol (docs/studies/ADVERSARIAL_PROTOCOL.md)',
    preconditions: [
      {
        name: 'S4 red-team study run, evasion rate computed',
        check: async () => {
          const res = await latestResult('adversarial_evasion')
          return { met: Boolean(res), evidence: res ? `evasion result n=${res.n} (${res.analysis_version})` : 'no adversarial_evasion result in registry' }
        },
      },
    ],
  },
  PRISM_LANG: {
    claimCeiling: 'Fairness-tested across [languages] — per language, never blanket',
    trackGate: 'Track 4 gates / S6 protocol (docs/studies/MULTILINGUAL_DIF_PROTOCOL.md)',
    preconditions: [
      {
        name: 'S6 DIF clean (or mitigated) per language, adequately powered',
        check: async () => {
          const res = await latestResult('multilingual_dif')
          const ok = res?.detail?.adequately_powered === true
          return { met: Boolean(ok), evidence: res ? `latest: n=${res.n} adequately_powered=${res.detail?.adequately_powered}` : 'no multilingual_dif result in registry' }
        },
      },
    ],
  },
  PRISM_REPLAY: {
    claimCeiling: '"Learn from your assessment" — formative claims only, no measurement claims',
    trackGate: 'Track 5.1 gates',
    preconditions: [
      {
        name: 'glass-box live + practice-ledger isolation re-verified in prod',
        check: async () => {
          const glassBox = process.env.PRISM_GLASS_BOX === 'true' && Boolean(process.env.PRISM_CREDENTIAL_SIGNING_KEY)
          const reverified = await latestResult('steering_ab', 'replay_isolation_reverified') // recorded by the human-run reverification
          return { met: glassBox && Boolean(reverified), evidence: `glassBox=${glassBox}; prod isolation re-verification ${reverified ? 'recorded' : 'NOT recorded in registry'}` }
        },
      },
    ],
  },
  PRISM_TEAMFIT: {
    claimCeiling: 'Qualitative observations only — the no-numeric-fit-score rule is permanent',
    trackGate: 'Track 5.2 gates',
    preconditions: [
      { name: 'PRISM_REPLAY preconditions met (replay live first)', check: async () => checkFlag('PRISM_REPLAY').then((r) => ({ met: r.verdict === 'GO', evidence: `replay verdict: ${r.verdict}` })) },
    ],
  },
}

// Verify one flag. Refusal semantics: unknown flag → escalate (it is not on
// the map); any unmet precondition → NO-GO with the citation.
export async function checkFlag(flag) {
  const entry = FLAG_MAP[flag]
  if (!entry) {
    return {
      flag,
      verdict: 'ESCALATE',
      reason: 'This flip is NOT on the study→flag→claim map. Per THE ONE LAW: stop and escalate to a human — no exceptions, including "the founder asked."',
    }
  }
  if (!isDbConfigured()) {
    return { flag, verdict: 'NO-GO', reason: 'no database — registry preconditions cannot be verified', claimCeiling: entry.claimCeiling }
  }
  const results = []
  for (const pre of entry.preconditions) {
    try {
      const r = await pre.check()
      results.push({ name: pre.name, ...r })
    } catch (err) {
      results.push({ name: pre.name, met: false, evidence: `check errored: ${err.message}` })
    }
  }
  const go = results.every((r) => r.met)
  return {
    flag,
    verdict: go ? 'GO' : 'NO-GO',
    claimCeiling: entry.claimCeiling,
    trackGate: entry.trackGate,
    preconditions: results,
    rollback: go
      ? `Rollback plan: remove the app setting ${flag}, restart, verify the surface returns 404/prior behavior, monitor 72h against pilot-era baselines.`
      : undefined,
    note: 'This verifier blesses or refuses. The flip itself is a human action.',
  }
}
