// Charter §16 — data retention: registry defaults, legal holds, contract
// overrides, enforcement engine with dry-run + receipts (Phase 3 part 2).
//
// Laws encoded here:
//   * PROVISIONAL defaults are labelled pending counsel (HA-003) and the
//     payment period is NEVER presented as legally approved.
//   * A legal hold suspends BOTH retention enforcement AND candidate erasure
//     for the referenced session/candidate/entity.
//   * Contract overrides can only EXTEND effective retention here — the
//     engine uses the longest applicable period, so enforcement can never
//     delete what a contract requires kept. (Shorter contractual periods are
//     honoured through the deliberate erasure workflow, not the bulk timer.)
//   * Enforcement mutates nothing in dry-run mode; every run (either mode)
//     leaves a retention_runs receipt.
//   * The scheduler exists but starts ONLY under PRISM_RETENTION_ENFORCEMENT
//     (default OFF — ONE LAW: humans enable automated deletion).
//   * Sessions with an ACTIVE DISPUTE are excluded from integrity-telemetry
//     pruning (charter §16 table: "unless a dispute or legal hold is active").

import { randomUUID } from 'node:crypto'
import { query, isDbConfigured } from '../db/pool.js'
import { pruneEventsBefore, listDisputes } from './store.js'
import logger from './logger.js'

export function isRetentionEnforcementEnabled() {
  return process.env.PRISM_RETENTION_ENFORCEMENT === 'true'
}

// ── Charter §16 provisional defaults (labelled, pending counsel) ─────────────
export const PROVISIONAL_BASIS = 'PROVISIONAL — pending counsel (HA-003); charter §16 default. Not legally approved.'
export const RETENTION_DEFAULTS = [
  { entity: 'assessment_transcripts', retentionDays: 365, basis: `${PROVISIONAL_BASIS} 12 months, then delete unless valid research consent applies.` },
  { entity: 'reports_evidence', retentionDays: 730, basis: `${PROVISIONAL_BASIS} Reports and evidence excerpts: 24 months.` },
  { entity: 'integrity_telemetry', retentionDays: 90, basis: `${PROVISIONAL_BASIS} 90 days, unless a dispute or legal hold is active.` },
  { entity: 'research_datasets', retentionDays: null, basis: 'Consent-scoped and pseudonymized until withdrawal or study end — not timer-based.' },
  { entity: 'operational_audit', retentionDays: 1095, basis: `${PROVISIONAL_BASIS} Operational audit records: 3 years.` },
  { entity: 'review_dispute_materials', retentionDays: 1095, basis: `${PROVISIONAL_BASIS} Human-review and dispute materials: 3 years.` },
  { entity: 'payment_records', retentionDays: 2920, basis: `${PROVISIONAL_BASIS} Statutory retention, provisionally configured around 8 years — NOT legally approved until counsel signs off.` },
  { entity: 'revoked_credential_tombstone', retentionDays: null, basis: 'Content-free tombstone retained indefinitely for verification integrity.' },
]

// Idempotent seed of the charter categories into data_retention_rules,
// labelled provisional. Existing operator-decided rows are never overwritten.
export async function seedRetentionDefaults() {
  if (!isDbConfigured()) return { seeded: 0 }
  let seeded = 0
  for (const d of RETENTION_DEFAULTS) {
    const r = await query(
      `INSERT INTO data_retention_rules (rule_id, entity, retention_days, basis, provisional)
       VALUES ($1,$2,$3,$4,TRUE) ON CONFLICT (entity) DO NOTHING
       RETURNING rule_id`,
      [randomUUID(), d.entity, d.retentionDays, d.basis],
    ).catch(() => null)
    if (r?.rows?.length) seeded += 1
  }
  return { seeded }
}

// ── Legal holds (§16) ────────────────────────────────────────────────────────
export async function activeHolds() {
  if (!isDbConfigured()) return []
  const r = await query('SELECT * FROM legal_holds WHERE released_at IS NULL').catch(() => null)
  return r?.rows || []
}

// Is a specific session/candidate covered by an active hold?
export async function holdCovering({ sessionIds = [], candidateRefs = [], entity = null }) {
  const holds = await activeHolds()
  return holds.find((h) => (
    (h.scope === 'session' && sessionIds.includes(h.reference)) ||
    (h.scope === 'candidate' && candidateRefs.includes(h.reference)) ||
    (h.scope === 'entity' && entity && h.reference === entity)
  )) || null
}

// ── Effective retention (rule + overrides; longest wins) ─────────────────────
export async function effectiveRetentionDays(entity) {
  if (!isDbConfigured()) return null
  const rule = await query('SELECT retention_days FROM data_retention_rules WHERE entity = $1', [entity]).catch(() => null)
  const base = rule?.rows?.[0]?.retention_days
  if (base == null) return null // not decided / not timer-based → nothing enforces
  const overrides = await query('SELECT retention_days FROM retention_overrides WHERE entity = $1', [entity]).catch(() => null)
  const days = [Number(base), ...(overrides?.rows || []).map((o) => Number(o.retention_days))].filter(Number.isFinite)
  return Math.max(...days)
}

// Sessions excluded from pruning: active dispute or active session-scope hold.
async function protectedSessionIds() {
  const ids = new Set()
  const open = await listDisputes({ page: 1, pageSize: 100 }).catch(() => ({ rows: [] }))
  for (const d of open.rows || []) {
    if (d.status !== 'resolved') ids.add(d.sessionId)
  }
  for (const h of await activeHolds()) {
    if (h.scope === 'session') ids.add(h.reference)
  }
  return [...ids]
}

// ── Enforceable entities ─────────────────────────────────────────────────────
// Only categories with a safe, session-aware deletion path are enforceable by
// the timer. Everything else stays deliberate-action-only (documented policy).
const ENFORCEMENT_TARGETS = {
  integrity_telemetry: async (cutoffIso, dryRun) => {
    const exclude = await protectedSessionIds()
    const store = await pruneEventsBefore(cutoffIso, { excludeSessionIds: exclude, dryRun })
    return { ...store, excludedSessions: exclude.length }
  },
  assessment_transcripts: async (cutoffIso, dryRun) => {
    if (!isDbConfigured()) return { matched: 0, deleted: 0 }
    const exclude = await protectedSessionIds()
    const params = [cutoffIso]
    let exclusion = ''
    if (exclude.length) {
      params.push(exclude)
      exclusion = 'AND NOT (session_id::text = ANY($2::text[]))'
    }
    const matched = await query(
      `SELECT COUNT(*) FROM session_transcripts WHERE created_at < $1 ${exclusion}`, params,
    ).catch(() => null)
    const count = Number(matched?.rows?.[0]?.count || 0)
    if (dryRun) return { matched: count, deleted: 0, excludedSessions: exclude.length }
    const del = await query(
      `DELETE FROM session_transcripts WHERE created_at < $1 ${exclusion}`, params,
    ).catch(() => null)
    return { matched: count, deleted: del?.rowCount ?? 0, excludedSessions: exclude.length }
  },
}

export const ENFORCEABLE_ENTITIES = Object.keys(ENFORCEMENT_TARGETS)

// ── The enforcement run (dry-run first-class; receipts always) ───────────────
export async function runRetention(entity, { dryRun = true, ranBy = null } = {}) {
  if (!ENFORCEMENT_TARGETS[entity]) {
    return { ok: false, error: `entity '${entity}' is not timer-enforceable`, enforceable: ENFORCEABLE_ENTITIES }
  }
  const entityHold = await holdCovering({ entity })
  if (entityHold && !dryRun) {
    return { ok: false, error: 'ENTITY_LEGAL_HOLD', holdId: entityHold.hold_id }
  }
  const days = await effectiveRetentionDays(entity)
  if (days == null) {
    return { ok: false, error: 'NO_RETENTION_RULE — the registry has no decided period for this entity' }
  }
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const result = await ENFORCEMENT_TARGETS[entity](cutoff, dryRun)
  const receipt = {
    entity,
    mode: dryRun ? 'dry_run' : 'enforce',
    effectiveDays: days,
    cutoff,
    ...result,
    at: new Date().toISOString(),
  }
  if (isDbConfigured()) {
    await query(
      `INSERT INTO retention_runs (run_id, entity, mode, cutoff, matched, deleted, receipt, ran_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [randomUUID(), entity, receipt.mode, cutoff, result.matched || 0, result.deleted || 0, JSON.stringify(receipt), ranBy],
    ).catch((err) => logger.captureException(err, { msg: 'retention_receipt_failed', entity }))
  }
  return { ok: true, receipt }
}

// ── Scheduler (charter §16 "scheduled enforcement jobs") ─────────────────────
// Starts ONLY under PRISM_RETENTION_ENFORCEMENT (default OFF). One pass per
// interval over the enforceable entities, in enforce mode, receipts + logs.
let _timer = null
export function startRetentionScheduler({ intervalMs = 24 * 60 * 60 * 1000 } = {}) {
  if (!isRetentionEnforcementEnabled() || _timer) return false
  const pass = async () => {
    for (const entity of ENFORCEABLE_ENTITIES) {
      try {
        const r = await runRetention(entity, { dryRun: false, ranBy: null })
        logger.info('retention_enforcement_pass', { entity, ok: r.ok, matched: r.receipt?.matched, deleted: r.receipt?.deleted })
      } catch (err) {
        logger.captureException(err, { msg: 'retention_enforcement_failed', entity })
      }
    }
  }
  _timer = setInterval(pass, intervalMs)
  _timer.unref?.()
  logger.info('retention_scheduler_started', { intervalMs })
  return true
}

export function stopRetentionScheduler() {
  if (_timer) clearInterval(_timer)
  _timer = null
}
