// Job runner (PROD-READY Phase 5): claims due jobs from the queue store and
// runs their handlers. Safe with several replicas: every claim is a fenced
// lease (repository.js), a crashed worker's lease expires and is recovered,
// failures are retried with exponential backoff + jitter, and a job that
// keeps failing becomes a dead letter for an operator.
//
// Handlers are idempotent: they receive ids only, re-read current state and
// skip work that is already done (an invite no longer PENDING, a student who
// completed, a seat no longer reserved). Delivery is at-least-once: a worker
// that dies after sending an email but before recording success causes one
// more send on retry; the dedupe key still prevents the job being scheduled
// twice.
import { hostname } from 'node:os'
import { randomUUID } from 'node:crypto'
import { backoffMs as defaultBackoff, sanitiseError } from './kinds.js'

export function defaultWorkerId() {
  return `${hostname().slice(0, 60)}:${process.pid}:${randomUUID().slice(0, 8)}`
}

const noopLogger = { info() {}, warn() {}, error() {} }

export function createJobRunner({
  repo,
  handlers,
  workerId = defaultWorkerId(),
  // Optional injected clock (tests). In production the database clock is
  // used for leases and due times so replicas agree.
  clock = null,
  leaseMs = 60_000,
  pollMs = 2_000,
  concurrency = 2,
  backoff = {},
  random = Math.random,
  logger = noopLogger,
}) {
  const kinds = Object.keys(handlers)
  const nowIso = () => (clock ? clock().toISOString() : null)
  const nowMs = () => (clock ? clock().getTime() : Date.now())
  const active = new Map() // job id → { job, promise }
  let stopped = false
  let draining = false
  let timer = null
  let loop = null

  async function runJob(j) {
    const handler = handlers[j.kind]
    let renewTimer = null
    const heartbeat = () => repo.renew(j.id, j.leaseToken, { leaseMs, now: nowIso() }).catch(() => false)
    // Long handlers keep their lease while they run.
    renewTimer = setInterval(() => { void heartbeat() }, Math.max(1_000, Math.floor(leaseMs / 3)))
    renewTimer.unref?.()
    try {
      const result = await handler.run(j.payload, { job: j, heartbeat, now: () => new Date(nowMs()) })
      const recorded = await repo.complete(j.id, j.leaseToken, { result: result ?? null, now: nowIso() })
      if (!recorded) logger.warn('job_lease_lost', { jobId: j.id, kind: j.kind })
      return 'SUCCEEDED'
    } catch (err) {
      const error = sanitiseError(err)
      const retryAt = new Date(nowMs() + defaultBackoff(j.attempts, { ...backoff, ...(handler.backoff || {}) }, random)).toISOString()
      const out = await repo.fail(j.id, j.leaseToken, { error, retryAt, dead: Boolean(err?.permanent), now: nowIso() }).catch(() => null)
      const status = out?.status || 'LEASE_LOST'
      const log = status === 'DEAD' ? logger.error : logger.warn
      log.call(logger, status === 'DEAD' ? 'job_dead_lettered' : 'job_attempt_failed', { jobId: j.id, kind: j.kind, attempt: j.attempts, status, code: error.split(':')[0] })
      return status
    } finally {
      clearInterval(renewTimer)
    }
  }

  // One pass: recover expired leases, claim up to the free slots, run them.
  async function runOnce() {
    const summary = { claimed: 0, succeeded: 0, failed: 0, dead: 0, recovered: 0 }
    if (stopped || draining) return summary
    const rec = await repo.recoverExpired({ now: nowIso() })
    summary.recovered = rec.recovered + rec.dead
    const free = concurrency - active.size
    if (free <= 0 || !kinds.length) return summary
    const claimed = await repo.claim({ workerId, kinds, limit: free, leaseMs, now: nowIso() })
    summary.claimed = claimed.length
    const runs = claimed.map((j) => {
      const promise = runJob(j).finally(() => active.delete(j.id))
      active.set(j.id, { job: j, promise })
      return promise
    })
    for (const status of await Promise.all(runs)) {
      if (status === 'SUCCEEDED') summary.succeeded += 1
      else if (status === 'DEAD') summary.dead += 1
      else summary.failed += 1
    }
    return summary
  }

  // Runs passes until nothing is due (tests and operator drains).
  async function drainDue({ maxPasses = 100 } = {}) {
    const total = { claimed: 0, succeeded: 0, failed: 0, dead: 0, recovered: 0 }
    for (let i = 0; i < maxPasses; i += 1) {
      const s = await runOnce()
      for (const k of Object.keys(total)) total[k] += s[k]
      if (!s.claimed) break
    }
    return total
  }

  function schedule(ms) {
    if (stopped || draining) return
    timer = setTimeout(tick, ms)
    timer.unref?.()
  }
  async function tick() {
    loop = (async () => {
      try {
        const s = await runOnce()
        // Busy queue: go again at once; idle: wait for the poll interval.
        schedule(s.claimed ? 0 : pollMs)
      } catch (err) {
        logger.error('job_runner_pass_failed', { code: err?.code || err?.name || 'unknown' })
        schedule(pollMs)
      }
    })()
    await loop
  }

  return {
    workerId,
    runOnce,
    drainDue,
    start() {
      if (timer || stopped) return
      schedule(0)
    },
    // Stop claiming new work (SIGTERM drain starts).
    beginDrain() {
      draining = true
      clearTimeout(timer)
    },
    // Wait (bounded) for running handlers, then give unfinished leases back so
    // another replica picks them up at once instead of after lease expiry.
    async stop({ drainMs = 10_000 } = {}) {
      draining = true
      stopped = true
      clearTimeout(timer)
      if (loop) await Promise.race([loop.catch(() => {}), new Promise((r) => setTimeout(r, drainMs).unref?.())])
      const pending = [...active.values()]
      if (pending.length) {
        let t
        await Promise.race([
          Promise.allSettled(pending.map((p) => p.promise)),
          new Promise((r) => { t = setTimeout(r, drainMs); t.unref?.() }),
        ])
        clearTimeout(t)
      }
      let released = 0
      for (const { job: j } of active.values()) {
        if (await repo.release(j.id, j.leaseToken, { now: nowIso() }).catch(() => false)) released += 1
      }
      if (released) logger.warn('job_leases_released_on_shutdown', { released })
      return { released }
    },
    activeCount: () => active.size,
  }
}
