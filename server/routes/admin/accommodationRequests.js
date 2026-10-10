// /api/admin/accommodation-requests — staff side of the V3 pre-start
// accommodation requests (PROD-READY Phase 4, ACCOMMODATIONS_POLICY_v1 §2).
// Dark (404) unless PRISM_V3_SUPPORT_ROUTES is on. Same rules as the existing
// session-keyed plane (/api/admin/accommodations): a person holding
// accommodations:manage decides with a written note and at least one mode;
// the needs text (may reference disability) is shown only on the audited
// detail read (accommodations:read), never in the list; a request whose
// assessment has started can no longer be decided. Every decision is audited
// on both planes (the assessment audit log and admin_audit_events).
//
//   GET  /                accommodations:read    list (no needs text)
//   GET  /:id             accommodations:read    detail incl. needs text (audited)
//   POST /:id/decide      accommodations:manage  { approve, modes?, material?, note }
import { Router } from 'express'
import { z } from 'zod'
import { requirePermission } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'
import { fail } from '../validation.js'
import { ACCOMMODATION_STATUSES } from '../../domain/support/accommodationRepository.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const Modes = z.object({ textOnly: z.boolean().optional(), noCamera: z.boolean().optional(), reducedProctoring: z.boolean().optional() }).strict()
const Decide = z.object({
  approve: z.boolean(),
  modes: Modes.optional().nullable(),
  material: z.boolean().optional(),
  note: z.string().trim().min(10).max(1000),
}).strict()

let defaultCampus = null
async function defaultCtx() {
  if (!defaultCampus) {
    const { createDefaultCampusContext } = await import('../../domain/campusStore/defaultContext.js')
    defaultCampus = createDefaultCampusContext()
  }
  return defaultCampus
}

export function createAccommodationRequestsAdminRouter({ campus = null, audit = adminAudit } = {}) {
  const router = Router()
  const ctx = async () => campus || defaultCtx()
  const conflict = (res, err) => res.status(409).json({ error: err.message, code: 'CONFLICT', reason: err.details?.reason || null })

  router.use((_req, res, next) => (process.env.PRISM_V3_SUPPORT_ROUTES === 'true' ? next() : res.status(404).json({ error: 'Not found' })))

  router.get('/', requirePermission('accommodations:read'), async (req, res) => {
    try {
      const status = req.query.status ? String(req.query.status) : null
      if (status && !ACCOMMODATION_STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of ${ACCOMMODATION_STATUSES.join(', ')}.` })
      const out = await (await ctx()).support.listAccommodationRequests({ status, page: req.query.page, pageSize: req.query.pageSize })
      res.json({
        ...out,
        note: 'Accommodation details are never buyer-visible and never appear in employer-facing data. Buyers must not filter, rank or reject candidates by alternate administration status (prohibited-use clause, policy draft §13).',
      })
    } catch (err) { fail(res, err, 'admin_accommodation_requests_list_failed', req) }
  })

  router.get('/:id', requirePermission('accommodations:read'), async (req, res) => {
    try {
      if (!UUID.test(String(req.params.id))) return res.status(404).json({ error: 'Not found' })
      const record = await (await ctx()).support.getAccommodationRequest(req.params.id)
      // Sensitive read — audited (like PII unmasking).
      await audit(req, { action: 'accommodation_viewed', entityType: 'accommodation_request', entityId: req.params.id })
      res.json({ accommodation: record })
    } catch (err) { fail(res, err, 'admin_accommodation_request_detail_failed', req) }
  })

  router.post('/:id/decide', requirePermission('accommodations:manage'), async (req, res) => {
    try {
      if (!UUID.test(String(req.params.id))) return res.status(404).json({ error: 'Not found' })
      const parsed = Decide.safeParse(req.body || {})
      if (!parsed.success) return res.status(400).json({ error: 'approve (true/false) and a written decision note (at least 10 characters) are required.' })
      const { approve, modes, material, note } = parsed.data
      if (approve && !(modes?.textOnly || modes?.noCamera || modes?.reducedProctoring)) {
        return res.status(400).json({ error: 'An approval must grant at least one alternate-administration mode (textOnly, noCamera, reducedProctoring).' })
      }
      let decided
      try {
        decided = await (await ctx()).support.decideAccommodationRequest({ id: req.params.id, approve, modes, material: Boolean(material), note, decidedBy: req.admin.id })
      } catch (err) {
        if (err?.code === 'CONFLICT') return conflict(res, err)
        throw err
      }
      await audit(req, {
        action: 'accommodation_decided', entityType: 'accommodation_request', entityId: req.params.id,
        after: { approved: approve, modes: decided.modes, material: decided.material }, reason: note.slice(0, 200),
      })
      res.json({ ok: true, ...decided })
    } catch (err) { fail(res, err, 'admin_accommodation_request_decide_failed', req) }
  })

  return router
}

export default createAccommodationRequestsAdminRouter()
