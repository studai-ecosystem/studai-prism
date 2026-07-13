// /api/admin/users — candidate administration (Control Centre Phase 2).
//
//   GET    /                    users:read      paginated list (email masked without users:read_pii)
//   GET    /:id                 users:read      candidate 360°: profile, sessions, reports,
//                                               entitlements, consents, verification status,
//                                               credentials, timeline, notes
//   PATCH  /:id                 users:write     allowlisted profile fields (name/college/year)
//   POST   /:id/state           users:suspend   suspend / reactivate (reason required)
//   POST   /:id/revoke-sessions users:suspend   bump token version — outstanding JWTs die
//   POST   /:id/reset-password  users:write     one-time temp password (shown once)
//   POST   /:id/entitlement     payments:grant  controlled assessment grant (reason required)
//   POST   /:id/notes           notes:write     internal note
//
// Scores are never editable here — or anywhere. Report corrections live in the
// reports router behind a dual-approved supersession workflow.

import { Router } from 'express'
import { randomUUID } from 'crypto'
import logger from '../../lib/logger.js'
import { query, isDbConfigured } from '../../db/pool.js'
import { requirePermission, hasPermission } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'
import { maskEmail, maskVerification } from '../../lib/adminProduct.js'
import {
  findUserById, listUsers, updateUser, updateUserAccount,
} from '../../lib/db.js'
import {
  getSessionIdsByUser, getSession, getReportsByUser, getEntitlement,
  getConsent, getVerification, getDispute, createEntitlement, listSessions,
} from '../../lib/store.js'
import bcrypt from 'bcryptjs'

const router = Router()

function userView(user, canSeePii) {
  if (!user) return null
  return {
    id: user.id,
    email: canSeePii ? user.email : maskEmail(user.email),
    name: user.name || '',
    college: user.college || '',
    year: user.year || '',
    candidateId: user.candidateId || null,
    accountState: user.accountState || 'active',
    createdAt: user.createdAt || null,
  }
}

// ── List ─────────────────────────────────────────────────────────────────────
router.get('/', requirePermission('users:read'), async (req, res) => {
  try {
    const { q, page, pageSize } = req.query
    const canSeePii = hasPermission(req.admin, 'users:read_pii')
    const result = await listUsers({ q: q ? String(q) : undefined, page, pageSize })
    res.json({
      ...result,
      rows: result.rows.map((u) => userView(u, canSeePii)),
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_users_list_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Detail (candidate 360°) ──────────────────────────────────────────────────
router.get('/:id', requirePermission('users:read'), async (req, res) => {
  try {
    const user = await findUserById(req.params.id)
    if (!user) return res.status(404).json({ error: 'Candidate not found.' })
    const canSeePii = hasPermission(req.admin, 'users:read_pii')

    const sessionIds = await getSessionIdsByUser(user.id)
    const sessions = (await listSessions({ userId: user.id, page: 1, pageSize: 100 })).rows
    const reports = (await getReportsByUser(user.id)).map((r) => ({
      sessionId: r.sessionId,
      overall: r.scores?.overall ?? null,
      scenario: r.scenario?.title || r.scenario || null,
      language: r.scoring?.language || 'en',
      flaggedForReview: Boolean(r.flaggedForReview),
      issuedAt: r.issuedAt || null,
      correction: r.correction || null,
    }))

    const perSession = {}
    for (const sid of sessionIds.slice(0, 100)) {
      const [ent, consent, verification, dispute] = await Promise.all([
        getEntitlement(sid), getConsent(sid), getVerification(sid), getDispute(sid),
      ])
      perSession[sid] = {
        entitlement: ent,
        consent: consent ? { scopes: consent.scopes, version: consent.meta?.consentVersion || null, at: consent.at } : null,
        verification: canSeePii ? verification : maskVerification(verification),
        dispute: dispute ? { status: dispute.status, at: dispute.at } : null,
      }
    }

    // Telemetry-side context (pseudonymous spine + credentials), when present.
    let timeline = []
    let credentials = []
    if (isDbConfigured() && user.candidateId) {
      const t = await query(
        `SELECT session_id, attempt_no, scenario_key, scale_version, language, is_synthetic, completed_at
           FROM assessment_timeline WHERE candidate_id = $1 ORDER BY completed_at DESC LIMIT 100`,
        [user.candidateId],
      ).catch(() => null)
      timeline = t?.rows || []
      const c = await query(
        `SELECT credential_id, session_id, status, schema_version, issued_at, superseded_by
           FROM credentials WHERE candidate_id = $1 ORDER BY issued_at DESC LIMIT 100`,
        [user.candidateId],
      ).catch(() => null)
      credentials = c?.rows || []
    }

    const notes = await query(
      `SELECT n.note_id, n.category, n.body, n.created_at, u.email AS author
         FROM admin_notes n JOIN admin_users u ON u.admin_id = n.author_id
        WHERE n.entity_type = 'user' AND n.entity_id = $1 ORDER BY n.created_at DESC LIMIT 50`,
      [user.id],
    ).then((r) => r?.rows || []).catch(() => [])

    const audit = await query(
      `SELECT action, admin_email, reason, created_at FROM admin_audit_events
        WHERE entity_type = 'user' AND entity_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [user.id],
    ).then((r) => r?.rows || []).catch(() => [])

    // Unmasked PII access is itself an audited event (plan §5).
    if (canSeePii) {
      await adminAudit(req, { action: 'user_pii_viewed', entityType: 'user', entityId: user.id })
    }

    res.json({
      user: userView(user, canSeePii),
      sessions, reports, perSession, timeline, credentials, notes, audit,
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_user_detail_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Profile edits (allowlist) ────────────────────────────────────────────────
router.patch('/:id', requirePermission('users:write'), async (req, res) => {
  try {
    const allowed = ['name', 'college', 'year']
    const keys = Object.keys(req.body || {}).filter((k) => k !== 'reason')
    const outside = keys.filter((k) => !allowed.includes(k))
    if (outside.length) {
      return res.status(400).json({ error: `Only ${allowed.join(', ')} are editable. Rejected: ${outside.join(', ')}` })
    }
    const before = await findUserById(req.params.id)
    if (!before) return res.status(404).json({ error: 'Candidate not found.' })

    const patch = {}
    for (const k of allowed) if (typeof req.body[k] === 'string') patch[k] = req.body[k]
    if (typeof patch.name === 'string' && !patch.name.trim()) {
      return res.status(400).json({ error: 'Name cannot be empty.' })
    }
    const user = await updateUser(req.params.id, patch)
    await adminAudit(req, {
      action: 'user_profile_updated', entityType: 'user', entityId: user.id,
      before: { name: before.name, college: before.college, year: before.year },
      after: { name: user.name, college: user.college, year: user.year },
      reason: req.body?.reason || null,
    })
    res.json({ user: userView(user, hasPermission(req.admin, 'users:read_pii')) })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_user_patch_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Account state ────────────────────────────────────────────────────────────
router.post('/:id/state', requirePermission('users:suspend'), async (req, res) => {
  try {
    const { state, reason } = req.body || {}
    if (!['active', 'suspended'].includes(state)) {
      return res.status(400).json({ error: 'state must be active or suspended.' })
    }
    if (!reason) return res.status(400).json({ error: 'A reason is required.' })
    const before = await findUserById(req.params.id)
    if (!before) return res.status(404).json({ error: 'Candidate not found.' })

    // Suspension also revokes outstanding candidate tokens.
    const user = await updateUserAccount(req.params.id, {
      accountState: state, bumpTokenVersion: state === 'suspended',
    })
    await adminAudit(req, {
      action: state === 'suspended' ? 'user_suspended' : 'user_reactivated',
      entityType: 'user', entityId: user.id,
      before: { accountState: before.accountState || 'active' },
      after: { accountState: state }, reason,
    })
    res.json({ ok: true, accountState: state })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_user_state_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/:id/revoke-sessions', requirePermission('users:suspend'), async (req, res) => {
  try {
    const { reason } = req.body || {}
    if (!reason) return res.status(400).json({ error: 'A reason is required.' })
    const user = await findUserById(req.params.id)
    if (!user) return res.status(404).json({ error: 'Candidate not found.' })
    await updateUserAccount(req.params.id, { bumpTokenVersion: true })
    await adminAudit(req, {
      action: 'user_sessions_revoked', entityType: 'user', entityId: req.params.id, reason,
    })
    res.json({ ok: true })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_user_revoke_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/:id/reset-password', requirePermission('users:write'), async (req, res) => {
  try {
    const { reason } = req.body || {}
    if (!reason) return res.status(400).json({ error: 'A reason is required.' })
    const user = await findUserById(req.params.id)
    if (!user) return res.status(404).json({ error: 'Candidate not found.' })

    const temp = `Tmp-${randomUUID().slice(0, 18)}`
    await updateUserAccount(req.params.id, {
      passwordHash: await bcrypt.hash(temp, 10), bumpTokenVersion: true,
    })
    await adminAudit(req, {
      action: 'user_password_reset', entityType: 'user', entityId: req.params.id, reason,
    })
    // Shown once; relay out-of-band to the verified account owner only.
    res.json({ ok: true, temporaryPassword: temp, note: 'Shown once. Existing sign-ins were revoked.' })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_user_pwreset_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Controlled entitlement grant ─────────────────────────────────────────────
router.post('/:id/entitlement', requirePermission('payments:grant'), async (req, res) => {
  try {
    const { reason } = req.body || {}
    if (!reason) return res.status(400).json({ error: 'A reason is required.' })
    const user = await findUserById(req.params.id)
    if (!user) return res.status(404).json({ error: 'Candidate not found.' })

    // mode 'admin_grant' ≠ 'paid' → the session is synthetic-flagged by the
    // existing timeline rule and stays OUT of calibration data (conservative).
    const sessionId = randomUUID()
    const entitlement = await createEntitlement({ sessionId, mode: 'admin_grant', amount: 0 })
    await adminAudit(req, {
      action: 'entitlement_granted', entityType: 'user', entityId: user.id,
      after: { sessionId, mode: 'admin_grant' }, reason,
    })
    res.status(201).json({
      ok: true, entitlement,
      note: 'Relay this session id to the candidate; it is consumed when their assessment starts.',
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_entitlement_grant_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Notes ────────────────────────────────────────────────────────────────────
router.post('/:id/notes', requirePermission('notes:write'), async (req, res) => {
  try {
    const { body, category } = req.body || {}
    if (!body || !String(body).trim()) return res.status(400).json({ error: 'Note body required.' })
    const user = await findUserById(req.params.id)
    if (!user) return res.status(404).json({ error: 'Candidate not found.' })
    const noteId = randomUUID()
    await query(
      `INSERT INTO admin_notes (note_id, entity_type, entity_id, author_id, category, body)
       VALUES ($1,'user',$2,$3,$4,$5)`,
      [noteId, user.id, req.admin.id, String(category || 'general').slice(0, 40), String(body).slice(0, 4000)],
    )
    await adminAudit(req, { action: 'note_added', entityType: 'user', entityId: user.id })
    res.status(201).json({ ok: true, noteId })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_user_note_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
