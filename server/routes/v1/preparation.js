// /api/v1 private preparation (P7; CH-34, CH-35). Dark unless
// PRISM_PREPARATION_V1 is on. PERSONAL workspace only — in any campus
// workspace every route is NOT_FOUND. The server fixes PREPARATION /
// SELF_REPORT mode; the client cannot send one.
//   POST   /preparation                   intent → { attemptId, sanitizedIntent, summary, limitation, needsConfirmation }
//   POST   /preparation/:id/confirm       optional edits → attempt view (REHEARSING)
//   POST   /preparation/:id/turns         { text } → attempt view (+ participant reply or boundary)
//   POST   /preparation/:id/assist        → attempt view with an AI_ASSISTANT sample line
//   POST   /preparation/:id/finish        → attempt view with card/observations or explicit cardError
//   POST   /preparation/:id/abandon
//   PATCH  /preparation/:id               { title }
//   DELETE /preparation/:id
//   PATCH  /preparation/:id/card          learner edits  · DELETE /preparation/:id/card discards it
//   PATCH  /preparation/:id/application   { text?, dismissed?, reminderOptIn? }
//   GET    /preparation | /preparation/:id
//   POST   /checkins | GET /checkins | PATCH /checkins/:id | DELETE /checkins/:id   SELF_REPORT check-ins
import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../domain/http/asyncHandler.js'
import { ApiError, ok } from '../../domain/http/errors.js'
import { requireFlag } from '../../domain/flags/index.js'
import { studentScoped } from './studentScope.js'
import { TURN_MAX } from '../../domain/preparation/service.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function createPreparationRouter({ requireUser, campus }) {
  const router = Router()
  const gate = [requireFlag('PRISM_PREPARATION_V1'), requireFlag('PRISM_APP_SHELL_V3'), ...studentScoped({ requireUser, campus })]
  const store = (_req, _res, next) => (campus.storeAvailable()
    ? next()
    : next(new ApiError('CAMPUS_STORE_UNAVAILABLE', 'Preparation is temporarily unavailable.')))
  const id = (req, _res, next) => (UUID.test(req.params.id) ? next() : next(new ApiError('NOT_FOUND', 'Not found')))
  const svc = () => campus.preparation
  const body = (req) => (req.body && typeof req.body === 'object' ? req.body : {})

  router.post('/preparation', ...gate, store, asyncHandler(async (req, res) => ok(res, await svc().createIntent(req.user, req.workspace, req.body), 201)))
  router.get('/preparation', ...gate, store, asyncHandler(async (req, res) => ok(res, await svc().list(req.user, req.workspace))))
  router.get('/preparation/:id', ...gate, store, id, asyncHandler(async (req, res) => ok(res, await svc().get(req.user, req.workspace, req.params.id))))
  router.patch('/preparation/:id', ...gate, store, id, asyncHandler(async (req, res) => ok(res, await svc().rename(req.user, req.workspace, req.params.id, body(req).title))))
  router.delete('/preparation/:id', ...gate, store, id, asyncHandler(async (req, res) => ok(res, await svc().remove(req.user, req.workspace, req.params.id))))
  router.post('/preparation/:id/confirm', ...gate, store, id, asyncHandler(async (req, res) => ok(res, await svc().confirm(req.user, req.workspace, req.params.id, body(req).edits || null))))
  router.post('/preparation/:id/turns', ...gate, store, id, asyncHandler(async (req, res) => {
    const parsed = z.object({ text: z.string().min(1).max(TURN_MAX) }).strict().safeParse(req.body || {})
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Write what you would say.')
    return ok(res, await svc().sendTurn(req.user, req.workspace, req.params.id, parsed.data.text), 201)
  }))
  router.post('/preparation/:id/assist', ...gate, store, id, asyncHandler(async (req, res) => ok(res, await svc().assist(req.user, req.workspace, req.params.id), 201)))
  router.post('/preparation/:id/finish', ...gate, store, id, asyncHandler(async (req, res) => ok(res, await svc().finish(req.user, req.workspace, req.params.id))))
  router.post('/preparation/:id/abandon', ...gate, store, id, asyncHandler(async (req, res) => ok(res, await svc().abandon(req.user, req.workspace, req.params.id))))
  router.patch('/preparation/:id/card', ...gate, store, id, asyncHandler(async (req, res) => ok(res, await svc().editCard(req.user, req.workspace, req.params.id, body(req)))))
  router.delete('/preparation/:id/card', ...gate, store, id, asyncHandler(async (req, res) => ok(res, await svc().discardCard(req.user, req.workspace, req.params.id))))
  router.patch('/preparation/:id/application', ...gate, store, id, asyncHandler(async (req, res) => ok(res, await svc().editApplication(req.user, req.workspace, req.params.id, body(req)))))

  router.post('/checkins', ...gate, store, asyncHandler(async (req, res) => ok(res, await svc().createCheckin(req.user, req.workspace, req.body), 201)))
  router.get('/checkins', ...gate, store, asyncHandler(async (req, res) => ok(res, await svc().listCheckins(req.user, req.workspace))))
  router.patch('/checkins/:id', ...gate, store, id, asyncHandler(async (req, res) => ok(res, await svc().editCheckin(req.user, req.workspace, req.params.id, body(req)))))
  router.delete('/checkins/:id', ...gate, store, id, asyncHandler(async (req, res) => ok(res, await svc().deleteCheckin(req.user, req.workspace, req.params.id))))

  return router
}
