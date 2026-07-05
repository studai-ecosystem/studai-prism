// Track 2 — glass-box credential engine.
//
// Assembles the canonical evidence bundle for a completed assessment, signs it
// with a Prism-held Ed25519 key, and verifies/revokes/supersedes credentials.
//
// Claim discipline (T2.5): the ONLY claim this module supports is
// "cryptographically verifiable evidence chain". Nothing here is "tamper-proof",
// "blockchain", or "regulator-approved", and no copy may say so.
//
//   PRISM_GLASS_BOX=true                 enable issuance (default OFF — dark)
//   PRISM_CREDENTIAL_SIGNING_KEY=<b64>   base64 PKCS8 DER Ed25519 private key.
//                                        No key → issuance disabled. There is
//                                        deliberately NO dev fallback key
//                                        (audit C8 lesson: fallback secrets rot
//                                        into production).
// Generate a key:  node -e "const {generateKeyPairSync}=require('crypto');
//   console.log(generateKeyPairSync('ed25519').privateKey
//     .export({type:'pkcs8',format:'der'}).toString('base64'))"

import { createHash, createPrivateKey, createPublicKey, sign as edSign, verify as edVerify, randomUUID } from 'node:crypto'
import { query, isDbConfigured } from '../db/pool.js'
import { getReport, getEvents, getConsent, getSession } from './store.js'
import { DIMENSION_KEYS, DIMENSION_WEIGHTS, SCALE_VERSION, SCORE_VALIDITY_MONTHS, CONSENT_VERSION } from './sharedConstants.js'
import { activeFlagSnapshot } from './telemetry.js'
import logger from './logger.js'

export function isGlassBoxEnabled() {
  return process.env.PRISM_GLASS_BOX === 'true' && Boolean(process.env.PRISM_CREDENTIAL_SIGNING_KEY) && isDbConfigured()
}

// ── canonical JSON ───────────────────────────────────────────────────────────
// Deterministic serialization: recursively sorted keys, no whitespace. The
// SAME bytes must be reproducible from the stored bundle for verification.
export function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(',')}}`
}

export const sha256hex = (s) => createHash('sha256').update(s).digest('hex')

// ── keys ─────────────────────────────────────────────────────────────────────
let _keys = null
function keys() {
  if (_keys) return _keys
  const b64 = process.env.PRISM_CREDENTIAL_SIGNING_KEY
  if (!b64) return null
  const privateKey = createPrivateKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'pkcs8' })
  const publicKey = createPublicKey(privateKey)
  const publicDer = publicKey.export({ type: 'spki', format: 'der' })
  _keys = { privateKey, publicKey, keyId: sha256hex(publicDer).slice(0, 16), publicPem: publicKey.export({ type: 'spki', format: 'pem' }) }
  return _keys
}

export function getPublicKeyInfo() {
  const k = keys()
  return k ? { keyId: k.keyId, publicKeyPem: k.publicPem, algorithm: 'Ed25519' } : null
}

// The prompt set that governs scoring at issuance time — versioned files, so
// the credential records exactly which rubric text produced the result.
function activePromptVersions() {
  const base = ['judge_full.v1', 'avatar_system.v1', 'avatar_styles.v1', 'dimension_rubric.v1', 'opening_turn.v1', 'calibration_tier.v1']
  if (process.env.PRISM_V2_EXECUTIVE === 'true') base.push('entry_estimator.v1', 'micro_rater.v1')
  if (process.env.PRISM_V2_DUAL_SCORER === 'true') base.push('judge_turn.v1')
  return base.sort()
}

// ── T2.1 evidence bundle assembly ────────────────────────────────────────────
// Pseudonymous by construction: session/candidate ids only — NEVER name/email.
// Every section that depends on an optional subsystem is present-but-null when
// that subsystem is off, so the schema is stable.
export async function assembleEvidenceBundle(sessionId) {
  const report = await getReport(sessionId)
  if (!report) return null
  const session = await getSession(sessionId).catch(() => null)
  const consent = await getConsent(sessionId).catch(() => null)
  const events = await getEvents(sessionId).catch(() => [])

  // Integrity summary: counts per event type, never raw payloads.
  const integrity = {}
  for (const e of events || []) integrity[e.type] = (integrity[e.type] || 0) + 1

  // Per-vote judge records (dual scorer) + timeline stamps, when telemetry is on.
  let judgeVotes = null
  let timeline = null
  if (isDbConfigured()) {
    const votes = await query(
      `SELECT jv.judge_model, jv.vote_no, jv.levels, jv.stability_flag, ir.exchange_no
         FROM judge_votes jv JOIN item_responses ir ON ir.response_id = jv.response_id
        WHERE ir.session_id = $1 ORDER BY ir.exchange_no, jv.vote_no`,
      [sessionId],
    ).catch(() => null)
    if (votes?.rows?.length) {
      judgeVotes = votes.rows.map((v) => ({
        exchangeNo: v.exchange_no, voteNo: v.vote_no, judgeModel: v.judge_model,
        levels: v.levels, stability: v.stability_flag,
      }))
    }
    const tl = await query(
      'SELECT attempt_no, scale_version, calibration_run_id, consent_version, flags_active, is_synthetic FROM assessment_timeline WHERE session_id = $1',
      [sessionId],
    ).catch(() => null)
    timeline = tl?.rows?.[0] || null
  }

  const scores = report.scores || {}
  return {
    schema: 'evidence-bundle-v1',
    sessionId,
    candidateId: session?.candidateId || timeline?.candidate_id || null,
    issued: {
      scaleVersion: timeline?.scale_version || SCALE_VERSION,
      calibrationRunId: timeline?.calibration_run_id || null,
      validityMonths: report.validityMonths || SCORE_VALIDITY_MONTHS,
      attemptNo: timeline?.attempt_no ?? null,
      isSynthetic: timeline?.is_synthetic ?? null,
    },
    scenario: report.scenario || null,
    scores: {
      overall: scores.overall ?? null,
      dimensions: Object.fromEntries(DIMENSION_KEYS.map((k) => [k, scores[k] ?? null])),
      weights: DIMENSION_WEIGHTS,
      arithmetic: DIMENSION_KEYS.map((k) => ({ dimension: k, score: scores[k] ?? null, weight: DIMENSION_WEIGHTS[k], contribution: scores[k] != null ? +(scores[k] * DIMENSION_WEIGHTS[k]).toFixed(2) : null })),
    },
    reliability: report.reliability || null,
    confidenceInterval: report.confidenceInterval || null,
    evidence: report.evidence || null, // per-dimension transcript quotes (disclosure-gated at the API)
    judgeVotes,
    integrityEvents: integrity,
    consent: {
      version: consent?.meta?.consentVersion || session?.consentVersion || null,
      currentCopyVersion: CONSENT_VERSION,
      scopes: consent?.scopes || null,
    },
    provenance: {
      promptVersions: activePromptVersions(),
      flagsActive: activeFlagSnapshot(),
      judgeDeployment: process.env.AZURE_OPENAI_DEPLOYMENT || null,
    },
  }
}

// Runtime PII guard (RULE 2): the signed bundle must never carry identity keys.
const PII_KEYS = /^(name|fullName|userName|email|userEmail|phone|aadhaar\w*|dob|college|rollNumber|fathersName)$/i
export function assertBundlePseudonymous(bundle, path = '') {
  if (!bundle || typeof bundle !== 'object') return
  for (const [k, v] of Object.entries(bundle)) {
    if (PII_KEYS.test(k)) throw new Error(`evidence bundle carries PII key at ${path}${k}`)
    if (v && typeof v === 'object') assertBundlePseudonymous(v, `${path}${k}.`)
  }
}

// ── T2.2 issuance & verification ─────────────────────────────────────────────
export async function issueCredential(sessionId, { supersedes = null } = {}) {
  if (!isGlassBoxEnabled()) return null
  const k = keys()
  const bundle = await assembleEvidenceBundle(sessionId)
  if (!bundle) return null
  assertBundlePseudonymous(bundle)

  const canonical = canonicalStringify(bundle)
  const bundleHash = sha256hex(canonical)
  const signature = edSign(null, Buffer.from(bundleHash, 'hex'), k.privateKey).toString('base64')
  const credentialId = randomUUID()
  const shareToken = randomUUID().replaceAll('-', '')

  await query(
    `INSERT INTO credentials
       (credential_id, session_id, candidate_id, bundle, bundle_hash, signature, key_id, supersedes, share_token_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [credentialId, sessionId, bundle.candidateId, canonical, bundleHash, signature, k.keyId, supersedes, sha256hex(shareToken)],
  )
  if (supersedes) {
    await query(
      `UPDATE credentials SET status = 'superseded', superseded_by = $2 WHERE credential_id = $1`,
      [supersedes, credentialId],
    )
  }
  logger.info('credential_issued', { credentialId, sessionId, keyId: k.keyId })
  // shareToken is returned ONCE (candidate-held; only its hash is stored).
  return { credentialId, bundleHash, keyId: k.keyId, shareToken }
}

// Recomputes the canonical hash from the STORED bundle and checks the signature.
// Any single-byte drift between stored bundle and signed hash fails closed.
export async function verifyCredential(credential) {
  const k = keys()
  const canonical = typeof credential.bundle === 'string' ? credential.bundle : canonicalStringify(credential.bundle)
  const recomputedHash = sha256hex(canonical)
  const hashMatches = recomputedHash === credential.bundle_hash
  let signatureValid = false
  if (k && credential.key_id === k.keyId) {
    signatureValid = edVerify(null, Buffer.from(credential.bundle_hash, 'hex'), k.publicKey, Buffer.from(credential.signature, 'base64'))
  }
  return {
    hashMatches,
    signatureValid,
    verified: hashMatches && signatureValid,
    recomputedHash,
    keyId: credential.key_id,
    status: credential.status,
  }
}

export async function getLatestCredential(sessionId) {
  if (!isDbConfigured()) return null
  const r = await query(
    'SELECT * FROM credentials WHERE session_id = $1 ORDER BY issued_at DESC LIMIT 1',
    [sessionId],
  )
  return r?.rows?.[0] || null
}

export async function getCredentialChain(sessionId) {
  if (!isDbConfigured()) return []
  const r = await query(
    'SELECT credential_id, status, bundle_hash, key_id, supersedes, superseded_by, revoked_reason, issued_at FROM credentials WHERE session_id = $1 ORDER BY issued_at',
    [sessionId],
  )
  return r?.rows || []
}

// ── T2.3 revocation & correction ─────────────────────────────────────────────
export async function revokeCredential(credentialId, reason) {
  const r = await query(
    `UPDATE credentials SET status = 'revoked', revoked_reason = $2 WHERE credential_id = $1 AND status = 'active' RETURNING credential_id`,
    [credentialId, String(reason || 'revoked').slice(0, 500)],
  )
  return Boolean(r?.rows?.length)
}

// Correction = revoke nothing silently: issue a NEW credential superseding the
// old (both visible in the chain forever).
export async function reissueCredential(sessionId, oldCredentialId) {
  return issueCredential(sessionId, { supersedes: oldCredentialId })
}
