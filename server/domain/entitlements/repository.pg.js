// Entitlements + append-only consumption ledger — Postgres adapter (0028).
// appendEvent runs in one transaction with the entitlement row locked.
import { ApiError } from '../http/errors.js'
import { iso, withTransaction } from '../campusStore/pgUtil.js'

const ent = (r) => r && ({
  id: r.id, userId: r.user_id, organizationId: r.organization_id, sourceType: r.source_type,
  sourceReferenceId: r.source_reference_id, productCode: r.product_code, assessmentDefinitionId: r.assessment_definition_id,
  quantity: r.quantity, consumedQuantity: r.consumed_quantity, validFrom: iso(r.valid_from), validUntil: iso(r.valid_until),
  status: r.status, metadata: r.metadata || {}, createdAt: iso(r.created_at),
})
const cons = (r) => r && ({
  id: r.id, entitlementId: r.entitlement_id, userId: r.user_id, organizationId: r.organization_id,
  sessionId: r.session_id, event: r.event, idempotencyKey: r.idempotency_key, createdAt: iso(r.created_at),
})

export function createEntitlementsRepoPg({ query, getPool }) {
  return {
    async createEntitlement(input) {
      try {
        const { rows } = await query(
          `INSERT INTO entitlements (id, user_id, organization_id, source_type, source_reference_id, product_code,
             assessment_definition_id, quantity, valid_from, valid_until, status, metadata)
           VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb) RETURNING *`,
          [input.id || null, input.userId ?? null, input.organizationId ?? null, input.sourceType, input.sourceReferenceId ?? null,
            input.productCode, input.assessmentDefinitionId ?? null, input.quantity, input.validFrom, input.validUntil ?? null,
            input.status, JSON.stringify(input.metadata || {})],
        )
        return ent(rows[0])
      } catch (err) {
        if (err.code === '23514') throw new ApiError('VALIDATION_FAILED', 'Entitlement is not valid for its source type.')
        throw err
      }
    },
    async getEntitlement(id) {
      const { rows } = await query('SELECT * FROM entitlements WHERE id = $1', [id])
      return ent(rows[0]) || null
    },
    async listEntitlements({ userId, organizationId, sourceTypes } = {}) {
      const where = []
      const params = []
      const eq = (column, value) => {
        if (value === undefined) return
        if (value === null) { where.push(`${column} IS NULL`); return }
        params.push(value)
        where.push(`${column} = $${params.length}`)
      }
      eq('user_id', userId)
      eq('organization_id', organizationId)
      if (sourceTypes) { params.push(sourceTypes); where.push(`source_type = ANY($${params.length})`) }
      const { rows } = await query(
        `SELECT * FROM entitlements ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at ASC`,
        params,
      )
      return rows.map(ent)
    },
    async findConsumption(idempotencyKey) {
      const { rows } = await query('SELECT * FROM entitlement_consumptions WHERE idempotency_key = $1', [idempotencyKey])
      return cons(rows[0]) || null
    },
    async listConsumptions(entitlementId) {
      const { rows } = await query('SELECT * FROM entitlement_consumptions WHERE entitlement_id = $1 ORDER BY created_at ASC', [entitlementId])
      return rows.map(cons)
    },
    async appendEvent({ entitlementId, userId, organizationId = null, sessionId = null, event, idempotencyKey, requireOpenReservation = false }) {
      const replayOf = async (client) => {
        const prior = await client.query('SELECT * FROM entitlement_consumptions WHERE idempotency_key = $1', [idempotencyKey])
        if (!prior.rows[0]) return null
        const e = await client.query('SELECT * FROM entitlements WHERE id = $1', [prior.rows[0].entitlement_id])
        return { consumption: cons(prior.rows[0]), entitlement: ent(e.rows[0]), replayed: true }
      }
      try {
        return await withTransaction(getPool, async (client) => {
          const early = await replayOf(client)
          if (early) return early
          const locked = await client.query('SELECT * FROM entitlements WHERE id = $1 FOR UPDATE', [entitlementId])
          const row = locked.rows[0]
          if (!row) throw new ApiError('NOT_FOUND', 'Entitlement not found.')
          // Re-check under the lock: a concurrent request may have just written.
          const late = await replayOf(client)
          if (late) return late
          if (requireOpenReservation) {
            const { rows: events } = await client.query(
              'SELECT * FROM entitlement_consumptions WHERE entitlement_id = $1 AND session_id = $2 ORDER BY created_at ASC',
              [entitlementId, sessionId],
            )
            if (!events.some((c) => c.event === 'RESERVED' && c.user_id === userId)) throw new ApiError('CONFLICT', 'Nothing is reserved for this session.')
            const closed = events.find((c) => c.event === 'CONSUMED' || c.event === 'RELEASED')
            if (closed) return { consumption: cons(closed), entitlement: ent(row), replayed: true }
          }
        let consumed = row.consumed_quantity
        if (event === 'RESERVED') {
          if (consumed >= row.quantity) throw new ApiError('ENTITLEMENT_REQUIRED', 'No seats remain on this entitlement.')
          consumed += 1
        } else if (event === 'RELEASED') {
          consumed = Math.max(0, consumed - 1)
        }
        const updated = await client.query('UPDATE entitlements SET consumed_quantity = $2, updated_at = now() WHERE id = $1 RETURNING *', [entitlementId, consumed])
        const inserted = await client.query(
          `INSERT INTO entitlement_consumptions (entitlement_id, user_id, organization_id, session_id, event, idempotency_key)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [entitlementId, userId, organizationId, sessionId, event, idempotencyKey],
        )
        return { consumption: cons(inserted.rows[0]), entitlement: ent(updated.rows[0]), replayed: false }
        })
      } catch (err) {
        // Same key committed by a concurrent request between our checks: replay it.
        if (err.code === '23505') {
          const { rows } = await query('SELECT * FROM entitlement_consumptions WHERE idempotency_key = $1', [idempotencyKey])
          if (rows[0]) {
            const e = await query('SELECT * FROM entitlements WHERE id = $1', [rows[0].entitlement_id])
            return { consumption: cons(rows[0]), entitlement: ent(e.rows[0]), replayed: true }
          }
        }
        throw err
      }
    },
  }
}
