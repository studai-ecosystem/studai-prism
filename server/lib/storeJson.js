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
