import { createHash } from 'node:crypto'
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

export function createPgSessionLocks({ getPool, waitMs = 10000, pollMs = 50, clock = () => performance.now(), sleep = delay }) {
  if (!Number.isFinite(waitMs) || waitMs < 0 || !Number.isFinite(pollMs) || pollMs <= 0) {
    throw new Error('Invalid assessment lock timing configuration.')
  }
  return {
    async withLock(resource, work) {
      const key = sessionLockKey(resource)
      let client
      try {
        const pool = getPool()
        if (!pool) throw new Error('Assessment lock store unavailable')
        client = await pool.connect()
      } catch (error) {
        logger.error('assessment_lock_connection_failed', { code: error.code || error.name })
        throw new ApiError('CAMPUS_STORE_UNAVAILABLE', 'The assessment workspace is temporarily unavailable.')
      }

      let acquired = false
      let destroy = false
      let connectionError = null
      const onError = (error) => {
        connectionError = error
        destroy = true
        logger.error('assessment_lock_connection_lost', { code: error.code || error.name })
      }
      client.on('error', onError)
      try {
        const started = clock()
        while (!acquired) {
          if (connectionError) throw new ApiError('UPSTREAM_UNAVAILABLE', 'The assessment connection was interrupted. Please retry.')
          let result
          try {
            result = await client.query('SELECT pg_try_advisory_lock($1::bigint) AS locked', [key])
          } catch (error) {
            destroy = true
            logger.error('assessment_lock_acquire_failed', { code: error.code || error.name })
            throw new ApiError('UPSTREAM_UNAVAILABLE', 'The assessment workspace is temporarily unavailable.')
          }
          const locked = result.rows?.[0]?.locked
          if (typeof locked !== 'boolean') {
            destroy = true
            logger.error('assessment_lock_acquire_failed', { code: 'INVALID_LOCK_RESULT' })
            throw new ApiError('UPSTREAM_UNAVAILABLE', 'The assessment workspace is temporarily unavailable.')
          }
          if (locked) acquired = true
          else {
            if (clock() - started >= waitMs) throw new ApiError('UPSTREAM_UNAVAILABLE', 'This assessment is busy. Please retry in a moment.')
            await sleep(pollMs)
          }
        }
        const result = await work()
        if (connectionError) throw new ApiError('UPSTREAM_UNAVAILABLE', 'The assessment connection was interrupted. Please retry.')
        return result
      } finally {
        if (acquired && !destroy) {
          try {
            const result = await client.query('SELECT pg_advisory_unlock($1::bigint) AS unlocked', [key])
            if (result.rows?.[0]?.unlocked !== true) {
              destroy = true
              logger.error('assessment_lock_release_failed', { code: 'LOCK_NOT_HELD' })
            }
          } catch (error) {
            destroy = true
            logger.error('assessment_lock_release_failed', { code: error.code || error.name })
          }
        }
        client.removeListener('error', onError)
        client.release(destroy)
      }
    },
  }
}
