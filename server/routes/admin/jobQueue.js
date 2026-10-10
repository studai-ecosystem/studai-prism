// /api/admin/job-queue — operator view of the PostgreSQL job queue
// (PROD-READY Phase 5). Dark (404) unless PRISM_JOB_WORKER is on.
//
//   GET  /              system:read   counts per status + jobs (?status=&kind=&limit=&before=)
//   GET  /:id           system:read   one job
//   POST /:id/retry     jobs:manage   { reason } a DEAD job → PENDING (attempts reset), audited
//   POST /:id/cancel    jobs:manage   { reason } a PENDING / FAILED / DEAD job → CANCELLED, audited
//
// Payloads are references only; an account id inside a payload is masked in
// this view (the subject is shown as "account"). The reason is recorded in
// the admin audit trail, never in the job row.
import { Router } from 'express'
import { z } from 'zod'
import { requirePermission } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'
import logger from '../../lib/logger.js'
import { JOB_KINDS, JOB_STATUSES } from '../../domain/jobs/kinds.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const Reason = z.object({ reason: z.string().trim().min(5).max(300) }).strict()
const ListQuery = z.object({
  status: z.enum(JOB_STATUSES).optional(),
  kind: z.string().refine((k) => Object.hasOwn(JOB_KINDS, k)).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  before: z.string().datetime().optional(),
}).strict()

let defaultCampus = null
async function defaultCtx() {
  if (!defaultCampus) {
    const { createDefaultCampusContext } = await import('../../domain/campusStore/defaultContext.js')
    defaultCampus = createDefaultCampusContext()
  }
  return defaultCampus
}

// What an operator sees: no account id, no lease token.
export function jobView(j) {
  if (!j) return null
  const payload = { ...(j.payload || {}) }
  if ('userId' in payload) payload.userId = '[account]'
  return {
    id: j.id, kind: j.kind, status: j.status, payload, subject: j.subjectUserId ? 'account' : null,
    attempts: j.attempts, maxAttempts: j.maxAttempts, runAt: j.runAt, lastError: j.lastError, lockedBy: j.lockedBy, lockedUntil: j.lockedUntil,
    result: j.result, createdAt: j.createdAt, updatedAt: j.updatedAt, startedAt: j.startedAt, finishedAt: j.finishedAt,
  }
}

export function createJobQueueAdminRouter({ campus = null, audit = adminAudit } = {}) {
  const router = Router()
  const repo = async () => {
    const c = campus || await defaultCtx()
    return c.storeAvailable?.() ? c.repos?.jobs || null : null
  }
  const fail = (res, err, msg, req) => {
    logger.captureException(err, { msg, requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }

  router.use((_req, res, next) => (process.env.PRISM_JOB_WORKER === 'true' ? next() : res.status(404).json({ error: 'Not found' })))

  router.get('/', requirePermission('system:read'), async (req, res) => {
    try {
      const parsed = ListQuery.safeParse(req.query || {})
      if (!parsed.success) return res.status(400).json({ error: `status must be one of ${JOB_STATUSES.join(', ')}; kind a known job kind; limit 1–200.` })
      const r = await repo()
      if (!r) return res.status(503).json({ error: 'The job queue needs the database.', code: 'STORE_UNAVAILABLE' })
      const { status = null, kind = null, limit = 50, before = null } = parsed.data
      const [counts, jobs] = await Promise.all([r.counts(), r.list({ status, kind, limit, before })])
      res.json({
        counts: Object.fromEntries(JOB_STATUSES.map((s) => [s, counts[s] || 0])),
        jobs: jobs.map(jobView),
        nextBefore: jobs.length === limit ? jobs[jobs.length - 1].updatedAt : null,
        kinds: Object.keys(JOB_KINDS),
        note: 'Dead letters (DEAD) need an operator: retry after fixing the cause, or cancel. Payloads hold ids only.',
      })
    } catch (err) { fail(res, err, 'admin_job_queue_list_failed', req) }
  })

  router.get('/:id', requirePermission('system:read'), async (req, res) => {
    try {
      if (!UUID.test(String(req.params.id))) return res.status(404).json({ error: 'Not found' })
      const r = await repo()
      if (!r) return res.status(503).json({ error: 'The job queue needs the database.', code: 'STORE_UNAVAILABLE' })
      const j = await r.get(req.params.id)
      if (!j) return res.status(404).json({ error: 'Not found' })
      res.json({ job: jobView(j) })
    } catch (err) { fail(res, err, 'admin_job_queue_detail_failed', req) }
  })

  for (const action of ['retry', 'cancel']) {
    router.post(`/:id/${action}`, requirePermission('jobs:manage'), async (req, res) => {
      try {
        if (!UUID.test(String(req.params.id))) return res.status(404).json({ error: 'Not found' })
        const parsed = Reason.safeParse(req.body || {})
        if (!parsed.success) return res.status(400).json({ error: 'A reason (5–300 characters) is required.' })
        const r = await repo()
        if (!r) return res.status(503).json({ error: 'The job queue needs the database.', code: 'STORE_UNAVAILABLE' })
        const before = await r.get(req.params.id)
        if (!before) return res.status(404).json({ error: 'Not found' })
        const after = action === 'retry' ? await r.retry(before.id) : await r.cancel(before.id)
        if (!after) {
          return res.status(409).json({
            error: action === 'retry' ? 'Only a dead job can be retried.' : 'Only a pending, failed or dead job can be cancelled.',
            code: 'CONFLICT', status: before.status,
          })
        }
        await audit(req, {
          action: action === 'retry' ? 'job_retried' : 'job_cancelled', entityType: 'job', entityId: before.id,
          before: { status: before.status, kind: before.kind, attempts: before.attempts }, after: { status: after.status }, reason: parsed.data.reason,
        })
        res.json({ job: jobView(after) })
      } catch (err) { fail(res, err, `admin_job_queue_${action}_failed`, req) }
    })
  }

  return router
}

export default createJobQueueAdminRouter()
