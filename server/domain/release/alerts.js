// P10.8 — operational alert definitions (pure configuration). Operational,
// measurement and customer-value views stay separate; these are operational
// only. Each alert names a signal, the comparison, a role placeholder and the
// SUPPORT_RUNBOOK triage path. No thresholds here are approvals; operators
// tune them per environment. If server/domain/metrics/* exists (P9), its
// counters are the intended sources; this module does not import it so the
// two can land independently.
export const ALERT_SEVERITIES = Object.freeze(['PAGE', 'TICKET', 'REVIEW'])

const alert = (id, signal, condition, severity, owner, triage) => Object.freeze({ id, signal, condition, severity, owner, triage, view: 'OPERATIONAL' })

export const ALERTS = Object.freeze([
  alert('SAVED_ACTION_LOSS', 'assessment.candidate_actions.failed', '> 0 FAILED actions without a later APPLIED/replay in 15 min', 'PAGE', 'On-call engineer', 'failed-evaluation'),
  alert('TECHNICAL_EMPTY_REPORT', 'report.processing.failed', 'any REPORT_PROCESSING_FAILED on a finished run', 'PAGE', 'On-call engineer', 'failed-evaluation'),
  alert('MISSING_OWNED_HISTORY', 'history.owned.empty_with_sessions', 'owner has completed sessions but history returns none', 'TICKET', 'Support owner', 'absent-history'),
  alert('REPEATED_START_TRANSITIONS', 'assessment.start.repeat', '> 3 START receipts for one assignment in 10 min', 'TICKET', 'On-call engineer', 'failed-evaluation'),
  alert('QUEUE_DEPTH', 'jobs.queued.count', 'QUEUED EVALUATE_RUN jobs > 20 for 10 min', 'PAGE', 'On-call engineer', 'failed-evaluation'),
  alert('EXPIRED_LEASES', 'jobs.lease.expired', 'LEASED jobs past leaseExpiresAt > 0 for 5 min', 'PAGE', 'On-call engineer', 'failed-evaluation'),
  alert('FAILED_CLAIMS', 'jobs.claim.conflict', 'fencing CONFLICT rate > 5/min', 'TICKET', 'On-call engineer', 'failed-evaluation'),
  alert('UNAUTHORIZED_SCOPE_ACCESS', 'auth.forbidden.scope', 'FORBIDDEN on report/source/export routes > 10/min from one actor', 'PAGE', 'Security lead', 'privacy-request'),
  alert('COST_OUTLIER', 'ai.usage.cost_per_run', 'run cost > 3x the trailing 7-day median', 'REVIEW', 'Engineering lead', 'paid-technical-failure'),
  alert('RECOVERY_CREDIT_USAGE', 'entitlements.release.technical_failure', 'any releaseForTechnicalFailure', 'REVIEW', 'Product/commercial owner', 'paid-technical-failure'),
  alert('RUN_NOT_ALLOCATABLE', 'release.run_not_allocatable', 'any 503 RUN_NOT_ALLOCATABLE while the stage expects starts', 'TICKET', 'Release operator', 'failed-evaluation'),
  alert('RUN_VERSION_UNSUPPORTED', 'release.run_version_unsupported', 'any RUN_VERSION_UNSUPPORTED (pinned method missing from build)', 'PAGE', 'Engineering lead', 'failed-evaluation'),
])

export const ALERT_IDS = Object.freeze(ALERTS.map((a) => a.id))

export function alertById(id) {
  return ALERTS.find((a) => a.id === id) || null
}

// Group alerts by triage path for the runbook (no learner data involved).
export function alertsByTriage() {
  const out = {}
  for (const a of ALERTS) (out[a.triage] ||= []).push(a.id)
  return out
}
