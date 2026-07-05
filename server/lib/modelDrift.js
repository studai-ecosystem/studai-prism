// Stage 6.1 — model-drift watch.
//
// The judge deployment that scored everything to date is pinned in
// server/scoring/judge-fingerprint.json. When the LIVE deployment differs,
// the system flags drift: a changed judge model must shadow re-score the
// anchor set + pass conformal recalibration BEFORE it scores any certified
// credential.
//
// Enforcement today (pre-calibration era, anchorRunId=null): drift is
// SURFACED loudly (boot warning, audit event, pilot dashboard, weekly
// report) — scoring continues because no frozen calibration exists yet to
// protect. The moment calibration-run v1 freezes, flip PRISM_DRIFT_HARD=true
// and drift BLOCKS credential issuance until re-anchoring (the hard CI/
// runtime gate the master prompt requires). This escalation rule is part of
// the fingerprint file itself so it cannot be lost.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import logger from './logger.js'
import { auditLog } from './telemetry.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FINGERPRINT_PATH = join(__dirname, '..', 'scoring', 'judge-fingerprint.json')

let _fingerprint = null
export function judgeFingerprint() {
  if (!_fingerprint) {
    _fingerprint = JSON.parse(readFileSync(FINGERPRINT_PATH, 'utf8'))
  }
  return _fingerprint
}

export function isDriftHardGate() {
  return process.env.PRISM_DRIFT_HARD === 'true'
}

export function modelDriftStatus() {
  const fp = judgeFingerprint()
  const liveDeployment = process.env.AZURE_OPENAI_DEPLOYMENT || null
  const drifted = Boolean(liveDeployment && liveDeployment !== fp.deployment)
  return {
    status: drifted ? (isDriftHardGate() ? 'DRIFT_BLOCKING' : 'DRIFT_DETECTED') : 'anchored',
    anchoredDeployment: fp.deployment,
    liveDeployment,
    anchorRunId: fp.anchorRunId,
    anchoredAt: fp.anchoredAt,
    hardGate: isDriftHardGate(),
    rule: fp.escalationRule,
  }
}

// Boot-time check: log drift loudly; block nothing unless the hard gate is on.
export function checkModelDriftAtBoot() {
  const s = modelDriftStatus()
  if (s.status !== 'anchored') {
    logger.captureException(new Error('judge model drift detected'), {
      msg: 'model_drift', anchored: s.anchoredDeployment, live: s.liveDeployment, hardGate: s.hardGate,
    })
    auditLog('model_drift_detected', null, { anchored: s.anchoredDeployment, live: s.liveDeployment, hardGate: s.hardGate })
  }
  return s
}

// Credential-issuance guard: under the hard gate, a drifted judge cannot mint
// certified artifacts until re-anchored (Stage 6.1's actual teeth).
export function assertJudgeAnchoredForIssuance() {
  const s = modelDriftStatus()
  if (s.status === 'DRIFT_BLOCKING') {
    throw new Error(
      `credential issuance blocked: judge deployment '${s.liveDeployment}' is not the anchored '${s.anchoredDeployment}' — run the anchor re-score + conformal recalibration, update judge-fingerprint.json, then reissue`,
    )
  }
}
