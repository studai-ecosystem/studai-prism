// P9.6 alert detectors: pure, reference-only (ids and counts), no learner content.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ALERT_KINDS, ALERT_VIEWS, DEFAULT_THRESHOLDS, runAllDetectors,
  detectZeroEvidenceClusters, detectAcceptedActionsWithoutJobs, detectJobsWithoutAppliedResults, detectClaimRejectionSpike,
  detectExpiredLeases, detectRepeatedBegin, detectOwnershipConflicts, detectCrossScopeDenials,
  detectCostOutliers, detectRecoveryCreditAnomalies,
} from '../domain/metrics/alerts.js'

const NOW = Date.parse('2026-10-02T12:00:00Z')

test('zero-evidence clusters: technical failures do not count; below threshold is silent', () => {
  const runs = [
    { sessionId: 's1', submitted: true, unitCount: 0 }, { sessionId: 's2', submitted: true, unitCount: 0 },
    { sessionId: 's3', submitted: true, unitCount: 0, technicalFailure: true }, { sessionId: 's4', submitted: false, unitCount: 0 },
  ]
  assert.deepEqual(detectZeroEvidenceClusters(runs), [])
  const fired = detectZeroEvidenceClusters([...runs, { sessionId: 's5', submitted: true, unitCount: 0 }])
  assert.equal(fired.length, 1)
  assert.deepEqual(fired[0].refs.sessionIds, ['s1', 's2', 's5'])
})

test('accepted FINISH without a job, DONE job without publication, expired leases', () => {
  const a = detectAcceptedActionsWithoutJobs(
    [{ sessionId: 's1', kind: 'FINISH', state: 'ACCEPTED' }, { sessionId: 's2', kind: 'FINISH', state: 'APPLIED' }, { sessionId: 's3', kind: 'MESSAGE', state: 'APPLIED' }],
    [{ sessionId: 's2', state: 'DONE' }],
  )
  assert.deepEqual(a[0].refs.sessionIds, ['s1'])
  const jobs = [
    { jobId: 'j1', sessionId: 's1', state: 'DONE', updatedAt: new Date(NOW - 60 * 60000).toISOString() },
    { jobId: 'j2', sessionId: 's2', state: 'DONE', updatedAt: new Date(NOW - 60 * 60000).toISOString() },
    { jobId: 'j3', sessionId: 's3', state: 'DONE', updatedAt: new Date(NOW - 60000).toISOString() },
    { jobId: 'j4', sessionId: 's4', state: 'LEASED', leaseExpiresAt: new Date(NOW - 1000).toISOString() },
    { jobId: 'j5', sessionId: 's5', state: 'LEASED', leaseExpiresAt: new Date(NOW + 60000).toISOString() },
  ]
  const j = detectJobsWithoutAppliedResults(jobs, ['s2'], { now: NOW })
  assert.deepEqual(j[0].refs.jobIds, ['j1'])
  const e = detectExpiredLeases(jobs, { now: NOW })
  assert.deepEqual(e[0].refs.jobIds, ['j4'])
})

test('claim-rejection spike needs a minimum unit count and the configured rate', () => {
  const units = Array.from({ length: 10 }, (_, i) => ({ sessionId: `s${i % 3}`, evidenceStatus: i < 3 ? 'HUMAN_REVIEW_REQUIRED' : 'PROVISIONAL', reason: i < 3 ? 'QUOTE_MISMATCH' : null }))
  const fired = detectClaimRejectionSpike(units)
  assert.equal(fired.length, 1)
  assert.equal(fired[0].rate, 0.3)
  assert.deepEqual(detectClaimRejectionSpike(units.slice(0, 5)), [], 'below the minimum unit count')
  assert.deepEqual(detectClaimRejectionSpike(units.map((u) => ({ ...u, reason: null }))), [])
})

test('repeated begin, ownership conflicts and cross-scope denials are keyed by references only', () => {
  const b = detectRepeatedBegin([{ sessionId: 's1' }, { sessionId: 's1' }, { sessionId: 's1' }, { sessionId: 's2' }])
  assert.deepEqual(b.map((x) => [x.refs.sessionIds[0], x.count]), [['s1', 3]])
  const o = detectOwnershipConflicts([{ sessionId: 's9', state: 'CONFLICT' }, { sessionId: 's8', claimedByCount: 1 }])
  assert.deepEqual(o[0].refs.sessionIds, ['s9'])
  const d = detectCrossScopeDenials([
    ...Array.from({ length: 5 }, (_, i) => ({ actorHash: 'h1', requestId: `r${i}`, crossScope: true })),
    { actorHash: 'h2', requestId: 'rx', crossScope: true }, { actorHash: 'h1', requestId: 'ry', crossScope: false },
  ])
  assert.equal(d.length, 1)
  assert.equal(d[0].refs.actorHash, 'h1')
  assert.equal(d[0].count, 5)
})

test('runAllDetectors emits only known kinds and never carries content fields', () => {
  const out = runAllDetectors({
    runs: [{ sessionId: 's1', submitted: true, unitCount: 0 }, { sessionId: 's2', submitted: true, unitCount: 0 }, { sessionId: 's3', submitted: true, unitCount: 0 }],
    actions: [{ sessionId: 's1', kind: 'FINISH', state: 'ACCEPTED', payload: { text: 'secret learner text' } }],
    jobs: [], published: [], units: [], beginRequests: [], ownershipClaims: [], denials: [],
    costs: [{ requestId: 'r-cost', jobId: 'j-cost', minorUnits: 900, prompt: 'secret learner text' }],
    recoveries: [{ grantId: 'g1', requestId: 'r-credit', kind: 'RECOVERY_CREDIT', status: 'PENDING', learnerText: 'secret learner text' }],
  }, { now: NOW })
  assert.ok(out.length >= 2)
  for (const a of out) assert.ok(ALERT_KINDS.includes(a.kind), a.kind)
  const raw = JSON.stringify(out)
  assert.equal(raw.includes('secret learner text'), false)
  assert.equal(/"(text|payload|email|name)"/.test(raw), false)
  assert.ok(Object.isFrozen(DEFAULT_THRESHOLDS))
  assert.deepEqual(detectCostOutliers([{ requestId: 'r1', minorUnits: 499 }]), [])
  assert.equal(detectCostOutliers([{ requestId: 'r2', jobId: 'j2', minorUnits: 500 }])[0].refs.requestIds[0], 'r2')
  assert.deepEqual(detectRecoveryCreditAnomalies([{ grantId: 'g2', kind: 'RECOVERY_CREDIT', status: 'APPROVED_APPLIED' }]), [])
  assert.equal(detectRecoveryCreditAnomalies([{ grantId: 'g3', kind: 'RECOVERY_CREDIT', status: 'PENDING' }])[0].refs.grantIds[0], 'g3')
  assert.ok(Object.isFrozen(ALERT_VIEWS))
})
