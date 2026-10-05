// P4.8 — content version governance (server-side, minimal). States and the
// transition guard for assessment forms. Nothing publishes by default: every
// authored form starts DRAFT and only a reviewer with a reason can move it.
// A pilot approval is not broad validation; APPROVED_FOR_INTENDED_USE needs
// a separate decision. Published content is immutable: a revision is a new
// version id, never an edit.
import { ApiError } from '../http/errors.js'
import { CORE_TEAMREADY_A, CORE_TEAMREADY_A_V1 } from '../assessments/universalForm.js'
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
  ...[CORE_TEAMREADY_A_V1, CORE_TEAMREADY_A].map((form) => ({ formId: form.formId, contentId: form.id, blueprintId: form.blueprintId, version: form.version, title: form.title, kind: 'UNIVERSAL_FORM', approvalHistory: form.approvalHistory, opportunities: form.opportunities.length, stages: form.stages.length, pkg: form })),
  { formId: `${DRAFT_CORE_TEAMREADY_A_HANDOVER.id}:${DRAFT_CORE_TEAMREADY_A_HANDOVER.version}`, contentId: DRAFT_CORE_TEAMREADY_A_HANDOVER.id, blueprintId: 'CORE-TEAMREADY-A', version: DRAFT_CORE_TEAMREADY_A_HANDOVER.version, title: DRAFT_CORE_TEAMREADY_A_HANDOVER.title, kind: 'SEGMENT', approvalHistory: [{ state: 'DRAFT', at: null, by: null, reason: 'Initial original draft segment.' }], opportunities: DRAFT_CORE_TEAMREADY_A_HANDOVER.opportunities.length, stages: 1, pkg: DRAFT_CORE_TEAMREADY_A_HANDOVER },
]

// Roles whose APPROVE decisions gate APPROVED_FOR_PILOT (P4.8): one content
// reviewer and one measurement reviewer, recorded as separate decisions by
// distinct reviewers. Each role is held through an existing admin permission.
export const REVIEWER_ROLES = Object.freeze({
  CONTENT: ['content:publish', '*'],
  MEASUREMENT: ['scenarios:manage', 'validation:manage', '*'],
  ACCESSIBILITY: ['accommodations:manage', '*'],
})
export const REVIEW_DECISIONS = Object.freeze(['APPROVE', 'REQUEST_CHANGES', 'REJECT'])
export function reviewerRoleAllowed(role, actor) {
  const perms = actor?.permissions instanceof Set ? actor.permissions : new Set(actor?.permissions || [])
  return Array.isArray(REVIEWER_ROLES[role]) && REVIEWER_ROLES[role].some((p) => perms.has(p))
}
// The pilot gate over recorded decisions: ≥1 APPROVE from CONTENT and ≥1
// from MEASUREMENT, by different reviewers, and no later REJECT /
// REQUEST_CHANGES from either role outstanding. Pure.
export function pilotApprovalGate(decisions = []) {
  const latestBy = new Map()
  for (const d of [...decisions].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) latestBy.set(`${d.reviewerRole}:${d.reviewerId || d.createdBy}`, d)
  const approvals = [...latestBy.values()].filter((d) => d.decision === 'APPROVE')
  const blocking = [...latestBy.values()].filter((d) => d.decision !== 'APPROVE')
  const content = approvals.filter((d) => d.reviewerRole === 'CONTENT')
  const measurement = approvals.filter((d) => d.reviewerRole === 'MEASUREMENT')
  const distinct = content.some((c) => measurement.some((m) => (m.reviewerId || m.createdBy) !== (c.reviewerId || c.createdBy)))
  const missing = []
  if (!content.length) missing.push('CONTENT_APPROVAL')
  if (!measurement.length) missing.push('MEASUREMENT_APPROVAL')
  if (content.length && measurement.length && !distinct) missing.push('DISTINCT_REVIEWERS')
  for (const b of blocking) missing.push(`${b.reviewerRole}_${b.decision}_OUTSTANDING`)
  return { ok: missing.length === 0, contentApprovals: content.length, measurementApprovals: measurement.length, missing }
}

// In-process registry of transitions. Module content never changes; the
// durable record of a decision is the admin audit event the route writes.
// New draft versions (P4.8 draft edit) are appended as NEW form ids; an
// existing version's package is never mutated.
export function createContentRegistry({ clock = () => new Date(), authored = AUTHORED } = {}) {
  const entries = authored.map((a) => ({ ...a, approvalHistory: [...a.approvalHistory] }))
  const history = new Map(entries.map((a) => [a.formId, a.approvalHistory]))
  const stateOf = (formId) => { const h = history.get(formId) || []; return h.length ? h[h.length - 1].state : 'DRAFT' }
  const view = (a) => ({ formId: a.formId, contentId: a.contentId, blueprintId: a.blueprintId, version: a.version, title: a.title, kind: a.kind, state: stateOf(a.formId), opportunities: a.opportunities, stages: a.stages })
  const findVersion = (contentId, version) => entries.find((a) => a.contentId === contentId && a.version === version) || null
  return {
    listForms() { return entries.map(view) },
    listVersions(contentId) {
      const rows = entries.filter((a) => a.contentId === contentId)
      if (!rows.length) throw new ApiError('NOT_FOUND', 'Not found')
      return rows.map((a) => ({ formId: a.formId, version: a.version, state: stateOf(a.formId), approvalHistory: history.get(a.formId), createdBy: a.createdBy || null, createdAt: a.createdAt || null, derivedFrom: a.derivedFrom || null }))
    },
    getVersion(contentId, version) {
      const a = findVersion(contentId, version)
      if (!a) throw new ApiError('NOT_FOUND', 'Not found')
      return { ...view(a), approvalHistory: history.get(a.formId), package: a.pkg, derivedFrom: a.derivedFrom || null }
    },
    hasVersion: (contentId, version) => Boolean(findVersion(contentId, version)),
    stateOf,
    transition({ formId, to, actor, reason, decisions = null }) {
      if (!history.has(formId)) throw new ApiError('NOT_FOUND', 'Not found')
      const before = stateOf(formId)
      if (to === 'APPROVED_FOR_PILOT') {
        const gate = pilotApprovalGate(decisions || [])
        if (!gate.ok) throw new ApiError('CONFLICT', `Pilot approval needs recorded APPROVE decisions from a content reviewer and a measurement reviewer (missing: ${gate.missing.join(', ')}).`, { details: gate })
      }
      const entry = guardTransition({ from: before, to, actor, reason, at: clock() })
      history.get(formId).push(entry)
      return { formId, before, state: entry.state, approvalHistory: history.get(formId) }
    },
    // Append a NEW draft version. The source version is untouched.
    addDraftVersion({ contentId, version, pkg, actor, derivedFrom = null, at = clock(), approvalHistory = null }) {
      if (findVersion(contentId, version)) throw new ApiError('CONFLICT', `Version ${version} of ${contentId} already exists; published and draft versions are immutable.`)
      const base = entries.find((a) => a.contentId === contentId) || null
      const entry = {
        formId: `${contentId}:${version}`, contentId, blueprintId: pkg.blueprintId || base?.blueprintId || null, version, title: pkg.title, kind: base?.kind || 'UNIVERSAL_FORM',
        approvalHistory: approvalHistory || [{ state: 'DRAFT', at: at.toISOString(), by: actor?.id || actor?.email || null, reason: `New draft version derived from ${derivedFrom || 'scratch'}; not self-approved.` }],
        opportunities: (pkg.opportunities || []).length, stages: (pkg.stages || []).length, pkg, derivedFrom, createdBy: actor?.id || null, createdAt: at.toISOString(),
      }
      entries.push(entry)
      history.set(entry.formId, entry.approvalHistory)
      return { ...view(entry), approvalHistory: entry.approvalHistory, derivedFrom }
    },
  }
}

export const contentRegistry = createContentRegistry()
