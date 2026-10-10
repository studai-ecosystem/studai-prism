// Background job worker (PROD-READY Phase 5). Runs in the API container,
// only when PRISM_JOB_WORKER=true (registered OFF; humans flip it). Each
// replica runs one worker: a runner that claims due jobs with
// FOR UPDATE SKIP LOCKED and a scheduler tick that enqueues the recurring
// scans for the current time bucket (deduplicated across replicas).
//
// The queue lives in the campus store: PostgreSQL when DATABASE_URL is set,
// the memory store in tests. Without a store there is nothing to run, so the
// worker does not start.
import { createJobRunner, defaultWorkerId } from './runner.js'
import { createJobHandlers } from './handlers.js'
import { scheduleRecurring, RECURRING_JOBS, isRetentionEnforcementOn } from './scheduler.js'

export { createJobRunner, createJobHandlers, scheduleRecurring, RECURRING_JOBS }

export const isJobWorkerEnabled = (env = process.env) => env.PRISM_JOB_WORKER === 'true'

const intFromEnv = (name, fallback, min, max) => {
  const n = Number(process.env[name])
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback
}

export function createJobWorker({
  repo,
  handlers,
  workerId = defaultWorkerId(),
  clock = null,
  logger,
  leaseMs = intFromEnv('PRISM_JOB_LEASE_MS', 120_000, 10_000, 3_600_000),
  pollMs = intFromEnv('PRISM_JOB_POLL_MS', 2_000, 250, 60_000),
  concurrency = intFromEnv('PRISM_JOB_CONCURRENCY', 2, 1, 16),
  scheduleEveryMs = 60_000,
  definitions = RECURRING_JOBS,
  retentionOn = isRetentionEnforcementOn,
}) {
  const runner = createJobRunner({ repo, handlers, workerId, clock, leaseMs, pollMs, concurrency, logger })
  let ticker = null
  const tick = async () => {
    try {
      const out = await scheduleRecurring({ repo, now: clock ? clock() : new Date(), definitions, retentionOn, passNow: Boolean(clock) })
      if (out.scheduled.length) logger?.info?.('jobs_scheduled', { kinds: out.scheduled })
    } catch (err) {
      logger?.error?.('job_schedule_failed', { code: err?.code || err?.name || 'unknown' })
    }
  }
  return {
    workerId,
    runner,
    tick,
    start() {
      void tick()
      ticker = setInterval(() => { void tick() }, scheduleEveryMs)
      ticker.unref?.()
      runner.start()
      logger?.info?.('job_worker_started', { workerId, concurrency, pollMs, leaseMs })
    },
    // SIGTERM: stop scheduling and claiming at once (in-flight jobs continue).
    beginDrain() {
      clearInterval(ticker)
      runner.beginDrain()
    },
    async stop({ drainMs = 10_000 } = {}) {
      clearInterval(ticker)
      return runner.stop({ drainMs })
    },
  }
}

// Wiring used by server/index.js. Returns null (and starts nothing) when the
// flag is off or no campus store is configured.
export function startJobWorker({ campus, logger, env = process.env }) {
  if (!isJobWorkerEnabled(env)) return null
  const repo = campus?.repos?.jobs
  if (!repo || !campus.storeAvailable?.()) {
    logger?.warn?.('job_worker_not_started', { reason: 'NO_STORE' })
    return null
  }
  const worker = createJobWorker({ repo, handlers: createJobHandlers({ campus, repo }), logger })
  worker.start()
  return worker
}
