// PostgreSQL-backed v1 store. Drop-in twin of storeJson.js: same function
// signatures, same returned record shapes. Active only when PRISM_PG_STORE=true
// AND a DATABASE_URL is configured (store.js enforces the dispatch). Tables come
// from migration 0003_v1_store.sql.
//
// Returned objects intentionally match the JSON store byte-for-byte (timestamps,
// null defaults, field names) so callers and the frontend see no difference.

import { query } from '../db/pool.js'

// ── Payments ────────────────────────────────────────────────────────────────
export async function createEntitlement({ sessionId, paymentId, orderId, amount, mode }) {
  const rec = {
    sessionId,
    paymentId: paymentId || null,
    orderId: orderId || null,
    amount: amount ?? null,
    mode: mode || 'paid',
    consumed: false,
    createdAt: new Date().toISOString(),
  }
  await query(
    `INSERT INTO v1_payments (session_id, payment_id, order_id, amount, mode, consumed, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (session_id) DO UPDATE SET
       payment_id = EXCLUDED.payment_id, order_id = EXCLUDED.order_id,
       amount = EXCLUDED.amount, mode = EXCLUDED.mode, consumed = EXCLUDED.consumed`,
    [sessionId, rec.paymentId, rec.orderId, rec.amount, rec.mode, rec.consumed, rec.createdAt],
  )
  return rec
}

export async function getEntitlement(sessionId) {
  const r = await query('SELECT * FROM v1_payments WHERE session_id = $1', [sessionId])
  const row = r?.rows?.[0]
  if (!row) return null
  return {
    sessionId: row.session_id,
    paymentId: row.payment_id,
    orderId: row.order_id,
    amount: row.amount,
    mode: row.mode,
    consumed: row.consumed,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  }
}

// ── Sessions ─────────────────────────────────────────────────────────────────
function rowToSession(row) {
  if (!row) return null
  return {
    sessionId: row.session_id,
    scenarioId: row.scenario_id ?? undefined,
    userId: row.user_id ?? undefined,
    userEmail: row.user_email ?? undefined,
    ...(row.data || {}),
    startedAt: row.started_at != null ? Number(row.started_at) : null,
    completedAt: row.completed_at != null ? Number(row.completed_at) : null,
    updatedAt: row.updated_at != null ? Number(row.updated_at) : null,
  }
}

export async function createSession(sessionId, data = {}) {
  const now = Date.now()
  const { scenarioId = null, userId = null, userEmail = null, ...rest } = data
  await query(
    `INSERT INTO v1_sessions (session_id, scenario_id, user_id, user_email, data, started_at, completed_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,NULL,$7)
     ON CONFLICT (session_id) DO UPDATE SET
       scenario_id = EXCLUDED.scenario_id, user_id = EXCLUDED.user_id,
       user_email = EXCLUDED.user_email, data = EXCLUDED.data,
       started_at = EXCLUDED.started_at, completed_at = NULL, updated_at = EXCLUDED.updated_at`,
    [sessionId, scenarioId, userId, userEmail, JSON.stringify(rest), now, now],
  )
  // A started session consumes its entitlement.
  await query('UPDATE v1_payments SET consumed = true WHERE session_id = $1', [sessionId])
  return rowToSession({
    session_id: sessionId, scenario_id: scenarioId, user_id: userId, user_email: userEmail,
    data: rest, started_at: now, completed_at: null, updated_at: now,
  })
}

export async function getSession(sessionId) {
  const r = await query('SELECT * FROM v1_sessions WHERE session_id = $1', [sessionId])
  return rowToSession(r?.rows?.[0])
}

export async function getRecentScenarioIdsByUser(userId, limit = 20) {
  if (!userId) return []
  const r = await query(
    `SELECT scenario_id FROM v1_sessions
      WHERE user_id = $1 AND scenario_id IS NOT NULL
      ORDER BY started_at DESC NULLS LAST LIMIT $2`,
    [userId, limit],
  )
  return (r?.rows || []).map((row) => row.scenario_id)
}

export async function updateSession(sessionId, patch = {}) {
  const existing = await getSession(sessionId)
  if (!existing) return null
  const merged = { ...existing, ...patch, updatedAt: Date.now() }
  const { sessionId: _s, scenarioId = null, userId = null, userEmail = null,
    startedAt = null, completedAt = null, updatedAt, ...rest } = merged
  await query(
    `UPDATE v1_sessions SET scenario_id=$2, user_id=$3, user_email=$4, data=$5,
       started_at=$6, completed_at=$7, updated_at=$8 WHERE session_id=$1`,
    [sessionId, scenarioId, userId, userEmail, JSON.stringify(rest), startedAt, completedAt, updatedAt],
  )
  return merged
}

// ── Reports ──────────────────────────────────────────────────────────────────
export async function saveReport(sessionId, report) {
  const rec = { sessionId, ...report, issuedAt: new Date().toISOString() }
  const overall = typeof rec?.scores?.overall === 'number' ? rec.scores.overall : null
  await query(
    `INSERT INTO v1_reports (session_id, user_id, overall, report, issued_at)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (session_id) DO UPDATE SET
       user_id = EXCLUDED.user_id, overall = EXCLUDED.overall,
       report = EXCLUDED.report, issued_at = EXCLUDED.issued_at`,
    [sessionId, rec.userId || null, overall, JSON.stringify(rec), rec.issuedAt],
  )
  // Mark the session complete + free the transcript, like the JSON store.
  await query(
    `UPDATE v1_sessions SET completed_at = $2, data = data - 'history' WHERE session_id = $1`,
    [sessionId, Date.now()],
  )
  return rec
}

export async function getReport(sessionId) {
  const r = await query('SELECT report FROM v1_reports WHERE session_id = $1', [sessionId])
  return r?.rows?.[0]?.report || null
}

export async function getReportsByUser(userId) {
  if (!userId) return []
  const r = await query(
    'SELECT report FROM v1_reports WHERE user_id = $1 ORDER BY issued_at DESC',
    [userId],
  )
  return (r?.rows || []).map((row) => row.report)
}

export async function getAllOverallScores() {
  const r = await query('SELECT overall FROM v1_reports WHERE overall IS NOT NULL')
  return (r?.rows || []).map((row) => Number(row.overall)).filter((n) => Number.isFinite(n))
}

// ── Anti-cheat events ────────────────────────────────────────────────────────
export async function recordEvent(sessionId, type, meta = {}) {
  await query(
    'INSERT INTO v1_events (session_id, type, meta, at) VALUES ($1,$2,$3,$4)',
    [sessionId, type, JSON.stringify(meta ?? {}), new Date().toISOString()],
  )
}

export async function getEvents(sessionId) {
  const r = await query('SELECT session_id, type, meta, at FROM v1_events WHERE session_id = $1 ORDER BY id', [sessionId])
  return (r?.rows || []).map((row) => ({
    sessionId: row.session_id,
    type: row.type,
    meta: row.meta || {},
    at: row.at instanceof Date ? row.at.toISOString() : row.at,
  }))
}

// ── Item telemetry ────────────────────────────────────────────────────────────
export async function recordItem(item) {
  const at = new Date().toISOString()
  await query(
    'INSERT INTO v1_items (session_id, item, at) VALUES ($1,$2,$3)',
    [item?.sessionId || null, JSON.stringify({ ...item, at }), at],
  )
}

export async function getItemsBySession(sessionId) {
  const r = await query('SELECT item FROM v1_items WHERE session_id = $1 ORDER BY id', [sessionId])
  return (r?.rows || []).map((row) => row.item)
}

export async function getAllItems() {
  const r = await query('SELECT item FROM v1_items ORDER BY id')
  return (r?.rows || []).map((row) => row.item)
}

// ── Calibration ──────────────────────────────────────────────────────────────
export async function setCalibration(sessionId, data) {
  const rec = { sessionId, ...data, at: new Date().toISOString() }
  await query(
    `INSERT INTO v1_calibrations (session_id, data, at) VALUES ($1,$2,$3)
     ON CONFLICT (session_id) DO UPDATE SET data = EXCLUDED.data, at = EXCLUDED.at`,
    [sessionId, JSON.stringify(rec), rec.at],
  )
  return rec
}

export async function getCalibration(sessionId) {
  const r = await query('SELECT data FROM v1_calibrations WHERE session_id = $1', [sessionId])
  return r?.rows?.[0]?.data || null
}

// ── Consent ──────────────────────────────────────────────────────────────────
export async function recordConsent(sessionId, scopes, meta = {}) {
  const rec = { sessionId, scopes, meta, at: new Date().toISOString() }
  await query(
    `INSERT INTO v1_consents (session_id, scopes, meta, at) VALUES ($1,$2,$3,$4)
     ON CONFLICT (session_id) DO UPDATE SET scopes = EXCLUDED.scopes, meta = EXCLUDED.meta, at = EXCLUDED.at`,
    [sessionId, JSON.stringify(scopes ?? []), JSON.stringify(meta ?? {}), rec.at],
  )
  return rec
}

export async function getConsent(sessionId) {
  const r = await query('SELECT session_id, scopes, meta, at FROM v1_consents WHERE session_id = $1', [sessionId])
  const row = r?.rows?.[0]
  if (!row) return null
  return {
    sessionId: row.session_id,
    scopes: row.scopes || [],
    meta: row.meta || {},
    at: row.at instanceof Date ? row.at.toISOString() : row.at,
  }
}

// ── Disputes ─────────────────────────────────────────────────────────────────
export async function createDispute(sessionId, reason, contact) {
  const rec = { sessionId, reason, contact: contact || null, status: 'open', at: new Date().toISOString() }
  await query(
    `INSERT INTO v1_disputes (session_id, reason, contact, status, at) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (session_id) DO UPDATE SET reason = EXCLUDED.reason, contact = EXCLUDED.contact,
       status = EXCLUDED.status, at = EXCLUDED.at`,
    [sessionId, reason, rec.contact, rec.status, rec.at],
  )
  return rec
}

export async function getDispute(sessionId) {
  const r = await query('SELECT session_id, reason, contact, status, at FROM v1_disputes WHERE session_id = $1', [sessionId])
  const row = r?.rows?.[0]
  if (!row) return null
  return {
    sessionId: row.session_id,
    reason: row.reason,
    contact: row.contact,
    status: row.status,
    at: row.at instanceof Date ? row.at.toISOString() : row.at,
  }
}

// ── Identity verification ─────────────────────────────────────────────────────
export async function recordVerification(sessionId, data) {
  const rec = {
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
  await query(
    `INSERT INTO v1_verifications (session_id, data, at) VALUES ($1,$2,$3)
     ON CONFLICT (session_id) DO UPDATE SET data = EXCLUDED.data, at = EXCLUDED.at`,
    [sessionId, JSON.stringify(rec), rec.at],
  )
  return rec
}

export async function getVerification(sessionId) {
  const r = await query('SELECT data FROM v1_verifications WHERE session_id = $1', [sessionId])
  return r?.rows?.[0]?.data || null
}

// ── Device pairing ────────────────────────────────────────────────────────────
export async function recordDeviceLink(pairCode, data) {
  const r = await query('SELECT * FROM v1_device_links WHERE pair_code = $1', [pairCode])
  const existing = r?.rows?.[0]
  const rec = {
    pairCode,
    sessionId: data.sessionId ?? existing?.session_id ?? '',
    status: data.status ?? existing?.status ?? 'pending',
    phoneUserAgent: data.phoneUserAgent ?? existing?.phone_user_agent ?? '',
    createdAt: existing?.created_at
      ? (existing.created_at instanceof Date ? existing.created_at.toISOString() : existing.created_at)
      : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  await query(
    `INSERT INTO v1_device_links (pair_code, session_id, status, phone_user_agent, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (pair_code) DO UPDATE SET session_id = EXCLUDED.session_id,
       status = EXCLUDED.status, phone_user_agent = EXCLUDED.phone_user_agent, updated_at = EXCLUDED.updated_at`,
    [pairCode, rec.sessionId, rec.status, rec.phoneUserAgent, rec.createdAt, rec.updatedAt],
  )
  return rec
}

export async function getDeviceLink(pairCode) {
  const r = await query('SELECT * FROM v1_device_links WHERE pair_code = $1', [pairCode])
  const row = r?.rows?.[0]
  if (!row) return null
  return {
    pairCode: row.pair_code,
    sessionId: row.session_id,
    status: row.status,
    phoneUserAgent: row.phone_user_agent,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  }
}

// ── Right to erasure ──────────────────────────────────────────────────────────
export async function eraseSession(sessionId) {
  let removed = false
  const tables = [
    'v1_sessions', 'v1_payments', 'v1_reports', 'v1_calibrations',
    'v1_consents', 'v1_disputes', 'v1_verifications',
  ]
  for (const t of tables) {
    const r = await query(`DELETE FROM ${t} WHERE session_id = $1`, [sessionId])
    if ((r?.rowCount || 0) > 0) removed = true
  }
  for (const t of ['v1_events', 'v1_items']) {
    const r = await query(`DELETE FROM ${t} WHERE session_id = $1`, [sessionId])
    if ((r?.rowCount || 0) > 0) removed = true
  }
  const dl = await query('DELETE FROM v1_device_links WHERE session_id = $1', [sessionId])
  if ((dl?.rowCount || 0) > 0) removed = true
  return removed
}
