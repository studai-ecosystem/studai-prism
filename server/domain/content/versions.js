// P4.8 — content version governance (server-side, minimal). States and the
// transition guard for assessment forms. Nothing publishes by default: every
// authored form starts DRAFT and only a reviewer with a reason can move it.
// A pilot approval is not broad validation; APPROVED_FOR_INTENDED_USE needs
// a separate decision. Published content is immutable: a revision is a new
// version id, never an edit.
import { ApiError } from '../http/errors.js'
import { CORE_TEAMREADY_A } from '../assessments/universalForm.js'
import { DRAFT_CORE_TEAMREADY_A_HANDOVER } from '../assessments/draftSegments.js'

export const CONTENT_STATES = Object.freeze(['DRAFT', 'REVIEW', 'APPROVED_FOR_PILOT', 'APPROVED_FOR_INTENDED_USE', 'RETIRED'])
const TRANSITIONS = Object.freeze({
  DRAFT: ['REVIEW', 'RETIRED'],
  REVIEW: ['DRAFT', 'APPROVED_FOR_PILOT', 'RETIRED'],
  APPROVED_FOR_PILOT: ['REVIEW', 'APPROVED_FOR_INTENDED_USE', 'RETIRED'],
  APPROVED_FOR_INTENDED_USE: ['RETIRED'],
  RETIRED: [],
})
// Who may move content: content reviewers / publishers. Permission keys of
// the existing admin RBAC catalogue; '*' is the super-admin wildcard.
export const REVIEWER_PERMISSIONS = Object.freeze(['content:publish', 'scenarios:manage', '*'])
export const CONTENT_READ_PERMISSIONS = Object.freeze(['content:read', 'scenarios:read', '*'])

export function canTransition(from, to) {
  return Array.isArray(TRANSITIONS[from]) && TRANSITIONS[from].includes(to)
}

/**
 * guardTransition({ from, to, actor: { permissions }, reason }) → the new
 * approvalHistory entry, or throws (FORBIDDEN / VALIDATION_FAILED).
 */
export function guardTransition({ from, to, actor, reason, at = new Date() }) {
  if (!CONTENT_STATES.includes(to)) throw new ApiError('VALIDATION_FAILED', 'Unknown content state.')
  if (!canTransition(from, to)) throw new ApiError('VALIDATION_FAILED', `Cannot move content from ${from} to ${to}.`)
  const perms = actor?.permissions instanceof Set ? actor.permissions : new Set(actor?.permissions || [])
  if (!REVIEWER_PERMISSIONS.some((p) => perms.has(p))) throw new ApiError('FORBIDDEN', 'A content reviewer role is required to change content state.')
  if (typeof reason !== 'string' || reason.trim().length < 10) throw new ApiError('VALIDATION_FAILED', 'A reason of at least 10 characters is required.')
  return { state: to, from, at: at.toISOString(), by: actor?.id || actor?.email || null, reason: reason.trim().slice(0, 1000) }
}

// Authored forms this build carries (immutable module content). The live
// state of a version is the last approvalHistory entry in the registry.
const AUTHORED = [
  { formId: CORE_TEAMREADY_A.formId, contentId: CORE_TEAMREADY_A.id, blueprintId: CORE_TEAMREADY_A.blueprintId, version: CORE_TEAMREADY_A.version, title: CORE_TEAMREADY_A.title, kind: 'UNIVERSAL_FORM', approvalHistory: CORE_TEAMREADY_A.approvalHistory, opportunities: CORE_TEAMREADY_A.opportunities.length, stages: CORE_TEAMREADY_A.stages.length },
  { formId: `${DRAFT_CORE_TEAMREADY_A_HANDOVER.id}:${DRAFT_CORE_TEAMREADY_A_HANDOVER.version}`, contentId: DRAFT_CORE_TEAMREADY_A_HANDOVER.id, blueprintId: 'CORE-TEAMREADY-A', version: DRAFT_CORE_TEAMREADY_A_HANDOVER.version, title: DRAFT_CORE_TEAMREADY_A_HANDOVER.title, kind: 'SEGMENT', approvalHistory: [{ state: 'DRAFT', at: null, by: null, reason: 'Initial original draft segment.' }], opportunities: DRAFT_CORE_TEAMREADY_A_HANDOVER.opportunities.length, stages: 1 },
]

// In-process registry of transitions. Module content never changes; the
// durable record of a decision is the admin audit event the route writes.
export function createContentRegistry({ clock = () => new Date(), authored = AUTHORED } = {}) {
  const history = new Map(authored.map((a) => [a.formId, [...a.approvalHistory]]))
  const stateOf = (formId) => { const h = history.get(formId) || []; return h.length ? h[h.length - 1].state : 'DRAFT' }
  return {
    listForms() {
      return authored.map((a) => ({ formId: a.formId, contentId: a.contentId, blueprintId: a.blueprintId, version: a.version, title: a.title, kind: a.kind, state: stateOf(a.formId), opportunities: a.opportunities, stages: a.stages }))
    },
    listVersions(contentId) {
      const rows = authored.filter((a) => a.contentId === contentId)
      if (!rows.length) throw new ApiError('NOT_FOUND', 'Not found')
      return rows.map((a) => ({ formId: a.formId, version: a.version, state: stateOf(a.formId), approvalHistory: history.get(a.formId) }))
    },
    stateOf,
    transition({ formId, to, actor, reason }) {
      if (!history.has(formId)) throw new ApiError('NOT_FOUND', 'Not found')
      const before = stateOf(formId)
      const entry = guardTransition({ from: before, to, actor, reason, at: clock() })
      history.get(formId).push(entry)
      return { formId, before, state: entry.state, approvalHistory: history.get(formId) }
    },
  }
}

export const contentRegistry = createContentRegistry()
