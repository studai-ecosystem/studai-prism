// JSON-file-backed v1 store (the original, default implementation).
//
// This is the canonical v1 persistence — used unless PRISM_PG_STORE=true. Kept
// intact so v1 behavior stays byte-identical. The Postgres-backed twin lives in
// storePg.js; store.js dispatches between them.

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { promises as fs } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
// DATA_DIR env override lets deployments point at persistent storage
// (e.g. /home/data on Azure App Service, which survives redeploys).
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', 'data')
const DB_FILE = join(DATA_DIR, 'assessments.json')

const EMPTY = { sessions: {}, payments: {}, reports: {}, events: [], calibrations: {}, consents: {}, disputes: {}, verifications: {}, deviceLinks: {}, items: [] }

// Serialize writes so concurrent calls don't clobber each other.
let writeChain = Promise.resolve()

async function ensureFile() {
  await fs.mkdir(DATA_DIR, { recursive: true })
  try {
    await fs.access(DB_FILE)
  } catch {
    await fs.writeFile(DB_FILE, JSON.stringify(EMPTY, null, 2))
  }
}

// Atomic write (audit C13): write to a temp file then rename over the target,
// so a crash mid-write can never leave a torn/corrupted assessments.json.
// NOTE: this protects single-instance durability only — it does NOT make the
// JSON store safe for scale-out (2+ instances still race read-modify-write).
// Multi-instance deployments must run PRISM_PG_STORE=true.
function writeDB(db) {
  writeChain = writeChain.then(async () => {
    const tmp = `${DB_FILE}.${process.pid}.tmp`
    await fs.writeFile(tmp, JSON.stringify(db, null, 2))
    await fs.rename(tmp, DB_FILE)
  })
  return writeChain
}

async function readDB() {
  await ensureFile()
  try {
    const parsed = JSON.parse(await fs.readFile(DB_FILE, 'utf-8'))
    return {
      sessions: parsed.sessions || {},
      payments: parsed.payments || {},
      reports: parsed.reports || {},
      events: Array.isArray(parsed.events) ? parsed.events : [],
      calibrations: parsed.calibrations || {},
      consents: parsed.consents || {},
      disputes: parsed.disputes || {},
      verifications: parsed.verifications || {},
      deviceLinks: parsed.deviceLinks || {},
      items: Array.isArray(parsed.items) ? parsed.items : [],
    }
  } catch {
    return { ...EMPTY }
  }
}

// ── Payments ────────────────────────────────────────────────────────────────
export async function createEntitlement({ sessionId, paymentId, orderId, amount, mode }) {
  const db = await readDB()
  db.payments[sessionId] = {
    sessionId,
    paymentId: paymentId || null,
    orderId: orderId || null,
    amount: amount ?? null,
    mode: mode || 'paid', // 'paid' | 'dev'
    consumed: false,
    createdAt: new Date().toISOString(),
  }
  await writeDB(db)
  return db.payments[sessionId]
}

export async function getEntitlement(sessionId) {
  const db = await readDB()
  return db.payments[sessionId] || null
}

// ── Sessions ─────────────────────────────────────────────────────────────────
export async function createSession(sessionId, data) {
  const db = await readDB()
  db.sessions[sessionId] = {
    sessionId,
    ...data,
    startedAt: Date.now(),
    completedAt: null,
    updatedAt: Date.now(),
  }
  if (db.payments[sessionId]) db.payments[sessionId].consumed = true
  await writeDB(db)
  return db.sessions[sessionId]
}

export async function getSession(sessionId) {
  const db = await readDB()
  return db.sessions[sessionId] || null
}

export async function getRecentScenarioIdsByUser(userId, limit = 20) {
  if (!userId) return []
  const db = await readDB()
  return Object.values(db.sessions)
    .filter((s) => s && s.userId === userId && s.scenarioId)
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
    .slice(0, limit)
    .map((s) => s.scenarioId)
}

// Track 0.4: every session id tied to a user (sessions + reports), for the
// candidate-level erasure cascade.
export async function getSessionIdsByUser(userId) {
  if (!userId) return []
  const db = await readDB()
  const ids = new Set()
  for (const s of Object.values(db.sessions)) {
    if (s && s.userId === userId) ids.add(s.sessionId)
  }
  for (const r of Object.values(db.reports)) {
    if (r && r.userId === userId) ids.add(r.sessionId)
  }
  return [...ids]
}

export async function updateSession(sessionId, patch) {
  const db = await readDB()
  const existing = db.sessions[sessionId]
  if (!existing) return null
  db.sessions[sessionId] = { ...existing, ...patch, updatedAt: Date.now() }
  await writeDB(db)
  return db.sessions[sessionId]
}

// ── Reports ──────────────────────────────────────────────────────────────────
export async function saveReport(sessionId, report) {
  const db = await readDB()
  db.reports[sessionId] = { sessionId, ...report, issuedAt: new Date().toISOString() }
  if (db.sessions[sessionId]) {
    db.sessions[sessionId].completedAt = Date.now()
    db.sessions[sessionId].history = undefined // free transcript from live store
  }
  await writeDB(db)
  return db.reports[sessionId]
}

export async function getReport(sessionId) {
  const db = await readDB()
  return db.reports[sessionId] || null
}

export async function getReportsByUser(userId) {
  if (!userId) return []
  const db = await readDB()
  return Object.values(db.reports)
    .filter((r) => r && r.userId === userId)
    .sort((a, b) => new Date(b.issuedAt || 0) - new Date(a.issuedAt || 0))
}

export async function getAllOverallScores() {
  const db = await readDB()
  return Object.values(db.reports)
    .map((r) => r?.scores?.overall)
    .filter((n) => typeof n === 'number')
}

// ── Anti-cheat events ────────────────────────────────────────────────────────
export async function recordEvent(sessionId, type, meta = {}) {
  const db = await readDB()
  db.events.push({ sessionId, type, meta, at: new Date().toISOString() })
  await writeDB(db)
}

export async function getEvents(sessionId) {
  const db = await readDB()
  return db.events.filter((e) => e.sessionId === sessionId)
}

// ── Item telemetry ────────────────────────────────────────────────────────────
export async function recordItem(item) {
  const db = await readDB()
  db.items.push({ ...item, at: new Date().toISOString() })
  await writeDB(db)
}

export async function getItemsBySession(sessionId) {
  const db = await readDB()
  return db.items.filter((it) => it.sessionId === sessionId)
}

export async function getAllItems() {
  const db = await readDB()
  return db.items
}

// ── Calibration ──────────────────────────────────────────────────────────────
export async function setCalibration(sessionId, data) {
  const db = await readDB()
  db.calibrations[sessionId] = { sessionId, ...data, at: new Date().toISOString() }
  await writeDB(db)
  return db.calibrations[sessionId]
}

export async function getCalibration(sessionId) {
  const db = await readDB()
  return db.calibrations[sessionId] || null
}

// ── Consent ──────────────────────────────────────────────────────────────────
export async function recordConsent(sessionId, scopes, meta = {}) {
  const db = await readDB()
  db.consents[sessionId] = {
    sessionId,
    scopes,
    meta,
    at: new Date().toISOString(),
  }
  await writeDB(db)
  return db.consents[sessionId]
}

export async function getConsent(sessionId) {
  const db = await readDB()
  return db.consents[sessionId] || null
}

// ── Disputes ─────────────────────────────────────────────────────────────────
export async function createDispute(sessionId, reason, contact) {
  const db = await readDB()
  db.disputes[sessionId] = {
    sessionId,
    reason,
    contact: contact || null,
    status: 'open',
    at: new Date().toISOString(),
  }
  await writeDB(db)
  return db.disputes[sessionId]
}

export async function getDispute(sessionId) {
  const db = await readDB()
  return db.disputes[sessionId] || null
}

// ── Identity verification ─────────────────────────────────────────────────────
export async function recordVerification(sessionId, data) {
  const db = await readDB()
  db.verifications[sessionId] = {
    sessionId,
    fullName: data.fullName || '',
    fathersName: data.fathersName || '',
    dob: data.dob || '',
    aadhaarLast4: String(data.aadhaarLast4 || '').slice(-4),
    college: data.college || '',
    rollNumber: data.rollNumber || '',
    nameMatch: Boolean(data.nameMatch),
    matchScore: typeof data.matchScore === 'number' ? data.matchScore : null,
    status: data.status || (data.nameMatch ? 'verified' : 'flagged'),
    meta: data.meta && typeof data.meta === 'object' ? data.meta : {},
    at: new Date().toISOString(),
  }
  await writeDB(db)
  return db.verifications[sessionId]
}

export async function getVerification(sessionId) {
  const db = await readDB()
  return db.verifications[sessionId] || null
}

// ── Device pairing ────────────────────────────────────────────────────────────
export async function recordDeviceLink(pairCode, data) {
  const db = await readDB()
  const existing = db.deviceLinks[pairCode] || {}
  db.deviceLinks[pairCode] = {
    pairCode,
    sessionId: data.sessionId ?? existing.sessionId ?? '',
    status: data.status ?? existing.status ?? 'pending',
    phoneUserAgent: data.phoneUserAgent ?? existing.phoneUserAgent ?? '',
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  await writeDB(db)
  return db.deviceLinks[pairCode]
}

export async function getDeviceLink(pairCode) {
  const db = await readDB()
  return db.deviceLinks[pairCode] || null
}

// ── Right to erasure ──────────────────────────────────────────────────────────
export async function eraseSession(sessionId) {
  const db = await readDB()
  let removed = false
  for (const bucket of ['sessions', 'payments', 'reports', 'calibrations', 'consents', 'disputes', 'verifications', 'deviceLinks']) {
    if (db[bucket][sessionId]) {
      delete db[bucket][sessionId]
      removed = true
    }
  }
  const before = db.events.length
  db.events = db.events.filter((e) => e.sessionId !== sessionId)
  if (db.events.length !== before) removed = true
  const itemsBefore = db.items.length
  db.items = db.items.filter((it) => it.sessionId !== sessionId)
  if (db.items.length !== itemsBefore) removed = true
  await writeDB(db)
  return removed
}

// ── Admin Control Centre list/search surface (Phase 2) ───────────────────────
// Read-only projections with server-side pagination. Same signatures as the
// storePg twin. Page sizes are clamped by the admin routes (≤100); volumes at
// pilot scale make full-scan-then-slice acceptable for the JSON backend.

function paginate(rows, page = 1, pageSize = 25) {
  const p = Math.max(1, Number(page) || 1)
  const size = Math.max(1, Math.min(100, Number(pageSize) || 25))
  return { rows: rows.slice((p - 1) * size, p * size), total: rows.length, page: p, pageSize: size }
}

// Sessions, newest first. Light projection — never the transcript.
export async function listSessions({ q, userId, status, scenarioId, page, pageSize } = {}) {
  const db = await readDB()
  let rows = Object.values(db.sessions).filter(Boolean)
  if (userId) rows = rows.filter((s) => s.userId === userId)
  if (scenarioId) rows = rows.filter((s) => s.scenarioId === scenarioId)
  if (status === 'active') rows = rows.filter((s) => !s.completedAt)
  if (status === 'completed') rows = rows.filter((s) => Boolean(s.completedAt))
  if (q) {
    const needle = String(q).toLowerCase()
    rows = rows.filter(
      (s) => String(s.sessionId).toLowerCase().includes(needle) ||
             String(s.userEmail || '').toLowerCase().includes(needle),
    )
  }
  rows.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
  const { rows: pageRows, ...meta } = paginate(rows, page, pageSize)
  return {
    ...meta,
    rows: pageRows.map((s) => ({
      sessionId: s.sessionId,
      scenarioId: s.scenarioId || null,
      userId: s.userId || null,
      userEmail: s.userEmail || null,
      language: s.language || 'en',
      exchangeCount: s.exchangeCount ?? null,
      startedAt: s.startedAt || null,
      completedAt: s.completedAt || null,
    })),
  }
}

// Reports, newest first. Light projection — scores summary only.
export async function listReports({ q, userId, minOverall, maxOverall, page, pageSize } = {}) {
  const db = await readDB()
  let rows = Object.values(db.reports).filter(Boolean)
  if (userId) rows = rows.filter((r) => r.userId === userId)
  if (typeof minOverall === 'number') rows = rows.filter((r) => (r.scores?.overall ?? -1) >= minOverall)
  if (typeof maxOverall === 'number') rows = rows.filter((r) => (r.scores?.overall ?? 101) <= maxOverall)
  if (q) {
    const needle = String(q).toLowerCase()
    rows = rows.filter((r) => String(r.sessionId).toLowerCase().includes(needle))
  }
  rows.sort((a, b) => new Date(b.issuedAt || 0) - new Date(a.issuedAt || 0))
  const { rows: pageRows, ...meta } = paginate(rows, page, pageSize)
  return {
    ...meta,
    rows: pageRows.map((r) => ({
      sessionId: r.sessionId,
      userId: r.userId || null,
      overall: r.scores?.overall ?? null,
      reliability: r.reliability?.level || r.reliability?.reliability || null,
      scenario: r.scenario?.title || r.scenario || null,
      language: r.scoring?.language || 'en',
      flaggedForReview: Boolean(r.flaggedForReview),
      issuedAt: r.issuedAt || null,
    })),
  }
}

export async function listDisputes({ status, page, pageSize } = {}) {
  const db = await readDB()
  let rows = Object.values(db.disputes).filter(Boolean)
  if (status) rows = rows.filter((d) => d.status === status)
  rows.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
  return paginate(rows, page, pageSize)
}

// Coarse 3-state sync target for the admin dispute workflow. The candidate's
// statement (reason/contact) is never modified here.
export async function setDisputeStatus(sessionId, status) {
  if (!['open', 'in_review', 'resolved'].includes(status)) throw new Error('BAD_DISPUTE_STATUS')
  const db = await readDB()
  const existing = db.disputes[sessionId]
  if (!existing) return null
  existing.status = status
  await writeDB(db)
  return existing
}

export async function listEntitlements({ q, mode, consumed, page, pageSize } = {}) {
  const db = await readDB()
  let rows = Object.values(db.payments).filter(Boolean)
  if (mode) rows = rows.filter((p) => p.mode === mode)
  if (consumed === true || consumed === false) rows = rows.filter((p) => Boolean(p.consumed) === consumed)
  if (q) {
    const needle = String(q).toLowerCase()
    rows = rows.filter(
      (p) => String(p.sessionId).toLowerCase().includes(needle) ||
             String(p.paymentId || '').toLowerCase().includes(needle) ||
             String(p.orderId || '').toLowerCase().includes(needle),
    )
  }
  rows.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
  return paginate(rows, page, pageSize)
}

export async function findEntitlementByRef(ref) {
  if (!ref) return null
  const db = await readDB()
  return (
    Object.values(db.payments).find(
      (p) => p && (p.paymentId === ref || p.orderId === ref || p.sessionId === ref),
    ) || null
  )
}

// Revoking an UNUSED entitlement reuses the existing consumption semantics
// (/start refuses consumed entitlements), plus an explicit marker for audit.
export async function revokeEntitlement(sessionId, reason) {
  const db = await readDB()
  const ent = db.payments[sessionId]
  if (!ent) return { ok: false, error: 'NOT_FOUND' }
  if (ent.consumed) return { ok: false, error: 'ALREADY_CONSUMED' }
  ent.consumed = true
  ent.revoked = true
  ent.revokedReason = String(reason || '')
  ent.revokedAt = new Date().toISOString()
  await writeDB(db)
  return { ok: true, entitlement: ent }
}

export async function listConsents({ page, pageSize } = {}) {
  const db = await readDB()
  const rows = Object.values(db.consents).filter(Boolean)
  rows.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
  return paginate(rows, page, pageSize)
}

export async function listVerifications({ status, page, pageSize } = {}) {
  const db = await readDB()
  let rows = Object.values(db.verifications).filter(Boolean)
  if (status) rows = rows.filter((v) => v.status === status)
  rows.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
  return paginate(rows, page, pageSize)
}

export async function listEventsFiltered({ sessionId, type, page, pageSize } = {}) {
  const db = await readDB()
  let rows = db.events
  if (sessionId) rows = rows.filter((e) => e.sessionId === sessionId)
  if (type) rows = rows.filter((e) => e.type === type)
  rows = [...rows].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
  return paginate(rows, page, pageSize)
}
