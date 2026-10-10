// Job queue store (PROD-READY Phase 5, migration 0059) — memory and
// PostgreSQL adapters with the same semantics.
//
//   enqueue   validated (kinds.js), idempotent per (kind, dedupe_key)
//   claim     due PENDING/FAILED rows → RUNNING with a fresh lease token;
//             PostgreSQL uses FOR UPDATE SKIP LOCKED, so concurrent workers on
//             several replicas always take disjoint rows
//   renew / complete / fail / release   fenced by the lease token: a worker
//             whose lease expired (and whose row was recovered or reclaimed)
//             cannot overwrite the row any more
//   recoverExpired   RUNNING rows past their lease → FAILED (retry now) or
//             DEAD when no attempt is left (crashed worker)
//   retry / cancel   operator actions on dead letters (audited by the route)
//
// `now` (ISO string) is optional everywhere: tests pass a clock; in
// production PostgreSQL uses the database clock so replicas agree on leases.
import { randomUUID } from 'node:crypto'
import { clone } from '../campusStore/memoryDb.js'
import { iso } from '../campusStore/pgUtil.js'
import { prepareJob } from './kinds.js'

const CLAIMABLE = ['PENDING', 'FAILED']
const RETRYABLE = ['DEAD']
const CANCELLABLE = ['PENDING', 'FAILED', 'DEAD']

const job = (r) => r && ({
  id: r.id, kind: r.kind, payload: r.payload || {}, subjectUserId: r.subject_user_id ?? null, dedupeKey: r.dedupe_key ?? null,
  status: r.status, runAt: iso(r.run_at), attempts: Number(r.attempts), maxAttempts: Number(r.max_attempts), lastError: r.last_error ?? null,
  lockedBy: r.locked_by ?? null, leaseToken: r.lease_token ?? null, lockedUntil: iso(r.locked_until), result: r.result ?? null,
  createdAt: iso(r.created_at), updatedAt: iso(r.updated_at), startedAt: iso(r.started_at), finishedAt: iso(r.finished_at),
})

export function createJobsRepoMemory(db) {
  db.jobs ||= new Map()
  const nowIso = (now) => now || db.clock().toISOString()
  const at = (v) => new Date(v).getTime()
  const leased = (r, leaseToken) => r && r.status === 'RUNNING' && r.leaseToken === leaseToken
  const unlock = (r) => Object.assign(r, { lockedBy: null, leaseToken: null, lockedUntil: null })
  return {
    kind: 'memory',
    async enqueue(input, { now = null } = {}) {
      const j = prepareJob(input)
      if (j.dedupeKey != null) {
        const existing = [...db.jobs.values()].find((r) => r.kind === j.kind && r.dedupeKey === j.dedupeKey)
        if (existing) return { job: clone(existing), created: false }
      }
      const t = nowIso(now)
      const row = {
        id: randomUUID(), kind: j.kind, payload: j.payload, subjectUserId: j.subjectUserId, dedupeKey: j.dedupeKey, status: 'PENDING',
        runAt: j.runAt || t, attempts: 0, maxAttempts: j.maxAttempts, lastError: null, lockedBy: null, leaseToken: null, lockedUntil: null,
        result: null, createdAt: t, updatedAt: t, startedAt: null, finishedAt: null,
      }
      db.jobs.set(row.id, row)
      return { job: clone(row), created: true }
    },
    async claim({ workerId, kinds = null, limit = 1, leaseMs = 60_000, now = null }) {
      const t = nowIso(now)
      const due = [...db.jobs.values()]
        .filter((r) => CLAIMABLE.includes(r.status) && at(r.runAt) <= at(t) && (!kinds || kinds.includes(r.kind)))
        .sort((a, b) => at(a.runAt) - at(b.runAt) || at(a.createdAt) - at(b.createdAt))
        .slice(0, Math.max(0, limit))
      for (const r of due) {
        Object.assign(r, {
          status: 'RUNNING', attempts: r.attempts + 1, lockedBy: workerId, leaseToken: randomUUID(),
          lockedUntil: new Date(at(t) + leaseMs).toISOString(), startedAt: t, updatedAt: t,
        })
      }
      return due.map(clone)
    },
    async renew(id, leaseToken, { leaseMs = 60_000, now = null } = {}) {
      const r = db.jobs.get(id)
      if (!leased(r, leaseToken)) return false
      const t = nowIso(now)
      Object.assign(r, { lockedUntil: new Date(at(t) + leaseMs).toISOString(), updatedAt: t })
      return true
    },
    async complete(id, leaseToken, { result = null, now = null } = {}) {
      const r = db.jobs.get(id)
      if (!leased(r, leaseToken)) return false
      const t = nowIso(now)
      unlock(Object.assign(r, { status: 'SUCCEEDED', result: clone(result), lastError: null, finishedAt: t, updatedAt: t }))
      return true
    },
    async fail(id, leaseToken, { error, retryAt, dead = false, now = null }) {
      const r = db.jobs.get(id)
      if (!leased(r, leaseToken)) return null
      const t = nowIso(now)
      const isDead = dead || r.attempts >= r.maxAttempts
      unlock(Object.assign(r, {
        status: isDead ? 'DEAD' : 'FAILED', lastError: error, runAt: isDead ? r.runAt : retryAt,
        finishedAt: isDead ? t : null, updatedAt: t,
      }))
      return { status: r.status }
    },
    // Graceful shutdown: give the row back without spending the attempt.
    async release(id, leaseToken, { now = null } = {}) {
      const r = db.jobs.get(id)
      if (!leased(r, leaseToken)) return false
      const t = nowIso(now)
      unlock(Object.assign(r, { status: 'PENDING', attempts: Math.max(0, r.attempts - 1), runAt: t, updatedAt: t }))
      return true
    },
    async recoverExpired({ now = null } = {}) {
      const t = nowIso(now)
      let recovered = 0
      let dead = 0
      for (const r of db.jobs.values()) {
        if (r.status !== 'RUNNING' || at(r.lockedUntil) >= at(t)) continue
        const isDead = r.attempts >= r.maxAttempts
        unlock(Object.assign(r, { status: isDead ? 'DEAD' : 'FAILED', lastError: 'LEASE_EXPIRED: the worker stopped before finishing', runAt: t, finishedAt: isDead ? t : null, updatedAt: t }))
        if (isDead) dead += 1
        else recovered += 1
      }
      return { recovered, dead }
    },
    async get(id) {
      return clone(db.jobs.get(id) || null)
    },
    async list({ status = null, kind = null, limit = 50, before = null } = {}) {
      return [...db.jobs.values()]
        .filter((r) => (!status || r.status === status) && (!kind || r.kind === kind) && (!before || at(r.updatedAt) < at(before)))
        .sort((a, b) => at(b.updatedAt) - at(a.updatedAt) || String(b.id).localeCompare(String(a.id)))
        .slice(0, limit)
        .map(clone)
    },
    async counts() {
      const out = {}
      for (const r of db.jobs.values()) out[r.status] = (out[r.status] || 0) + 1
      return out
    },
    async retry(id, { now = null } = {}) {
      const r = db.jobs.get(id)
      if (!r || !RETRYABLE.includes(r.status)) return null
      const t = nowIso(now)
      Object.assign(r, { status: 'PENDING', attempts: 0, runAt: t, finishedAt: null, updatedAt: t })
      return clone(r)
    },
    async cancel(id, { now = null } = {}) {
      const r = db.jobs.get(id)
      if (!r || !CANCELLABLE.includes(r.status)) return null
      const t = nowIso(now)
      Object.assign(r, { status: 'CANCELLED', finishedAt: t, updatedAt: t })
      return clone(r)
    },
    async prune({ before }) {
      let n = 0
      for (const [id, r] of db.jobs) {
        if (['SUCCEEDED', 'CANCELLED'].includes(r.status) && r.finishedAt && at(r.finishedAt) < at(before)) { db.jobs.delete(id); n += 1 }
      }
      return n
    },
  }
}

export function createJobsRepoPg({ query }) {
  const NOW = (n) => `COALESCE($${n}::timestamptz, now())`
  return {
    kind: 'pg',
    async enqueue(input, { now = null } = {}) {
      const j = prepareJob(input)
      const { rows } = await query(
        `INSERT INTO jobs (kind, payload, subject_user_id, dedupe_key, run_at, max_attempts, created_at, updated_at)
         VALUES ($1, $2::jsonb, $3, $4, COALESCE($5::timestamptz, ${NOW(7)}), $6, ${NOW(7)}, ${NOW(7)})
         ON CONFLICT (kind, dedupe_key) DO NOTHING RETURNING *`,
        [j.kind, JSON.stringify(j.payload), j.subjectUserId, j.dedupeKey, j.runAt, j.maxAttempts, now],
      )
      if (rows[0]) return { job: job(rows[0]), created: true }
      const existing = await query('SELECT * FROM jobs WHERE kind = $1 AND dedupe_key = $2', [j.kind, j.dedupeKey])
      return { job: job(existing.rows[0]) || null, created: false }
    },
    async claim({ workerId, kinds = null, limit = 1, leaseMs = 60_000, now = null }) {
      if (limit <= 0) return []
      const { rows } = await query(
        `WITH due AS (
           SELECT id FROM jobs
            WHERE status IN ('PENDING', 'FAILED') AND run_at <= ${NOW(1)}
              AND ($4::text[] IS NULL OR kind = ANY($4::text[]))
            ORDER BY run_at, created_at
            LIMIT $5
            FOR UPDATE SKIP LOCKED)
         UPDATE jobs j SET status = 'RUNNING', attempts = j.attempts + 1, locked_by = $2, lease_token = gen_random_uuid(),
                locked_until = ${NOW(1)} + ($3::int * interval '1 millisecond'), started_at = ${NOW(1)}, updated_at = ${NOW(1)}
           FROM due WHERE j.id = due.id
         RETURNING j.*`,
        [now, workerId, Math.round(leaseMs), kinds, limit],
      )
      return rows.map(job).sort((a, b) => a.runAt.localeCompare(b.runAt))
    },
    async renew(id, leaseToken, { leaseMs = 60_000, now = null } = {}) {
      const { rowCount } = await query(
        `UPDATE jobs SET locked_until = ${NOW(3)} + ($4::int * interval '1 millisecond'), updated_at = ${NOW(3)}
          WHERE id = $1 AND lease_token = $2 AND status = 'RUNNING'`,
        [id, leaseToken, now, Math.round(leaseMs)],
      )
      return rowCount === 1
    },
    async complete(id, leaseToken, { result = null, now = null } = {}) {
      const { rowCount } = await query(
        `UPDATE jobs SET status = 'SUCCEEDED', result = $3::jsonb, last_error = NULL, finished_at = ${NOW(4)}, updated_at = ${NOW(4)},
                locked_by = NULL, lease_token = NULL, locked_until = NULL
          WHERE id = $1 AND lease_token = $2 AND status = 'RUNNING'`,
        [id, leaseToken, result == null ? null : JSON.stringify(result), now],
      )
      return rowCount === 1
    },
    async fail(id, leaseToken, { error, retryAt, dead = false, now = null }) {
      const { rows } = await query(
        `UPDATE jobs SET
           status = CASE WHEN $5::boolean OR attempts >= max_attempts THEN 'DEAD' ELSE 'FAILED' END,
           run_at = CASE WHEN $5::boolean OR attempts >= max_attempts THEN run_at ELSE $4::timestamptz END,
           finished_at = CASE WHEN $5::boolean OR attempts >= max_attempts THEN ${NOW(6)} ELSE NULL END,
           last_error = $3, updated_at = ${NOW(6)}, locked_by = NULL, lease_token = NULL, locked_until = NULL
         WHERE id = $1 AND lease_token = $2 AND status = 'RUNNING' RETURNING status`,
        [id, leaseToken, error, retryAt, Boolean(dead), now],
      )
      return rows[0] ? { status: rows[0].status } : null
    },
    async release(id, leaseToken, { now = null } = {}) {
      const { rowCount } = await query(
        `UPDATE jobs SET status = 'PENDING', attempts = GREATEST(0, attempts - 1), run_at = ${NOW(3)}, updated_at = ${NOW(3)},
                locked_by = NULL, lease_token = NULL, locked_until = NULL
          WHERE id = $1 AND lease_token = $2 AND status = 'RUNNING'`,
        [id, leaseToken, now],
      )
      return rowCount === 1
    },
    async recoverExpired({ now = null } = {}) {
      const { rows } = await query(
        `UPDATE jobs SET
           status = CASE WHEN attempts >= max_attempts THEN 'DEAD' ELSE 'FAILED' END,
           finished_at = CASE WHEN attempts >= max_attempts THEN ${NOW(1)} ELSE NULL END,
           last_error = 'LEASE_EXPIRED: the worker stopped before finishing', run_at = ${NOW(1)}, updated_at = ${NOW(1)},
           locked_by = NULL, lease_token = NULL, locked_until = NULL
         WHERE id IN (SELECT id FROM jobs WHERE status = 'RUNNING' AND locked_until < ${NOW(1)} FOR UPDATE SKIP LOCKED)
         RETURNING status`,
        [now],
      )
      return { recovered: rows.filter((r) => r.status === 'FAILED').length, dead: rows.filter((r) => r.status === 'DEAD').length }
    },
    async get(id) {
      const { rows } = await query('SELECT * FROM jobs WHERE id = $1', [id])
      return job(rows[0]) || null
    },
    async list({ status = null, kind = null, limit = 50, before = null } = {}) {
      const { rows } = await query(
        `SELECT * FROM jobs WHERE ($1::text IS NULL OR status = $1) AND ($2::text IS NULL OR kind = $2)
            AND ($3::timestamptz IS NULL OR updated_at < $3::timestamptz)
          ORDER BY updated_at DESC, id DESC LIMIT $4`,
        [status, kind, before, limit],
      )
      return rows.map(job)
    },
    async counts() {
      const { rows } = await query('SELECT status, count(*)::int AS n FROM jobs GROUP BY status')
      return Object.fromEntries(rows.map((r) => [r.status, r.n]))
    },
    async retry(id, { now = null } = {}) {
      const { rows } = await query(
        `UPDATE jobs SET status = 'PENDING', attempts = 0, run_at = ${NOW(2)}, finished_at = NULL, updated_at = ${NOW(2)}
          WHERE id = $1 AND status = ANY($3::text[]) RETURNING *`,
        [id, now, RETRYABLE],
      )
      return job(rows[0]) || null
    },
    async cancel(id, { now = null } = {}) {
      const { rows } = await query(
        `UPDATE jobs SET status = 'CANCELLED', finished_at = ${NOW(2)}, updated_at = ${NOW(2)}
          WHERE id = $1 AND status = ANY($3::text[]) RETURNING *`,
        [id, now, CANCELLABLE],
      )
      return job(rows[0]) || null
    },
    async prune({ before }) {
      const { rowCount } = await query(
        "DELETE FROM jobs WHERE status IN ('SUCCEEDED', 'CANCELLED') AND finished_at < $1::timestamptz",
        [before],
      )
      return rowCount
    },
  }
}
