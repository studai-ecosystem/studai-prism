// Guardian consent storage (PROD-READY Phase 8, 0062). Dark: nothing calls
// this while PRISM_UNDER18_PATH is off.
//
// PostgreSQL when a database is configured; otherwise an in-process store
// (development and unit tests), erased by the account erasure cascade like
// the table (eraseGuardianConsentsFromMemory).
import { randomUUID } from 'node:crypto'
import { isDbConfigured as defaultDbConfigured, query as defaultQuery } from '../../db/pool.js'

const iso = (v) => (v == null ? null : (v.toISOString?.() ?? String(v)))
const row = (r) => r && ({
  id: r.id, userId: r.user_id, guardianEmail: r.guardian_email, copyVersion: r.copy_version, tokenHash: r.token_hash,
  status: r.status, verification: r.verification, requestedAt: iso(r.requested_at), expiresAt: iso(r.expires_at),
  decidedAt: iso(r.decided_at), withdrawnAt: iso(r.withdrawn_at),
})

const memory = new Map()

export function eraseGuardianConsentsFromMemory(userId) {
  let n = 0
  for (const [id, r] of [...memory.entries()]) if (r.userId === userId) { memory.delete(id); n += 1 }
  return n
}

// Test helper: the in-process store is module state.
export function resetGuardianMemory() { memory.clear() }

function createMemoryRepo() {
  const clone = (r) => (r ? { ...r } : null)
  return {
    kind: 'memory',
    async create({ userId, guardianEmail, copyVersion, tokenHash, expiresAt, now }) {
      if ([...memory.values()].some((r) => r.userId === userId && r.status === 'PENDING')) {
        const err = new Error('GUARDIAN_CONSENT_PENDING_EXISTS')
        err.code = 'CONFLICT'
        throw err
      }
      const r = { id: randomUUID(), userId, guardianEmail, copyVersion, tokenHash, status: 'PENDING', verification: 'EMAIL_LINK', requestedAt: now.toISOString(), expiresAt: expiresAt.toISOString(), decidedAt: null, withdrawnAt: null }
      memory.set(r.id, r)
      return clone(r)
    },
    async findByTokenHash(tokenHash) { return clone([...memory.values()].find((r) => r.tokenHash === tokenHash) || null) },
    async latestForUser(userId) {
      return clone([...memory.values()].filter((r) => r.userId === userId).sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)))[0] || null)
    },
    async transition(id, { from, to, at }) {
      const r = memory.get(id)
      if (!r || !from.includes(r.status)) return null
      r.status = to
      if (to === 'VERIFIED' || to === 'DECLINED') r.decidedAt = at.toISOString()
      if (to === 'WITHDRAWN') r.withdrawnAt = at.toISOString()
      return clone(r)
    },
    async expirePending(userId) {
      let n = 0
      for (const r of memory.values()) if (r.userId === userId && r.status === 'PENDING') { r.status = 'EXPIRED'; n += 1 }
      return n
    },
  }
}

function createPgRepo(query) {
  return {
    kind: 'pg',
    async create({ userId, guardianEmail, copyVersion, tokenHash, expiresAt, now }) {
      try {
        const { rows } = await query(
          `INSERT INTO guardian_consents (user_id, guardian_email, copy_version, token_hash, requested_at, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [userId, guardianEmail, copyVersion, tokenHash, now.toISOString(), expiresAt.toISOString()],
        )
        return row(rows[0])
      } catch (err) {
        if (err?.code === '23505') {
          const e = new Error('GUARDIAN_CONSENT_PENDING_EXISTS')
          e.code = 'CONFLICT'
          throw e
        }
        throw err
      }
    },
    async findByTokenHash(tokenHash) {
      const { rows } = await query('SELECT * FROM guardian_consents WHERE token_hash = $1', [tokenHash])
      return row(rows[0] || null)
    },
    async latestForUser(userId) {
      const { rows } = await query('SELECT * FROM guardian_consents WHERE user_id = $1 ORDER BY requested_at DESC, id DESC LIMIT 1', [userId])
      return row(rows[0] || null)
    },
    // Conditional state change: only from one of `from` (a racing decision loses).
    async transition(id, { from, to, at }) {
      const { rows } = await query(
        `UPDATE guardian_consents
            SET status = $3,
                decided_at = CASE WHEN $3 IN ('VERIFIED', 'DECLINED') THEN $4::timestamptz ELSE decided_at END,
                withdrawn_at = CASE WHEN $3 = 'WITHDRAWN' THEN $4::timestamptz ELSE withdrawn_at END
          WHERE id = $1 AND status = ANY($2::text[]) RETURNING *`,
        [id, from, to, at.toISOString()],
      )
      return row(rows[0] || null)
    },
    async expirePending(userId) {
      const r = await query(`UPDATE guardian_consents SET status = 'EXPIRED' WHERE user_id = $1 AND status = 'PENDING'`, [userId])
      return r.rowCount
    },
  }
}

export function createGuardianConsentRepo({ isDbConfigured = defaultDbConfigured, query = defaultQuery } = {}) {
  return isDbConfigured() ? createPgRepo(query) : createMemoryRepo()
}
