// Job handlers (PROD-READY Phase 5). Each handler receives the payload of
// references only, re-reads current state and is idempotent: running it
// twice has the effect of running it once (an invite no longer PENDING is
// skipped, a reminder is not sent to a student who finished, a seat that is
// no longer reserved is not released, retention passes clear only what is
// still due). Results are counts and outcome codes only (no personal data).
import { isRetentionEnforcementOn } from './scheduler.js'

// Finished (SUCCEEDED / CANCELLED) job rows are deleted after this many days;
// DEAD rows stay until an operator retries or cancels them.
export const JOB_RETENTION_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

async function defaultRetention() {
  const [{ runRetention, ENFORCEABLE_ENTITIES }, { purgeImportRowRaw }, { purgeUnstartedAccommodationRequests }, { purgeUnverifiedGuardianConsents }] = await Promise.all([
    import('../../lib/retentionEnforcement.js'),
    import('../privacy/importRowRetention.js'),
    import('../privacy/accommodationRequestRetention.js'),
    import('../privacy/guardianConsentRetention.js'),
  ])
  return { runRetention, ENFORCEABLE_ENTITIES, purgeImportRowRaw, purgeUnstartedAccommodationRequests, purgeUnverifiedGuardianConsents }
}

class RetentionRefusedError extends Error {
  constructor(code) {
    super(`retention pass refused: ${code}`)
    this.code = code
  }
}

// A dry run first (its receipt satisfies the "dry-run within 24 h" rule),
// then the real run. A legal hold on the entity is a clean skip, not a failure.
async function dryThenEnforce(purge, now) {
  const dry = await purge({ dryRun: true, now })
  if (!dry.ok) throw new RetentionRefusedError(dry.error || 'DRY_RUN_FAILED')
  const real = await purge({ dryRun: false, now })
  if (!real.ok) {
    if (real.error === 'ENTITY_LEGAL_HOLD') return { skipped: 'ENTITY_LEGAL_HOLD', matched: dry.matched }
    throw new RetentionRefusedError(real.error || 'ENFORCE_FAILED')
  }
  return { matched: real.matched, cleared: real.cleared ?? real.deleted ?? 0, effectiveDays: real.effectiveDays, ...(real.skipped ? { skipped: real.skipped } : {}) }
}

export function createJobHandlers({
  campus,
  repo,
  retention = null,
  retentionOn = isRetentionEnforcementOn,
}) {
  const enqueue = (input) => repo.enqueue(input)
  const campusLive = () => Boolean(campus?.campusAvailable?.())
  const storeLive = () => Boolean(campus?.storeAvailable?.())
  let retentionFns = retention
  const r = async () => (retentionFns ||= await defaultRetention())
  const retentionGuard = () => (retentionOn() ? null : { skipped: 'RETENTION_ENFORCEMENT_OFF' })

  return {
    'campus.invite_email': {
      async run({ inviteId }) {
        if (!storeLive()) return { outcome: 'STORE_UNAVAILABLE' }
        return campus.invites.deliverQueuedInvite(inviteId)
      },
    },
    'campus.reminders_scan': {
      async run() {
        if (!campusLive()) return { skipped: 'CAMPUS_OFF' }
        return campus.admin.scanReminders({ enqueue })
      },
    },
    'campus.assignment_reminder': {
      async run({ assignmentId, userId }) {
        if (!campusLive()) return { outcome: 'CAMPUS_OFF' }
        return campus.admin.sendAssignmentReminder({ assignmentId, userId })
      },
    },
    'campus.seat_release_scan': {
      async run() {
        if (!campusLive()) return { skipped: 'CAMPUS_OFF' }
        return campus.admin.scanSeatReleases({ enqueue })
      },
    },
    'campus.seat_release': {
      async run({ assignmentId }) {
        if (!storeLive()) return { outcome: 'STORE_UNAVAILABLE', released: 0 }
        return campus.admin.releaseWindowSeats({ assignmentId })
      },
    },
    'jobs.prune': {
      async run(_payload, { now }) {
        const before = new Date(now().getTime() - JOB_RETENTION_DAYS * DAY_MS).toISOString()
        return { deleted: await repo.prune({ before }) }
      },
    },
    'retention.enforce': {
      async run() {
        const off = retentionGuard()
        if (off) return off
        const { runRetention, ENFORCEABLE_ENTITIES } = await r()
        const out = {}
        for (const entity of ENFORCEABLE_ENTITIES) {
          const res = await runRetention(entity, { dryRun: false, ranBy: null })
          out[entity] = res.ok ? { matched: res.receipt?.matched ?? 0, deleted: res.receipt?.deleted ?? 0 } : { error: String(res.error || 'FAILED').split(' ')[0] }
        }
        return out
      },
    },
    'retention.import_rows': {
      async run(_payload, { now }) {
        const off = retentionGuard()
        if (off) return off
        const { purgeImportRowRaw } = await r()
        return dryThenEnforce(purgeImportRowRaw, now())
      },
    },
    'retention.accommodation_requests': {
      async run(_payload, { now }) {
        const off = retentionGuard()
        if (off) return off
        const { purgeUnstartedAccommodationRequests } = await r()
        return dryThenEnforce(purgeUnstartedAccommodationRequests, now())
      },
    },
    'retention.guardian_consents': {
      async run(_payload, { now }) {
        const off = retentionGuard()
        if (off) return off
        const { purgeUnverifiedGuardianConsents } = await r()
        return dryThenEnforce(purgeUnverifiedGuardianConsents, now())
      },
    },
  }
}
