// V3 evidence rating queue store (C12.01) — memory + Postgres adapters with
// the same interface. Items are unique per evidence reference; ratings are
// append-only and unique per (item, rater).
import { ApiError } from '../http/errors.js'
import { clone } from '../campusStore/memoryDb.js'
import { iso } from '../campusStore/pgUtil.js'

export function createValidationRepoMemory(db) {
  db.ratingItems ||= new Map()
  db.unitRatings ||= []
  const now = () => db.clock().toISOString()
  return {
    // Returns { item, created }: an evidence unit is queued at most once.
    async upsertItem(input) {
      const existing = [...db.ratingItems.values()].find((i) => i.evidenceRef === input.evidenceRef)
      if (existing) return { item: clone(existing), created: false }
      const row = { id: db.id(), sourceMethod: null, ...input, createdAt: now() }
      db.ratingItems.set(row.id, row)
      return { item: clone(row), created: true }
    },
    async getItem(id) {
      return clone(db.ratingItems.get(String(id)) || null)
    },
    async listItems() {
      return [...db.ratingItems.values()].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).map(clone)
    },
    async appendRating({ itemId, raterId, level, cannotRate }) {
      if (!db.ratingItems.has(itemId)) throw new ApiError('NOT_FOUND', 'Not found')
      if ((level == null) !== Boolean(cannotRate) || (level != null && !(Number.isInteger(level) && level >= 1 && level <= 5))) throw new ApiError('VALIDATION_FAILED', 'Choose a level from 1 to 5, or "cannot rate".')
      if (db.unitRatings.some((r) => r.itemId === itemId && r.raterId === raterId)) throw new ApiError('CONFLICT', 'You have already rated this item.')
      const row = Object.freeze({ id: db.id(), itemId, raterId, level: level ?? null, cannotRate: Boolean(cannotRate), createdAt: now() })
      db.unitRatings.push(row)
      return clone(row)
    },
    async listRatings() {
      return db.unitRatings.map(clone)
    },
  }
}

export function createValidationRepoPg({ query }) {
  const item = (r) => r && ({
    id: r.id, evidenceRef: r.evidence_ref, sessionRef: r.session_ref, capabilityId: r.capability_id, sourceType: r.source_type,
    behaviorAnchorId: r.behavior_anchor_id, excerpt: r.excerpt, aiLevel: r.ai_level, aiStatus: r.ai_status, rubricVersion: r.rubric_version,
    enqueuedBy: r.enqueued_by, createdAt: iso(r.created_at), sourceMethod: r.source_method_json || null,
  })
  const rating = (r) => r && ({ id: r.id, itemId: r.item_id, raterId: r.rater_id, level: r.level, cannotRate: r.cannot_rate, createdAt: iso(r.created_at) })
  return {
    async upsertItem(input) {
      const { rows: [r] } = await query(
        `INSERT INTO evidence_rating_items (evidence_ref, session_ref, capability_id, source_type, behavior_anchor_id, excerpt, ai_level, ai_status, rubric_version, enqueued_by, source_method_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (evidence_ref) DO NOTHING RETURNING *`,
        [input.evidenceRef, input.sessionRef, input.capabilityId, input.sourceType, input.behaviorAnchorId, input.excerpt, input.aiLevel, input.aiStatus, input.rubricVersion, input.enqueuedBy, input.sourceMethod ? JSON.stringify(input.sourceMethod) : null],
      )
      if (r) return { item: item(r), created: true }
      const { rows: [e] } = await query('SELECT * FROM evidence_rating_items WHERE evidence_ref = $1', [input.evidenceRef])
      return { item: item(e), created: false }
    },
    async getItem(id) {
      const { rows: [r] } = await query('SELECT * FROM evidence_rating_items WHERE id = $1', [id])
      return item(r) || null
    },
    async listItems() {
      const { rows } = await query('SELECT * FROM evidence_rating_items ORDER BY created_at ASC, id ASC')
      return rows.map(item)
    },
    async appendRating({ itemId, raterId, level, cannotRate }) {
      try {
        const { rows: [r] } = await query(
          'INSERT INTO evidence_unit_ratings (item_id, rater_id, level, cannot_rate) VALUES ($1, $2, $3, $4) RETURNING *',
          [itemId, raterId, level ?? null, Boolean(cannotRate)],
        )
        return rating(r)
      } catch (err) {
        if (err.code === '23505') throw new ApiError('CONFLICT', 'You have already rated this item.')
        if (err.code === '23503') throw new ApiError('NOT_FOUND', 'Not found')
        if (err.code === '23514') throw new ApiError('VALIDATION_FAILED', 'Choose a level from 1 to 5, or "cannot rate".')
        throw err
      }
    },
    async listRatings() {
      const { rows } = await query('SELECT * FROM evidence_unit_ratings ORDER BY created_at ASC, id ASC')
      return rows.map(rating)
    },
  }
}
