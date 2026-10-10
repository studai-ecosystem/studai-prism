import { createHash } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { setTimeout as delay } from 'node:timers/promises'
import { ApiError } from '../http/errors.js'
import logger from '../../lib/logger.js'

export function createMemorySessionLocks() {
  const tails = new Map()
  return {
    async withLock(resource, work) {
      const previous = tails.get(resource) || Promise.resolve()
      let release
      const next = new Promise((resolve) => { release = resolve })
      const tail = previous.then(() => next)
      tails.set(resource, tail)
      await previous
      try {
        return await work()
      } finally {
        release()
        if (tails.get(resource) === tail) tails.delete(resource)
      }
    },
  }
}

export function sessionLockKey(resource) {
  if (typeof resource !== 'string' || !resource) throw new ApiError('VALIDATION_FAILED', 'An operation resource is required.')
  return createHash('sha256').update(`prism.assessment.operation:${resource}`).digest().readBigInt64BE(0).toString()
}

// PROD-READY Phase 6 (P66): a lock taken INSIDE another lock's operation
// (a V3 start holds `assignment:…` and then takes the session lock) is taken
// on the connection the enclosing operation already holds, never on a second
// pool connection. With separate connections, as many concurrent starts as
// the pool has connections each held one and waited for another, so every one
// of them failed after the pool wait (load test: 5 of 5 failed with the
// default pool of 5). Advisory locks are per connection, so mutual exclusion
// across requests and replicas is unchanged. Within one operation, a resource
// an enclosing lock already holds is re-entrant, and two concurrent branches
// that ask for the same resource still take it one after the other.
export function createPgSessionLocks({ getPool, waitMs = 10000, pollMs = 50, clock = () => performance.now(), sleep = delay }) {
  if (!Number.isFinite(waitMs) || waitMs < 0 || !Number.isFinite(pollMs) || pollMs <= 0) {
    throw new Error('Invalid assessment lock timing configuration.')
  }
  // frame: { conn, keys } — conn is the held connection shared by nested
  // locks; keys are the resources held by this frame and its ancestors.
  const frames = new AsyncLocalStorage()

  async function acquireOn(conn, key) {
    const started = clock()
    for (;;) {
      if (conn.connectionError) throw new ApiError('UPSTREAM_UNAVAILABLE', 'The assessment connection was interrupted. Please retry.')
      let result
      try {
        result = await conn.client.query('SELECT pg_try_advisory_lock($1::bigint) AS locked', [key])
      } catch (error) {
        conn.destroy = true
        logger.error('assessment_lock_acquire_failed', { code: error.code || error.name })
        throw new ApiError('UPSTREAM_UNAVAILABLE', 'The assessment workspace is temporarily unavailable.')
      }
      const locked = result.rows?.[0]?.locked
      if (typeof locked !== 'boolean') {
        conn.destroy = true
        logger.error('assessment_lock_acquire_failed', { code: 'INVALID_LOCK_RESULT' })
        throw new ApiError('UPSTREAM_UNAVAILABLE', 'The assessment workspace is temporarily unavailable.')
      }
      if (locked) return
      if (clock() - started >= waitMs) throw new ApiError('UPSTREAM_UNAVAILABLE', 'This assessment is busy. Please retry in a moment.')
      await sleep(pollMs)
    }
  }

  async function releaseOn(conn, key) {
    if (conn.destroy) return
    try {
      const result = await conn.client.query('SELECT pg_advisory_unlock($1::bigint) AS unlocked', [key])
      if (result.rows?.[0]?.unlocked !== true) {
        conn.destroy = true
        logger.error('assessment_lock_release_failed', { code: 'LOCK_NOT_HELD' })
      }
    } catch (error) {
      conn.destroy = true
      logger.error('assessment_lock_release_failed', { code: error.code || error.name })
    }
  }

  async function runFramed(conn, keys, work) {
    const result = await frames.run({ conn, keys }, work)
    if (conn.connectionError) throw new ApiError('UPSTREAM_UNAVAILABLE', 'The assessment connection was interrupted. Please retry.')
    return result
  }

  // A lock taken while an enclosing operation of this lock object holds a
  // connection: same connection, no pool wait.
  async function withSharedConnection(frame, key, work) {
    const { conn } = frame
    const previous = conn.tails.get(key) || Promise.resolve()
    let done
    const mine = new Promise((resolve) => { done = resolve })
    const tail = previous.then(() => mine)
    conn.tails.set(key, tail)
    conn.nested += 1
    try {
      await previous
      await acquireOn(conn, key)
      try {
        return await runFramed(conn, new Set([...frame.keys, key]), work)
      } finally {
        await releaseOn(conn, key)
      }
    } finally {
      done()
      if (conn.tails.get(key) === tail) conn.tails.delete(key)
      conn.nested -= 1
      if (conn.nested === 0) conn.idle?.()
    }
  }

  async function withOwnConnection(key, work) {
    let client
    try {
      const pool = getPool()
      if (!pool) throw new Error('Assessment lock store unavailable')
      client = await pool.connect()
    } catch (error) {
      logger.error('assessment_lock_connection_failed', { code: error.code || error.name })
      throw new ApiError('CAMPUS_STORE_UNAVAILABLE', 'The assessment workspace is temporarily unavailable.')
    }
    const conn = { client, open: true, destroy: false, connectionError: null, tails: new Map(), nested: 0, idle: null }
    const onError = (error) => {
      conn.connectionError = error
      conn.destroy = true
      logger.error('assessment_lock_connection_lost', { code: error.code || error.name })
    }
    client.on('error', onError)
    let acquired = false
    try {
      await acquireOn(conn, key)
      acquired = true
      return await runFramed(conn, new Set([key]), work)
    } finally {
      // Work started inside and still holding a nested lock (not awaited by
      // the operation) finishes before the connection goes back to the pool.
      if (conn.nested > 0) await new Promise((resolve) => { conn.idle = resolve })
      conn.open = false
      if (acquired) await releaseOn(conn, key)
      client.removeListener('error', onError)
      client.release(conn.destroy)
    }
  }

  return {
    async withLock(resource, work) {
      const key = sessionLockKey(resource)
      const frame = frames.getStore()
      if (frame?.conn.open && !frame.conn.destroy) {
        // An enclosing operation already holds this resource: re-entrant.
        if (frame.keys.has(key)) return work()
        return withSharedConnection(frame, key, work)
      }
      return withOwnConnection(key, work)
    },
  }
}
