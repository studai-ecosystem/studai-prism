import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { EvidenceGraph } from '../lib/evidenceGraph.js'
import { createReportService } from '../domain/reports/v3/service.js'
import { buildRunPin } from '../domain/assessments/draftSegments.js'
import { methodHash } from '../domain/assessments/frozenMethod.js'
import { CORE_TEAMREADY_A_ID, CORE_TEAMREADY_A_FORM_ID } from '../domain/assessments/universalForm.js'

const unit = (sessionId, id) => ({
  evidence_id: id, session_id: sessionId, capability_id: 'CAP-REASONING',
  candidate_action: { dialogue_excerpt: 'Synthetic action' },
  observable_behavior: 'Synthetic observation', provenance: { rubric_version: 'synthetic-v1' },
  rubric_level: 2, rubric_label: 'Synthetic', source_type: 'DIALOGUE_TURN', source_turn: 1,
})

async function run() {
  let at = new Date()
  const repos = createMemoryCampusRepos({ clock: () => at })
  const sessionId = `cr03-${randomUUID()}`
  const graph = new EvidenceGraph()
  await repos.sessionIo.upsertOpportunity({ sessionId, opportunityId: 'opp', capabilityId: 'CAP-REASONING', state: 'ACTION_RECEIVED' })
  await repos.sessionIo.acceptAction({ sessionId, clientEventId: 'finish', kind: 'FINISH', payload: { early: true } })
  await repos.sessionIo.enqueueJob({ taskKey: `evaluate:${sessionId}`, sessionId, kind: 'EVALUATE' })
  const job = await repos.sessionIo.claimJob('EVALUATE', 1000)
  const expectedInputHash = await repos.sessionIo.getEvaluationInputHash(sessionId)
  const apply = (options = {}) => repos.sessionIo.applyEvaluation({
    ...job, sessionId, expectedInputHash, units: [unit(sessionId, 'cr03-unit-1'), unit(sessionId, 'cr03-unit-2')],
    evaluatedOpportunityIds: ['opp'], writeUnit: (u, tx) => graph.recordEvidenceUnit(u, tx), ...options,
  })
  return { repos, graph, sessionId, job, apply, advance: () => { at = new Date(at.getTime() + 1001) } }
}

async function allocatedRequest() {
  const repos = createMemoryCampusRepos()
  const sessionId = `cr03-${randomUUID()}`
  await repos.scopes.createSessionScope({
    sessionId, ownerUserId: 'synthetic-owner', sponsorType: 'PERSONAL', workspaceId: 'synthetic-workspace',
    visibilityPolicy: 'OWNER_ONLY', createdBy: 'synthetic-owner',
  })
  await repos.sessionIo.upsertOpportunity({ sessionId, opportunityId: 'answered', capabilityId: 'CAP-REASONING', state: 'ACTION_RECEIVED' })
  await repos.sessionIo.upsertOpportunity({ sessionId, opportunityId: 'unanswered', capabilityId: 'CAP-REASONING', state: 'PRESENTED' })
  return { repos, input: { sessionId, taskKey: `evaluate:${sessionId}`, kind: 'EVALUATE_RUN', payload: { early: true }, universal: true } }
}

test('CR03 accepted-receipt interruption rolls back the entire evidence batch and leaves the job reclaimable', async () => {
  const w = await run()
  const set = w.repos.db.clientEvents.set
  w.repos.db.clientEvents.set = function (key, value) {
    if (value.kind === 'EVALUATION_ACCEPTED') throw new Error('Synthetic accepted-receipt outage')
    return set.call(this, key, value)
  }
  await assert.rejects(w.apply(), /Synthetic accepted-receipt outage/)
  assert.deepEqual(await w.graph.getEvidenceUnits(w.sessionId), [])
  assert.equal((await w.repos.sessionIo.getJob(w.job.taskKey)).state, 'LEASED')
  assert.equal((await w.repos.sessionIo.listOpportunities(w.sessionId))[0].state, 'ACTION_RECEIVED')
  w.repos.db.clientEvents.set = set
  await w.apply()
  assert.equal((await w.graph.getEvidenceUnits(w.sessionId)).length, 2)
  assert.equal((await w.repos.sessionIo.getJob(w.job.taskKey)).state, 'DONE')
})

test('CR03 memory: requestEvaluation atomically closes FINISH, queues answered opportunities and inserts one logical job', async () => {
  const { repos, input } = await allocatedRequest()
  const jobs = await Promise.all(Array.from({ length: 3 }, () => repos.sessionIo.requestEvaluation(input)))
  assert.ok(jobs.every((job) => job.jobId === jobs[0].jobId))
  const finish = await repos.sessionIo.getAction(input.sessionId, 'finish')
  assert.equal(finish.kind, 'FINISH')
  assert.equal(finish.state, 'APPLIED')
  assert.deepEqual(finish.result, { closed: true })
  assert.deepEqual(finish.payload, input.payload)
  assert.equal(jobs[0].state, 'QUEUED')
  const opportunities = await repos.sessionIo.listOpportunities(input.sessionId)
  assert.equal(opportunities.find((o) => o.opportunityId === 'answered').state, 'EVALUATION_PENDING')
  assert.equal(opportunities.find((o) => o.opportunityId === 'unanswered').state, 'PRESENTED')
  const replay = await repos.sessionIo.requestEvaluation({ ...input, payload: { early: false } })
  assert.deepEqual(replay, jobs[0], 'an already-present logical job wins without rewriting FINISH')
  assert.deepEqual(await repos.sessionIo.getAction(input.sessionId, 'finish'), finish)
  assert.deepEqual(await repos.sessionIo.listOpportunities(input.sessionId), opportunities)
  const nonUniversal = await allocatedRequest()
  const original = await nonUniversal.repos.sessionIo.listOpportunities(nonUniversal.input.sessionId)
  await nonUniversal.repos.sessionIo.requestEvaluation({ ...nonUniversal.input, universal: false })
  assert.deepEqual(await nonUniversal.repos.sessionIo.listOpportunities(nonUniversal.input.sessionId), original)
})

test('CR03 memory: enqueue interruption rolls the new FINISH marker and opportunity changes back together', async () => {
  const { repos, input } = await allocatedRequest()
  const opportunities = await repos.sessionIo.listOpportunities(input.sessionId)
  const set = repos.db.assessmentJobs.set
  repos.db.assessmentJobs.set = function (k, value) {
    if (k === input.taskKey) throw new Error('synthetic-enqueue-interruption')
    return set.call(this, k, value)
  }
  try {
    await assert.rejects(repos.sessionIo.requestEvaluation(input), /synthetic-enqueue-interruption/)
  } finally { repos.db.assessmentJobs.set = set }
  assert.equal(await repos.sessionIo.getAction(input.sessionId, 'finish'), null)
  assert.equal(await repos.sessionIo.getJob(input.taskKey), null)
  assert.deepEqual(await repos.sessionIo.listOpportunities(input.sessionId), opportunities)
  assert.equal((await repos.sessionIo.requestEvaluation(input)).state, 'QUEUED')
})

test('CR03 memory: requestEvaluation recovers immutable FINISH, preserves results and rejects missing/erased or colliding keys', async () => {
  const { repos, input } = await allocatedRequest()
  const finish = await repos.sessionIo.acceptAction({ sessionId: input.sessionId, clientEventId: 'finish', kind: 'FINISH', payload: input.payload })
  await repos.sessionIo.applyAction(finish.actionId, { response: { state: 'SCORING' } })
  await assert.rejects(repos.sessionIo.requestEvaluation({ ...input, payload: { early: false } }), { code: 'CONFLICT' })
  const job = await repos.sessionIo.requestEvaluation(input)
  const closed = await repos.sessionIo.getAction(input.sessionId, 'finish')
  assert.equal(closed.actionId, finish.actionId)
  assert.equal(closed.acceptedAt, finish.acceptedAt)
  assert.deepEqual(closed.result, { response: { state: 'SCORING' }, closed: true })
  await assert.rejects(repos.sessionIo.requestEvaluation({ ...input, kind: 'OTHER_JOB' }), { code: 'CONFLICT' })
  await assert.rejects(repos.sessionIo.requestEvaluation({ ...input, sessionId: 'missing-session', taskKey: 'missing-job' }), { code: 'NOT_FOUND' })
  await repos.sessionIo.markErased(input.sessionId)
  await assert.rejects(repos.sessionIo.requestEvaluation(input), { code: 'NOT_FOUND' })
  assert.equal((await repos.sessionIo.getJob(input.taskKey)).jobId, job.jobId)
  const other = await allocatedRequest()
  await other.repos.sessionIo.acceptAction({ sessionId: other.input.sessionId, clientEventId: 'finish', kind: 'MESSAGE', payload: {} })
  await assert.rejects(other.repos.sessionIo.requestEvaluation(other.input), { code: 'CONFLICT' })
  assert.equal((await other.repos.sessionIo.getAction(other.input.sessionId, 'finish')).kind, 'MESSAGE')
  assert.equal(await other.repos.sessionIo.getJob(other.input.taskKey), null)
})

test('CR03 memory: second writer failure rolls back evidence, opportunities and job completion', async () => {
  const w = await run()
  let calls = 0
  await assert.rejects(w.apply({ writeUnit: async (u, tx) => {
    if (++calls === 2) throw new Error('synthetic-interruption')
    return w.graph.recordEvidenceUnit(u, tx)
  } }), /synthetic-interruption/)
  assert.deepEqual(await w.graph.getEvidenceUnits(w.sessionId), [])
  assert.equal((await w.repos.sessionIo.listOpportunities(w.sessionId))[0].state, 'ACTION_RECEIVED')
  assert.equal((await w.repos.sessionIo.getJob(w.job.taskKey)).state, 'LEASED')
  const accepted = await w.apply()
  assert.equal(accepted.units.length, 2)
  assert.equal(accepted.job.state, 'DONE')
  assert.equal((await w.graph.getEvidenceUnits(w.sessionId)).length, 2)
  await assert.rejects(w.apply(), { code: 'CONFLICT' })
})

test('CR03 memory: lease expiry after staging leaves no evidence', async () => {
  const w = await run()
  await assert.rejects(w.apply({ writeUnit: async (u, tx) => {
    const result = await w.graph.recordEvidenceUnit(u, tx)
    w.advance()
    return result
  } }), { code: 'CONFLICT' })
  assert.deepEqual(await w.graph.getEvidenceUnits(w.sessionId), [])
})

test('CR03 memory: changed input and foreign session units are rejected atomically', async () => {
  const w = await run()
  await assert.rejects(w.apply({ units: [unit('foreign-session', 'foreign-unit')] }), { code: 'VALIDATION_FAILED' })
  await assert.rejects(w.apply({ writeUnit: async (u, tx) => {
    const result = await w.graph.recordEvidenceUnit(u, tx)
    await w.repos.sessionIo.setOpportunityState(w.sessionId, 'opp', 'REVIEW_REQUIRED')
    return result
  } }), { code: 'CONFLICT' })
  assert.deepEqual(await w.graph.getEvidenceUnits(w.sessionId), [])
})

test('CR03 memory: changing the persisted START method invalidates computed acceptance', async () => {
  const w = await run()
  await w.repos.sessionIo.putClientEvent({
    sessionId: w.sessionId, clientEventId: 'start', kind: 'START',
    response: { runPin: { methodHash: 'synthetic-changed-method' } },
  })
  await assert.rejects(w.apply(), { code: 'CONFLICT' })
  assert.deepEqual(await w.graph.getEvidenceUnits(w.sessionId), [])
})

test('CR03 memory: captureEvaluationInput returns one detached input snapshot and its required fence', async () => {
  const w = await run()
  const io = w.repos.sessionIo
  await io.acceptAction({ sessionId: w.sessionId, clientEventId: 'captured-action', kind: 'MESSAGE', payload: { text: 'Original synthetic action' } })
  await io.putClientEvent({ sessionId: w.sessionId, clientEventId: 'start', kind: 'START', response: { runPin: { methodHash: 'synthetic-original' } } })
  const captured = await io.captureEvaluationInput(w.sessionId)
  assert.equal(captured.actions.length, 2)
  assert.equal(captured.opportunities.length, 1)
  assert.deepEqual(captured.artifactVersions, [])
  assert.equal(captured.runPin.methodHash, 'synthetic-original')
  assert.equal(captured.expectedInputHash, await io.getEvaluationInputHash(w.sessionId))
  captured.actions.find((a) => a.kind === 'MESSAGE').payload.text = 'Changed local copy'
  captured.runPin.methodHash = 'changed-local-copy'
  assert.equal((await io.getAction(w.sessionId, 'captured-action')).payload.text, 'Original synthetic action')
  assert.equal((await io.getClientEvent(w.sessionId, 'start')).response.runPin.methodHash, 'synthetic-original')
  await io.acceptAction({ sessionId: w.sessionId, clientEventId: 'later-action', kind: 'MESSAGE', payload: {} })
  assert.notEqual(captured.expectedInputHash, await io.getEvaluationInputHash(w.sessionId))
})

test('CR03 memory: actual payload, actor, kind and evaluation context fence acceptance independently of advertised hashes', async (t) => {
  const cases = [
    ['payload', (row) => { row.payload.text = 'Changed source payload' }],
    ['actor', (row) => { row.actorKind = 'AI_PARTICIPANT' }],
    ['kind', (row) => { row.kind = 'ARTIFACT' }],
    ['context', (row) => { row.result.evaluationContext.sourceTurn = 2 }],
  ]
  for (const [name, change] of cases) await t.test(name, async () => {
    const w = await run()
    const io = w.repos.sessionIo
    const accepted = await io.acceptAction({ sessionId: w.sessionId, clientEventId: 'source', kind: 'MESSAGE', payload: { text: 'Original source payload' } })
    await io.applyAction(accepted.actionId, { evaluationContext: { sourceTurn: 1 } })
    const input = await io.captureEvaluationInput(w.sessionId)
    const stored = w.repos.db.candidateActions.get(`${w.sessionId}\u0000source`)
    const advertisedHash = stored.payloadHash
    change(stored)
    assert.equal(stored.payloadHash, advertisedHash, 'advertised hash stayed unchanged')
    assert.notEqual(await io.getEvaluationInputHash(w.sessionId), input.expectedInputHash)
    await assert.rejects(w.apply({ expectedInputHash: input.expectedInputHash }), { code: 'CONFLICT' })
    assert.deepEqual(await w.graph.getEvidenceUnits(w.sessionId), [])
  })
})

test('CR03 memory: receipt response recovery does not change the inference fingerprint', async () => {
  const w = await run()
  const io = w.repos.sessionIo
  const accepted = await io.acceptAction({ sessionId: w.sessionId, clientEventId: 'source', kind: 'MESSAGE', payload: { text: 'Original source payload' } })
  await io.applyAction(accepted.actionId, { evaluationContext: { sourceTurn: 1 } })
  const input = await io.captureEvaluationInput(w.sessionId)
  await io.saveActionResponse(accepted.actionId, { nextOpportunityId: 'synthetic-next' })
  assert.equal(await io.getEvaluationInputHash(w.sessionId), input.expectedInputHash)
  assert.equal((await w.apply({ expectedInputHash: input.expectedInputHash })).job.state, 'DONE')
})

test('CR03 memory: a matching fingerprint cannot authorize an unfinished or unsettled run', async (t) => {
  for (const condition of ['missing finish', 'failed finish', 'pending work']) await t.test(condition, async () => {
    const w = await run()
    const io = w.repos.sessionIo
    if (condition === 'missing finish') w.repos.db.candidateActions.delete(`${w.sessionId}\u0000finish`)
    if (condition === 'failed finish') await io.failAction((await io.getAction(w.sessionId, 'finish')).actionId, 'SYNTHETIC_FAILURE')
    if (condition === 'pending work') await io.acceptAction({ sessionId: w.sessionId, clientEventId: 'pending', kind: 'MESSAGE', payload: {} })
    const input = await io.captureEvaluationInput(w.sessionId)
    await assert.rejects(w.apply({ expectedInputHash: input.expectedInputHash, writeUnit: () => assert.fail('ineligible run reached writer') }), { code: 'CONFLICT' })
    assert.equal((await io.getJob(w.job.taskKey)).state, 'LEASED')
    assert.deepEqual(await w.graph.getEvidenceUnits(w.sessionId), [])
  })
})

test('CR03 memory: lease heartbeat preserves ownership and refuses expired, completed, reclaimed or erased jobs', async () => {
  const w = await run()
  const io = w.repos.sessionIo
  const renewed = await io.renewJobLease(w.job.jobId, w.job.fencingToken, 5000)
  assert.equal(renewed.fencingToken, w.job.fencingToken)
  assert.equal(renewed.attempts, w.job.attempts)
  assert.equal(renewed.state, 'LEASED')
  assert.ok(new Date(renewed.leaseExpiresAt) > new Date(w.job.leaseExpiresAt))
  w.advance()
  assert.equal((await w.apply()).job.state, 'DONE', 'renewal supports compute beyond the original lease')
  await assert.rejects(io.renewJobLease(w.job.jobId, w.job.fencingToken, 5000), { code: 'CONFLICT' })
  const stale = await run()
  stale.advance()
  await assert.rejects(stale.repos.sessionIo.renewJobLease(stale.job.jobId, stale.job.fencingToken, 5000), { code: 'CONFLICT' })
  const reclaimed = await stale.repos.sessionIo.claimJob('EVALUATE', 5000)
  await assert.rejects(stale.repos.sessionIo.renewJobLease(stale.job.jobId, stale.job.fencingToken, 5000), { code: 'CONFLICT' })
  await assert.rejects(stale.repos.sessionIo.renewJobLease(reclaimed.jobId, reclaimed.fencingToken, 0), { code: 'VALIDATION_FAILED' })
  await stale.repos.sessionIo.markErased(stale.sessionId)
  await assert.rejects(stale.repos.sessionIo.renewJobLease(reclaimed.jobId, reclaimed.fencingToken, 5000), { code: 'NOT_FOUND' })
})

test('CR03 memory: staged effects roll back if commit is interrupted', async () => {
  const w = await run()
  await assert.rejects(w.apply({ writeUnit: async (u, tx) => {
    const result = await w.graph.recordEvidenceUnit(u, tx)
    if (u.evidence_id.endsWith('2')) tx.memory.stage({ commit: () => { throw new Error('commit-interruption') }, rollback: () => {} })
    return result
  } }), /commit-interruption/)
  assert.deepEqual(await w.graph.getEvidenceUnits(w.sessionId), [])
  assert.equal((await w.repos.sessionIo.getJob(w.job.taskKey)).state, 'LEASED')
})

test('CR03 memory: erasure fences late evidence and report writes and hides stored versions', async () => {
  const w = await run()
  const report = { sessionId: w.sessionId, version: 1, contentHash: 'synthetic', builderVersion: 'synthetic', report: {} }
  await w.repos.reportVersions.append(report)
  await w.repos.sessionIo.markErased(w.sessionId)
  await assert.rejects(w.apply(), { code: 'NOT_FOUND' })
  await assert.rejects(w.graph.recordEvidenceUnit(unit(w.sessionId, 'late-unit')), { code: 'NOT_FOUND' })
  await assert.rejects(w.repos.reportVersions.append({ ...report, version: 2, contentHash: 'late' }), { code: 'NOT_FOUND' })
  assert.equal(await w.repos.reportVersions.latest(w.sessionId), null)
})

test('CR03 memory: saveActionResponse preserves the applied effect and replays the first response without a receipt', async () => {
  const repos = createMemoryCampusRepos()
  const io = repos.sessionIo
  const sessionId = `cr03-response-${randomUUID()}`
  const input = { sessionId, clientEventId: 'synthetic-action', kind: 'MESSAGE', payload: { text: 'Synthetic action' } }
  const accepted = await io.acceptAction(input)
  await assert.rejects(io.saveActionResponse(accepted.actionId, {}), { code: 'CONFLICT' })
  const applied = await io.applyAction(accepted.actionId, { turn: 1, engineEffect: 'synthetic-applied-once' })
  const response = { sessionId, nextOpportunityId: 'synthetic-next', state: 'ACTIVE' }
  const saved = await io.saveActionResponse(applied.actionId, response)
  assert.deepEqual(saved, { ...applied, result: { ...applied.result, response } }, 'no other action fields change')
  assert.equal(await io.getClientEvent(sessionId, input.clientEventId), null, 'saving the response does not create a receipt')
  const replay = await io.acceptAction(input)
  assert.deepEqual(replay.result.response, response, 'an ack-lost action already carries its exact next-stage response')
  const repeated = await io.saveActionResponse(applied.actionId, { state: 'DIFFERENT' })
  assert.deepEqual(repeated, saved, 'the first response wins; retries cannot overwrite it')
  response.state = 'MUTATED_BY_CALLER'
  assert.equal((await io.getAction(sessionId, input.clientEventId)).result.response.state, 'ACTIVE')
  await io.markErased(sessionId)
  await assert.rejects(io.saveActionResponse(applied.actionId, {}), { code: 'NOT_FOUND' })
})

test('CR03 report reads: legacy GET never publishes; explicit publication is stable and versions are exact', async () => {
  const repos = createMemoryCampusRepos()
  const sessionId = 'cr03-historical-reader'
  const user = { id: 'synthetic-reader', name: 'Synthetic Reader' }
  let catalogReads = 0
  const legacy = {
    getSession: async () => ({ userId: user.id, scenarioId: CORE_TEAMREADY_A_ID, history: [] }),
    getReport: async () => ({ userId: user.id, issuedAt: '2026-10-01T00:00:00.000Z' }),
  }
  const service = createReportService({
    repos, legacy, catalog: { getCatalog: async () => { catalogReads++; return { definitions: [], forms: [] } } },
    evidence: { units: async () => [] }, scenarioSource: async () => ({ generalScenarios: [], bankScenarios: {} }),
    sessionScopes: { authorizeSponsorRead: async () => ({ scope: { ownerUserId: user.id }, via: 'SHARE_GRANT', disclosure: 'SUMMARY' }) },
    dataAccess: { record: async () => {} },
  })
  const owner = (reportVersion = null) => service.forOwner({ user, workspace: { type: 'PERSONAL' }, sessionId, reportVersion })
  await assert.rejects(owner(), { code: 'REPORT_NOT_READY' })
  await assert.rejects(service.forSponsor({ req: {}, actor: {}, organizationId: 'synthetic-org', sessionId }), { code: 'REPORT_NOT_READY' })
  const beforeShare = await service.createShare({ user, workspace: { type: 'PERSONAL' }, sessionId, recipientType: 'LINK', disclosureLevel: 'SUMMARY', expiresInDays: 1 })
  await assert.rejects(service.forShare({ req: {}, token: beforeShare.token }), { code: 'NOT_FOUND' })
  assert.equal(catalogReads, 0)
  assert.equal(repos.db.reportVersions.length, 0)
  await assert.rejects(service.publish(sessionId), { code: 'PINNED_METHOD_UNAVAILABLE' })
  // This fixture declares its synthetic allocation archive explicitly.
  await repos.sessionIo.putClientEvent({ sessionId, clientEventId: 'start', kind: 'START', response: {
    runPin: buildRunPin({ scenarioId: CORE_TEAMREADY_A_ID, formId: CORE_TEAMREADY_A_FORM_ID }),
  } })
  await service.publish(sessionId)
  const first = await owner()
  const stored = structuredClone(repos.db.reportVersions)
  assert.equal(first.version.number, 1)
  await owner()
  assert.equal(catalogReads, 2, 'only the two explicit publication attempts read the catalogue')
  assert.deepEqual(repos.db.reportVersions, stored)
  const body2 = { ...stored[0].report, syntheticHistoricalMarker: 'version-2' }
  await repos.reportVersions.append({
    sessionId, version: 2, priorVersion: 1, contentHash: 'synthetic-correction', builderVersion: 'synthetic-method',
    report: body2, reason: 'REVIEW_CORRECTION', publicationNote: 'Specific historical correction reason.', issuedAt: '2026-10-02T00:00:00.000Z',
  })
  const exact = await owner(1)
  assert.equal(exact.version.number, 1)
  const sponsor = await service.forSponsor({ req: {}, actor: {}, organizationId: 'synthetic-org', sessionId, reportVersion: 1 })
  assert.equal(sponsor.version.number, exact.version.number)
  assert.equal('publicationNote' in sponsor.version, false, 'free-text correction reasons are not widened to shared summaries')
  const share = await service.createShare({ user, workspace: { type: 'PERSONAL' }, sessionId, recipientType: 'LINK', disclosureLevel: 'SUMMARY', expiresInDays: 1 })
  const shared = await service.forShare({ req: {}, token: share.token, reportVersion: 1 })
  assert.equal(shared.version.number, exact.version.number)
  assert.equal('publicationNote' in shared.version, false)
  await assert.rejects(owner(9), { code: 'NOT_FOUND' })
  await assert.rejects(owner('1'), { code: 'VALIDATION_FAILED' })
  const versions = await repos.reportVersions.listVersions(sessionId)
  assert.equal(versions[1].publicationNote, 'Specific historical correction reason.')
  assert.equal(versions[1].builderVersion, 'synthetic-method')
  assert.equal(versions[1].priorVersion, 1)
  assert.equal(versions[1].issuedAt, '2026-10-02T00:00:00.000Z')
})

test('CR03 historical-reader publication: coverage uses the archived START form, never the current module', async () => {
  const repos = createMemoryCampusRepos()
  const sessionId = 'cr03-archived-coverage'
  const user = { id: 'synthetic-archived-reader' }
  const pin = structuredClone(buildRunPin({ scenarioId: CORE_TEAMREADY_A_ID, formId: CORE_TEAMREADY_A_FORM_ID }))
  const form = pin.methodSnapshot.snapshot.form
  const currentPlanned = form.opportunities.filter((o) => o.required).length
  form.opportunities.find((o) => o.required).required = false
  pin.snapshotHash = methodHash(form)
  pin.methodHash = methodHash(pin.methodSnapshot)
  await repos.sessionIo.putClientEvent({ sessionId, clientEventId: 'start', kind: 'START', response: { runPin: pin } })
  await repos.sessionIo.upsertOpportunity({ sessionId, opportunityId: form.opportunities[0].id, capabilityId: 'CAP-REASONING', state: 'EVALUATED' })
  const service = createReportService({
    repos, legacy: {
      getSession: async () => ({ userId: user.id, scenarioId: CORE_TEAMREADY_A_ID, history: [] }),
      getReport: async () => ({ userId: user.id, issuedAt: '2026-10-01T00:00:00.000Z' }),
    },
    catalog: { getCatalog: async () => ({ definitions: [], forms: [] }) },
    evidence: { units: async () => [] }, scenarioSource: async () => ({ generalScenarios: [], bankScenarios: {} }),
  })
  await service.publish(sessionId)
  const read = () => service.forOwner({ user, workspace: { type: 'PERSONAL' }, sessionId })
  const published = await read()
  assert.equal(published.report.coverage.planned, currentPlanned - 1, 'the archived form differs from the current authored module')
  const start = repos.db.clientEvents.get(`${sessionId}\u0000start`)
  start.response.runPin.methodHash = 'unavailable-method'
  assert.deepEqual((await read()).report, published.report, 'GET never resolves or rebuilds an issued method')
  await assert.rejects(service.publish(sessionId, { reason: 'RE_ANALYSIS', note: 'Specific archived re-analysis request.' }), { code: 'PINNED_METHOD_UNAVAILABLE' })
  assert.equal(repos.db.reportVersions.length, 1)
})
