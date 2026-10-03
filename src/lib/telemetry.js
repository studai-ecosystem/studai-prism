// track(event, props) — product telemetry (spec §46; C4.13). Only allow-listed
// events and props (ids, enums, counts, timestamps) ever leave the browser;
// the server applies the same allow-list again. Never pass transcript text,
// answers, names, emails, report narrative, URLs or tokens.
import { sendProductEvent } from '../api/telemetry.js'

export const TRACKED_EVENTS = Object.freeze([
  'invite_received', 'membership_accepted', 'briefing_opened', 'assessment_started', 'assessment_resumed',
  'assessment_completed', 'report_viewed', 'mission_started', 'mission_completed', 'reassessment_started', 'reassessment_completed',
  'org_created', 'students_imported', 'program_created', 'assignment_created', 'assignment_launched',
  'cohort_report_viewed', 'intervention_created', 'reassessment_created', 'renewal_intent_recorded',
  'preview_started', 'preview_completed', 'preview_claimed', 'offer_viewed', 'checkout_started', 'purchase_completed', 'purchase_failed',
  'recommendation_viewed', 'recommendation_followed', 'practice_started', 'practice_completed', 'practice_retried',
])

const ID = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,79}$/
const ENUM = /^[A-Z][A-Z0-9_]{0,39}$/
const isId = (v) => typeof v === 'string' && ID.test(v)
const RULES = {
  assignmentId: isId,
  sessionId: isId,
  definitionId: isId,
  missionId: isId,
  cohortId: isId,
  programId: isId,
  scope: (v) => v === 'PERSONAL' || v === 'SPONSORED',
  surface: (v) => typeof v === 'string' && ENUM.test(v),
  outcome: (v) => typeof v === 'string' && ENUM.test(v),
  productCode: (v) => typeof v === 'string' && ENUM.test(v),
  fundingSource: (v) => typeof v === 'string' && ENUM.test(v),
  purchaseKind: (v) => ['GENUINE', 'REFUND', 'INCENTIVE', 'COMPULSORY', 'TEST'].includes(v),
  accountClass: (v) => ['GENUINE', 'TEST', 'RESEARCH_PARTICIPANT', 'STAFF'].includes(v),
  workspaceClass: (v) => v === 'PERSONAL' || v === 'CAMPUS',
  mode: (v) => ['FORMAL', 'PRACTICE', 'PREPARATION', 'SELF_REPORT', 'PREVIEW'].includes(v),
  version: isId,
  count: (v) => Number.isInteger(v) && v >= 0 && v <= 100000,
}

export function allowedProps(props = {}) {
  const out = {}
  for (const [k, v] of Object.entries(props || {})) {
    if (Object.hasOwn(RULES, k) && RULES[k](v)) out[k] = v
  }
  return out
}

let sender = sendProductEvent
export function setTelemetrySender(fn) {
  sender = fn || sendProductEvent
}

export function track(event, props = {}) {
  if (!TRACKED_EVENTS.includes(event)) return false
  sender({ event, props: allowedProps(props), occurredAt: new Date().toISOString() })
  return true
}
