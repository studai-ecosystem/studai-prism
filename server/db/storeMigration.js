// Charter §20 — JSON/EFS store → PostgreSQL system-of-record migration.
//
// Copies every bucket of the JSON store (assessments.json) and the JSON user
// store (users.json) into the v1_* PostgreSQL tables, PRESERVING original
// timestamps and record fields (no store-function semantics such as
// "createSession consumes the entitlement" are re-applied — this is a copy,
// not a replay). Then reconciles through the PUBLIC read paths of both
// backends: after migration, storePg/dbPg must serve records that are
// canonically identical to what storeJson/dbJson serve.
//
// Safety properties:
//   • dry-run by default — counts what WOULD copy, writes nothing;
//   • idempotent upserts for all keyed buckets;
//   • append-only buckets (events, items) are copied only for sessions that
//     have ZERO existing PG rows, so re-runs never duplicate telemetry;
//   • reconciliation evidence: per-bucket row counts + SHA-256 over the
//     canonical serialization of every record set (charter §20 requirement).
//
// The production cutover itself (backup → final sync → PRISM_PG_STORE flip)
// is HUMAN-GATED — see docs/PG_MIGRATION_RUNBOOK_v1.md and HA-023. This module
// never touches PRISM_PG_STORE.

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { promises as fs } from 'fs'
import { query } from './pool.js'
import { canonicalStringify, sha256hex } from '../lib/credentials.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', 'data')
const STORE_FILE = join(DATA_DIR, 'assessments.json')
const USERS_FILE = join(DATA_DIR, 'users.json')

// ── JSON snapshot (raw source of truth) ──────────────────────────────────────

async function readJsonFile(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf-8'))
  } catch {
    return fallback
  }
}

export async function readJsonSnapshot() {
  const store = await readJsonFile(STORE_FILE, {})
  const users = await readJsonFile(USERS_FILE, { users: [] })
  return {
    users: Array.isArray(users.users) ? users.users : [],
    sessions: store.sessions || {},
    payments: store.payments || {},
    reports: store.reports || {},
    events: Array.isArray(store.events) ? store.events : [],
    items: Array.isArray(store.items) ? store.items : [],
    calibrations: store.calibrations || {},
    consents: store.consents || {},
    disputes: store.disputes || {},
    verifications: store.verifications || {},
    deviceLinks: store.deviceLinks || {},
    accommodations: store.accommodations || {},
  }
}

// ── Copy (preserving original fields/timestamps) ─────────────────────────────

async function copyUsers(users, apply) {
  let copied = 0
  for (const u of users) {
    if (!u?.id || !u?.email) continue
    copied += 1
    if (!apply) continue
    await query(
      `INSERT INTO v1_users (id, email, name, college, year, password_hash,
         candidate_id, account_state, token_version, age_declaration, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email, name = EXCLUDED.name, college = EXCLUDED.college,
         year = EXCLUDED.year, password_hash = EXCLUDED.password_hash,
         candidate_id = EXCLUDED.candidate_id, account_state = EXCLUDED.account_state,
         token_version = EXCLUDED.token_version, age_declaration = EXCLUDED.age_declaration,
         created_at = EXCLUDED.created_at`,
      [u.id, u.email, u.name || '', u.college || '', u.year || '', u.passwordHash || null,
        u.candidateId || null, u.accountState || 'active', u.tokenVersion ?? 0,
        u.ageDeclaration ? JSON.stringify(u.ageDeclaration) : null,
        u.createdAt || new Date().toISOString()],
    )
  }
  return copied
}

async function copyPayments(payments, apply) {
  let copied = 0
  for (const rec of Object.values(payments)) {
    if (!rec?.sessionId) continue
    copied += 1
    if (!apply) continue
    await query(
      `INSERT INTO v1_payments (session_id, payment_id, order_id, amount, mode, consumed, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (session_id) DO UPDATE SET
         payment_id = EXCLUDED.payment_id, order_id = EXCLUDED.order_id,
         amount = EXCLUDED.amount, mode = EXCLUDED.mode, consumed = EXCLUDED.consumed,
         created_at = EXCLUDED.created_at`,
      [rec.sessionId, rec.paymentId ?? null, rec.orderId ?? null, rec.amount ?? null,
        rec.mode || 'paid', Boolean(rec.consumed), rec.createdAt || new Date().toISOString()],
    )
  }
  return copied
}

async function copySessions(sessions, apply) {
  let copied = 0
  for (const rec of Object.values(sessions)) {
    if (!rec?.sessionId) continue
    copied += 1
    if (!apply) continue
    const { sessionId, scenarioId = null, userId = null, userEmail = null,
      startedAt = null, completedAt = null, updatedAt = null, ...rest } = rec
    await query(
      `INSERT INTO v1_sessions (session_id, scenario_id, user_id, user_email, data, started_at, completed_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (session_id) DO UPDATE SET
         scenario_id = EXCLUDED.scenario_id, user_id = EXCLUDED.user_id,
         user_email = EXCLUDED.user_email, data = EXCLUDED.data,
         started_at = EXCLUDED.started_at, completed_at = EXCLUDED.completed_at,
         updated_at = EXCLUDED.updated_at`,
      [sessionId, scenarioId, userId, userEmail, JSON.stringify(rest),
        startedAt, completedAt, updatedAt],
    )
  }
  return copied
}

async function copyReports(reports, apply) {
  let copied = 0
  for (const rec of Object.values(reports)) {
    if (!rec?.sessionId) continue
    copied += 1
    if (!apply) continue
    const overall = typeof rec?.composite?.value === 'number'
      ? rec.composite.value
      : typeof rec?.scores?.overall === 'number' ? rec.scores.overall : null
    await query(
      `INSERT INTO v1_reports (session_id, user_id, overall, report, issued_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (session_id) DO UPDATE SET
         user_id = EXCLUDED.user_id, overall = EXCLUDED.overall,
         report = EXCLUDED.report, issued_at = EXCLUDED.issued_at`,
      [rec.sessionId, rec.userId || null, overall, JSON.stringify(rec),
        rec.issuedAt || new Date().toISOString()],
    )
  }
  return copied
}

// Append-only telemetry: copied ONLY for sessions with zero existing PG rows
// so re-running the migration never duplicates rows.
async function copyAppendOnly(table, records, apply, rowParams) {
  const bySession = new Map()
  for (const rec of records) {
    const sid = rec?.sessionId ?? null
    if (!bySession.has(sid)) bySession.set(sid, [])
    bySession.get(sid).push(rec)
  }
  let copied = 0
  let skippedSessions = 0
  for (const [sid, recs] of bySession) {
    const existing = await query(`SELECT 1 FROM ${table} WHERE session_id ${sid === null ? 'IS NULL' : '= $1'} LIMIT 1`, sid === null ? [] : [sid])
    if (existing?.rows?.length) { skippedSessions += 1; continue }
    copied += recs.length
    if (!apply) continue
    for (const rec of recs) {
      const { sql, params } = rowParams(rec)
      await query(sql, params)
    }
  }
  return { copied, skippedSessions }
}

async function copyKeyed(table, records, apply, toRow) {
  let copied = 0
  for (const rec of Object.values(records)) {
    const row = toRow(rec)
    if (!row) continue
    copied += 1
    if (!apply) continue
    await query(row.sql, row.params)
  }
  return copied
}

export async function migrateJsonStoreToPg({ dryRun = true } = {}) {
  const startedAt = new Date().toISOString()
  const snap = await readJsonSnapshot()
  const apply = !dryRun
  const buckets = {}

  buckets.users = { jsonCount: snap.users.length, copied: await copyUsers(snap.users, apply) }
  buckets.payments = { jsonCount: Object.keys(snap.payments).length, copied: await copyPayments(snap.payments, apply) }
  buckets.sessions = { jsonCount: Object.keys(snap.sessions).length, copied: await copySessions(snap.sessions, apply) }
  buckets.reports = { jsonCount: Object.keys(snap.reports).length, copied: await copyReports(snap.reports, apply) }

  const events = await copyAppendOnly('v1_events', snap.events, apply, (e) => ({
    sql: 'INSERT INTO v1_events (session_id, type, meta, at) VALUES ($1,$2,$3,$4)',
    params: [e.sessionId ?? null, e.type ?? null, JSON.stringify(e.meta ?? {}), e.at || new Date().toISOString()],
  }))
  buckets.events = { jsonCount: snap.events.length, ...events }

  const items = await copyAppendOnly('v1_items', snap.items, apply, (it) => ({
    sql: 'INSERT INTO v1_items (session_id, item, at) VALUES ($1,$2,$3)',
    params: [it.sessionId ?? null, JSON.stringify(it), it.at || new Date().toISOString()],
  }))
  buckets.items = { jsonCount: snap.items.length, ...items }

  buckets.calibrations = {
    jsonCount: Object.keys(snap.calibrations).length,
    copied: await copyKeyed('v1_calibrations', snap.calibrations, apply, (rec) => rec?.sessionId && {
      sql: `INSERT INTO v1_calibrations (session_id, data, at) VALUES ($1,$2,$3)
            ON CONFLICT (session_id) DO UPDATE SET data = EXCLUDED.data, at = EXCLUDED.at`,
      params: [rec.sessionId, JSON.stringify(rec), rec.at || new Date().toISOString()],
    }),
  }
  buckets.consents = {
    jsonCount: Object.keys(snap.consents).length,
    copied: await copyKeyed('v1_consents', snap.consents, apply, (rec) => rec?.sessionId && {
      sql: `INSERT INTO v1_consents (session_id, scopes, meta, at) VALUES ($1,$2,$3,$4)
            ON CONFLICT (session_id) DO UPDATE SET scopes = EXCLUDED.scopes, meta = EXCLUDED.meta, at = EXCLUDED.at`,
      params: [rec.sessionId, JSON.stringify(rec.scopes ?? []), JSON.stringify(rec.meta ?? {}), rec.at || new Date().toISOString()],
    }),
  }
  buckets.disputes = {
    jsonCount: Object.keys(snap.disputes).length,
    copied: await copyKeyed('v1_disputes', snap.disputes, apply, (rec) => rec?.sessionId && {
      sql: `INSERT INTO v1_disputes (session_id, reason, contact, status, at, resolution) VALUES ($1,$2,$3,$4,$5,$6)
            ON CONFLICT (session_id) DO UPDATE SET reason = EXCLUDED.reason, contact = EXCLUDED.contact,
              status = EXCLUDED.status, at = EXCLUDED.at, resolution = EXCLUDED.resolution`,
      params: [rec.sessionId, rec.reason ?? null, rec.contact ?? null, rec.status || 'open',
        rec.at || new Date().toISOString(), rec.resolution ? JSON.stringify(rec.resolution) : null],
    }),
  }
  buckets.verifications = {
    jsonCount: Object.keys(snap.verifications).length,
    copied: await copyKeyed('v1_verifications', snap.verifications, apply, (rec) => rec?.sessionId && {
      sql: `INSERT INTO v1_verifications (session_id, data, at) VALUES ($1,$2,$3)
            ON CONFLICT (session_id) DO UPDATE SET data = EXCLUDED.data, at = EXCLUDED.at`,
      params: [rec.sessionId, JSON.stringify(rec), rec.at || new Date().toISOString()],
    }),
  }
  buckets.deviceLinks = {
    jsonCount: Object.keys(snap.deviceLinks).length,
    copied: await copyKeyed('v1_device_links', snap.deviceLinks, apply, (rec) => rec?.pairCode && {
      sql: `INSERT INTO v1_device_links (pair_code, session_id, status, phone_user_agent, created_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6)
            ON CONFLICT (pair_code) DO UPDATE SET session_id = EXCLUDED.session_id, status = EXCLUDED.status,
              phone_user_agent = EXCLUDED.phone_user_agent, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at`,
      params: [rec.pairCode, rec.sessionId || '', rec.status || 'pending', rec.phoneUserAgent || '',
        rec.createdAt || new Date().toISOString(), rec.updatedAt || new Date().toISOString()],
    }),
  }
  buckets.accommodations = {
    jsonCount: Object.keys(snap.accommodations).length,
    copied: await copyKeyed('v1_accommodations', snap.accommodations, apply, (rec) => rec?.sessionId && {
      sql: `INSERT INTO v1_accommodations (session_id, needs, modes, status, material, decision_note, decided_by, at, decided_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            ON CONFLICT (session_id) DO UPDATE SET needs = EXCLUDED.needs, modes = EXCLUDED.modes,
              status = EXCLUDED.status, material = EXCLUDED.material, decision_note = EXCLUDED.decision_note,
              decided_by = EXCLUDED.decided_by, at = EXCLUDED.at, decided_at = EXCLUDED.decided_at`,
      params: [rec.sessionId, rec.needs || '', rec.modes ? JSON.stringify(rec.modes) : null,
        rec.status || 'requested', Boolean(rec.material), rec.decisionNote || '',
        rec.decidedBy || null, rec.at || new Date().toISOString(), rec.decidedAt || null],
    }),
  }

  return { dryRun, startedAt, finishedAt: new Date().toISOString(), dataDir: DATA_DIR, buckets }
}

// ── Reconciliation (public read-path contract) ────────────────────────────────
//
// For every key in the JSON snapshot, fetch the record through BOTH backends'
// public getters and compare the canonical serialization after normalizing
// contract-level defaults (fields the PG mapper materializes as null/'' that
// the JSON record may simply omit). Evidence: per-bucket counts, ordered
// canonical SHA-256 hashes over each backend's record set, and the list of
// mismatched keys.

function normalize(rec, defaults) {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return rec
  const out = { ...defaults, ...Object.fromEntries(Object.entries(rec).filter(([, v]) => v !== undefined)) }
  return out
}

const USER_DEFAULTS = { name: '', college: '', year: '', candidateId: null, accountState: 'active', tokenVersion: 0, ageDeclaration: null }
const SESSION_DEFAULTS = { startedAt: null, completedAt: null, updatedAt: null }
const DEVICE_DEFAULTS = { sessionId: '', status: 'pending', phoneUserAgent: '' }

export async function reconcileStores() {
  const [jsonStore, pgStore, dbJson, dbPg] = await Promise.all([
    import('../lib/storeJson.js'), import('../lib/storePg.js'),
    import('../lib/dbJson.js'), import('../lib/dbPg.js'),
  ])
  const snap = await readJsonSnapshot()
  const buckets = {}

  async function compareKeyed(name, keys, jsonGet, pgGet, defaults = {}) {
    const mismatched = []
    const jsonCanon = []
    const pgCanon = []
    for (const key of keys) {
      const [j, p] = await Promise.all([jsonGet(key), pgGet(key)])
      const cj = canonicalStringify(normalize(j, defaults))
      const cp = canonicalStringify(normalize(p, defaults))
      jsonCanon.push(cj)
      pgCanon.push(cp)
      if (cj !== cp) mismatched.push(key)
    }
    buckets[name] = {
      jsonCount: keys.length,
      matched: keys.length - mismatched.length,
      mismatched,
      jsonHash: sha256hex(jsonCanon.join('\n')),
      pgHash: sha256hex(pgCanon.join('\n')),
    }
  }

  await compareKeyed('users', snap.users.map((u) => u.id), dbJson.findUserById, dbPg.findUserById, USER_DEFAULTS)
  await compareKeyed('payments', Object.keys(snap.payments), jsonStore.getEntitlement, pgStore.getEntitlement)
  await compareKeyed('sessions', Object.keys(snap.sessions), jsonStore.getSession, pgStore.getSession, SESSION_DEFAULTS)
  await compareKeyed('reports', Object.keys(snap.reports), jsonStore.getReport, pgStore.getReport)
  await compareKeyed('calibrations', Object.keys(snap.calibrations), jsonStore.getCalibration, pgStore.getCalibration)
  await compareKeyed('consents', Object.keys(snap.consents), jsonStore.getConsent, pgStore.getConsent)
  await compareKeyed('disputes', Object.keys(snap.disputes), jsonStore.getDispute, pgStore.getDispute)
  await compareKeyed('verifications', Object.keys(snap.verifications), jsonStore.getVerification, pgStore.getVerification)
  await compareKeyed('deviceLinks', Object.keys(snap.deviceLinks), jsonStore.getDeviceLink, pgStore.getDeviceLink, DEVICE_DEFAULTS)
  await compareKeyed('accommodations', Object.keys(snap.accommodations), jsonStore.getAccommodation, pgStore.getAccommodation)

  // Append-only buckets compared as whole per-session arrays.
  const eventSessions = [...new Set(snap.events.map((e) => e.sessionId))]
  await compareKeyed('events', eventSessions, jsonStore.getEvents, pgStore.getEvents)
  const itemSessions = [...new Set(snap.items.map((it) => it.sessionId))]
  await compareKeyed('items', itemSessions, jsonStore.getItemsBySession, pgStore.getItemsBySession)

  const ok = Object.values(buckets).every((b) => b.mismatched.length === 0 && b.jsonHash === b.pgHash)
  return { ok, at: new Date().toISOString(), buckets }
}
