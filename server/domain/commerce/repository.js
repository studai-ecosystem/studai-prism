// P8.4/P8.5 commerce store: product grants (0048) and guest preview attempts
// (0049) — memory and Postgres adapters with the same semantics. Both unique
// keys of product_grants (purchase_ref, provider_event_key) are enforced here
// too so an idempotent grant never duplicates in either adapter.
import { ApiError } from '../http/errors.js'
import { clone } from '../campusStore/memoryDb.js'
import { iso } from '../campusStore/pgUtil.js'

export function createCommerceRepoMemory(db) {
  db.productGrants ||= new Map()
  db.previewAttempts ||= new Map()
  const now = () => db.clock().toISOString()
  const grants = () => [...db.productGrants.values()]
  return {
    async findGrantByProviderEventKey(key) {
      if (!key) return null
      return clone(grants().find((g) => g.providerEventKey === key) || null)
    },
    async findGrantByPurchaseRef(ref) {
      if (!ref) return null
      return clone(grants().find((g) => g.purchaseRef === ref) || null)
    },
    async getGrant(id) {
      return clone(db.productGrants.get(String(id)) || null)
    },
    async listGrantsForUser(userId) {
      return grants().filter((g) => g.userId === userId).map(clone)
    },
    // Insert-or-return: a repeated provider event key returns the SAME row.
    async createGrant(input) {
      const dupe = grants().find((g) => (input.providerEventKey && g.providerEventKey === input.providerEventKey) || (input.purchaseRef && g.purchaseRef === input.purchaseRef))
      if (dupe) return { grant: clone(dupe), created: false }
      const row = {
        id: input.id || db.id(),
        userId: input.userId,
        productCode: input.productCode,
        productVersion: input.productVersion,
        included: clone(input.included) || {},
        selectedMissionIds: [...(input.selectedMissionIds || [])],
        validFrom: input.validFrom,
        validUntil: input.validUntil ?? null,
        fundingSource: input.fundingSource,
        purchaseRef: input.purchaseRef ?? null,
        providerEventKey: input.providerEventKey ?? null,
        policyVersion: input.policyVersion,
        createdAt: now(),
      }
      db.productGrants.set(row.id, row)
      return { grant: clone(row), created: true }
    },
    async setSelectedMissions(id, selectedMissionIds) {
      const row = db.productGrants.get(String(id))
      if (!row) throw new ApiError('NOT_FOUND', 'Not found')
      row.selectedMissionIds = [...selectedMissionIds]
      return clone(row)
    },

    async createPreviewAttempt({ id, tokenHash, payload, expiresAt, isSynthetic = false }) {
      const row = { id: id || db.id(), tokenHash, payload: clone(payload), isSynthetic: Boolean(isSynthetic), expiresAt, createdAt: now(), claimedUserId: null, claimedAt: null }
      db.previewAttempts.set(row.id, row)
      return clone(row)
    },
    async getPreviewAttempt(id) {
      return clone(db.previewAttempts.get(String(id)) || null)
    },
    async updatePreviewPayload(id, payload) {
      const row = db.previewAttempts.get(String(id))
      if (!row) throw new ApiError('NOT_FOUND', 'Not found')
      row.payload = clone(payload)
      return clone(row)
    },
    async claimPreviewAttempt(id, userId) {
      const row = db.previewAttempts.get(String(id))
      if (!row) throw new ApiError('NOT_FOUND', 'Not found')
      if (row.claimedUserId && row.claimedUserId !== userId) throw new ApiError('CONFLICT', 'This preview is already linked to another account.')
      if (!row.claimedUserId) { row.claimedUserId = userId; row.claimedAt = now() }
      return clone(row)
    },
    async listPreviewAttemptsForUser(userId) {
      return [...db.previewAttempts.values()].filter((p) => p.claimedUserId === userId).map(clone)
    },
    async purgeExpiredPreviews(at) {
      let n = 0
      for (const [id, row] of db.previewAttempts) {
        if (!row.claimedUserId && new Date(row.expiresAt) <= at) { db.previewAttempts.delete(id); n += 1 }
      }
      return n
    },
    // T59: product metrics count REAL previews only; synthetic rows are
    // reported as excluded, never folded into the numerator or denominator.
    async previewMetrics() {
      const rows = [...db.previewAttempts.values()]
      const real = rows.filter((r) => !r.isSynthetic)
      return { started: real.length, claimed: real.filter((r) => r.claimedUserId).length, retried: real.filter((r) => (r.payload?.attempts || []).length > 1).length, syntheticExcluded: rows.length - real.length }
    },
  }
}

const grantRow = (r) => r && ({
  id: r.id, userId: r.user_id, productCode: r.product_code, productVersion: r.product_version,
  included: r.included_json || {}, selectedMissionIds: r.selected_mission_ids || [],
  validFrom: iso(r.valid_from), validUntil: iso(r.valid_until), fundingSource: r.funding_source,
  purchaseRef: r.purchase_ref, providerEventKey: r.provider_event_key, policyVersion: r.policy_version, createdAt: iso(r.created_at),
})
const previewRow = (r) => r && ({
  id: r.id, tokenHash: r.token_hash, payload: r.payload_json || {}, isSynthetic: Boolean(r.is_synthetic),
  expiresAt: iso(r.expires_at), createdAt: iso(r.created_at), claimedUserId: r.claimed_user_id, claimedAt: iso(r.claimed_at),
})

export function createCommerceRepoPg({ query }) {
  return {
    async findGrantByProviderEventKey(key) {
      if (!key) return null
      const { rows } = await query('SELECT * FROM product_grants WHERE provider_event_key = $1', [key])
      return grantRow(rows[0]) || null
    },
    async findGrantByPurchaseRef(ref) {
      if (!ref) return null
      const { rows } = await query('SELECT * FROM product_grants WHERE purchase_ref = $1', [ref])
      return grantRow(rows[0]) || null
    },
    async getGrant(id) {
      const { rows } = await query('SELECT * FROM product_grants WHERE id = $1', [id])
      return grantRow(rows[0]) || null
    },
    async listGrantsForUser(userId) {
      const { rows } = await query('SELECT * FROM product_grants WHERE user_id = $1 ORDER BY created_at ASC', [userId])
      return rows.map(grantRow)
    },
    async createGrant(input) {
      // ON CONFLICT DO NOTHING on either unique key, then read the winner.
      const { rows } = await query(
        `INSERT INTO product_grants
           (user_id, product_code, product_version, included_json, selected_mission_ids, valid_from, valid_until,
            funding_source, purchase_ref, provider_event_key, policy_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [input.userId, input.productCode, input.productVersion, JSON.stringify(input.included || {}), input.selectedMissionIds || [],
          input.validFrom, input.validUntil ?? null, input.fundingSource, input.purchaseRef ?? null, input.providerEventKey ?? null, input.policyVersion],
      )
      if (rows[0]) return { grant: grantRow(rows[0]), created: true }
      const existing = (await this.findGrantByProviderEventKey(input.providerEventKey)) || (await this.findGrantByPurchaseRef(input.purchaseRef))
      return { grant: existing, created: false }
    },
    async setSelectedMissions(id, selectedMissionIds) {
      const { rows } = await query('UPDATE product_grants SET selected_mission_ids = $2 WHERE id = $1 RETURNING *', [id, selectedMissionIds])
      if (!rows[0]) throw new ApiError('NOT_FOUND', 'Not found')
      return grantRow(rows[0])
    },

    async createPreviewAttempt({ id, tokenHash, payload, expiresAt, isSynthetic = false }) {
      const { rows } = await query(
        `INSERT INTO preview_attempts (id, token_hash, payload_json, is_synthetic, expires_at)
         VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5) RETURNING *`,
        [id || null, tokenHash, JSON.stringify(payload || {}), Boolean(isSynthetic), expiresAt],
      )
      return previewRow(rows[0])
    },
    async getPreviewAttempt(id) {
      const { rows } = await query('SELECT * FROM preview_attempts WHERE id = $1', [id])
      return previewRow(rows[0]) || null
    },
    async updatePreviewPayload(id, payload) {
      const { rows } = await query('UPDATE preview_attempts SET payload_json = $2 WHERE id = $1 RETURNING *', [id, JSON.stringify(payload || {})])
      if (!rows[0]) throw new ApiError('NOT_FOUND', 'Not found')
      return previewRow(rows[0])
    },
    async claimPreviewAttempt(id, userId) {
      const { rows } = await query(
        `UPDATE preview_attempts SET claimed_user_id = $2, claimed_at = COALESCE(claimed_at, now())
         WHERE id = $1 AND (claimed_user_id IS NULL OR claimed_user_id = $2) RETURNING *`,
        [id, userId],
      )
      if (rows[0]) return previewRow(rows[0])
      const current = await this.getPreviewAttempt(id)
      if (!current) throw new ApiError('NOT_FOUND', 'Not found')
      throw new ApiError('CONFLICT', 'This preview is already linked to another account.')
    },
    async listPreviewAttemptsForUser(userId) {
      const { rows } = await query('SELECT * FROM preview_attempts WHERE claimed_user_id = $1 ORDER BY created_at ASC', [userId])
      return rows.map(previewRow)
    },
    async purgeExpiredPreviews(at) {
      const { rowCount } = await query('DELETE FROM preview_attempts WHERE claimed_user_id IS NULL AND expires_at <= $1', [at.toISOString()])
      return rowCount || 0
    },
    async previewMetrics() {
      const { rows } = await query(
        `SELECT
           COUNT(*) FILTER (WHERE NOT is_synthetic)::int AS started,
           COUNT(*) FILTER (WHERE NOT is_synthetic AND claimed_user_id IS NOT NULL)::int AS claimed,
           COUNT(*) FILTER (WHERE NOT is_synthetic AND jsonb_array_length(COALESCE(payload_json->'attempts', '[]'::jsonb)) > 1)::int AS retried,
           COUNT(*) FILTER (WHERE is_synthetic)::int AS synthetic_excluded
         FROM preview_attempts`)
      const r = rows[0] || {}
      return { started: r.started || 0, claimed: r.claimed || 0, retried: r.retried || 0, syntheticExcluded: r.synthetic_excluded || 0 }
    },
  }
}
