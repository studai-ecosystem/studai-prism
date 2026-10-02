import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import pg from 'pg'
import { inspectDatabase, baselineReport } from '../../scripts/check-experience-baseline.mjs'

const isolated = process.env.PRISM_P0_ISOLATED_DATABASE === 'true'
const skip = !isolated || !process.env.TEST_DATABASE_URL
const evidence = { layer: 'B', modelBoundary: 'EXISTING_ISOLATED_AUDIT_PROVIDER', checks: [] }

test('P0 integrated diagnostic and real learner-path baseline on a self-owned database', {
  skip: skip ? 'Run node scripts/run-experience-baseline-tests.mjs database for a newly provisioned throwaway DB.' : false,
}, async (t) => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  process.env.NODE_ENV = 'test'
  process.env.PRISM_PG_STORE = 'true'
  process.env.PRISM_AUDIT_AI = 'true'
  process.env.PRISM_AUDIT_E2E = 'true'
  process.env.PRISM_V2_TELEMETRY = 'true'
  process.env.PRISM_DUMMY_PAYMENTS = 'true'
  process.env.PRISM_SKIP_VERIFICATION = 'true'
  process.env.PRISM_APP_SHELL_V3 = 'true'
  process.env.PRISM_ASSESSMENT_WORKSPACE_V3 = 'true'
  process.env.PRISM_STUDENT_REPORT_V3 = 'true'
  process.env.PRISM_EVIDENCE_FAIL_CLOSED = 'true'
  process.env.JWT_SECRET = 'isolated-p0-test-secret-never-production'
  process.env.ADMIN_TOKEN = 'isolated-p0-test-admin-never-production'
  const { migrateUp } = await import('../db/migrate.js')
  const { closePool, query } = await import('../db/pool.js')
  t.after(closePool)
  await migrateUp()
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL })
  await client.connect()
  t.after(() => client.end())

  await t.test('CH41 read-only transaction rejects writes and leaves the store unchanged', async () => {
    const before = await client.query('SELECT COUNT(*) AS n FROM public.v1_users')
    let denied = false
    const guarded = {
      async query(sql, params) {
        if (sql.includes('information_schema.columns')) {
          await client.query('SAVEPOINT p0_write_probe')
          await assert.rejects(client.query("INSERT INTO public.v1_users(id,email) VALUES('synthetic-denied','denied@test.local')"), { code: '25006' })
          denied = true
          await client.query('ROLLBACK TO SAVEPOINT p0_write_probe')
        }
        return client.query(sql, params)
      },
    }
    const result = await inspectDatabase(guarded)
    assert.equal(denied, true)
    assert.equal(result.status, 'AVAILABLE')
    assert.equal(result.migrations.appliedKnown, 39)
    assert.deepEqual(await client.query('SELECT COUNT(*) AS n FROM public.v1_users').then((r) => r.rows), before.rows)
    evidence.checks.push({ id: 'CH-41', status: 'PASS', readOnlyWriteRejected: true, migrationsApplied: result.migrations.appliedKnown })
  })

  const { buildApp } = await import('../app.js')
  const app = buildApp()
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())))
  const base = `http://127.0.0.1:${server.address().port}`
  async function request(method, path, token, body) {
    const response = await fetch(`${base}${path}`, {
      method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const payload = await response.json()
    return { status: response.status, payload }
  }
  const account = await request('POST', '/api/auth/register', null, {
    name: 'Synthetic P0 learner', email: 'p0-learner@test.local', password: 'synthetic-p0-password', ageConfirmed: true,
  })
  assert.equal(account.status, 201)
  const token = account.payload.token
  const other = await request('POST', '/api/auth/register', null, {
    name: 'Synthetic other learner', email: 'p0-other@test.local', password: 'synthetic-p0-password', ageConfirmed: true,
  })
  assert.equal(other.status, 201)
  const minted = await request('POST', '/api/payment/dev-session', token, {})
  assert.equal(minted.status, 200)
  const sid = minted.payload.sessionId
  const consent = await request('POST', '/api/assessment/consent', token, {
    sessionId: sid, scopes: ['data_processing', 'ai_disclosure', 'ai_scoring_oversight', 'proctoring', 'face_analysis', 'own_work'],
    consentVersion: 'synthetic-p0-consent',
  })
  assert.equal(consent.status, 200)
  const started = await request('POST', '/api/assessment/start', token, { sessionId: sid, scenarioId: 'prism-sim-mkt-l1' })
  assert.equal(started.status, 200)
  const intro = await request('GET', `/api/v1/assessment-sessions/${sid}`, token)
  assert.equal(intro.status, 200)
  assert.equal(intro.payload.data.status, 'IN_PROGRESS')
  assert.equal(new Date(intro.payload.data.timing.deadlineAt) - new Date(intro.payload.data.timing.startedAt), 35 * 60000)
  assert.equal(intro.payload.data.scenario.title, started.payload.scenario.title)
  evidence.checks.push({ id: 'T14/T16/T19/T20', status: 'BASELINED', selectedExistingForm: true, startedBeforeSeparateIntroAcknowledgement: true, answerWindowMinutes: 35 })

  for (let turn = 1; turn <= 3; turn += 1) {
    const sent = await request('POST', `/api/v1/assessment-sessions/${sid}/messages`, token, {
      clientEventId: `synthetic-p0-message-${turn}`, text: `Synthetic test response ${turn}: I would review the source information before deciding.`,
    })
    assert.equal(sent.status, 201)
  }
  const saved = await query('SELECT data FROM v1_sessions WHERE session_id=$1', [sid])
  assert.ok(saved.rows[0].data.history.some((message) => message.content.includes('[Candidate]')))
  const receipts = await query("SELECT COUNT(*)::int AS n FROM assessment_client_events WHERE session_id=$1 AND kind='MESSAGE'", [sid])
  assert.equal(receipts.rows[0].n, 3)
  evidence.checks.push({ id: 'T25', status: 'PARTIAL', acceptedMessagesPersisted: 3, modelFailureAndCrashWindow: 'NOT_PROVEN' })
  const wrongOwner = await request('GET', `/api/v1/assessment-sessions/${sid}`, other.payload.token)
  assert.equal(wrongOwner.status, 404)
  evidence.checks.push({ id: 'T07/T47', status: 'PARTIAL', secondOwnerSessionDenied: true })

  const finished = await request('POST', `/api/v1/assessment-sessions/${sid}/finish`, token, { early: true })
  assert.ok([200, 202].includes(finished.status))
  let report
  for (let attempt = 0; attempt < 20; attempt += 1) {
    report = await query('SELECT COUNT(*)::int AS n FROM v1_reports WHERE session_id=$1', [sid])
    if (report.rows[0].n) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.equal(report.rows[0].n, 1, 'normal scorer must save the report; none was preseeded')
  const strict = await query("SELECT COUNT(*)::int AS n FROM behavioral_evidence_units WHERE session_id=$1 AND NOT legacy_row AND rubric_level IS NOT NULL", [sid])
  const historyAfter = await query("SELECT COALESCE(data ? 'history',false) AS present FROM v1_sessions WHERE session_id=$1", [sid])
  const result = await request('GET', `/api/v1/assessment-sessions/${sid}/report`, token)
  assert.equal(result.status, 200)
  const versions = await query('SELECT COUNT(*)::int AS n FROM student_report_versions WHERE session_id=$1', [sid])
  const checks = [
    { id: 'T27', status: strict.rows[0].n ? 'OBSERVED_REQUIRES_REVIEW' : 'FAIL', judgedStrictUnits: strict.rows[0].n },
    { id: 'T32', status: historyAfter.rows[0].present ? 'SOURCE_PRESENT' : 'FAIL', sourceHistoryPresentAfterCompletion: historyAfter.rows[0].present },
    { id: 'T36', status: 'DIAGNOSTIC_SIDE_EFFECT', reportReadAppendedVersion: versions.rows[0].n > 0 },
  ]
  evidence.checks.push(...checks)
  for (const check of checks) t.diagnostic(JSON.stringify(check))
  const assignments = await request('GET', '/api/v1/me/assessments', token)
  assert.equal(assignments.status, 200)
  assert.ok(assignments.payload.data.completed.some((entry) => entry.sessionId === sid))
  const deniedReport = await request('GET', `/api/v1/assessment-sessions/${sid}/report`, other.payload.token)
  assert.equal(deniedReport.status, 404)
  evidence.checks.push({ id: 'T05/T47', status: 'PARTIAL', ownedCompletedRunDiscoverable: true, secondOwnerReportDenied: true })
  const snapshot = baselineReport(process.env, await inspectDatabase(client))
  assert.equal(snapshot.database.ownership.MATCHED, 1)
  assert.equal(snapshot.database.ownership.UNCLAIMED, 0)
  assert.doesNotMatch(JSON.stringify(snapshot), /p0-learner|p0-other|synthetic-p0-password|synthetic-p0-consent/)
  let timeline
  for (let attempt = 0; attempt < 20; attempt += 1) {
    timeline = await query('SELECT is_synthetic FROM assessment_timeline WHERE session_id=$1', [sid])
    if (timeline.rows.length) break
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert.equal(timeline.rows.length, 1)
  assert.equal(timeline.rows[0].is_synthetic, true)
  evidence.checks.push({ id: 'T59', status: 'PARTIAL', actualTimelineMarkedSynthetic: true, conversionResearchExclusionManifest: 'UNVERIFIED' })

  await t.test('CH41 conflicting and unclaimed source fixtures never transfer ownership', async () => {
    await query("INSERT INTO v1_sessions(session_id,user_id,data) VALUES ('synthetic-p0-conflict',$1,'{}'),('synthetic-p0-unclaimed',NULL,'{}')", [account.payload.user.id])
    await query("INSERT INTO v1_payments(session_id,user_id) VALUES ('synthetic-p0-conflict',$1)", [other.payload.user.id])
    const classified = await inspectDatabase(client)
    assert.equal(classified.ownership.MATCHED, 1)
    assert.equal(classified.ownership.CONFLICTING, 1)
    assert.equal(classified.ownership.UNCLAIMED, 1)
    assert.equal(classified.ownership.DELETED, null)
    assert.equal(classified.ownership.EXCLUDED, null)
    const unchanged = await query("SELECT user_id FROM v1_sessions WHERE session_id='synthetic-p0-conflict'")
    assert.equal(unchanged.rows[0].user_id, account.payload.user.id)
    evidence.checks.push({ id: 'T06/CH41', status: 'PASS_DIAGNOSTIC', conflictsNotAssigned: true, sourceFixtureOnly: true })
  })
  await mkdir(join('audit-results', 'p0'), { recursive: true })
  await writeFile(join('audit-results', 'p0', 'lineage.json'), JSON.stringify({ ...evidence, snapshot }, null, 2))
})
