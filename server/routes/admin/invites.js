// /api/admin/invites — group assessment invite links (college cohorts).
//
//   GET  /              invites:read    list all invites with usage + status
//   GET  /:id           invites:read    invite detail + redemption roster
//   POST /              invites:manage  create (label, maxUses ≤100, window);
//                                       the raw link token returns ONCE here
//   POST /:id/revoke    invites:manage  withdraw an invite (reason required)
//
// Every creation/revocation writes an admin_audit_events row; redemptions are
// candidate-side (routes/payment.js) and land in invite_redemptions.

import { Router } from 'express'
import logger from '../../lib/logger.js'
import { requirePermission } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'
import { createInvite, listInvites, getInvite, listRedemptions, revokeInvite } from '../../lib/invites.js'

const router = Router()

router.get('/', requirePermission('invites:read'), async (req, res) => {
  try {
    res.json({ invites: await listInvites() })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_invites_list_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/:id', requirePermission('invites:read'), async (req, res) => {
  try {
    const invite = await getInvite(req.params.id)
    if (!invite) return res.status(404).json({ error: 'Invite not found.' })
    res.json({ invite, redemptions: await listRedemptions(invite.inviteId) })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_invite_detail_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/', requirePermission('invites:manage'), async (req, res) => {
  try {
    const { label, maxUses, startsAt, expiresAt } = req.body || {}
    if (!label || !String(label).trim()) {
      return res.status(400).json({ error: 'A label is required (e.g. the college and batch).' })
    }
    if (!expiresAt) {
      return res.status(400).json({ error: 'An expiry time is required.' })
    }
    let created
    try {
      created = await createInvite({
        label: String(label).trim(),
        maxUses: maxUses ?? 10,
        startsAt: startsAt || null,
        expiresAt,
        createdBy: req.admin.id,
      })
    } catch (err) {
      if (['INVALID_MAX_USES', 'INVALID_EXPIRY', 'INVALID_WINDOW'].includes(err.code)) {
        return res.status(400).json({ error: err.message })
      }
      throw err
    }
    await adminAudit(req, {
      action: 'invite_created',
      entityType: 'assessment_invite',
      entityId: created.invite.inviteId,
      after: { label: created.invite.label, maxUses: created.invite.maxUses, expiresAt: created.invite.expiresAt },
    })
    // The raw token appears in this response ONLY — never stored, never listed.
    res.status(201).json({ invite: created.invite, token: created.token, path: `/invite/${created.token}` })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_invite_create_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/:id/revoke', requirePermission('invites:manage'), async (req, res) => {
  try {
    const { reason } = req.body || {}
    if (!reason) return res.status(400).json({ error: 'A reason is required.' })
    const ok = await revokeInvite(req.params.id, reason)
    if (!ok) return res.status(404).json({ error: 'Invite not found or already revoked.' })
    await adminAudit(req, {
      action: 'invite_revoked', entityType: 'assessment_invite', entityId: req.params.id, reason,
    })
    res.json({ ok: true })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_invite_revoke_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
