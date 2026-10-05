// P10.9 — go/no-go checklist (pure). Combines release readiness with the
// HA-C human gate statuses. Every human item defaults to OPEN; an OPEN gate,
// a NOT_READY or UNVERIFIED required check, or a missing flag yields NO_GO.
// A pending approval is never a passing test.
import { RELEASE_CONFIG, stageConfig } from './config.js'
import { ApiError } from '../http/errors.js'

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

// Scope decisions are read-only operator diagnostics, not flag activation or
// replacements for the stage readiness/allocation gate. Deferred components
// do not block a smaller scope; their applicable approvals are not waived.
export const RELEASE_SCOPES = Object.freeze({
  PERSONAL_NAVIGATION: Object.freeze(['PERSONAL_HOME_HISTORY']),
  DEVELOPMENTAL_PILOT: Object.freeze(['PERSONAL_HOME_HISTORY', 'PLAYER_EVIDENCE_REPORT', 'REVIEWED_PRACTICE']),
  PAID_PILOT: Object.freeze(['PERSONAL_HOME_HISTORY', 'PLAYER_EVIDENCE_REPORT', 'REVIEWED_PRACTICE', 'APPROVED_PAID_PACKAGES']),
  FULL_RELEASE: RELEASE_CONFIG.activationOrder,
})

const COMMON_SAFETY = RELEASE_PROHIBITIONS.slice(0, 4)
const COMPONENT_REQUIREMENTS = {
  PERSONAL_HOME_HISTORY: {
    flags: ['PRISM_APP_SHELL_V3'], checks: ['SCOPED_HISTORY'],
    owners: ['ENGINEERING', 'SECURITY_PRIVACY', 'OPERATIONS'], gates: ['HA-C001', 'HA-C005', 'HA-C007', 'HA-C012', 'HA-C013'],
  },
  PLAYER_EVIDENCE_REPORT: {
    flags: ['PRISM_ASSESSMENT_WORKSPACE_V3', 'PRISM_STUDENT_REPORT_V3', 'PRISM_EVIDENCE_FAIL_CLOSED'],
    checks: ['COMPATIBLE_PLAYER', 'DURABLE_WRITER', 'EVALUATOR', 'PUBLICATION', 'APPROVED_CONTENT', 'WORKER_REACHABILITY'],
    owners: ['ENGINEERING', 'CONTENT', 'MEASUREMENT', 'SECURITY_PRIVACY', 'PRODUCT_FINANCE', 'OPERATIONS'],
    gates: ['HA-C002', 'HA-C003'], prohibitions: ['NO_APPROVED_RECOVERY_POLICY'],
  },
  REVIEWED_PRACTICE: {
    flags: ['PRISM_DEVELOPMENT_V2'], checks: ['APPROVED_PRACTICE_CONTENT'],
    owners: ['ENGINEERING', 'CONTENT', 'MEASUREMENT', 'PRODUCT_FINANCE', 'OPERATIONS'],
    gates: ['HA-C009'], prohibitions: ['ADVERTISED_PRACTICE_UNAVAILABLE'],
  },
  PRIVATE_PREPARATION: {
    flags: ['PRISM_PREPARATION_V1'], checks: ['PRIVACY_ERASURE_APPROVAL', 'APPROVED_PREPARATION_CONTENT'],
    owners: ['ENGINEERING', 'CONTENT', 'SECURITY_PRIVACY', 'OPERATIONS'], gates: ['HA-C005'],
  },
  APPROVED_PAID_PACKAGES: {
    flags: [], checks: ['PAID_OFFER_READY'],
    owners: ['ENGINEERING', 'CONTENT', 'MEASUREMENT', 'SECURITY_PRIVACY', 'PRODUCT_FINANCE', 'OPERATIONS'],
    gates: ['HA-C006'], prohibitions: ['NO_APPROVED_RECOVERY_POLICY'],
  },
  CAMPUS: {
    flags: ['PRISM_CAMPUS_ENABLED'], checks: ['CAMPUS_PRIVACY_ERASURE_APPROVAL'],
    owners: ['ENGINEERING', 'CONTENT', 'MEASUREMENT', 'SECURITY_PRIVACY', 'OPERATIONS'],
    gates: ['HA-C005', 'HA-C010'],
  },
  GROWTH: {
    flags: ['PRISM_GROWTH_ENABLED'], checks: ['APPROVED_FORM_COMPARABILITY'],
    owners: ['ENGINEERING', 'MEASUREMENT', 'SECURITY_PRIVACY', 'OPERATIONS'], gates: ['HA-C004', 'HA-C008'],
  },
}

export function scopedReleaseDecisions({
  scope = 'DEVELOPMENTAL_PILOT', env = {}, readiness = null, componentChecks = {},
  humanGates = {}, independentSignoffs = {}, releaseProhibitions = {},
} = {}) {
  if (!Object.hasOwn(RELEASE_SCOPES, scope)) throw new ApiError('VALIDATION_FAILED', 'Unknown release scope.')
  const selected = new Set(RELEASE_SCOPES[scope])
  const activeDeferredFlags = Object.entries(COMPONENT_REQUIREMENTS)
    .filter(([id]) => !selected.has(id))
    .flatMap(([, requirements]) => requirements.flags)
    .filter((flag) => env[flag] === 'true')
  if (env.PRISM_ROLE_EXPLORATION_V2 === 'true') activeDeferredFlags.push('PRISM_ROLE_EXPLORATION_V2')
  if (!selected.has('CAMPUS') && env.PRISM_CAMPUS_ANALYTICS === 'true') activeDeferredFlags.push('PRISM_CAMPUS_ANALYTICS')
  const reasons = activeDeferredFlags.map((flag) => `OUT_OF_SCOPE_FLAG_ON:${flag}`)
  const components = RELEASE_CONFIG.activationOrder.map((id) => {
    const requirements = COMPONENT_REQUIREMENTS[id]
    if (!selected.has(id)) return { id, status: 'DEFERRED', reasons: [], ownerRoles: [...requirements.owners] }
    const blockers = []
    for (const flag of requirements.flags) if (env[flag] !== 'true') blockers.push(`FLAG_OFF:${flag}`)
    for (const check of requirements.checks) {
      let state = readiness?.checks?.[check]?.state
        || (componentChecks[check] === true ? 'READY' : componentChecks[check] === false ? 'NOT_READY' : 'UNVERIFIED')
      if (check === 'APPROVED_CONTENT' && state === 'READY') {
        const contentState = readiness?.checks?.[check]?.detail?.contentState
        if (!['APPROVED_FOR_PILOT', 'APPROVED_FOR_INTENDED_USE'].includes(contentState)) state = contentState ? 'NOT_READY' : 'UNVERIFIED'
      }
      if (state !== 'READY') blockers.push(`${state}:${check}`)
    }
    for (const owner of requirements.owners) {
      if (independentSignoffs[owner] !== 'APPROVED') blockers.push(`INDEPENDENT_SIGNOFF_OPEN:${owner}`)
    }
    for (const gate of requirements.gates) {
      if (humanGates[gate] !== 'APPROVED') blockers.push(`HUMAN_GATE_OPEN:${gate}`)
    }
    for (const prohibition of [...COMMON_SAFETY, ...(requirements.prohibitions || [])]) {
      if (releaseProhibitions[prohibition] !== 'CLEAR') blockers.push(`RELEASE_PROHIBITION_${releaseProhibitions[prohibition] === 'PRESENT' ? 'PRESENT' : 'UNVERIFIED'}:${prohibition}`)
    }
    reasons.push(...blockers)
    return { id, status: blockers.length ? 'NO_GO' : 'GO', reasons: blockers, ownerRoles: [...requirements.owners] }
  })
  return {
    scope, verdict: reasons.length ? 'NO_GO' : 'GO', reasons: [...new Set(reasons)], components,
    activationAuthorized: false,
    scopeBoundary: scope === 'DEVELOPMENTAL_PILOT' || scope === 'PERSONAL_NAVIGATION'
      ? 'No paid offers, formal longitudinal growth, employment prediction, Campus or preparation activation in this scope.'
      : 'Every selected feature retains its own content, claims, privacy and operational approvals.',
  }
}
