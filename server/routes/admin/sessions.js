// /api/admin/sessions — assessment-session explorer (Control Centre Phase 2).
//
//   GET  /                       sessions:read        list w/ filters + admin overlay
//   GET  /:id                    sessions:read        full session file: summary, conversation
//                                                     (blinded transcript), integrity events,
//                                                     decision trail, related records
//   POST /:id/review             sessions:review      hold / release (reason required)
//   POST /:id/invalidate         sessions:invalidate  mark invalid + exclude from calibration
//   POST /:id/exclude-calibration sessions:invalidate calibration exclusion toggle
//   POST /:id/notes              notes:write
//
// NOT here by design: transcript editing (never exists), score editing (never
// exists — corrections are dual-approved report supersessions in reports.js),
// scoring reprocess (needs the judge-pipeline extraction, lands with Phase 3's
// scientific administration).

import { Router } from 'express'
import { randomUUID } from 'crypto'
import logger from '../../lib/logger.js'
import { query, isDbConfigured } from '../../db/pool.js'
import { requirePermission } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'
import { auditLog } from '../../lib/telemetry.js'
import {
  listSessions, getSession, getReport, getEntitlement, getConsent, getEvents, getDispute,
} from '../../lib/store.js'
import { getLatestCredential } from '../../lib/credentials.js'

const router = Router()

async function overlayFor(sessionIds) {
  if (!sessionIds.length) return {}
  const r = await query(
    `SELECT * FROM admin_session_states WHERE session_id = ANY($1::text[])`,
    [sessionIds],
  ).catch(() => null)
  const map = {}
  for (const row of r?.rows || []) {
    map[row.session_id] = {
      reviewState: row.review_state,
      invalid: row.invalid,
      invalidReason: row.invalid_reason,
      excludedFromCalibration: row.excluded_from_calibration,
    }
  }
  return map
}

async function upsertState(sessionId, fields, adminId) {
  const cols = { review_state: null, review_reason: null, invalid: null, invalid_reason: null, excluded_from_calibration: null, exclusion_reason: null, ...fields }
  await query(
    `INSERT INTO admin_session_states
       (session_id, review_state, review_reason, invalid, invalid_reason,
        excluded_from_calibration, exclusion_reason, updated_by, updated_at)
     VALUES ($1,$2,$3,COALESCE($4,FALSE),$5,COALESCE($6,FALSE),$7,$8,now())
     ON CONFLICT (session_id) DO UPDATE SET
       review_state              = COALESCE(EXCLUDED.review_state, admin_session_states.review_state),
       review_reason             = COALESCE(EXCLUDED.review_reason, admin_session_states.review_reason),
       invalid                   = COALESCE($4, admin_session_states.invalid),
       invalid_reason            = COALESCE(EXCLUDED.invalid_reason, admin_session_states.invalid_reason),
       excluded_from_calibration = COALESCE($6, admin_session_states.excluded_from_calibration),
       exclusion_reason          = COALESCE(EXCLUDED.exclusion_reason, admin_session_states.exclusion_reason),
       updated_by                = EXCLUDED.updated_by,
       updated_at                = now()`,
    [sessionId, cols.review_state, cols.review_reason, cols.invalid, cols.invalid_reason,
     cols.excluded_from_calibration, cols.exclusion_reason, adminId],
  )
}

// ── List ─────────────────────────────────────────────────────────────────────
router.get('/', requirePermission('sessions:read'), async (req, res) => {
  try {
    const { q, userId, status, scenarioId, page, pageSize } = req.query
    const result = await listSessions({
      q: q ? String(q) : undefined,
      userId: userId ? String(userId) : undefined,
      status: status ? String(status) : undefined,
      scenarioId: scenarioId ? String(scenarioId) : undefined,
      page, pageSize,
    })
    const overlay = await overlayFor(result.rows.map((s) => s.sessionId))
    // Report overall per listed session (single fetch per row is fine at ≤100).
    const rows = []
    for (const s of result.rows) {
      const report = await getReport(s.sessionId)
      rows.push({
        ...s,
        overall: report?.scores?.overall ?? null,
        flaggedForReview: Boolean(report?.flaggedForReview),
        admin: overlay[s.sessionId] || null,
      })
    }
    res.json({ ...result, rows })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_sessions_list_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Detail ───────────────────────────────────────────────────────────────────
router.get('/:id', requirePermission('sessions:read'), async (req, res) => {
  try {
    const sid = req.params.id
    const session = await getSession(sid)
    const report = await getReport(sid)
    if (!session && !report) return res.status(404).json({ error: 'Session not found.' })

    const [entitlement, consent, events, dispute] = await Promise.all([
      getEntitlement(sid), getConsent(sid), getEvents(sid), getDispute(sid),
    ])

    // Blinded conversation: live sessions still hold history; completed ones
    // free it, so fall back to the research transcript (turns only, no scores).
    let conversation = null
    if (Array.isArray(session?.history) && session.history.length) {
      conversation = { source: 'live_session', turns: session.history }
    } else if (isDbConfigured()) {
      const t = await query('SELECT turns FROM session_transcripts WHERE session_id = $1::uuid', [sid])
        .catch(() => null)
      if (t?.rows?.[0]) conversation = { source: 'blinded_transcript', turns: t.rows[0].turns }
    }

    let timeline = null
    let decisions = []
    let integrityReviews = []
    let adminState = null
    let credential = null
    if (isDbConfigured()) {
      timeline = await query('SELECT * FROM assessment_timeline WHERE session_id = $1::uuid', [sid])
        .then((r) => r?.rows?.[0] || null).catch(() => null)
      decisions = await query(
        `SELECT event_type, payload, created_at FROM audit_log
          WHERE session_id = $1::uuid ORDER BY id ASC LIMIT 500`,
        [sid],
      ).then((r) => r?.rows || []).catch(() => [])
      integrityReviews = await query(
        'SELECT * FROM integrity_reviews WHERE session_id = $1 ORDER BY created_at DESC',
        [sid],
      ).then((r) => r?.rows || []).catch(() => [])
      adminState = (await overlayFor([sid]))[sid] || null
      credential = await getLatestCredential(sid).catch(() => null)
    }

    const notes = await query(
      `SELECT n.note_id, n.category, n.body, n.created_at, u.email AS author
         FROM admin_notes n JOIN admin_users u ON u.admin_id = n.author_id
        WHERE n.entity_type = 'session' AND n.entity_id = $1 ORDER BY n.created_at DESC LIMIT 50`,
      [sid],
    ).then((r) => r?.rows || []).catch(() => [])

    res.json({
      summary: {
        sessionId: sid,
        scenarioId: session?.scenarioId || null,
        userId: session?.userId || report?.userId || null,
        userEmail: session?.userEmail || null,
        language: session?.language || 'en',
        exchangeCount: session?.exchangeCount ?? null,
        startedAt: session?.startedAt || null,
        completedAt: session?.completedAt || null,
        consentVersion: consent?.meta?.consentVersion || null,
        scaleVersion: timeline?.scale_version || null,
        flagsActive: timeline?.flags_active || null,
        isSynthetic: timeline?.is_synthetic ?? null,
      },
      report: report ? {
        overall: report.scores?.overall ?? null,
        scores: report.scores || null,
        reliability: report.reliability || null,
        percentile: report.percentile ?? null,
        flaggedForReview: Boolean(report.flaggedForReview),
        issuedAt: report.issuedAt || null,
        correction: report.correction || null,
      } : null,
      conversation,
      entitlement,
      consent,
      integrity: { events, reviews: integrityReviews },
      decisions,
      dispute,
      credential: credential ? {
        credentialId: credential.credential_id, status: credential.status, issuedAt: credential.issued_at,
      } : null,
      adminState,
      notes,
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_session_detail_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Review hold / release ────────────────────────────────────────────────────
router.post('/:id/review', requirePermission('sessions:review'), async (req, res) => {
  try {
    const { action, reason } = req.body || {}
    if (!['hold', 'release'].includes(action)) return res.status(400).json({ error: 'action must be hold or release.' })
    if (!reason) return res.status(400).json({ error: 'A reason is required.' })
    const session = await getSession(req.params.id)
    if (!session) return res.status(404).json({ error: 'Session not found.' })

    await upsertState(req.params.id, {
      review_state: action === 'hold' ? 'held' : 'released', review_reason: String(reason),
    }, req.admin.id)
    // Review state affects downstream handling of the score — record it in the
    // assessment decision trail too (build rule: score-affecting → audit_log).
    auditLog(action === 'hold' ? 'session_review_hold' : 'session_review_release', req.params.id, {
      by: 'admin_console', reason: String(reason),
    })
    await adminAudit(req, {
      action: `session_review_${action}`, entityType: 'session', entityId: req.params.id, reason,
    })
    res.json({ ok: true, reviewState: action === 'hold' ? 'held' : 'released' })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_session_review_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Invalidate ───────────────────────────────────────────────────────────────
router.post('/:id/invalidate', requirePermission('sessions:invalidate'), async (req, res) => {
  try {
    const { reason } = req.body || {}
    if (!reason || String(reason).trim().length < 10) {
      return res.status(400).json({ error: 'A specific reason (>= 10 characters) is required to mark a session invalid.' })
    }
    const session = await getSession(req.params.id)
    const report = await getReport(req.params.id)
    if (!session && !report) return res.status(404).json({ error: 'Session not found.' })

    await upsertState(req.params.id, {
      invalid: true, invalid_reason: String(reason).trim(),
      excluded_from_calibration: true, exclusion_reason: 'session marked invalid',
    }, req.admin.id)
    auditLog('session_marked_invalid', req.params.id, { by: 'admin_console', reason: String(reason).trim() })
    await adminAudit(req, {
      action: 'session_marked_invalid', entityType: 'session', entityId: req.params.id, reason,
    })
    res.json({ ok: true, invalid: true, excludedFromCalibration: true })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_session_invalidate_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Calibration exclusion ────────────────────────────────────────────────────
router.post('/:id/exclude-calibration', requirePermission('sessions:invalidate'), async (req, res) => {
  try {
    const { excluded, reason } = req.body || {}
    if (typeof excluded !== 'boolean') return res.status(400).json({ error: 'excluded (boolean) is required.' })
    if (!reason) return res.status(400).json({ error: 'A reason is required.' })
    await upsertState(req.params.id, {
      excluded_from_calibration: excluded, exclusion_reason: String(reason),
    }, req.admin.id)
    auditLog('session_calibration_exclusion', req.params.id, {
      by: 'admin_console', excluded, reason: String(reason),
    })
    await adminAudit(req, {
      action: excluded ? 'session_excluded_from_calibration' : 'session_included_in_calibration',
      entityType: 'session', entityId: req.params.id, reason,
    })
    res.json({ ok: true, excludedFromCalibration: excluded })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_session_exclude_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Notes ────────────────────────────────────────────────────────────────────
router.post('/:id/notes', requirePermission('notes:write'), async (req, res) => {
  try {
    const { body, category } = req.body || {}
    if (!body || !String(body).trim()) return res.status(400).json({ error: 'Note body required.' })
    const noteId = randomUUID()
    await query(
      `INSERT INTO admin_notes (note_id, entity_type, entity_id, author_id, category, body)
       VALUES ($1,'session',$2,$3,$4,$5)`,
      [noteId, req.params.id, req.admin.id, String(category || 'general').slice(0, 40), String(body).slice(0, 4000)],
    )
    await adminAudit(req, { action: 'note_added', entityType: 'session', entityId: req.params.id })
    res.status(201).json({ ok: true, noteId })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_session_note_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
