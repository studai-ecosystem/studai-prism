// /api/v1 Development Engine V2 (spec §16, §26, §32.2; C8.06–C8.07). Dark
// unless PRISM_DEVELOPMENT_V2 is on.
// Student (active workspace via X-Prism-Workspace; also needs the V3 shell):
//   GET   /missions                               catalogue for this workspace
//   GET   /missions/:id                           player view (no rule internals)
//   POST  /missions/:id/attempts                  Idempotency-Key; resumes the open attempt unless { retry: true }
//   GET   /mission-attempts/:attemptId
//   PATCH /mission-attempts/:attemptId            If-Match version
//   POST  /mission-attempts/:attemptId/hints      If-Match version
//   POST  /mission-attempts/:attemptId/submit     runs the §16.3 pipeline once
// Campus (organization permissions):
//   GET|POST /organizations/:orgId/interventions, GET /organizations/:orgId/interventions/:id,
//   POST /organizations/:orgId/interventions/:id/status, GET /organizations/:orgId/practice-missions
import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../domain/http/asyncHandler.js'
import { ApiError, ok } from '../../domain/http/errors.js'
import { requireFlag } from '../../domain/flags/index.js'
import { studentScoped } from './studentScope.js'
import { LAYER_1_TRANSFERABLE_CAPABILITIES } from '../../lib/competencyModelV2.js'
import { capabilityInfo } from '../../domain/assessments/catalog.js'

const MISSION_ID = /^[A-Z0-9][A-Z0-9-]{2,63}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ORG_ID = /^[0-9a-f-]{36}$/i
// A real calendar day (2026-13-45 is refused, not passed to the database).
const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => {
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}, 'Not a real date')

const StartAttempt = z.object({ retry: z.boolean().optional() }).strict()
const SaveWork = z.object({ work: z.record(z.string().regex(/^[A-Z0-9][A-Z0-9_-]{1,63}$/), z.record(z.unknown())) }).strict()
const CreateIntervention = z.object({
  name: z.string().trim().min(1).max(160),
  targetCapabilityId: z.string().regex(/^CAP-[A-Z0-9-]+$/),
  cohortId: z.string().regex(UUID),
  startsOn: calendarDay,
  endsOn: calendarDay,
  missionIds: z.array(z.string().regex(MISSION_ID)).min(1).max(10),
  reassessmentPlanned: z.boolean().optional(),
}).strict()

function ifMatchOf(req) {
  const raw = req.get('if-match')
  const v = raw != null && /^\d{1,9}$/.test(String(raw).replace(/"/g, '')) ? Number(String(raw).replace(/"/g, '')) : null
  if (v === null) throw new ApiError('IF_MATCH_REQUIRED', 'Send the version you are changing (If-Match).')
  return v
}

export function createDevelopmentRouter({ requireUser, campus }) {
  const router = Router()
  const flag = requireFlag('PRISM_DEVELOPMENT_V2')
  const student = [flag, requireFlag('PRISM_APP_SHELL_V3'), ...studentScoped({ requireUser, campus })]
  const store = (_req, _res, next) => (campus.storeAvailable()
    ? next()
    : next(new ApiError('CAMPUS_STORE_UNAVAILABLE', 'Practice missions are temporarily unavailable.')))
  const svc = () => campus.development
  const mission = (req, _res, next) => (MISSION_ID.test(req.params.id) ? next() : next(new ApiError('NOT_FOUND', 'Not found')))
  const attempt = (req, _res, next) => (UUID.test(req.params.attemptId) ? next() : next(new ApiError('NOT_FOUND', 'Not found')))
  const sendAttempt = (res, a, status = 200) => { res.setHeader('ETag', `"${a.version}"`); return ok(res, a, status) }

  router.get('/missions', ...student, store, asyncHandler(async (req, res) => ok(res, await svc().listMissions(req.user, req.workspace))))
  router.get('/missions/:id', ...student, store, mission, asyncHandler(async (req, res) => ok(res, await svc().getMission(req.user, req.workspace, req.params.id))))
  router.post('/missions/:id/attempts', ...student, store, mission, asyncHandler(async (req, res) => {
    const key = req.get('idempotency-key')
    if (!key || key.length > 128) throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'An Idempotency-Key is required.')
    const parsed = StartAttempt.safeParse(req.body || {})
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Invalid request.')
    const out = await svc().startAttempt(req.user, req.workspace, req.params.id, { idempotencyKey: key, retry: Boolean(parsed.data.retry) })
    return sendAttempt(res, out.attempt, out.resumed ? 200 : 201)
  }))
  router.get('/mission-attempts/:attemptId', ...student, store, attempt, asyncHandler(async (req, res) => sendAttempt(res, await svc().getAttempt(req.user, req.workspace, req.params.attemptId))))
  router.patch('/mission-attempts/:attemptId', ...student, store, attempt, asyncHandler(async (req, res) => {
    const expectedVersion = ifMatchOf(req)
    const parsed = SaveWork.safeParse(req.body || {})
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Your work could not be read.')
    return sendAttempt(res, await svc().saveWork(req.user, req.workspace, req.params.attemptId, { work: parsed.data.work, expectedVersion }))
  }))
  router.post('/mission-attempts/:attemptId/hints', ...student, store, attempt, asyncHandler(async (req, res) => (
    sendAttempt(res, await svc().revealHint(req.user, req.workspace, req.params.attemptId, { expectedVersion: ifMatchOf(req) }))
  )))
  router.post('/mission-attempts/:attemptId/submit', ...student, store, attempt, asyncHandler(async (req, res) => {
    const out = await svc().submit(req.user, req.workspace, req.params.attemptId)
    return sendAttempt(res, out.attempt, out.replayed ? 200 : 201)
  }))

  // ── Campus interventions ──────────────────────────────────────────────
  const { requireCampus, requireOrgPermission } = campus
  router.use('/organizations/:orgId/interventions', (req, _res, next) => (ORG_ID.test(req.params.orgId) ? next() : next(new ApiError('NOT_FOUND', 'Not found'))))
  const orgGate = (perm) => [flag, requireCampus, requireUser, requireOrgPermission(perm)]
  const helpers = () => ({ cohortOf: campus.admin.cohortOf, orgAudit: campus.admin.orgAudit })

  router.get('/organizations/:orgId/practice-missions', ...orgGate('interventions.write'), asyncHandler(async (req, res) => {
    if (!ORG_ID.test(req.params.orgId)) throw new ApiError('NOT_FOUND', 'Not found')
    const list = { items: await svc().catalogue() }
    const ids = new Set([...Object.keys(LAYER_1_TRANSFERABLE_CAPABILITIES), ...list.items.map((m) => m.targetCapabilityId)])
    return ok(res, {
      missions: list.items.map((m) => ({ id: m.id, title: m.title, targetCapabilityId: m.targetCapabilityId, targetCapabilityName: m.targetCapabilityName, estimatedMinutes: m.estimatedMinutes })),
      capabilities: [...ids].map((id) => ({ id, name: capabilityInfo(id)?.name || id })),
    })
  }))
  router.get('/organizations/:orgId/interventions', ...orgGate('interventions.read'), asyncHandler(async (req, res) => {
    const cohorts = await campus.store.campusAdmin.listCohorts(req.params.orgId)
    return ok(res, { items: await svc().listInterventions(req.actor, req.params.orgId, req.permissionScope, { cohortsById: new Map(cohorts.map((c) => [c.id, c])) }) })
  }))
  router.post('/organizations/:orgId/interventions', ...orgGate('interventions.write'), asyncHandler(async (req, res) => {
    const parsed = CreateIntervention.safeParse(req.body || {})
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Check the intervention details.', { details: parsed.error.flatten() })
    return ok(res, await svc().createIntervention(req, req.actor, req.params.orgId, parsed.data, helpers()), 201)
  }))
  router.get('/organizations/:orgId/interventions/:id', ...orgGate('interventions.read'), asyncHandler(async (req, res) => {
    if (!UUID.test(req.params.id)) throw new ApiError('NOT_FOUND', 'Not found')
    return ok(res, await svc().getIntervention(req.actor, req.params.orgId, req.params.id, helpers()))
  }))
  router.post('/organizations/:orgId/interventions/:id/status', ...orgGate('interventions.write'), asyncHandler(async (req, res) => {
    if (!UUID.test(req.params.id)) throw new ApiError('NOT_FOUND', 'Not found')
    const parsed = z.object({ status: z.enum(['COMPLETED', 'CANCELLED']) }).strict().safeParse(req.body || {})
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Choose complete or cancel.')
    return ok(res, await svc().setInterventionStatus(req, req.actor, req.params.orgId, req.params.id, parsed.data.status, helpers()))
  }))

  return router
}
