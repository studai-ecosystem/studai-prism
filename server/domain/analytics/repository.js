// Campus analytics settings store (C10.02) — memory + Postgres adapters with
// the same interface: the organization's minimum aggregate group size, or
// null when it uses the default.
import { ApiError } from '../http/errors.js'
import { iso } from '../campusStore/pgUtil.js'

export function createAnalyticsRepoMemory(db) {
  db.analyticsSettings ||= new Map()
  return {
    async getSettings(organizationId) {
      const r = db.analyticsSettings.get(organizationId)
      return r ? { ...r } : null
    },
    async saveSettings({ organizationId, minAggregateGroupSize, updatedBy }) {
      if (!Number.isInteger(minAggregateGroupSize) || minAggregateGroupSize < 5 || minAggregateGroupSize > 1000) throw new ApiError('VALIDATION_FAILED', 'Those details are not valid.')
      const row = { organizationId, minAggregateGroupSize, updatedBy, updatedAt: db.clock().toISOString() }
      db.analyticsSettings.set(organizationId, row)
      return { ...row }
    },
  }
}

export function createAnalyticsRepoPg({ query }) {
  const map = (r) => r && ({ organizationId: r.organization_id, minAggregateGroupSize: r.min_aggregate_group_size, updatedBy: r.updated_by, updatedAt: iso(r.updated_at) })
  return {
    async getSettings(organizationId) {
      const { rows: [r] } = await query('SELECT * FROM organization_analytics_settings WHERE organization_id = $1', [organizationId])
      return map(r) || null
    },
    async saveSettings({ organizationId, minAggregateGroupSize, updatedBy }) {
      try {
        const { rows: [r] } = await query(
          `INSERT INTO organization_analytics_settings (organization_id, min_aggregate_group_size, updated_by) VALUES ($1, $2, $3)
           ON CONFLICT (organization_id) DO UPDATE SET min_aggregate_group_size = EXCLUDED.min_aggregate_group_size, updated_by = EXCLUDED.updated_by, updated_at = now()
           RETURNING *`,
          [organizationId, minAggregateGroupSize, updatedBy],
        )
        return map(r)
      } catch (err) {
        if (err.code === '23514') throw new ApiError('VALIDATION_FAILED', 'Those details are not valid.')
        throw err
      }
    },
  }
}
