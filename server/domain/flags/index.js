// Campus flags (spec §49). Registered in lib/flagRegistry.js, default OFF.
// ONE LAW: this module only READS process.env — it never assigns.
import { ApiError } from '../http/errors.js'

export const CAMPUS_FLAGS = Object.freeze([
  'PRISM_APP_SHELL_V3',
  'PRISM_EVIDENCE_FAIL_CLOSED',
  'PRISM_STUDENT_REPORT_V3',
  'PRISM_ASSESSMENT_WORKSPACE_V3',
  'PRISM_CAMPUS_ENABLED',
  'PRISM_CAMPUS_ANALYTICS',
  'PRISM_DEVELOPMENT_V2',
  'PRISM_GROWTH_ENABLED',
  'PRISM_ROLE_EXPLORATION_V2',
])

export function isEnabled(key) {
  return process.env[key] === 'true'
}

// Allow-listed booleans the client may see (never other env state).
export function clientFlags() {
  return Object.fromEntries(CAMPUS_FLAGS.map((k) => [k, isEnabled(k)]))
}

// Dark routes: flag off → indistinguishable from a missing route.
export function requireFlag(key) {
  return function flagGate(_req, _res, next) {
    return isEnabled(key) ? next() : next(new ApiError('NOT_FOUND', 'Not found'))
  }
}
