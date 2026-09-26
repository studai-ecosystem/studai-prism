// /api/validation — rater plane of the V3 evidence double-rating queue
// (Campus Phase 12, C12.01; spec §45). Dark unless PRISM_V3_RATING_QUEUE is on.
// Raters authenticate with their existing study-runner token (x-rater-token,
// hashed lookup; handle + token only, no PII) and must have passed the IRR
// training gate ('qualified'). They see one blinded item at a time: the
// capability and the candidate's own words (identity tokenised) — never the
// AI's level, other ratings, or anything that leads back to the student.
//
//   GET  /rater/next              → { item } | { item: null }
//   POST /rater/items/:itemId     { level: 1..5 } | { cannotRate: true }

import { Router } from 'express'
import { createHash } from 'node:crypto'
import logger from '../lib/logger.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex')

let defaultCampus = null
async function defaultCtx() {
  if (!defaultCampus) {
    const { createDefaultCampusContext } = await import('../domain/campusStore/defaultContext.js')
    defaultCampus = createDefaultCampusContext()
  }
  return defaultCampus
}

// The study runner's rater registry (0005): token hash → rater.
async function raterFromToken(token) {
  const { isDbConfigured, query } = await import('../db/pool.js')
  if (!isDbConfigured()) return null
  const { rows } = await query('SELECT rater_id, status FROM raters WHERE token_hash = $1', [sha256(token)])
  return rows[0] ? { id: String(rows[0].rater_id), status: rows[0].status } : null
}

export const ratingQueueEnabled = () => process.env.PRISM_V3_RATING_QUEUE === 'true'

export function fail(res, err, msg, req) {
  const map = { NOT_FOUND: 404, VALIDATION_FAILED: 400, CONFLICT: 409, CAMPUS_STORE_UNAVAILABLE: 503 }
  if (map[err?.code]) return res.status(map[err.code]).json({ error: err.message, code: err.code })
  logger.captureException(err, { msg, requestId: req.requestId })
  return res.status(500).json({ error: 'Internal server error' })
}

export function createValidationRaterRouter({ campus = null, resolveRater = raterFromToken } = {}) {
  const router = Router()
  const ctx = async () => campus || defaultCtx()

  router.use((req, res, next) => (ratingQueueEnabled() ? next() : res.status(404).json({ error: 'Not found' })))
  router.use(async (req, res, next) => {
    try {
      const token = req.get('x-rater-token')
      if (!token) return res.status(401).json({ error: 'rater token required' })
      const rater = await resolveRater(token)
      if (!rater) return res.status(401).json({ error: 'unknown rater token' })
      if (rater.status !== 'qualified') return res.status(403).json({ error: 'Finish rater training before rating evidence.', code: 'RATER_NOT_QUALIFIED' })
      req.rater = rater
      return next()
    } catch (err) { return fail(res, err, 'validation_rater_auth_failed', req) }
  })

  router.get('/rater/next', async (req, res) => {
    try {
      res.json({ item: await (await ctx()).validation.nextFor(req.rater.id) })
    } catch (err) { fail(res, err, 'validation_next_failed', req) }
  })

  router.post('/rater/items/:itemId', async (req, res) => {
    try {
      if (!UUID.test(req.params.itemId)) return res.status(404).json({ error: 'Not found' })
      const { level, cannotRate } = req.body || {}
      const unsure = cannotRate === true
      if (!unsure && !(Number.isInteger(level) && level >= 1 && level <= 5)) return res.status(400).json({ error: 'Choose a level from 1 to 5, or "cannot rate".' })
      if (unsure && level != null) return res.status(400).json({ error: 'Choose a level or "cannot rate", not both.' })
      await (await ctx()).validation.submit(req.rater.id, req.params.itemId, { level: unsure ? null : level, cannotRate: unsure })
      res.status(201).json({ ok: true })
    } catch (err) { fail(res, err, 'validation_submit_failed', req) }
  })

  return router
}

export default createValidationRaterRouter()
