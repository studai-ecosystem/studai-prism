// P1.5/P1.6 durable acceptance foundation (memory repos): candidate actions
// are accepted before the engine runs, replays are detected by payload hash,
// jobs are leased with fencing tokens, and erased sessions fail closed.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryDb } from '../domain/campusStore/memoryDb.js'
import { createSessionIoRepoMemory, payloadHash } from '../domain/assessments/sessionIoRepository.js'
import { createAssessmentSessionService } from '../domain/assessments/sessionService.js'

const setup = () => {
  let t = Date.parse('2026-01-01T00:00:00Z')
  const db = createMemoryDb({ clock: () => new Date(t) })
  return { db, io: createSessionIoRepoMemory(db), tick: (ms) => { t += ms } }
}

test('payload hash is independent of key order and distinguishes changed payloads', () => {
  assert.equal(payloadHash({ a: 1, b: { c: [1, 2] } }), payloadHash({ b: { c: [1, 2] }, a: 1 }))
  assert.notEqual(payloadHash({ text: 'a' }), payloadHash({ text: 'b' }))
})

test('acceptAction: insert, replay on same hash, CONFLICT on different hash, validation', async () => {
  const { io } = setup()
  const a = await io.acceptAction({ sessionId: 's1', clientEventId: 'e1', kind: 'MESSAGE', payload: { text: 'hello' } })
  assert.equal(a.state, 'ACCEPTED')
  assert.equal(a.sequence, 1)
  assert.equal(a.actorKind, 'CANDIDATE')
  const again = await io.acceptAction({ sessionId: 's1', clientEventId: 'e1', kind: 'MESSAGE', payload: { text: 'hello' } })
  assert.equal(again.actionId, a.actionId)
  await assert.rejects(io.acceptAction({ sessionId: 's1', clientEventId: 'e1', kind: 'MESSAGE', payload: { text: 'changed' } }), (e) => e.code === 'CONFLICT')
  await assert.rejects(io.acceptAction({ sessionId: 's1', clientEventId: 'e1', kind: 'ARTIFACT', payload: { text: 'hello' } }), (e) => e.code === 'CONFLICT')
  const b = await io.acceptAction({ sessionId: 's1', clientEventId: 'e2', kind: 'ARTIFACT', payload: { artifactId: 'x', ifMatch: 0 } })
  assert.equal(b.sequence, 2)
  await assert.rejects(io.acceptAction({ sessionId: 's1', clientEventId: '', kind: 'MESSAGE', payload: {} }), (e) => e.code === 'VALIDATION_FAILED')
  await assert.rejects(io.acceptAction({ sessionId: 's1', clientEventId: 'e3', kind: 'START', payload: {} }), (e) => e.code === 'VALIDATION_FAILED')
})

test('applyAction / failAction move state but never mutate the accepted payload', async () => {
  const { io, db } = setup()
  const a = await io.acceptAction({ sessionId: 's1', clientEventId: 'e1', kind: 'MESSAGE', payload: { text: 'hello' } })
  const failed = await io.failAction(a.actionId, 'ENGINE_FAILED')
  assert.equal(failed.state, 'FAILED')
  assert.deepEqual(failed.result, { code: 'ENGINE_FAILED' })
  const applied = await io.applyAction(a.actionId, { messages: [] })
  assert.equal(applied.state, 'APPLIED')
  assert.deepEqual(applied.result, { messages: [] })
  assert.deepEqual(applied.payload, { text: 'hello' })
  assert.equal(applied.payloadHash, a.payloadHash)
  // Terminal APPLIED is sticky: a late failure report does not regress it.
  assert.equal((await io.failAction(a.actionId, 'LATE')).state, 'APPLIED')
  assert.equal(db.candidateActions.size, 1)
  await assert.rejects(io.applyAction('missing', {}), (e) => e.code === 'NOT_FOUND')
})

test('erasure marker: accept and apply fail closed with NOT_FOUND', async () => {
  const { io } = setup()
  const a = await io.acceptAction({ sessionId: 's1', clientEventId: 'e1', kind: 'MESSAGE', payload: { text: 'hello' } })
  assert.equal(await io.hasErasureMarker('s1'), false)
  await io.markErased('s1')
  assert.equal(await io.hasErasureMarker('s1'), true)
  await assert.rejects(io.acceptAction({ sessionId: 's1', clientEventId: 'e2', kind: 'MESSAGE', payload: {} }), (e) => e.code === 'NOT_FOUND')
  await assert.rejects(io.applyAction(a.actionId, {}), (e) => e.code === 'NOT_FOUND')
})

test('jobs: idempotent enqueue, lease with fencing token, stale tokens rejected, lease expiry re-claimable', async () => {
  const { io, tick } = setup()
  const j1 = await io.enqueueJob({ taskKey: 'evaluate:s1', sessionId: 's1', kind: 'EVALUATE' })
  const j1b = await io.enqueueJob({ taskKey: 'evaluate:s1', sessionId: 's1', kind: 'EVALUATE' })
  assert.equal(j1.jobId, j1b.jobId)
  assert.equal(j1.state, 'QUEUED')
  assert.equal(await io.claimJob('OTHER', 1000), null)
  const lease1 = await io.claimJob('EVALUATE', 1000)
  assert.equal(lease1.state, 'LEASED')
  assert.equal(lease1.attempts, 1)
  assert.equal(await io.claimJob('EVALUATE', 1000), null, 'a held lease is not handed out twice')
  tick(1500)
  const lease2 = await io.claimJob('EVALUATE', 1000)
  assert.equal(lease2.jobId, lease1.jobId)
  assert.equal(lease2.attempts, 2)
  assert.ok(lease2.fencingToken > lease1.fencingToken)
  await assert.rejects(io.completeJob(lease1.jobId, lease1.fencingToken), (e) => e.code === 'CONFLICT')
  await assert.rejects(io.failJob(lease1.jobId, lease1.fencingToken), (e) => e.code === 'CONFLICT')
  const done = await io.completeJob(lease2.jobId, lease2.fencingToken, 'COMPLETE')
  assert.equal(done.state, 'DONE')
  assert.equal(done.resultState, 'COMPLETE')
  await assert.rejects(io.completeJob(lease2.jobId, lease2.fencingToken), (e) => e.code === 'CONFLICT')
  assert.equal(await io.claimJob('EVALUATE', 1000), null)
})

test('jobs: failJob with retry backs off, without retry is terminal', async () => {
  const { io, tick } = setup()
  await io.enqueueJob({ taskKey: 'k', kind: 'EVALUATE' })
  const l = await io.claimJob('EVALUATE', 1000)
  const retried = await io.failJob(l.jobId, l.fencingToken, { retryAfterMs: 5000, resultState: 'UPSTREAM' })
  assert.equal(retried.state, 'QUEUED')
  assert.equal(await io.claimJob('EVALUATE', 1000), null)
  tick(5000)
  const l2 = await io.claimJob('EVALUATE', 1000)
  assert.equal(l2.attempts, 2)
  assert.equal((await io.failJob(l2.jobId, l2.fencingToken)).state, 'FAILED')
  assert.equal(await io.claimJob('EVALUATE', 1000), null)
  await assert.rejects(io.enqueueJob({ taskKey: '', kind: 'EVALUATE' }), (e) => e.code === 'VALIDATION_FAILED')
})

function service({ io, session, engine }) {
  return createAssessmentSessionService({
    repos: { kind: 'memory', sessionIo: io },
    legacy: { getSession: async () => ({ ...session }), getReport: async () => null },
    engine,
  })
}

test('sendMessage: engine failure leaves a FAILED action; retry re-drives; result applied once', async () => {
  const { io, db } = setup()
  const user = { id: 'u1' }
  const session = { userId: user.id, exchangeCount: 0 }
  let failOnce = true
  const svc = service({ io, session, engine: { async message() {
    if (failOnce) { failOnce = false; throw new Error('SYNTHETIC_ENGINE_FAILURE') }
    session.exchangeCount += 1
    return { messages: [{ role: 'assistant', content: 'ok' }] }
  } } })
  const args = { user, workspace: { type: 'PERSONAL' }, sessionId: 's1', clientEventId: 'e1', text: 'hi' }
  await assert.rejects(svc.sendMessage(args), /SYNTHETIC_ENGINE_FAILURE/)
  assert.equal((await io.getAction('s1', 'e1')).state, 'FAILED')
  assert.equal(db.clientEvents.size, 0, 'no receipt without an applied result')
  const out = await svc.sendMessage(args)
  assert.equal(out.replayed, false)
  assert.equal(out.exchanges, 1)
  assert.equal((await io.getAction('s1', 'e1')).state, 'APPLIED')
  assert.equal((await svc.sendMessage(args)).replayed, true)
  assert.equal(session.exchangeCount, 1)
  await assert.rejects(svc.sendMessage({ ...args, text: 'other' }), (e) => e.code === 'CONFLICT')
  assert.equal(db.candidateActions.size, 1)
})

test('sendMessage / saveArtifact on an erased session → NOT_FOUND before any engine effect', async () => {
  const { io } = setup()
  const user = { id: 'u1' }
  let effects = 0
  const session = { userId: user.id, exchangeCount: 0, artifacts: [{ artifactId: 'a1', type: 'doc' }] }
  const svc = service({ io, session, engine: { async message() { effects += 1; return { messages: [] } }, async saveArtifact() { effects += 1; return { artifact: { data: {} } } } } })
  await io.markErased('s1')
  const base = { user, workspace: { type: 'PERSONAL' }, sessionId: 's1' }
  await assert.rejects(svc.sendMessage({ ...base, clientEventId: 'e1', text: 'hi' }), (e) => e.code === 'NOT_FOUND')
  await assert.rejects(svc.saveArtifact({ ...base, artifactId: 'a1', ifMatch: 0, clientEventId: 'e2', updates: {} }), (e) => e.code === 'NOT_FOUND')
  assert.equal(effects, 0)
})

test('saveArtifact: accepted before engine; same key different payload → CONFLICT; replay after apply', async () => {
  const { io } = setup()
  const user = { id: 'u1' }
  const session = { userId: user.id, exchangeCount: 0, artifacts: [{ artifactId: 'a1', type: 'doc' }] }
  let effects = 0
  const svc = service({ io, session, engine: { async saveArtifact({ updates }) { effects += 1; return { artifact: { data: updates } } } } })
  const args = { user, workspace: { type: 'PERSONAL' }, sessionId: 's1', artifactId: 'a1', ifMatch: 0, clientEventId: 'e1', updates: { v: 1 }, notes: 'n' }
  const out = await svc.saveArtifact(args)
  assert.equal(out.version, 1)
  assert.equal((await io.getAction('s1', 'e1')).state, 'APPLIED')
  assert.equal((await svc.saveArtifact(args)).replayed, true)
  await assert.rejects(svc.saveArtifact({ ...args, updates: { v: 2 } }), (e) => e.code === 'CONFLICT')
  assert.equal(effects, 1)
  // A stale If-Match with a new key is still the 409 with snapshot (unchanged behaviour).
  await assert.rejects(svc.saveArtifact({ ...args, clientEventId: 'e2', updates: { v: 2 } }), (e) => e.code === 'CONFLICT' && e.details?.version === 1)
  assert.equal((await io.getAction('s1', 'e2')).state, 'FAILED')
})
