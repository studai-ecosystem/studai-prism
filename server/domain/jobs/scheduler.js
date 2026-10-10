// Recurring jobs (PROD-READY Phase 5): a cron-like table of scans and
// housekeeping. Every replica ticks the scheduler; each tick enqueues one job
// per definition for the CURRENT time bucket with dedupe key
// `every:<interval>:<bucket start>`. The queue's unique (kind, dedupe_key)
// makes the first replica win and the others no-ops, so several replicas
// never double-schedule.
//
// Retention passes are scheduled ONLY while PRISM_RETENTION_ENFORCEMENT is on
// (default OFF until counsel approves the schedule, HA-003); their handlers
// check the flag again when they run.
import { JOB_KINDS } from './kinds.js'

const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE

export const RECURRING_JOBS = Object.freeze([
  { kind: 'campus.reminders_scan', everyMs: 15 * MINUTE },
  { kind: 'campus.seat_release_scan', everyMs: 15 * MINUTE },
  { kind: 'jobs.prune', everyMs: DAY },
  { kind: 'retention.enforce', everyMs: DAY },
  { kind: 'retention.import_rows', everyMs: DAY },
  { kind: 'retention.accommodation_requests', everyMs: DAY },
])

export const isRetentionEnforcementOn = (env = process.env) => env.PRISM_RETENTION_ENFORCEMENT === 'true'

export function bucketStart(nowMs, everyMs) {
  return new Date(Math.floor(nowMs / everyMs) * everyMs).toISOString()
}

// Enqueues the current bucket of every recurring job; returns what was new.
export async function scheduleRecurring({
  repo, now = new Date(), definitions = RECURRING_JOBS, retentionOn = isRetentionEnforcementOn, passNow = false,
}) {
  const out = { scheduled: [], existing: 0, skipped: [] }
  for (const def of definitions) {
    if (JOB_KINDS[def.kind]?.retention && !retentionOn()) { out.skipped.push(def.kind); continue }
    const bucket = bucketStart(now.getTime(), def.everyMs)
    const { created } = await repo.enqueue(
      { kind: def.kind, payload: { bucket }, dedupeKey: `every:${def.everyMs}:${bucket}`, runAt: bucket },
      { now: passNow ? now.toISOString() : null },
    )
    if (created) out.scheduled.push(def.kind)
    else out.existing += 1
  }
  return out
}
