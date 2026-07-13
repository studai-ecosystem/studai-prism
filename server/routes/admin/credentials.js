// /api/admin/credentials — credential administration (Control Centre Phase 4).
//
//   GET  /                       credentials:read    list w/ filters + verification counts
//   GET  /signing-key            credentials:read    key id + PUBLIC key + config health
//   GET  /audit-export           credentials:read    PII-free auditor package (ledgered)
//   GET  /:credentialId          credentials:read    detail + chain + verification analytics
//   POST /session/:sessionId/issue credentials:issue issue (glass-box gated; shareToken ONCE)
//   POST /:credentialId/revoke   credentials:revoke  requires reason
//   POST /:credentialId/reissue  credentials:revoke  supersession chain (never edit)
//   POST /bulk-revoke            credentials:revoke  DUAL-APPROVED, capped batch
//
// Immutability (plan §17): signed contents — bundle, bundle_hash, signature,
// key_id, issued_at — have NO edit endpoint anywhere; the DB trigger
// (trg_credentials_guard) blocks such updates anyway. Revocation and
// supersession are the only lifecycle verbs. The private signing key never
// appears in any response (test-enforced).

import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import logger from '../../lib/logger.js'
import { query } from '../../db/pool.js'
import { requirePermission, consumeApproval } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'
import { auditLog } from '../../lib/telemetry.js'
import {
  isGlassBoxEnabled, issueCredential, revokeCredential, reissueCredential,
  verifyCredential, getPublicKeyInfo,
} from '../../lib/credentials.js'

const router = Router()

// ── List ─────────────────────────────────────────────────────────────────────
router.get('/', requirePermission('credentials:read'), async (req, res) => {
  try {
    const { status, q } = req.query
    const where = []
    const params = []
    if (status) { params.push(String(status)); where.push(`c.status = $${params.length}`) }
    if (q) {
      params.push(String(q))
      where.push(`(c.credential_id::text = $${params.length} OR c.session_id::text = $${params.length})`)
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const r = await query(
      `SELECT c.credential_id, c.session_id, c.candidate_id, c.status, c.schema_version,
              c.key_id, c.supersedes, c.superseded_by, c.revoked_reason, c.issued_at,
              (SELECT COUNT(*)::int FROM audit_log a
                WHERE a.event_type = 'credential_verified_public'
                  AND a.payload->>'credentialId' = c.credential_id::text) AS verification_count
         FROM credentials c ${clause}
        ORDER BY c.issued_at DESC LIMIT 200`,
      params,
    )
    res.json({ credentials: r?.rows || [], glassBox: isGlassBoxEnabled() })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_credentials_list_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Signing key (public parts only, ever) ────────────────────────────────────
router.get('/signing-key', requirePermission('credentials:read'), async (req, res) => {
  try {
    const info = getPublicKeyInfo()
    const lastIssue = await query(
      'SELECT credential_id, issued_at FROM credentials ORDER BY issued_at DESC LIMIT 1',
    ).catch(() => null)
    res.json({
      configured: Boolean(info),
      keyId: info?.keyId || null,
      publicKeyPem: info?.publicKeyPem || null,
      algorithm: 'Ed25519',
      glassBox: isGlassBoxEnabled(),
      lastIssue: lastIssue?.rows?.[0] || null,
      note: 'The private signing key lives only in the PRISM_CREDENTIAL_SIGNING_KEY environment variable and is never displayed. Rotation is an operator env action followed by reissuance.',
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_signing_key_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Auditor package (PII-free by construction; every export ledgered) ────────
router.get('/audit-export', requirePermission('credentials:read'), async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10))
    const sessions = await query(
      `SELECT DISTINCT session_id FROM audit_log
        WHERE event_type = 'scoring_complete' ORDER BY session_id LIMIT $1`,
      [limit],
    )
    const out = []
    for (const row of sessions?.rows || []) {
      const sid = row.session_id
      const [events, responses, votes] = await Promise.all([
        query('SELECT event_type, payload, created_at FROM audit_log WHERE session_id = $1 ORDER BY id', [sid]),
        query(
          `SELECT response_id, exchange_no, latency_ms, asr_confidence, micro_levels
             FROM item_responses WHERE session_id = $1 ORDER BY exchange_no`, [sid],
        ),
        query(
          `SELECT jv.vote_no, jv.judge_model, jv.levels, jv.stability_flag, ir.exchange_no
             FROM judge_votes jv JOIN item_responses ir ON ir.response_id = jv.response_id
            WHERE ir.session_id = $1 ORDER BY ir.exchange_no, jv.vote_no`, [sid],
        ),
      ])
      out.push({
        sessionId: sid,
        decisionTrail: events?.rows || [],
        responses: responses?.rows || [],
        judgeVotes: votes?.rows || [],
      })
    }
    await query(
      `INSERT INTO admin_exports (export_id, admin_id, entity_type, filters, row_count, purpose)
       VALUES ($1,$2,'credential_audit_export',$3,$4,$5)`,
      [randomUUID(), req.admin.id, JSON.stringify({ limit }), out.length,
       req.query.purpose ? String(req.query.purpose).slice(0, 400) : 'auditor package'],
    )
    await adminAudit(req, {
      action: 'credential_audit_exported', entityType: 'export', entityId: null,
      after: { sessions: out.length },
    })
    res.json({ generatedAt: new Date().toISOString(), sessions: out.length, export: out })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_credential_export_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Bulk revoke (dual-approved, capped) ──────────────────────────────────────
router.post('/bulk-revoke', requirePermission('credentials:revoke'), async (req, res) => {
  try {
    const { credentialIds, reason } = req.body || {}
    if (!Array.isArray(credentialIds) || credentialIds.length === 0 || credentialIds.length > 50) {
      return res.status(400).json({ error: 'credentialIds must be a non-empty array of at most 50 ids.' })
    }
    if (!reason || String(reason).trim().length < 10) {
      return res.status(400).json({ error: 'A specific reason (>= 10 characters) is required.' })
    }
    const approval = await consumeApproval('bulk_revoke_credentials', 'batch')
    if (!approval) {
      return res.status(409).json({
        error: 'Bulk revocation requires dual approval. Raise a request with action "bulk_revoke_credentials" and entityId "batch", approved by a different administrator.',
        code: 'APPROVAL_REQUIRED',
      })
    }
    const revoked = []
    const skipped = []
    for (const id of credentialIds) {
      const ok = await revokeCredential(String(id), String(reason).trim())
      if (ok) {
        revoked.push(id)
        const c = await query('SELECT session_id FROM credentials WHERE credential_id = $1', [id])
        auditLog('credential_revoked', c?.rows?.[0]?.session_id || null, {
          by: 'admin_console', credentialId: id, bulk: true, reason: String(reason).trim(),
        })
      } else {
        skipped.push(id)
      }
    }
    await adminAudit(req, {
      action: 'credentials_bulk_revoked', entityType: 'credential', entityId: 'batch',
      after: { revoked: revoked.length, skipped }, reason: String(reason).trim(),
      approvalId: approval.approval_id,
    })
    res.json({ ok: true, revoked, skipped })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_bulk_revoke_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Detail + chain + verification analytics ──────────────────────────────────
router.get('/:credentialId', requirePermission('credentials:read'), async (req, res) => {
  try {
    const r = await query('SELECT * FROM credentials WHERE credential_id = $1', [req.params.credentialId])
    const credential = r?.rows?.[0]
    if (!credential) return res.status(404).json({ error: 'Credential not found.' })

    const chain = await query(
      `SELECT credential_id, status, bundle_hash, key_id, supersedes, superseded_by, revoked_reason, issued_at
         FROM credentials WHERE session_id = $1 ORDER BY issued_at`,
      [credential.session_id],
    )
    const verifications = await query(
      `SELECT payload, created_at FROM audit_log
        WHERE event_type = 'credential_verified_public'
          AND payload->>'credentialId' = $1
        ORDER BY created_at DESC LIMIT 25`,
      [req.params.credentialId],
    ).catch(() => null)
    const integrity = await verifyCredential(credential)

    res.json({
      credential: {
        credentialId: credential.credential_id,
        sessionId: credential.session_id,
        candidateId: credential.candidate_id,
        status: credential.status,
        schemaVersion: credential.schema_version,
        keyId: credential.key_id,
        bundleHash: credential.bundle_hash,
        supersedes: credential.supersedes,
        supersededBy: credential.superseded_by,
        revokedReason: credential.revoked_reason,
        issuedAt: credential.issued_at,
        // The signed bundle itself is available on the public verify surface
        // with the candidate-held share token; the console shows integrity,
        // not disclosure.
      },
      integrity,
      chain: chain?.rows || [],
      verifications: (verifications?.rows || []).map((v) => ({
        refererHost: v.payload?.refererHost || null,
        uaFamily: v.payload?.uaFamily || null,
        disclosure: v.payload?.disclosure || 'scores',
        at: v.created_at,
      })),
      publicVerifyPath: `/verify/${credential.session_id}`,
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_credential_detail_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Issue ────────────────────────────────────────────────────────────────────
router.post('/session/:sessionId/issue', requirePermission('credentials:issue'), async (req, res) => {
  try {
    if (!isGlassBoxEnabled()) {
      return res.status(503).json({
        error: 'Credential issuance is dark: PRISM_GLASS_BOX and the signing key must be configured.',
        code: 'GLASS_BOX_OFF',
      })
    }
    const existing = await query(
      `SELECT credential_id FROM credentials WHERE session_id = $1 AND status = 'active'`,
      [req.params.sessionId],
    )
    if (existing?.rows?.length) {
      return res.status(409).json({
        error: 'An active credential already exists for this session — reissue (supersession) is the correct action.',
        code: 'ACTIVE_EXISTS',
        credentialId: existing.rows[0].credential_id,
      })
    }
    const issued = await issueCredential(req.params.sessionId)
    if (!issued) return res.status(404).json({ error: 'No completed report for this session — nothing to certify.' })

    auditLog('credential_issued', req.params.sessionId, {
      by: 'admin_console', credentialId: issued.credentialId, keyId: issued.keyId,
    })
    await adminAudit(req, {
      action: 'credential_issued', entityType: 'credential', entityId: issued.credentialId,
      after: { sessionId: req.params.sessionId, keyId: issued.keyId },
      reason: req.body?.reason || null,
    })
    // shareToken is shown exactly once — the candidate holds it; only its hash is stored.
    res.status(201).json({ ok: true, ...issued })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_credential_issue_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Revoke ───────────────────────────────────────────────────────────────────
router.post('/:credentialId/revoke', requirePermission('credentials:revoke'), async (req, res) => {
  try {
    const { reason } = req.body || {}
    if (!reason || String(reason).trim().length < 10) {
      return res.status(400).json({ error: 'A specific reason (>= 10 characters) is required to revoke a credential.' })
    }
    const r = await query('SELECT session_id, status FROM credentials WHERE credential_id = $1', [req.params.credentialId])
    const cred = r?.rows?.[0]
    if (!cred) return res.status(404).json({ error: 'Credential not found.' })
    const ok = await revokeCredential(req.params.credentialId, String(reason).trim())
    if (!ok) {
      return res.status(409).json({ error: `Only active credentials can be revoked (this one is '${cred.status}').` })
    }
    auditLog('credential_revoked', cred.session_id, {
      by: 'admin_console', credentialId: req.params.credentialId, reason: String(reason).trim(),
    })
    await adminAudit(req, {
      action: 'credential_revoked', entityType: 'credential', entityId: req.params.credentialId,
      before: { status: 'active' }, after: { status: 'revoked' }, reason: String(reason).trim(),
    })
    res.json({ ok: true, status: 'revoked' })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_credential_revoke_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Reissue (supersession — the correction verb) ─────────────────────────────
router.post('/:credentialId/reissue', requirePermission('credentials:revoke'), async (req, res) => {
  try {
    const { reason } = req.body || {}
    if (!reason || String(reason).trim().length < 10) {
      return res.status(400).json({ error: 'A specific reason (>= 10 characters) is required to reissue.' })
    }
    if (!isGlassBoxEnabled()) {
      return res.status(503).json({ error: 'Credential issuance is dark: PRISM_GLASS_BOX and the signing key must be configured.', code: 'GLASS_BOX_OFF' })
    }
    const r = await query('SELECT session_id FROM credentials WHERE credential_id = $1', [req.params.credentialId])
    const cred = r?.rows?.[0]
    if (!cred) return res.status(404).json({ error: 'Credential not found.' })

    const issued = await reissueCredential(cred.session_id, req.params.credentialId)
    if (!issued) return res.status(409).json({ error: 'Reissue failed — no report evidence available.' })

    auditLog('credential_reissued', cred.session_id, {
      by: 'admin_console', oldCredentialId: req.params.credentialId,
      newCredentialId: issued.credentialId, reason: String(reason).trim(),
    })
    await adminAudit(req, {
      action: 'credential_reissued', entityType: 'credential', entityId: issued.credentialId,
      before: { supersedes: req.params.credentialId }, reason: String(reason).trim(),
    })
    res.status(201).json({ ok: true, ...issued, supersedes: req.params.credentialId })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_credential_reissue_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
