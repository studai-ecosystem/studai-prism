import { ApiError } from '../http/errors.js'
import { withTransaction } from '../campusStore/pgUtil.js'
import { createMemorySessionLocks, sessionLockKey } from './sessionLocks.js'

const memoryLocks = createMemorySessionLocks()
const memoryMarkers = new Set()
export const isMemorySessionErased = (sessionId) => memoryMarkers.has(sessionId)
export const markMemorySessionErased = (sessionId) => memoryMarkers.add(sessionId)
export const withMemoryPublicationFence = (sessionId, work) => memoryLocks.withLock(`publication:${sessionId}`, work)

// This short transaction fence is deliberately distinct from the operation
// lock: finishing a session can already hold that lock on another connection.
export async function lockPublication(client, sessionId) {
  await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [sessionLockKey(`publication:${sessionId}`)])
}

export async function assertSessionNotErased(client, sessionId) {
  const { rows } = await client.query('SELECT 1 FROM assessment_erasure_markers WHERE session_id = $1', [sessionId])
  if (rows.length) throw new ApiError('NOT_FOUND', 'Not found')
}

export function withPublicationTransaction(getPool, sessionId, work) {
  if (typeof getPool !== 'function') throw new ApiError('CAMPUS_STORE_UNAVAILABLE', 'The assessment store is temporarily unavailable.')
  return withTransaction(getPool, async (client) => {
    await lockPublication(client, sessionId)
    await assertSessionNotErased(client, sessionId)
    return work(client)
  })
}

// Writers stage synchronously reversible effects; no visible ledger change
// occurs while a writer awaits I/O or before the final lease/input check.
export function createMemoryPublicationTransaction() {
  const effects = []
  const values = new Map()
  return {
    values,
    stage({ commit, rollback }) {
      if (typeof commit !== 'function' || typeof rollback !== 'function') throw new ApiError('VALIDATION_FAILED', 'Invalid staged write.')
      effects.push({ commit, rollback })
    },
    commit() {
      const applied = []
      try {
        for (const effect of effects) { applied.push(effect); effect.commit() }
      } catch (error) {
        for (const effect of applied.reverse()) effect.rollback()
        throw error
      }
    },
  }
}
