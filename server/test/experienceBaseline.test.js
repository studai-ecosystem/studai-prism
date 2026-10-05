import test from 'node:test'
import assert from 'node:assert/strict'
import { baselineReport, inspectDatabase, runDiagnostic } from '../../scripts/check-experience-baseline.mjs'
import { createAssessmentSessionService } from '../domain/assessments/sessionService.js'
import { createSessionIoRepoMemory } from '../domain/assessments/sessionIoRepository.js'
import { createMemoryDb } from '../domain/campusStore/memoryDb.js'

function client({ missing = false, failure = false, rollbackFailure = false } = {}) {
  const calls = []
  const columns = {
    schema_migrations: ['name'], v1_users: ['id'],
    v1_sessions: ['session_id', 'user_id', 'data', 'completed_at'],
    v1_reports: ['session_id', 'user_id'], v1_payments: ['session_id', 'user_id'],
    behavioral_evidence_units: ['session_id', 'legacy_row', 'rubric_level', 'evidence_status'],
    student_report_versions: ['session_id', 'version'],
  }
  return {
    calls,
    async connect() { calls.push('CONNECT') },
    async end() { calls.push('END') },
    async query(sql, params) {
      calls.push(sql)
      if (sql === 'ROLLBACK' && rollbackFailure) throw new Error('private-rollback-detail')
      if (sql.includes('information_schema')) {
        if (failure) throw new Error('private-query-detail')
        return { rows: missing ? [] : Object.entries(columns).flatMap(([table_name, names]) => names.map((column_name) => ({ table_name, column_name }))) }
      }
      if (sql.includes('FROM public.schema_migrations')) return { rows: [{ known: String(params[0].length), unknown: '0' }] }
      if (sql.includes('WITH sources')) return { rows: [{ MATCHED: '1', CONFLICTING: '2', UNCLAIMED: '3', DELETED: null, EXCLUDED: null }] }
      if (sql.includes('AS sessions')) return { rows: [{ sessions: '1', reports: '1', sessionsWithHistory: '0', completedWithoutHistory: '1', evidenceUnits: '0', judgedStrictUnits: '0', reportVersions: '0' }] }
      return { rows: [] }
    },
  }
}

test('P0/T04 unknown database and approvals cannot become release-ready', () => {
  const out = baselineReport({})
  assert.equal(out.database.status, 'UNVERIFIED')
  assert.equal(out.worker, 'UNVERIFIED_NO_DURABLE_WORKER_PROBE')
  assert.equal(out.contentApproval, 'HUMAN_REVIEW_REQUIRED')
  assert.equal(out.configuration.issues.length, 0)
  assert.equal(out.kind, 'P0_DIAGNOSTIC_NOT_RELEASE_APPROVAL')
})

test('P0/T04 allowlisted flag states never echo secret or malformed values', () => {
  const out = baselineReport({ PRISM_DEVELOPMENT_V2: 'private-token', DATABASE_URL: 'private-url', JWT_SECRET: 'private-secret' })
  assert.equal(out.configuration.flags.PRISM_DEVELOPMENT_V2.enabled, null)
  assert.match(out.configuration.issues[0], /exactly true or false/)
  assert.doesNotMatch(JSON.stringify(out), /private-/)
})

test('P0/CH41 probes use one read-only transaction and rollback, without runtime writes', async () => {
  const db = client()
  const out = await inspectDatabase(db)
  assert.equal(out.status, 'AVAILABLE')
  assert.equal(out.records.completedWithoutHistory, 1)
  assert.equal(out.ownership.CONFLICTING, 2)
  assert.equal(out.ownership.DELETED, null)
  assert.equal(out.ownership.EXCLUDED, null)
  assert.match(db.calls[0], /READ ONLY/)
  assert.equal(db.calls.at(-1), 'ROLLBACK')
  assert.ok(db.calls.every((sql) => !/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|COMMIT)\b/i.test(sql)))
})

test('P0/CH41 missing schema stops before any record query', async () => {
  const db = client({ missing: true })
  const out = await inspectDatabase(db)
  assert.equal(out.status, 'INCOMPATIBLE')
  assert.equal(out.records, null)
  assert.ok(out.missingColumns.includes('v1_sessions.user_id'))
  assert.equal(db.calls.length, 4)
})

test('P0/T31 read or cleanup failure cannot become an empty successful result', async () => {
  for (const options of [{ failure: true }, { rollbackFailure: true }]) {
    const db = client(options)
    const lines = []
    const status = await runDiagnostic({
      args: ['--database'], env: { PRISM_DIAGNOSTIC_DATABASE_URL: 'private-connection' },
      clientFactory: () => db, write: (line) => lines.push(line),
    })
    assert.equal(status, 1)
    assert.equal(JSON.parse(lines[0]).database.status, 'ERROR')
    assert.equal(JSON.parse(lines[0]).database.code, 'DIAGNOSTIC_READ_FAILED')
    assert.doesNotMatch(lines[0], /private-/)
    assert.equal(db.calls.at(-1), 'END')
  }
})

test('P0/CH41 diagnostic never falls back to application DATABASE_URL', async () => {
  let called = false
  const lines = []
  const status = await runDiagnostic({
    args: ['--database'], env: { DATABASE_URL: 'private-application-db' },
    clientFactory: () => { called = true }, write: (line) => lines.push(line),
  })
  assert.equal(status, 1)
  assert.equal(called, false)
  assert.equal(JSON.parse(lines[0]).database.code, 'DIAGNOSTIC_DATABASE_NOT_CONFIGURED')
  assert.doesNotMatch(lines[0], /private-/)
})

test('P0/CH41 refuses identifier arguments and reports unknown metadata as nonzero', async () => {
  for (const args of [[], ['--session=private-session'], ['--database', '--database']]) {
    const lines = []
    assert.equal(await runDiagnostic({ args, env: {}, write: (line) => lines.push(line) }), 1)
    assert.doesNotMatch(lines[0], /private-session/)
  }
})

test('P0/CH41 output schema rejects arbitrary fields and invalid counts', () => {
  for (const database of [
    { status: 'AVAILABLE', payload: 'private-answer' },
    { status: 'AVAILABLE', missingColumns: [], migrations: null, ownership: null, records: { sessions: -1 } },
  ]) assert.throws(() => baselineReport({}, database))
})

test('P0/T25/T26 durable acceptance survives the engine-effect-before-receipt failure window (Layer A)', async (t) => {
  const user = { id: 'synthetic-owner' }
  const session = { userId: user.id, exchangeCount: 0 }
  const db = createMemoryDb()
  const io = createSessionIoRepoMemory(db)
  let rejectReceipt = true
  const repos = {
    kind: 'memory',
    sessionIo: {
      ...io,
      async putClientEvent(event) {
        if (rejectReceipt) {
          rejectReceipt = false
          throw new Error('SYNTHETIC_RECEIPT_WRITE_FAILURE')
        }
        return io.putClientEvent(event)
      },
    },
  }
  const service = createAssessmentSessionService({
    repos,
    legacy: { getSession: async () => ({ ...session }), getReport: async () => null },
    engine: { async message() { session.exchangeCount += 1; return { messages: [] } } },
  })
  const args = { user, workspace: { type: 'PERSONAL' }, sessionId: 'synthetic-session', clientEventId: 'synthetic-event', text: 'Synthetic test input' }
  await assert.rejects(service.sendMessage(args), /SYNTHETIC_RECEIPT_WRITE_FAILURE/)
  // The applied response survives a lost public receipt.
  const afterFailure = await io.getAction(args.sessionId, args.clientEventId)
  assert.equal(afterFailure.state, 'APPLIED')
  const receipt = await service.sendMessage(args)
  assert.equal(receipt.replayed, true)
  assert.ok(db.clientEvents.has(`${args.sessionId}\u0000${args.clientEventId}`))
  const appliedAction = await io.getAction(args.sessionId, args.clientEventId)
  assert.equal(appliedAction.state, 'APPLIED')
  assert.equal(appliedAction.actionId, afterFailure.actionId)
  // Exactly one accepted action and one applied result for the key…
  const actions = [...db.candidateActions.values()].filter((a) => a.sessionId === args.sessionId)
  assert.equal(actions.length, 1)
  assert.equal(db.clientEvents.size, 1)
  // …and a replay returns the applied response without a third engine effect.
  const replay = await service.sendMessage(args)
  assert.equal(replay.replayed, true)
  // Same key, changed payload → CONFLICT (never silently applied).
  await assert.rejects(service.sendMessage({ ...args, text: 'Changed synthetic input' }), (err) => err.code === 'CONFLICT')
  const engineEffects = session.exchangeCount
  assert.equal(engineEffects, 1, 'receipt recovery does not repeat an applied engine effect')
  const status = actions.length === 1 && appliedAction.state === 'APPLIED' && db.clientEvents.size === 1 && engineEffects === 1 ? 'PASS' : 'FAIL'
  assert.equal(status, 'PASS')
  t.diagnostic(JSON.stringify({
    id: 'T25/T26', layer: 'A', invariant: 'one accepted action and one applied result per client event; re-drive idempotent; changed payload conflicts',
    status, engineEffects, acceptedActions: actions.length, durableReceipts: db.clientEvents.size, productionCrashTest: false,
  }))
})
