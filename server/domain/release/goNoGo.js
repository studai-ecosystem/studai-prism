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

/**
 * goNoGo({ readiness, humanGates, stage }) → { verdict, reasons, areas }.
 * `readiness` is the output of release/config.js readiness(); `humanGates`
 * maps HA-C ids to OPEN | APPROVED | NOT_APPLICABLE (missing → OPEN).
 */
export function goNoGo({ readiness, humanGates = {}, stage = readiness?.stage || 'LOCAL' } = {}) {
  const cfg = stageConfig(stage) || stageConfig('LOCAL')
  const gates = { ...defaultHumanGates(), ...Object.fromEntries(Object.entries(humanGates).filter(([k, v]) => HUMAN_GATES.includes(k) && GATE_STATES.includes(v))) }
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
  const areas = CHECKLIST.map((area) => {
    const openGates = area.gates.filter((id) => cfg.humanGates.includes(id) && gates[id] === 'OPEN')
    const failing = area.checks.filter((c) => (readiness?.requiredChecks || []).includes(c) && readiness?.checks?.[c]?.state !== 'READY')
    return { id: area.id, status: openGates.length || failing.length ? 'OPEN' : 'CLEAR', openGates, failingChecks: failing }
  })
  return {
    configVersion: RELEASE_CONFIG.version,
    stage: cfg.stage,
    verdict: reasons.length ? 'NO_GO' : 'GO',
    reasons,
    humanGates: gates,
    areas,
  }
}
