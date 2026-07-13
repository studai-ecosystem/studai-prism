// Track 0 gate tests — longitudinal identity & session linking.
//
// Covers: T0.1 candidate identity (pseudonymous, write-once), T0.3
// re-assessment eligibility + no-repeat form assignment, T0.4 erasure cascade
// (v1 store side; telemetry side is DB-gated below), and the automated
// "research tables contain no PII columns" schema check.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'prism-track0-'))
delete process.env.PRISM_PG_STORE

const __dirname = dirname(fileURLToPath(import.meta.url))

const { createUser, findUserById } = await import('../lib/db.js')
const { ensureCandidateId } = await import('../lib/identity.js')
const { reassessmentBlock, configuredGapDays } = await import('../lib/eligibility.js')
const { pickScenario, ACTIVE_SCENARIOS } = await import('../routes/assessment.js')
const store = await import('../lib/store.js')
const { eraseTelemetry } = await import('../lib/telemetry.js')

// ── T0.1 identity ─────────────────────────────────────────────────────────────
test('T0.1: candidate_id is minted once, persisted, stable, and distinct from user id', async () => {
  const user = await createUser({ email: 'spine@example.com', name: 'Spine Test', passwordHash: 'x' })
  const c1 = await ensureCandidateId(user.id)
  assert.ok(c1, 'candidate id minted')
  assert.notEqual(c1, user.id, 'candidate id must be pseudonymous, not the user id')
  const c2 = await ensureCandidateId(user.id)
  assert.equal(c2, c1, 'candidate id is stable across calls')
  const reread = await findUserById(user.id)
  assert.equal(reread.candidateId, c1, 'candidate id persisted on the identity record')
})

test('T0.1: ensureCandidateId never throws for unknown/missing users', async () => {
  assert.equal(await ensureCandidateId(null), null)
  assert.equal(await ensureCandidateId('no-such-user'), null)
})

// ── T0.3 eligibility ─────────────────────────────────────────────────────────
test('T0.3: reassessment gap math — blocked inside the window, free after it', () => {
  const now = Date.parse('2026-07-05T00:00:00Z')
  const last = '2026-06-01T00:00:00Z' // 34 days ago
  const block = reassessmentBlock(last, 90, now)
  assert.ok(block, 'blocked inside 90-day window')
  assert.equal(block.daysRemaining, 56)
  assert.equal(reassessmentBlock(last, 30, now), null, 'free after a 30-day gap')
  assert.equal(reassessmentBlock(last, 0, now), null, 'gap 0 disables')
  assert.equal(reassessmentBlock(null, 90, now), null, 'no prior attempt → free')
  assert.equal(reassessmentBlock('garbage-date', 90, now), null, 'invalid date → free (never dead-end)')
})

test('T0.3: configured gap defaults to 90 and honors the env override', () => {
  const old = process.env.PRISM_REASSESSMENT_GAP_DAYS
  try {
    delete process.env.PRISM_REASSESSMENT_GAP_DAYS
    assert.equal(configuredGapDays(), 90)
    process.env.PRISM_REASSESSMENT_GAP_DAYS = '30'
    assert.equal(configuredGapDays(), 30)
    process.env.PRISM_REASSESSMENT_GAP_DAYS = '0'
    assert.equal(configuredGapDays(), 0)
    process.env.PRISM_REASSESSMENT_GAP_DAYS = 'nonsense'
    assert.equal(configuredGapDays(), 90)
  } finally {
    if (old === undefined) delete process.env.PRISM_REASSESSMENT_GAP_DAYS
    else process.env.PRISM_REASSESSMENT_GAP_DAYS = old
  }
})

test('T0.3: five sequential assessments never repeat a scenario form until the bank is exhausted', () => {
  // Simulates form assignment across 5 sequential attempts (untiered pool = 8
  // active forms): each attempt excludes everything already seen.
  for (let run = 0; run < 20; run++) {
    const seen = []
    for (let attempt = 0; attempt < 5; attempt++) {
      const s = pickScenario(undefined, seen)
      assert.ok(!seen.includes(s.id), `attempt ${attempt + 1} repeated form ${s.id}`)
      seen.push(s.id)
    }
    assert.equal(new Set(seen).size, 5)
  }
  // Exhaustion behavior stays graceful: excluding the whole bank still serves.
  const all = ACTIVE_SCENARIOS.map((s) => s.id)
  assert.ok(pickScenario(undefined, all))
})

// ── T0.4 erasure cascade (v1 store side) ─────────────────────────────────────
test('T0.4: candidate with 3 sessions erases with zero orphans across v1 buckets', async () => {
  const user = await createUser({ email: 'erase-me@example.com', name: 'Erase Me', passwordHash: 'x' })
  const sids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']
  for (const sid of sids) {
    await store.createEntitlement({ sessionId: sid, mode: 'dev', amount: 0 })
    await store.createSession(sid, { scenarioId: 'group-project', userId: user.id, history: [] })
    await store.saveReport(sid, { scores: { overall: 60 }, userId: user.id, userEmail: user.email })
    await store.recordEvent(sid, 'tab_switch', {})
    await store.recordConsent(sid, ['data_processing'], { consentVersion: 'test' })
  }

  const found = await store.getSessionIdsByUser(user.id)
  assert.equal(new Set(found).size, 3, 'all 3 sessions found for the candidate')

  for (const sid of found) {
    const removed = await store.eraseSession(sid)
    assert.ok(removed, `session ${sid} erased`)
    const telemetryRemoved = await eraseTelemetry(sid)
    assert.deepEqual(telemetryRemoved, {}, 'telemetry erasure is a clean no-op without a DB')
  }

  // Zero orphans: raw store file has no trace of any erased session id.
  const raw = await readFile(join(process.env.DATA_DIR, 'assessments.json'), 'utf-8')
  for (const sid of sids) {
    assert.ok(!raw.includes(sid), `orphan rows remain for ${sid}`)
  }
  assert.deepEqual(await store.getSessionIdsByUser(user.id), [])
})

// ── PII schema gate (automated, not eyeball) ─────────────────────────────────
test('T0 gate: research tables define no PII columns and never reference user_id', async () => {
  const dir = join(__dirname, '..', 'db', 'migrations')
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  const FORBIDDEN = /^\s*(user_id|email|full_name|first_name|last_name|phone|mobile|address|aadhaar\w*|dob|date_of_birth|password\w*)\s/i

  for (const file of files) {
    const sql = await readFile(join(dir, file), 'utf-8')
    // Walk every CREATE TABLE block; v1_* tables are the identity/PII store
    // and are exempt by design. admin_* tables (migration 0011) are the
    // ADMINISTRATOR identity plane — operator emails/password hashes, zero
    // candidate data — exempt for the same reason.
    const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\n\);/g)]
    for (const [, name, body] of tables) {
      if (name.startsWith('v1_') || name.startsWith('admin_')) continue
      for (const line of body.split('\n')) {
        assert.ok(
          !FORBIDDEN.test(line),
          `research table ${name} (${file}) defines a PII/identity column: "${line.trim()}"`,
        )
      }
    }
  }
})

// ── DB-gated: timeline + telemetry erasure round-trip ───────────────────────
const dbReady = Boolean(process.env.DATABASE_URL) && process.env.PRISM_V2_TELEMETRY === 'true'
test('T0.2/T0.4: timeline write + telemetry erasure round-trip (needs DATABASE_URL)', { skip: !dbReady }, async () => {
  const { recordTimelineEntry } = await import('../lib/telemetry.js')
  const { query } = await import('../db/pool.js')
  const sid = crypto.randomUUID()
  const cid = crypto.randomUUID()
  recordTimelineEntry({
    sessionId: sid,
    candidateId: cid,
    scenarioKey: 'group-project',
    scaleVersion: 'prism-scale-v1',
    consentVersion: 'test',
    flagsActive: { PRISM_TEST: 'true' },
    isSynthetic: true,
  })
  await new Promise((r) => setTimeout(r, 500)) // fire-and-forget settle
  const rows = await query('SELECT attempt_no, is_synthetic FROM assessment_timeline WHERE session_id = $1', [sid])
  assert.equal(rows.rows.length, 1)
  assert.equal(rows.rows[0].is_synthetic, true)
  const counts = await eraseTelemetry(sid)
  assert.equal(counts.assessment_timeline, 1)
  const after = await query('SELECT 1 FROM assessment_timeline WHERE session_id = $1', [sid])
  assert.equal(after.rows.length, 0)
})
