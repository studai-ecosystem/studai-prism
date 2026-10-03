// P10.9 — go/no-go checklist (pure). Combines release readiness with the
// HA-C human gate statuses. Every human item defaults to OPEN; an OPEN gate,
// a NOT_READY or UNVERIFIED required check, or a missing flag yields NO_GO.
// A pending approval is never a passing test.
import { RELEASE_CONFIG, stageConfig } from './config.js'

export const HUMAN_GATES = Object.freeze([
  'HA-C001', 'HA-C002', 'HA-C003', 'HA-C004', 'HA-C005', 'HA-C006', 'HA-C007',
  'HA-C008', 'HA-C009', 'HA-C010', 'HA-C011', 'HA-C012', 'HA-C013',
])
export const GATE_STATES = Object.freeze(['OPEN', 'APPROVED', 'NOT_APPLICABLE'])
export const VERDICTS = Object.freeze(['GO', 'NO_GO'])
export const INDEPENDENT_SIGNOFF_GATES = Object.freeze([
  'ENGINEERING',
  'CONTENT',
  'MEASUREMENT',
  'SECURITY_PRIVACY',
  'PRODUCT_FINANCE',
  'OPERATIONS',
])
export const RELEASE_PROHIBITIONS = Object.freeze([
  'ACKNOWLEDGED_WORK_LOSS',
  'CROSS_USER_EXPOSURE',
  'FABRICATED_EVIDENCE',
  'REPEATED_TECHNICAL_ZERO_RESULT',
  'NO_APPROVED_RECOVERY_POLICY',
  'ADVERTISED_PRACTICE_UNAVAILABLE',
])
export const CHECKLIST_STATES = Object.freeze(['PASS', 'BLOCKED', 'UNVERIFIED'])

// Checklist areas from P10.9; each maps to the readiness checks and human
// gates that evidence it. Areas without automated coverage stay human-owned.
export const CHECKLIST = Object.freeze([
  { id: 'CUSTOMER_VALUE', checks: [], gates: ['HA-C005'] },
  { id: 'ASSESSMENT', checks: ['COMPATIBLE_PLAYER', 'DURABLE_WRITER'], gates: ['HA-C003'] },
  { id: 'RESULTS', checks: ['EVALUATOR', 'PUBLICATION', 'APPROVED_CONTENT'], gates: ['HA-C002'] },
  { id: 'DEVELOPMENT', checks: [], gates: ['HA-C009'] },
  { id: 'SAFETY', checks: ['WORKER_REACHABILITY'], gates: ['HA-C010', 'HA-C012'] },
  { id: 'VERIFICATION', checks: [], gates: ['HA-C008', 'HA-C013'] },
  { id: 'ACTIVATION', checks: [], gates: ['HA-C001', 'HA-C007'] },
])

export function defaultHumanGates() {
  return Object.fromEntries(HUMAN_GATES.map((id) => [id, 'OPEN']))
}

export function defaultIndependentSignoffs() {
  return Object.fromEntries(INDEPENDENT_SIGNOFF_GATES.map((id) => [id, 'OPEN']))
}

export function defaultReleaseProhibitions() {
  return Object.fromEntries(RELEASE_PROHIBITIONS.map((id) => [id, 'UNVERIFIED']))
}

/**
 * goNoGo({ readiness, humanGates, stage }) → { verdict, reasons, areas }.
 * `readiness` is the output of release/config.js readiness(); `humanGates`
 * maps HA-C ids to OPEN | APPROVED | NOT_APPLICABLE (missing → OPEN).
 */
export function goNoGo({ readiness, humanGates = {}, independentSignoffs = {}, releaseProhibitions = {}, stage = readiness?.stage || 'LOCAL_CI' } = {}) {
  const cfg = stageConfig(stage) || stageConfig('LOCAL_CI')
  const gates = { ...defaultHumanGates(), ...Object.fromEntries(Object.entries(humanGates).filter(([k, v]) => HUMAN_GATES.includes(k) && GATE_STATES.includes(v))) }
  const signoffs = { ...defaultIndependentSignoffs(), ...Object.fromEntries(Object.entries(independentSignoffs).filter(([k, v]) => INDEPENDENT_SIGNOFF_GATES.includes(k) && GATE_STATES.includes(v))) }
  const prohibitions = {
    ...defaultReleaseProhibitions(),
    ...Object.fromEntries(Object.entries(releaseProhibitions).filter(([key, value]) => RELEASE_PROHIBITIONS.includes(key) && ['CLEAR', 'PRESENT', 'UNVERIFIED'].includes(value))),
  }
  const reasons = []
  if (!readiness || typeof readiness !== 'object') reasons.push('READINESS_UNVERIFIED')
  else {
    for (const key of readiness.flags?.missing || []) reasons.push(`FLAG_OFF:${key}`)
    for (const check of readiness.requiredChecks || []) {
      const state = readiness.checks?.[check]?.state
      if (state !== 'READY') reasons.push(`${state || 'UNVERIFIED'}:${check}`)
    }
  }
  for (const id of cfg.humanGates) if (gates[id] === 'OPEN') reasons.push(`HUMAN_GATE_OPEN:${id}`)
  if (cfg.stage !== 'LOCAL_CI') {
    for (const id of INDEPENDENT_SIGNOFF_GATES) if (signoffs[id] === 'OPEN') reasons.push(`INDEPENDENT_SIGNOFF_OPEN:${id}`)
    for (const id of RELEASE_PROHIBITIONS) if (prohibitions[id] !== 'CLEAR') reasons.push(`RELEASE_PROHIBITION_${prohibitions[id]}:${id}`)
  }
  const areas = CHECKLIST.map((area) => {
    const openGates = area.gates.filter((id) => cfg.humanGates.includes(id) && gates[id] === 'OPEN')
    const failing = area.checks.filter((c) => (readiness?.requiredChecks || []).includes(c) && readiness?.checks?.[c]?.state !== 'READY')
    const unverified = failing.some((check) => readiness?.checks?.[check]?.state !== 'NOT_READY')
    return {
      id: area.id,
      status: openGates.length ? 'BLOCKED' : failing.length ? (unverified ? 'UNVERIFIED' : 'BLOCKED') : 'PASS',
      openGates,
      failingChecks: failing,
    }
  })
  return {
    configVersion: RELEASE_CONFIG.version,
    stage: cfg.stage,
    verdict: reasons.length ? 'NO_GO' : 'GO',
    reasons,
    humanGates: gates,
    independentSignoffs: signoffs,
    releaseProhibitions: prohibitions,
    areas,
  }
}
