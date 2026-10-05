import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const isolated = process.env.PRISM_P0_ISOLATED_DATABASE === 'true' && Boolean(process.env.TEST_DATABASE_URL)

test('CR03 PostgreSQL: interrupted accepted transactions and erasure/publication fences', {
  skip: isolated ? false : 'Run node scripts\\run-cr03-runtime-tests.mjs for a self-owned disposable database.',
}, async (t) => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  const { migrateUp } = await import('../db/migrate.js')
  const { query, getPool, closePool } = await import('../db/pool.js')
  const { createSessionIoRepoPg } = await import('../domain/assessments/sessionIoRepository.js')
  const { createReportVersionsRepoPg } = await import('../domain/reports/v3/repository.js')
  const { createScopesRepoPg } = await import('../domain/scopes/repository.pg.js')
  const { EvidenceGraph } = await import('../lib/evidenceGraph.js')
  const { eraseCampusSessionData, isErased } = await import('../lib/campusErasure.js')
  const { withTransaction } = await import('../domain/campusStore/pgUtil.js')
  const { lockPublication } = await import('../domain/assessments/publicationFence.js')
  t.after(closePool)
  await migrateUp()
  const io = createSessionIoRepoPg({ query, getPool })
  const reports = createReportVersionsRepoPg({ query, getPool })
  const scopes = createScopesRepoPg({ query })
  const graph = new EvidenceGraph()
  const unit = (sessionId, suffix) => ({
    evidence_id: `${sessionId}-${suffix}`, session_id: sessionId, capability_id: 'CAP-REASONING',
    candidate_action: { dialogue_excerpt: 'Synthetic action' }, provenance: { rubric_version: 'synthetic-v1' },
    observable_behavior: 'Synthetic observation', source_type: 'DIALOGUE_TURN', source_turn: 1,
    rubric_level: 2, rubric_label: 'Synthetic',
  })
  const setup = async () => {
    const sessionId = `cr03-${randomUUID()}`
    await io.upsertOpportunity({ sessionId, opportunityId: 'opp', capabilityId: 'CAP-REASONING', state: 'ACTION_RECEIVED' })
    await io.acceptAction({ sessionId, clientEventId: 'finish', kind: 'FINISH', payload: { early: true } })
    await io.enqueueJob({ taskKey: sessionId, sessionId, kind: sessionId })
    const job = await io.claimJob(sessionId, 30000)
    const expectedInputHash = await io.getEvaluationInputHash(sessionId)
    const apply = (writeUnit = (u, tx) => graph.recordEvidenceUnit(u, tx), overrides = {}) => io.applyEvaluation({
      ...job, expectedInputHash, units: [unit(sessionId, 'a'), unit(sessionId, 'b')],
      evaluatedOpportunityIds: ['opp'], writeUnit, ...overrides,
    })
    return { sessionId, job, apply }
  }
  const unchanged = async (w) => {
    assert.deepEqual(await graph.getEvidenceUnits(w.sessionId), [])
    assert.equal((await io.listOpportunities(w.sessionId))[0].state, 'ACTION_RECEIVED')
    assert.equal((await io.getJob(w.job.taskKey)).state, 'LEASED')
  }

  const allocate = async () => {
    const sessionId = `cr03-${randomUUID()}`
    await scopes.createSessionScope({
      sessionId, ownerUserId: 'synthetic-owner', sponsorType: 'PERSONAL', workspaceId: 'synthetic-workspace',
      visibilityPolicy: 'OWNER_ONLY', createdBy: 'synthetic-owner',
    })
    await io.upsertOpportunity({ sessionId, opportunityId: 'answered', capabilityId: 'CAP-REASONING', state: 'ACTION_RECEIVED' })
    await io.upsertOpportunity({ sessionId, opportunityId: 'unanswered', capabilityId: 'CAP-REASONING', state: 'PRESENTED' })
    return { sessionId, taskKey: `evaluate:${sessionId}`, kind: 'EVALUATE_RUN', payload: { early: true }, universal: true }
  }

  await t.test('requestEvaluation atomically closes FINISH and inserts one logical outbox job under concurrent replay', async () => {
    const input = await allocate()
    const jobs = await Promise.all(Array.from({ length: 3 }, () => io.requestEvaluation(input)))
    assert.ok(jobs.every((job) => job.jobId === jobs[0].jobId))
    const finish = await io.getAction(input.sessionId, 'finish')
    assert.equal(finish.kind, 'FINISH')
    assert.equal(finish.state, 'APPLIED')
    assert.deepEqual(finish.result, { closed: true })
    assert.deepEqual(finish.payload, input.payload)
    const opportunities = await io.listOpportunities(input.sessionId)
    assert.equal(opportunities.find((o) => o.opportunityId === 'answered').state, 'EVALUATION_PENDING')
    assert.equal(opportunities.find((o) => o.opportunityId === 'unanswered').state, 'PRESENTED')
    assert.deepEqual(await io.requestEvaluation({ ...input, payload: { early: false } }), jobs[0])
    assert.deepEqual(await io.getAction(input.sessionId, 'finish'), finish)
    assert.deepEqual(await io.listOpportunities(input.sessionId), opportunities)
    const nonUniversal = await allocate()
    const original = await io.listOpportunities(nonUniversal.sessionId)
    await io.requestEvaluation({ ...nonUniversal, universal: false })
    assert.deepEqual(await io.listOpportunities(nonUniversal.sessionId), original)
  })

  await t.test('personal JSON-store allocation can finish through its durable START archive without a sponsored scope or v1 PostgreSQL row', async () => {
    const sessionId = `cr03-personal-${randomUUID()}`
    const { buildRunPin } = await import('../domain/assessments/draftSegments.js')
    const { CORE_TEAMREADY_A_ID, CORE_TEAMREADY_A_FORM_ID } = await import('../domain/assessments/universalForm.js')
    await io.putClientEvent({ sessionId, clientEventId: 'start', kind: 'START', response: {
      runPin: buildRunPin({ scenarioId: CORE_TEAMREADY_A_ID, formId: CORE_TEAMREADY_A_FORM_ID }),
    } })
    const input = { sessionId, taskKey: `evaluate:${sessionId}`, kind: 'EVALUATE_RUN', payload: { early: true }, universal: true }
    assert.equal((await io.requestEvaluation(input)).state, 'QUEUED')
    assert.equal((await io.getAction(sessionId, 'finish')).state, 'APPLIED')
    await io.markErased(sessionId)
    await assert.rejects(io.requestEvaluation(input), { code: 'NOT_FOUND' })
  })

  await t.test('real enqueue SQL fault rolls FINISH and opportunity changes back in the same transaction', async () => {
    const input = await allocate()
    const opportunities = await io.listOpportunities(input.sessionId)
    await query(`CREATE FUNCTION cr03_interrupt_enqueue() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.session_id = '${input.sessionId}' THEN RAISE EXCEPTION 'synthetic enqueue interruption'; END IF; RETURN NEW; END $$`)
    await query('CREATE TRIGGER cr03_enqueue_interrupt BEFORE INSERT ON assessment_jobs FOR EACH ROW EXECUTE FUNCTION cr03_interrupt_enqueue()')
    try {
      await assert.rejects(io.requestEvaluation(input), /synthetic enqueue interruption/)
      assert.equal(await io.getAction(input.sessionId, 'finish'), null)
      assert.equal(await io.getJob(input.taskKey), null)
      assert.deepEqual(await io.listOpportunities(input.sessionId), opportunities)
    } finally {
      await query('DROP TRIGGER cr03_enqueue_interrupt ON assessment_jobs')
      await query('DROP FUNCTION cr03_interrupt_enqueue()')
    }
    assert.equal((await io.requestEvaluation(input)).state, 'QUEUED')
  })

  await t.test('requestEvaluation recovers immutable FINISH but never overwrites another-kind event or missing/erased session', async () => {
    const input = await allocate()
    const finish = await io.acceptAction({ sessionId: input.sessionId, clientEventId: 'finish', kind: 'FINISH', payload: input.payload })
    await io.applyAction(finish.actionId, { response: { state: 'SCORING' } })
    await assert.rejects(io.requestEvaluation({ ...input, payload: { early: false } }), { code: 'CONFLICT' })
    const job = await io.requestEvaluation(input)
    const closed = await io.getAction(input.sessionId, 'finish')
    assert.equal(closed.actionId, finish.actionId)
    assert.equal(closed.acceptedAt, finish.acceptedAt)
    assert.deepEqual(closed.result, { response: { state: 'SCORING' }, closed: true })
    await assert.rejects(io.requestEvaluation({ ...input, kind: 'OTHER_JOB' }), { code: 'CONFLICT' })
    await assert.rejects(io.requestEvaluation({ ...input, sessionId: 'missing-session', taskKey: 'missing-job' }), { code: 'NOT_FOUND' })
    await io.markErased(input.sessionId)
    await assert.rejects(io.requestEvaluation(input), { code: 'NOT_FOUND' })
    assert.equal((await io.getJob(input.taskKey)).jobId, job.jobId)
    const other = await allocate()
    await io.acceptAction({ sessionId: other.sessionId, clientEventId: 'finish', kind: 'MESSAGE', payload: {} })
    await assert.rejects(io.requestEvaluation(other), { code: 'CONFLICT' })
    assert.equal((await io.getAction(other.sessionId, 'finish')).kind, 'MESSAGE')
    assert.equal(await io.getJob(other.taskKey), null)
  })

  await t.test('captureEvaluationInput returns all accepted inputs and the required fingerprint in one SQL snapshot', async () => {
    const w = await setup()
    await io.acceptAction({ sessionId: w.sessionId, clientEventId: 'captured-action', kind: 'MESSAGE', payload: { text: 'Original synthetic action' } })
    await io.putClientEvent({ sessionId: w.sessionId, clientEventId: 'start', kind: 'START', response: { runPin: { methodHash: 'synthetic-original' } } })
    let queries = 0
    const reader = createSessionIoRepoPg({ query: (...args) => { queries++; return query(...args) }, getPool })
    const captured = await reader.captureEvaluationInput(w.sessionId)
    assert.equal(queries, 1)
    assert.equal(captured.actions.length, 2)
    assert.equal(captured.opportunities.length, 1)
    assert.deepEqual(captured.artifactVersions, [])
    assert.equal(captured.runPin.methodHash, 'synthetic-original')
    assert.equal(captured.expectedInputHash, await io.getEvaluationInputHash(w.sessionId))
    captured.actions.find((a) => a.kind === 'MESSAGE').payload.text = 'Changed local copy'
    assert.equal((await io.getAction(w.sessionId, 'captured-action')).payload.text, 'Original synthetic action')
    await io.acceptAction({ sessionId: w.sessionId, clientEventId: 'later-action', kind: 'MESSAGE', payload: {} })
    assert.notEqual(captured.expectedInputHash, await io.getEvaluationInputHash(w.sessionId))
    await io.markErased(w.sessionId)
    await assert.rejects(reader.captureEvaluationInput(w.sessionId), { code: 'NOT_FOUND' })
  })

  await t.test('lease heartbeat outside inference transactions preserves ownership but never revives an expired/reclaimed job', async () => {
    const w = await setup()
    const renewed = await io.renewJobLease(w.job.jobId, w.job.fencingToken, 60000)
    assert.equal(renewed.fencingToken, w.job.fencingToken)
    assert.equal(renewed.attempts, w.job.attempts)
    assert.equal(renewed.state, 'LEASED')
    assert.ok(new Date(renewed.leaseExpiresAt) > new Date(w.job.leaseExpiresAt))
    await query("UPDATE assessment_jobs SET lease_expires_at = clock_timestamp() - interval '1 second' WHERE job_id = $1", [w.job.jobId])
    await assert.rejects(io.renewJobLease(w.job.jobId, w.job.fencingToken, 60000), { code: 'CONFLICT' })
    const reclaimed = await io.claimJob(w.sessionId, 60000)
    await assert.rejects(io.renewJobLease(w.job.jobId, w.job.fencingToken, 60000), { code: 'CONFLICT' })
    await assert.rejects(io.renewJobLease(reclaimed.jobId, reclaimed.fencingToken, 0), { code: 'VALIDATION_FAILED' })
    await io.markErased(w.sessionId)
    await assert.rejects(io.renewJobLease(reclaimed.jobId, reclaimed.fencingToken, 60000), { code: 'NOT_FOUND' })
  })

  await t.test('changed evaluation source context is fenced even with identical advertised payload hash', async () => {
    const w = await setup()
    const accepted = await io.acceptAction({ sessionId: w.sessionId, clientEventId: 'source', kind: 'MESSAGE', payload: { text: 'Original source payload' } })
    await io.applyAction(accepted.actionId, { evaluationContext: { sourceTurn: 1 } })
    const input = await io.captureEvaluationInput(w.sessionId)
    await query(`UPDATE assessment_candidate_actions SET result_json = jsonb_set(result_json, '{evaluationContext,sourceTurn}', '2'::jsonb) WHERE action_id = $1`, [accepted.actionId])
    assert.equal((await io.getAction(w.sessionId, 'source')).payloadHash, accepted.payloadHash)
    assert.notEqual(await io.getEvaluationInputHash(w.sessionId), input.expectedInputHash)
    await assert.rejects(w.apply(undefined, { expectedInputHash: input.expectedInputHash }), { code: 'CONFLICT' })
    await unchanged(w)
  })

  await t.test('response receipt recovery is excluded from the inference fingerprint', async () => {
    const w = await setup()
    const accepted = await io.acceptAction({ sessionId: w.sessionId, clientEventId: 'source', kind: 'MESSAGE', payload: { text: 'Original source payload' } })
    await io.applyAction(accepted.actionId, { evaluationContext: { sourceTurn: 1 } })
    const input = await io.captureEvaluationInput(w.sessionId)
    await io.saveActionResponse(accepted.actionId, { nextOpportunityId: 'synthetic-next' })
    assert.equal(await io.getEvaluationInputHash(w.sessionId), input.expectedInputHash)
    assert.equal((await w.apply(undefined, { expectedInputHash: input.expectedInputHash })).job.state, 'DONE')
  })

  await t.test('a matching fingerprint cannot authorize a missing/failed FINISH or unsettled accepted work', async () => {
    for (const condition of ['missing finish', 'failed finish', 'pending work']) {
      const w = await setup()
      if (condition === 'missing finish') await query("DELETE FROM assessment_candidate_actions WHERE session_id = $1 AND kind = 'FINISH'", [w.sessionId])
      if (condition === 'failed finish') await io.failAction((await io.getAction(w.sessionId, 'finish')).actionId, 'SYNTHETIC_FAILURE')
      if (condition === 'pending work') await io.acceptAction({ sessionId: w.sessionId, clientEventId: 'pending', kind: 'MESSAGE', payload: {} })
      const input = await io.captureEvaluationInput(w.sessionId)
      await assert.rejects(w.apply(() => assert.fail('ineligible run reached writer'), { expectedInputHash: input.expectedInputHash }), { code: 'CONFLICT' })
      await unchanged(w)
    }
  })

  await t.test('saveActionResponse preserves the applied effect, persists across replay without a receipt, and respects erasure', async () => {
    const sessionId = `cr03-${randomUUID()}`
    const input = { sessionId, clientEventId: 'synthetic-action', kind: 'MESSAGE', payload: { text: 'Synthetic action' } }
    const accepted = await io.acceptAction(input)
    await assert.rejects(io.saveActionResponse(accepted.actionId, {}), { code: 'CONFLICT' })
    const applied = await io.applyAction(accepted.actionId, { turn: 1, engineEffect: 'synthetic-applied-once' })
    const response = { sessionId, nextOpportunityId: 'synthetic-next', state: 'ACTIVE' }
    const saved = await io.saveActionResponse(applied.actionId, response)
    assert.deepEqual(saved, { ...applied, result: { ...applied.result, response } })
    assert.equal(await io.getClientEvent(sessionId, input.clientEventId), null, 'no separate receipt effect')
    const replay = await io.acceptAction(input)
    assert.deepEqual(replay.result.response, response)
    const repeated = await io.saveActionResponse(applied.actionId, { state: 'DIFFERENT' })
    assert.deepEqual(repeated, saved, 'retries cannot replace the response already returned by the engine')
    await io.markErased(sessionId)
    await assert.rejects(io.saveActionResponse(applied.actionId, {}), { code: 'NOT_FOUND' })
  })

  await t.test('SQL failure after the first real insert rolls back the entire accepted batch', async () => {
    const w = await setup()
    let calls = 0
    await assert.rejects(w.apply(async (u, tx) => {
      if (++calls === 2) await tx.client.query('SELECT 1 / 0')
      return graph.recordEvidenceUnit(u, tx)
    }), { code: '22012' })
    await unchanged(w)
    const result = await w.apply()
    assert.equal(result.job.state, 'DONE')
    assert.equal((await graph.getEvidenceUnits(w.sessionId)).length, 2)
    await graph.recordEvidenceUnit(unit(w.sessionId, 'a'))
    assert.equal((await graph.getEvidenceUnits(w.sessionId)).length, 2, 'logical evidence key is idempotent')
  })

  await t.test('lease expiry during a real transaction rolls back staged inserts', async () => {
    const w = await setup()
    await query(`UPDATE assessment_jobs SET lease_expires_at = clock_timestamp() + interval '100 milliseconds' WHERE job_id = $1`, [w.job.jobId])
    let calls = 0
    await assert.rejects(w.apply(async (u, tx) => {
      const result = await graph.recordEvidenceUnit(u, tx)
      if (++calls === 1) await tx.client.query('SELECT pg_sleep(0.15)')
      return result
    }), { code: 'CONFLICT' })
    await unchanged(w)
  })

  await t.test('terminating the actual transaction connection cannot leave accepted evidence behind', async () => {
    const w = await setup()
    await assert.rejects(w.apply(async (u, tx) => {
      await graph.recordEvidenceUnit(u, tx)
      const { rows } = await tx.client.query('SELECT pg_backend_pid() AS pid')
      // The synthetic disconnect can also emit a socket error after the
      // active query fails; keep it local to this deliberately killed client.
      tx.client.on('error', () => {})
      await Promise.all([
        tx.client.query('SELECT pg_sleep(1)'),
        query('SELECT pg_terminate_backend($1)', [rows[0].pid]),
      ])
      return u
    }), { code: '57P01' })
    await unchanged(w)
    assert.equal((await w.apply()).job.state, 'DONE', 'the retry uses a healthy pooled connection')
  })

  await t.test('changed inputs and foreign evidence/opportunities refuse acceptance before persistence', async () => {
    const w = await setup()
    await assert.rejects(w.apply(undefined, { units: [unit('foreign', 'a')] }), { code: 'VALIDATION_FAILED' })
    await assert.rejects(w.apply(undefined, { evaluatedOpportunityIds: ['missing'] }), { code: 'CONFLICT' })
    await io.acceptAction({ sessionId: w.sessionId, clientEventId: 'late-action', kind: 'MESSAGE', payload: { synthetic: true } })
    await assert.rejects(w.apply(), { code: 'CONFLICT' })
    await unchanged(w)
  })

  await t.test('erasure serializes against an absent tombstone and blocks late report/evidence append', async () => {
    const w = await setup()
    let started
    let release
    const inWriter = new Promise((r) => { started = r })
    const resume = new Promise((r) => { release = r })
    let first = true
    const applying = w.apply(async (u, tx) => {
      const result = await graph.recordEvidenceUnit(u, tx)
      if (first) { first = false; started(); await resume }
      return result
    })
    await inWriter
    const erasing = eraseCampusSessionData(w.sessionId)
    release()
    await applying
    await erasing
    assert.equal(await isErased(w.sessionId), true)
    assert.deepEqual(await graph.getEvidenceUnits(w.sessionId), [])
    await assert.rejects(graph.recordEvidenceUnit(unit(w.sessionId, 'late')), { code: 'NOT_FOUND' })
    await assert.rejects(reports.append({ sessionId: w.sessionId, version: 1, contentHash: 'late', builderVersion: 'synthetic', report: {} }), { code: 'NOT_FOUND' })
    await assert.rejects(io.enqueueJob({ taskKey: `late-${w.sessionId}`, sessionId: w.sessionId, kind: w.sessionId }), { code: 'NOT_FOUND' })
  })

  await t.test('marker remains durable when deletion transaction is interrupted', async () => {
    const w = await setup()
    await graph.recordEvidenceUnit(unit(w.sessionId, 'before-erasure'))
    // A per-session synthetic delete trigger interrupts the actual cascade.
    await query(`CREATE FUNCTION cr03_interrupt_delete() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF OLD.session_id = '${w.sessionId}' THEN RAISE EXCEPTION 'synthetic delete interruption'; END IF; RETURN OLD; END $$`)
    await query('CREATE TRIGGER cr03_interrupt BEFORE DELETE ON assessment_jobs FOR EACH ROW EXECUTE FUNCTION cr03_interrupt_delete()')
    try {
      await assert.rejects(eraseCampusSessionData(w.sessionId), /synthetic delete interruption/)
      assert.equal(await isErased(w.sessionId), true)
      assert.notEqual(await io.getJob(w.job.taskKey), null, 'deletes rolled back')
      assert.equal((await query('SELECT COUNT(*)::int AS n FROM behavioral_evidence_units WHERE session_id = $1', [w.sessionId])).rows[0].n, 1, 'evidence delete also rolled back')
      assert.deepEqual(await graph.getEvidenceUnits(w.sessionId), [], 'a durable marker prevents disclosure while deletion is retried')
      await assert.rejects(w.apply(), { code: 'NOT_FOUND' })
    } finally {
      await query('DROP TRIGGER cr03_interrupt ON assessment_jobs')
      await query('DROP FUNCTION cr03_interrupt_delete()')
    }
  })

  await t.test('report append shares the erasure transaction fence and persists correction metadata', async () => {
    const sessionId = `cr03-${randomUUID()}`
    const row = { sessionId, version: 1, contentHash: 'initial', builderVersion: 'synthetic-method', report: {} }
    await reports.append(row)
    await reports.append({ ...row, version: 2, contentHash: 'corrected', priorVersion: 1, reason: 'REVIEW_CORRECTION',
      publicationNote: 'Specific persisted correction reason.', issuedAt: '2026-10-05T00:00:00.000Z' })
    assert.equal((await reports.get(sessionId, 2)).publicationNote, 'Specific persisted correction reason.')
    assert.equal((await reports.listVersions(sessionId))[1].priorVersion, 1)
    let locked
    let release
    const ready = new Promise((r) => { locked = r })
    const resume = new Promise((r) => { release = r })
    const marking = withTransaction(getPool, async (client) => {
      await lockPublication(client, sessionId)
      await client.query('INSERT INTO assessment_erasure_markers (session_id) VALUES ($1)', [sessionId])
      locked()
      await resume
    })
    await ready
    const appending = reports.append({ ...row, version: 3, contentHash: 'too-late', priorVersion: 2 })
    const refused = assert.rejects(appending, { code: 'NOT_FOUND' })
    release()
    await marking
    await refused
    assert.equal(await reports.latest(sessionId), null)
    assert.equal((await query('SELECT COUNT(*)::int AS n FROM student_report_versions WHERE session_id = $1', [sessionId])).rows[0].n, 2)
  })
})
