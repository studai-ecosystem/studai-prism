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
import { randomUUID } from 'crypto'
import logger from '../../lib/logger.js'
import { query, isDbConfigured } from '../../db/pool.js'
import { requirePermission } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'
import { auditLog } from '../../lib/telemetry.js'
import { createInvite, listInvites, getInvite, listRedemptions, revokeInvite } from '../../lib/invites.js'
import { getReport } from '../../lib/store.js'

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
    // Roster rows carry the assessment COMPLETION state so an operator can
    // see, per redeemer, whether the assessment finished and jump to the
    // report record. Charter §6: the composite score never appears in this
    // ordinary operational view.
    const redemptions = await Promise.all(
      (await listRedemptions(invite.inviteId)).map(async (r) => {
        const report = await getReport(r.sessionId).catch(() => null)
        return {
          ...r,
          reportReady: Boolean(report),
        }
      }),
    )
    res.json({ invite, redemptions })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_invite_detail_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/', requirePermission('invites:manage'), async (req, res) => {
  try {
    const { label, maxUses, startsAt, expiresAt, code } = req.body || {}
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
        code: code ? String(code) : null,
      })
    } catch (err) {
      if (['INVALID_MAX_USES', 'INVALID_EXPIRY', 'INVALID_WINDOW', 'INVALID_CODE'].includes(err.code)) {
        return res.status(400).json({ error: err.message })
      }
      if (err.code === 'CODE_TAKEN') {
        return res.status(409).json({ error: err.message })
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

// ── Institution verification (charter §9, Level 2) ─────────────────────────
// An invite alone NEVER proves identity. Level 2 requires this RECORDED
// verification event naming the responsible institutional authority — e.g.
// the placement cell confirming the candidate against its roster. Write-once
// per session; every recording is audited on both planes.
router.post('/:id/institution-verification', requirePermission('invites:manage'), async (req, res) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Requires the governance database.' })
    const { sessionId, authority, method, note } = req.body || {}
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required.' })
    if (!authority || String(authority).trim().length < 5) {
      return res.status(400).json({ error: 'The responsible institutional authority is required (institution + person/role).' })
    }
    if (!method || !['roster_confirmation', 'placement_cell_attestation', 'institutional_workflow'].includes(method)) {
      return res.status(400).json({ error: 'method must be one of: roster_confirmation, placement_cell_attestation, institutional_workflow' })
    }
    const invite = await getInvite(req.params.id)
    if (!invite) return res.status(404).json({ error: 'Invite not found.' })
    // The session must belong to this invite's redemptions — the cohort is
    // the context the institution is attesting against.
    const redemptions = await listRedemptions(invite.inviteId)
    const redemption = redemptions.find((r) => r.sessionId === sessionId)
    if (!redemption) return res.status(404).json({ error: 'That session was not started through this invite.' })

    const verificationId = randomUUID()
    const inserted = await query(
      `INSERT INTO institution_verifications
         (verification_id, session_id, invite_id, authority, method, note, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (session_id) DO NOTHING
       RETURNING verification_id`,
      [verificationId, sessionId, invite.inviteId,
        String(authority).trim().slice(0, 200), method, String(note || '').slice(0, 1000), req.admin.id],
    )
    if (!inserted?.rows?.length) {
      return res.status(409).json({ error: 'An institution-verification event is already recorded for this session.', code: 'ALREADY_RECORDED' })
    }
    auditLog('institution_verification_recorded', sessionId, {
      verificationId, inviteId: invite.inviteId, method, by: 'admin_console',
    })
    await adminAudit(req, {
      action: 'institution_verification_recorded', entityType: 'assessment_invite', entityId: invite.inviteId,
      after: { sessionId, verificationId, method, authority: String(authority).trim().slice(0, 200) },
    })
    res.status(201).json({ ok: true, verificationId, assuranceLevel: 'L2' })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_institution_verification_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
