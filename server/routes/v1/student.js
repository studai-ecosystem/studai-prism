// /api/v1 student application (spec §9–§18; C4.03, C4.06, C4.10, C4.11).
// Every read is scoped to the active workspace (X-Prism-Workspace): PERSONAL
// sees personal data only, CAMPUS_STUDENT sees its organization's sponsored
// data only. Dark while PRISM_APP_SHELL_V3 is off.
//   GET  /me/home | /me/capabilities | /me/evidence | /me/assessments | /me/history | /me/development-plan | /me/growth
//   POST /me/role-exploration                    (PRISM_ROLE_EXPLORATION_V2)
//   GET  /assessment-assignments/:id             briefing read model
//   POST /assessment-assignments/:id/acknowledge sponsored disclosure (consent_records)
//   GET|PUT /me/preferences                      account accessibility preferences
//   GET  /me/share-grants, POST /me/share-grants/:id/revoke
import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../domain/http/asyncHandler.js'
import { ApiError, ok } from '../../domain/http/errors.js'
import { requireFlag } from '../../domain/flags/index.js'
import { DEFAULT_PREFERENCES, SEGMENTS, INTENTIONS, RESPONSE_MODES, DISPLAY_NAME_MAX, SUPPORT_DISCLOSURE } from '../../domain/preferences/repository.js'
import { studentScoped } from './studentScope.js'

const ASSIGNMENT_ID = /^(pa_[0-9a-f]{32}|[0-9a-f-]{36})$/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,79}$/

const EvidenceQuery = z.object({
  capability: z.string().regex(SAFE_ID).optional(),
  assessment: z.string().regex(SAFE_ID).optional(),
  scope: z.enum(['PERSONAL', 'SPONSORED']).optional(),
  kind: z.enum(['FORMAL', 'PRACTICE']).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
}).strict()
const Acknowledge = z.object({ copyVersion: z.string().min(1).max(80), acknowledged: z.literal(true) }).strict()
const Preferences = z.object({
  reducedMotion: z.boolean(),
  largerText: z.boolean(),
  // P8.2 display-only intent (never a scoring input); all optional/skippable.
  segment: z.enum(SEGMENTS).nullable().optional(),
  intention: z.enum(INTENTIONS).nullable().optional(),
  responseMode: z.enum(RESPONSE_MODES).nullable().optional(),
  // Optional display-only name (own screens only); separate research choice.
  displayName: z.string().trim().min(1).max(DISPLAY_NAME_MAX).nullable().optional(),
  researchPermission: z.boolean().nullable().optional(),
}).strict()
const preferencesView = (p) => ({
  reducedMotion: p.reducedMotion, largerText: p.largerText, segment: p.segment ?? null, intention: p.intention ?? null, responseMode: p.responseMode ?? null,
  displayName: p.displayName ?? null, researchPermission: p.researchPermission ?? null, researchPermissionAt: p.researchPermissionAt ?? null,
  updatedAt: p.updatedAt, support: SUPPORT_DISCLOSURE,
})
const Interests = z.object({ interests: z.record(z.number().min(0).max(1)).nullable() }).strict()
const HistoryQuery = z.object({
  cursor: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
}).strict()

function grantView(g, at) {
  const status = g.revokedAt ? 'REVOKED' : new Date(g.expiresAt) <= at ? 'EXPIRED' : 'ACTIVE'
  return {
    id: g.id,
    recipient: { type: g.recipientType, organizationName: g.recipientOrganizationName || null },
    resources: g.resources.map((r) => ({ resourceType: r.resourceType, resourceId: r.resourceId, disclosureLevel: r.disclosureLevel })),
    createdAt: g.createdAt,
    expiresAt: g.expiresAt,
    revokedAt: g.revokedAt,
    status,
  }
}

export function createStudentRouter({ requireUser, campus, clock = () => new Date() }) {
  const router = Router()
  const shell = requireFlag('PRISM_APP_SHELL_V3')
  const scoped = [shell, ...studentScoped({ requireUser, campus })]
  const requireStore = (_req, _res, next) => (campus.storeAvailable()
    ? next()
    : next(new ApiError('CAMPUS_STORE_UNAVAILABLE', 'This feature is temporarily unavailable.')))

  router.get('/me/home', ...scoped, asyncHandler(async (req, res) => ok(res, await campus.student.home(req.user, req.workspace))))
  router.get('/me/capabilities', ...scoped, asyncHandler(async (req, res) => ok(res, await campus.student.capabilities(req.user, req.workspace))))
  // P5.4: one capability bound to its latest formal snapshot.
  router.get('/me/capabilities/:id', ...scoped, asyncHandler(async (req, res) => {
    if (!SAFE_ID.test(req.params.id)) throw new ApiError('NOT_FOUND', 'Not found')
    return ok(res, await campus.student.capabilityDetail(req.user, req.workspace, req.params.id))
  }))
  router.get('/me/assessments', ...scoped, asyncHandler(async (req, res) => ok(res, await campus.assignments.listForWorkspace(req.user, req.workspace))))
  router.get('/me/history', ...scoped, asyncHandler(async (req, res) => {
    const parsed = HistoryQuery.safeParse(req.query || {})
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'That page reference is not valid.')
    return ok(res, await campus.history.list(req.user, req.workspace, parsed.data))
  }))
  router.get('/me/development-plan', ...scoped, asyncHandler(async (req, res) => ok(res, await campus.student.developmentPlan(req.user, req.workspace))))
  router.get('/me/growth', ...scoped, asyncHandler(async (req, res) => ok(res, await campus.student.growth(req.user, req.workspace))))

  router.get('/me/evidence', ...scoped, asyncHandler(async (req, res) => {
    const parsed = EvidenceQuery.safeParse(req.query || {})
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'One of the filters is not valid.')
    return ok(res, await campus.student.evidence(req.user, req.workspace, parsed.data))
  }))

  router.post('/me/role-exploration', requireFlag('PRISM_ROLE_EXPLORATION_V2'), ...scoped, asyncHandler(async (req, res) => {
    const parsed = Interests.safeParse(req.body || {})
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Choose the kinds of work you enjoy.')
    return ok(res, await campus.student.exploration(req.user, req.workspace, parsed.data.interests))
  }))

  router.get('/assessment-assignments/:id', ...scoped, asyncHandler(async (req, res) => {
    if (!ASSIGNMENT_ID.test(req.params.id)) throw new ApiError('NOT_FOUND', 'Not found')
    return ok(res, await campus.assignments.getBriefing(req.user, req.workspace, req.params.id))
  }))

  router.post('/assessment-assignments/:id/acknowledge', ...scoped, requireStore, asyncHandler(async (req, res) => {
    if (!ASSIGNMENT_ID.test(req.params.id)) throw new ApiError('NOT_FOUND', 'Not found')
    const parsed = Acknowledge.safeParse(req.body || {})
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Please confirm you have read who can see this assessment.')
    const result = await campus.assignments.acknowledge(req.user, req.workspace, req.params.id, parsed.data)
    campus.audit('campus.assessment_disclosure.acknowledged', null, {
      assignmentId: req.params.id, organizationId: req.workspace.organizationId, copyVersion: result.copyVersion, requestId: req.requestId,
    })
    return ok(res, result)
  }))

  router.get('/me/preferences', shell, requireUser, requireStore, asyncHandler(async (req, res) => {
    const stored = await campus.store.preferences.getPreferences(req.user.id)
    return ok(res, stored ? preferencesView(stored) : preferencesView({ ...DEFAULT_PREFERENCES, updatedAt: null }))
  }))

  router.put('/me/preferences', shell, requireUser, requireStore, asyncHandler(async (req, res) => {
    const parsed = Preferences.safeParse(req.body || {})
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Those preferences are not valid.')
    const saved = await campus.store.preferences.savePreferences(req.user.id, parsed.data)
    return ok(res, preferencesView(saved))
  }))

  router.get('/me/share-grants', shell, requireUser, requireStore, asyncHandler(async (req, res) => {
    const at = clock()
    const grants = await campus.store.sharing.listShareGrantsForOwner(req.user.id)
    return ok(res, { items: grants.map((g) => grantView(g, at)) })
  }))

  router.post('/me/share-grants/:id/revoke', shell, requireUser, requireStore, asyncHandler(async (req, res) => {
    if (!UUID.test(req.params.id)) throw new ApiError('NOT_FOUND', 'Not found')
    const at = clock()
    const revoked = await campus.store.sharing.revokeShareGrant(req.params.id, req.user.id, at.toISOString())
    if (!revoked) throw new ApiError('NOT_FOUND', 'Not found')
    campus.audit('share_grant.revoked', null, {
      shareGrantId: revoked.id, recipientType: revoked.recipientType, organizationId: revoked.recipientOrganizationId || null, requestId: req.requestId,
    })
    return ok(res, { id: revoked.id, revokedAt: revoked.revokedAt, status: 'REVOKED' })
  }))

  return router
}
