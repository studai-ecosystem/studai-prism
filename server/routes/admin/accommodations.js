// /api/admin/accommodations — charter §13 review workflow (Phase 3 part 2).
//
//   GET  /                 accommodations:read    list requests
//   GET  /:sessionId       accommodations:read    full request (sensitive needs text)
//   POST /:sessionId/decide accommodations:manage approve/deny with modes +
//                                                 material-interpretation judgement
//
// The needs text may reference disability — the single most sensitive
// candidate input in the system. It exists ONLY here (accommodations:read),
// never on buyer/report/verify surfaces (CI-enforced), and is erased with the
// session. Approval activates alternate administration at /start; the
// `material` judgement controls the ONLY external disclosure (the charter
// sentence — never the type or needs).

import { Router } from 'express'
import logger from '../../lib/logger.js'
import { requirePermission } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'
import { auditLog } from '../../lib/telemetry.js'
import { listAccommodations, getAccommodation, decideAccommodation, getSession } from '../../lib/store.js'

const router = Router()

router.get('/', requirePermission('accommodations:read'), async (req, res) => {
  try {
    const { status, page, pageSize } = req.query
    const result = await listAccommodations({ status: status ? String(status) : undefined, page, pageSize })
    res.json({
      ...result,
      note: 'Accommodation details are never buyer-visible and never appear in employer-facing data. Buyers must not filter, rank or reject candidates by alternate administration status (prohibited-use clause, policy draft §13).',
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_accommodations_list_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/:sessionId', requirePermission('accommodations:read'), async (req, res) => {
  try {
    const record = await getAccommodation(req.params.sessionId)
    if (!record) return res.status(404).json({ error: 'No accommodation request on file.' })
    // Sensitive read — audited (like PII unmasking).
    await adminAudit(req, {
      action: 'accommodation_viewed', entityType: 'accommodation', entityId: req.params.sessionId,
    })
    res.json({ accommodation: record })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_accommodation_detail_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/:sessionId/decide', requirePermission('accommodations:manage'), async (req, res) => {
  try {
    const { approve, modes, material, note } = req.body || {}
    if (typeof approve !== 'boolean') return res.status(400).json({ error: 'approve (boolean) is required.' })
    if (!note || String(note).trim().length < 10) {
      return res.status(400).json({ error: 'A written decision note (>= 10 characters) is required.' })
    }
    if (approve && !(modes?.textOnly || modes?.noCamera || modes?.reducedProctoring)) {
      return res.status(400).json({ error: 'An approval must grant at least one alternate-administration mode (textOnly, noCamera, reducedProctoring).' })
    }
    const existing = await getAccommodation(req.params.sessionId)
    if (!existing) return res.status(404).json({ error: 'No accommodation request on file.' })
    if (existing.status !== 'requested') {
      return res.status(409).json({ error: `This request was already ${existing.status}.`, code: 'ALREADY_DECIDED' })
    }
    const session = await getSession(req.params.sessionId)
    if (session && !session.completedAt && session.exchangeCount > 0) {
      return res.status(409).json({ error: 'The assessment is already in progress — an accommodation cannot change a running session.', code: 'SESSION_IN_PROGRESS' })
    }

    const decided = await decideAccommodation(req.params.sessionId, {
      approved: approve,
      modes,
      material: Boolean(material),
      note: String(note).trim(),
      decidedBy: req.admin.id,
    })
    // Governance decision → both audit planes.
    auditLog('accommodation_decided', req.params.sessionId, {
      approved: approve,
      modes: decided.modes,
      material: decided.material,
      by: 'admin_console',
    })
    await adminAudit(req, {
      action: 'accommodation_decided', entityType: 'accommodation', entityId: req.params.sessionId,
      after: { approved: approve, modes: decided.modes, material: decided.material },
      reason: String(note).trim().slice(0, 200),
    })
    res.json({ ok: true, status: decided.status, modes: decided.modes, material: decided.material })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_accommodation_decide_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
