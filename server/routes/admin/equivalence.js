// /api/admin/equivalence — assessment form equivalence registry (Campus
// Phase 9, C9.02; spec §17, §30.10; HA-C004).
//
//   GET  /            equivalence:read    every seeded pair with its status
//   GET  /decisions   equivalence:read    ?formAId=&formBId= decision history
//   POST /decisions   equivalence:decide  { formAId, formBId, status: APPROVED|REJECTED, evidenceRef, reason }
//
// Growth deltas appear ONLY across APPROVED pairs, so approval is a scientific
// decision: it cites evidence, needs a second administrator's approval
// (action "approve_form_equivalence", entityId "<formAId>|<formBId>" in
// canonical order), and is written to the admin audit trail and the
// append-only decision history. Rejection needs evidence and a reason but no
// second approval (it can only remove a comparison). Nothing is auto-approved.

import { Router } from 'express'
import logger from '../../lib/logger.js'
import { requirePermission, consumeApproval } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'
import { canonicalPair } from '../../domain/growth/snapshot.js'

const router = Router()
const FORM_ID = /^[A-Za-z0-9:._-]{1,160}$/

let campus = null
async function growth() {
  if (!campus) {
    const { createDefaultCampusContext } = await import('../../domain/campusStore/defaultContext.js')
    campus = createDefaultCampusContext()
  }
  return campus.growth
}

const fail = (res, err, msg, req) => {
  if (err?.code === 'NOT_FOUND') return res.status(404).json({ error: 'Form pair not found.' })
  if (err?.code === 'VALIDATION_FAILED') return res.status(400).json({ error: err.message })
  logger.captureException(err, { msg, requestId: req.requestId })
  return res.status(500).json({ error: 'Internal server error' })
}

router.get('/', requirePermission('equivalence:read'), async (req, res) => {
  try {
    const pairs = await (await growth()).registry()
    res.json({ pairs, note: 'Growth is shown only across APPROVED pairs. Every pair starts PENDING.' })
  } catch (err) { fail(res, err, 'admin_equivalence_list_failed', req) }
})

router.get('/decisions', requirePermission('equivalence:read'), async (req, res) => {
  try {
    const { formAId, formBId } = req.query || {}
    if (!FORM_ID.test(String(formAId || '')) || !FORM_ID.test(String(formBId || ''))) return res.status(400).json({ error: 'formAId and formBId are required.' })
    const pair = canonicalPair(formAId, formBId)
    const campusCtx = await growth()
    await campusCtx.ensureRegistrySeeded()
    res.json({ ...pair, decisions: await campus.repos.growth.listDecisions(pair.formAId, pair.formBId) })
  } catch (err) { fail(res, err, 'admin_equivalence_decisions_failed', req) }
})

router.post('/decisions', requirePermission('equivalence:decide'), async (req, res) => {
  try {
    const { formAId, formBId, status, evidenceRef, reason } = req.body || {}
    if (!FORM_ID.test(String(formAId || '')) || !FORM_ID.test(String(formBId || ''))) return res.status(400).json({ error: 'formAId and formBId are required.' })
    if (!['APPROVED', 'REJECTED'].includes(status)) return res.status(400).json({ error: 'status must be APPROVED or REJECTED.' })
    if (!evidenceRef || String(evidenceRef).trim().length < 3) return res.status(400).json({ error: 'Cite the evidence (study, calibration run or document) behind this decision.' })
    if (!reason || String(reason).trim().length < 10) return res.status(400).json({ error: 'A specific reason (>= 10 characters) is required.' })
    const pair = canonicalPair(formAId, formBId)
    const svc = await growth()
    await svc.ensureRegistrySeeded()
    if (!(await campus.repos.growth.getEquivalence(pair.formAId, pair.formBId))) return res.status(404).json({ error: 'Form pair not found.' })
    let approval = null
    if (status === 'APPROVED') {
      approval = await consumeApproval('approve_form_equivalence', `${pair.formAId}|${pair.formBId}`)
      if (!approval) {
        return res.status(409).json({
          error: `Approving a form pair for growth comparison requires dual approval. Raise a request with action "approve_form_equivalence" and entityId "${pair.formAId}|${pair.formBId}", approved by a different administrator.`,
          code: 'APPROVAL_REQUIRED',
        })
      }
    }
    const { before, after } = await svc.decide({
      ...pair, status, evidenceRef: String(evidenceRef), reason: String(reason), decidedBy: req.admin.id, approvalId: approval?.approval_id || null,
    })
    await adminAudit(req, {
      action: 'form_equivalence_decided', entityType: 'form_pair', entityId: `${pair.formAId}|${pair.formBId}`,
      before: { status: before.status }, after: { status: after.status, evidenceRef: after.evidenceRef },
      reason: String(reason).trim(), approvalId: approval?.approval_id || null,
    })
    res.json({ ok: true, pair: after })
  } catch (err) { fail(res, err, 'admin_equivalence_decide_failed', req) }
})

export default router
