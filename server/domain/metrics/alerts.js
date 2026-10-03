// P9.6 alert detectors — pure functions over aggregate rows. Every alert
// carries request/run/job references only (ids and counts), never learner
// content. Thresholds are planning defaults and are passed in explicitly so
// an operator can see what fired and why.
export const ALERT_KINDS = Object.freeze([
  'ZERO_EVIDENCE_CLUSTER',
  'ACCEPTED_ACTIONS_WITHOUT_JOB',
  'JOBS_WITHOUT_APPLIED_RESULT',
  'CLAIM_REJECTION_SPIKE',
  'EXPIRED_LEASES',
  'REPEATED_BEGIN',
  'OWNERSHIP_CONFLICT',
  'CROSS_SCOPE_DENIALS',
  'COST_OUTLIER',
  'RECOVERY_CREDIT_ANOMALY',
])

export const ALERT_VIEWS = Object.freeze({
  OPERATIONAL: Object.freeze(['ACCEPTED_ACTIONS_WITHOUT_JOB', 'JOBS_WITHOUT_APPLIED_RESULT', 'EXPIRED_LEASES', 'REPEATED_BEGIN', 'COST_OUTLIER']),
  MEASUREMENT: Object.freeze(['ZERO_EVIDENCE_CLUSTER', 'CLAIM_REJECTION_SPIKE', 'OWNERSHIP_CONFLICT']),
  CUSTOMER: Object.freeze(['CROSS_SCOPE_DENIALS', 'RECOVERY_CREDIT_ANOMALY']),
})

export const DEFAULT_THRESHOLDS = Object.freeze({
  zeroEvidenceClusterMin: 3,        // submitted runs with zero units in the window
  jobsWithoutResultMinutes: 15,     // DONE/LEASED age without an applied result
  claimRejectionRate: 0.2,          // share of units withheld for QUOTE_MISMATCH
  claimRejectionMinUnits: 10,
  repeatedBeginMin: 3,              // begin requests per session
  crossScopeDenialsMin: 5,          // 404/403 cross-scope per actor in window
  ownershipConflictMin: 1,
  costOutlierMinorUnits: 500,
  recoveryCreditMin: 1,
})

const alert = (kind, severity, refs, detail = {}) => ({ kind, severity, refs, ...detail })

// rows: { sessionId, submitted: boolean, unitCount: number, technicalFailure: boolean }
export function detectZeroEvidenceClusters(runs, t = DEFAULT_THRESHOLDS) {
  const zero = (runs || []).filter((r) => r.submitted === true && r.technicalFailure !== true && Number(r.unitCount || 0) === 0)
  if (zero.length < t.zeroEvidenceClusterMin) return []
  return [alert('ZERO_EVIDENCE_CLUSTER', 'HIGH', { sessionIds: zero.map((r) => r.sessionId) }, { count: zero.length })]
}

// actions: { sessionId, kind, state }, jobs: { sessionId, state }
export function detectAcceptedActionsWithoutJobs(actions, jobs) {
  const withJob = new Set((jobs || []).map((j) => j.sessionId))
  const finished = new Set((actions || []).filter((a) => a.kind === 'FINISH' && ['ACCEPTED', 'APPLIED'].includes(a.state)).map((a) => a.sessionId))
  const missing = [...finished].filter((sid) => !withJob.has(sid))
  return missing.length ? [alert('ACCEPTED_ACTIONS_WITHOUT_JOB', 'HIGH', { sessionIds: missing }, { count: missing.length })] : []
}

// jobs: { jobId, sessionId, state, updatedAt }, published: Set<sessionId> or array of { sessionId }
export function detectJobsWithoutAppliedResults(jobs, published, { now = Date.now(), thresholds = DEFAULT_THRESHOLDS } = {}) {
  const pub = published instanceof Set ? published : new Set((published || []).map((p) => (typeof p === 'string' ? p : p.sessionId)))
  const stale = (jobs || []).filter((j) => j.state === 'DONE' && !pub.has(j.sessionId)
    && now - new Date(j.updatedAt).getTime() >= thresholds.jobsWithoutResultMinutes * 60000)
  return stale.length ? [alert('JOBS_WITHOUT_APPLIED_RESULT', 'MEDIUM', { jobIds: stale.map((j) => j.jobId), sessionIds: stale.map((j) => j.sessionId) }, { count: stale.length })] : []
}

// units: { sessionId, evidenceStatus, reason }
export function detectClaimRejectionSpike(units, t = DEFAULT_THRESHOLDS) {
  const all = units || []
  if (all.length < t.claimRejectionMinUnits) return []
  const rejected = all.filter((u) => u.reason === 'QUOTE_MISMATCH' || (u.evidenceStatus === 'HUMAN_REVIEW_REQUIRED' && u.reason === 'QUOTE_MISMATCH'))
  const rate = rejected.length / all.length
  if (rate < t.claimRejectionRate) return []
  return [alert('CLAIM_REJECTION_SPIKE', 'HIGH', { sessionIds: [...new Set(rejected.map((u) => u.sessionId))] }, { rate: Number(rate.toFixed(4)), rejected: rejected.length, total: all.length })]
}

// jobs: { jobId, sessionId, state, leaseExpiresAt }
export function detectExpiredLeases(jobs, { now = Date.now() } = {}) {
  const expired = (jobs || []).filter((j) => j.state === 'LEASED' && j.leaseExpiresAt && new Date(j.leaseExpiresAt).getTime() <= now)
  return expired.length ? [alert('EXPIRED_LEASES', 'MEDIUM', { jobIds: expired.map((j) => j.jobId) }, { count: expired.length })] : []
}

// beginRequests: { sessionId, requestId }
export function detectRepeatedBegin(beginRequests, t = DEFAULT_THRESHOLDS) {
  const by = new Map()
  for (const b of beginRequests || []) by.set(b.sessionId, (by.get(b.sessionId) || 0) + 1)
  const hot = [...by.entries()].filter(([, n]) => n >= t.repeatedBeginMin)
  return hot.map(([sessionId, n]) => alert('REPEATED_BEGIN', 'LOW', { sessionIds: [sessionId] }, { count: n }))
}

// claims: { sessionId, claimedByCount } or { sessionId, state: 'CONFLICT' }
export function detectOwnershipConflicts(claims, t = DEFAULT_THRESHOLDS) {
  const conflicts = (claims || []).filter((c) => c.state === 'CONFLICT' || Number(c.claimedByCount || 0) > 1)
  if (conflicts.length < t.ownershipConflictMin) return []
  return [alert('OWNERSHIP_CONFLICT', 'HIGH', { sessionIds: conflicts.map((c) => c.sessionId) }, { count: conflicts.length })]
}

// denials: { actorHash, requestId, code: 'NOT_FOUND'|'FORBIDDEN', crossScope: boolean }
export function detectCrossScopeDenials(denials, t = DEFAULT_THRESHOLDS) {
  const by = new Map()
  for (const d of denials || []) {
    if (d.crossScope !== true) continue
    const key = d.actorHash || 'anonymous'
    const cur = by.get(key) || { count: 0, requestIds: [] }
    cur.count += 1
    if (d.requestId) cur.requestIds.push(d.requestId)
    by.set(key, cur)
  }
  return [...by.entries()].filter(([, v]) => v.count >= t.crossScopeDenialsMin)
    .map(([actorHash, v]) => alert('CROSS_SCOPE_DENIALS', 'HIGH', { actorHash, requestIds: v.requestIds }, { count: v.count }))
}

// costs: { requestId, jobId, minorUnits }. The detector never carries prompts,
// responses, provider payloads or learner identifiers.
export function detectCostOutliers(costs, t = DEFAULT_THRESHOLDS) {
  const outliers = (costs || []).filter((cost) => Number(cost.minorUnits || 0) >= t.costOutlierMinorUnits)
  return outliers.length ? [alert('COST_OUTLIER', 'MEDIUM', {
    requestIds: outliers.map((cost) => cost.requestId).filter(Boolean),
    jobIds: outliers.map((cost) => cost.jobId).filter(Boolean),
  }, { count: outliers.length })] : []
}

// recoveries: { grantId, requestId, kind, status }. Only explicitly approved
// grants should reach APPLIED; all other recovery credit activity is reviewed.
export function detectRecoveryCreditAnomalies(recoveries, t = DEFAULT_THRESHOLDS) {
  const anomalies = (recoveries || []).filter((recovery) => recovery.kind === 'RECOVERY_CREDIT'
    && recovery.status !== 'APPROVED_APPLIED')
  if (anomalies.length < t.recoveryCreditMin) return []
  return [alert('RECOVERY_CREDIT_ANOMALY', 'HIGH', {
    grantIds: anomalies.map((recovery) => recovery.grantId).filter(Boolean),
    requestIds: anomalies.map((recovery) => recovery.requestId).filter(Boolean),
  }, { count: anomalies.length })]
}

export function runAllDetectors(input, { now = Date.now(), thresholds = DEFAULT_THRESHOLDS } = {}) {
  return [
    ...detectZeroEvidenceClusters(input.runs, thresholds),
    ...detectAcceptedActionsWithoutJobs(input.actions, input.jobs),
    ...detectJobsWithoutAppliedResults(input.jobs, input.published, { now, thresholds }),
    ...detectClaimRejectionSpike(input.units, thresholds),
    ...detectExpiredLeases(input.jobs, { now }),
    ...detectRepeatedBegin(input.beginRequests, thresholds),
    ...detectOwnershipConflicts(input.ownershipClaims, thresholds),
    ...detectCrossScopeDenials(input.denials, thresholds),
    ...detectCostOutliers(input.costs, thresholds),
    ...detectRecoveryCreditAnomalies(input.recoveries, thresholds),
  ]
}
