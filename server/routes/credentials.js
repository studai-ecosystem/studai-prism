// Track 2 — credential verification & lifecycle routes.
//
//   Public:  GET /api/credentials/public-key
//            GET /api/credentials/:sessionId/verify[?disclosure=<shareToken>]
//            GET /api/credentials/id/:credentialId/status   (revocation check)
//   Admin (x-admin-token):
//            POST /api/credentials/:sessionId/issue
//            POST /api/credentials/id/:credentialId/revoke
//            POST /api/credentials/:sessionId/reissue
//            GET  /api/credentials/audit-export?limit=N      (T2.4, PII-free)

import { Router } from 'express'
import { createHash } from 'node:crypto'
import logger from '../lib/logger.js'
import { query, isDbConfigured } from '../db/pool.js'
import { auditLog } from '../lib/telemetry.js'
import { legacyAdminGuard } from '../lib/adminAuth.js'
import {
  isGlassBoxEnabled,
  getPublicKeyInfo,
  issueCredential,
  reissueCredential,
  revokeCredential,
  verifyCredential,
  getLatestCredential,
  getCredentialChain,
} from '../lib/credentials.js'

const router = Router()
const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex')

// Phase 6 migration: console session (credentials:revoke covers this admin
// half) OR legacy token (timing-safe; retired via PRISM_ADMIN_TOKEN_DISABLED).
const adminGuard = legacyAdminGuard('credentials:revoke')
function requireAdmin(req, res, next) {
  adminGuard(req, res, () => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'no database configured' })
    next()
  })
}

// ── Public ───────────────────────────────────────────────────────────────────
router.get('/public-key', (_req, res) => {
  const info = getPublicKeyInfo()
  if (!info) return res.status(503).json({ error: 'credential signing not configured' })
  res.json(info)
})

// Verification: recompute hash from the stored bundle, check the signature,
// return the disclosure-appropriate view. Default view = scores + integrity +
// methodology (privacy default). Full evidence quotes require the candidate's
// share token. Both views render from the SAME signed bundle.
router.get('/:sessionId/verify', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'not available' })
  try {
    const credential = await getLatestCredential(req.params.sessionId)
    if (!credential) return res.status(404).json({ error: 'no credential issued for this session' })
    const verification = await verifyCredential(credential)
    const chain = await getCredentialChain(req.params.sessionId)

    // Phase 3 Stage 5: verification analytics — the employer-demand signal.
    // Pseudonymous by construction: referrer HOST + UA family only, no IPs.
    try {
      const referer = req.get('referer') ? new URL(req.get('referer')).host : null
      const ua = req.get('user-agent') || ''
      auditLog('credential_verified_public', req.params.sessionId, {
        credentialId: credential.credential_id,
        refererHost: referer,
        uaFamily: /bot|crawl|spider/i.test(ua) ? 'bot' : ua.split('/')[0].slice(0, 40) || null,
        disclosure: typeof req.query.disclosure === 'string' ? 'token-attempted' : 'scores',
      })
    } catch { /* analytics must never break verification */ }

    const bundle = typeof credential.bundle === 'string' ? JSON.parse(credential.bundle) : credential.bundle
    const fullDisclosure =
      typeof req.query.disclosure === 'string' &&
      credential.share_token_hash &&
      sha256(req.query.disclosure) === credential.share_token_hash

    const view = {
      schema: bundle.schema,
      sessionId: bundle.sessionId,
      issued: bundle.issued,
      scenario: bundle.scenario,
      scores: bundle.scores,
      reliability: bundle.reliability,
      confidenceInterval: bundle.confidenceInterval,
      integrityEvents: bundle.integrityEvents,
      consent: { version: bundle.consent?.version || null },
      provenance: bundle.provenance,
      ...(fullDisclosure ? { evidence: bundle.evidence, judgeVotes: bundle.judgeVotes } : {}),
    }

    res.json({
      credentialId: credential.credential_id,
      status: credential.status,
      revokedReason: credential.revoked_reason || undefined,
      verification,
      disclosure: fullDisclosure ? 'full' : 'scores',
      bundleHash: credential.bundle_hash,
      keyId: credential.key_id,
      issuedAt: credential.issued_at,
      chain,
      view,
      // T2.2: W3C Verifiable Credential rendering of the SAME signed bundle
      // (data-model envelope; proof = the stored Ed25519 signature over the
      // canonical bundle hash). Claim discipline: this is a "cryptographically
      // verifiable evidence chain" — nothing stronger.
      ...(req.query.format === 'vc'
        ? {
            verifiableCredential: {
              '@context': ['https://www.w3.org/ns/credentials/v2'],
              type: ['VerifiableCredential', 'PrismSkillAssessmentCredential'],
              issuer: `did:web:prism.studai.one#${credential.key_id}`,
              validFrom: credential.issued_at,
              credentialStatus: {
                id: `https://prism.studai.one/api/credentials/id/${credential.credential_id}/status`,
                type: 'PrismRevocationStatus',
              },
              credentialSubject: {
                id: `urn:uuid:${req.params.sessionId}`, // pseudonymous session id — never identity
                evidenceBundle: view, // disclosure-appropriate view of the signed bundle
                bundleHash: credential.bundle_hash,
                schema: 'https://prism.studai.one/docs/evidence-bundle-schema-v1.json',
              },
              proof: {
                type: 'Ed25519Signature2020',
                created: credential.issued_at,
                verificationMethod: `did:web:prism.studai.one#${credential.key_id}`,
                proofPurpose: 'assertionMethod',
                proofValue: credential.signature,
                // The signature is over sha256(canonical bundle) — verify via
                // GET /api/credentials/public-key + the published schema.
              },
            },
          }
        : {}),
    })
  } catch (err) {
    logger.captureException(err, { msg: 'credential_verify_failed', requestId: req.requestId })
    res.status(500).json({ error: 'verification failed' })
  }
})

// Revocation-status endpoint (T2.3) — minimal, cacheable, no bundle content.
router.get('/id/:credentialId/status', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'not available' })
  const r = await query(
    'SELECT credential_id, status, revoked_reason, superseded_by, issued_at FROM credentials WHERE credential_id = $1',
    [req.params.credentialId],
  )
  if (!r?.rows?.length) return res.status(404).json({ error: 'unknown credential' })
  res.json(r.rows[0])
})

// ── Admin ────────────────────────────────────────────────────────────────────
router.post('/:sessionId/issue', requireAdmin, async (req, res) => {
  if (!isGlassBoxEnabled()) return res.status(503).json({ error: 'glass box disabled (PRISM_GLASS_BOX + signing key required)' })
  try {
    const issued = await issueCredential(req.params.sessionId)
    if (!issued) return res.status(404).json({ error: 'no completed report for this session' })
    res.status(201).json(issued) // shareToken returned ONCE
  } catch (err) {
    logger.captureException(err, { msg: 'credential_issue_failed' })
    res.status(500).json({ error: 'issuance failed' })
  }
})

router.post('/id/:credentialId/revoke', requireAdmin, async (req, res) => {
  const ok = await revokeCredential(req.params.credentialId, req.body?.reason)
  if (!ok) return res.status(404).json({ error: 'not found or not active' })
  res.json({ ok: true, credentialId: req.params.credentialId, status: 'revoked' })
})

router.post('/:sessionId/reissue', requireAdmin, async (req, res) => {
  if (!isGlassBoxEnabled()) return res.status(503).json({ error: 'glass box disabled' })
  const { oldCredentialId } = req.body || {}
  if (!oldCredentialId) return res.status(400).json({ error: 'oldCredentialId required' })
  try {
    const issued = await reissueCredential(req.params.sessionId, oldCredentialId)
    if (!issued) return res.status(404).json({ error: 'no completed report for this session' })
    res.status(201).json(issued)
  } catch (err) {
    logger.captureException(err, { msg: 'credential_reissue_failed' })
    res.status(500).json({ error: 'reissue failed' })
  }
})

// ── T2.4 auditor export ──────────────────────────────────────────────────────
// The complete decision trail a psychometric auditor needs, for a sample of
// sessions, PII-stripped BY CONSTRUCTION: audit events + judge votes + micro
// levels + timing — never candidate free text, never identity fields.
router.get('/audit-export', requireAdmin, async (req, res) => {
  const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10))
  try {
    const sessions = await query(
      `SELECT DISTINCT session_id FROM audit_log
        WHERE event_type = 'scoring_complete'
        ORDER BY session_id LIMIT $1`,
      [limit],
    )
    const out = []
    for (const row of sessions?.rows || []) {
      const sid = row.session_id
      const events = await query(
        'SELECT event_type, payload, created_at FROM audit_log WHERE session_id = $1 ORDER BY id',
        [sid],
      )
      const responses = await query(
        `SELECT response_id, exchange_no, latency_ms, asr_confidence, micro_levels
           FROM item_responses WHERE session_id = $1 ORDER BY exchange_no`,
        [sid],
      )
      const votes = await query(
        `SELECT jv.vote_no, jv.judge_model, jv.levels, jv.stability_flag, ir.exchange_no
           FROM judge_votes jv JOIN item_responses ir ON ir.response_id = jv.response_id
          WHERE ir.session_id = $1 ORDER BY ir.exchange_no, jv.vote_no`,
        [sid],
      )
      out.push({
        sessionId: sid,
        decisionTrail: events?.rows || [],
        responses: responses?.rows || [],
        judgeVotes: votes?.rows || [],
      })
    }
    res.json({ generatedAt: new Date().toISOString(), sessions: out.length, export: out })
  } catch (err) {
    logger.captureException(err, { msg: 'audit_export_failed' })
    res.status(500).json({ error: 'export failed' })
  }
})

export default router
