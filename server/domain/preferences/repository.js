// Account accessibility preferences (C4.11) — memory + Postgres adapters (0031).
import { iso } from '../campusStore/pgUtil.js'
import { clone } from '../campusStore/memoryDb.js'

export const DEFAULT_PREFERENCES = Object.freeze({ reducedMotion: false, largerText: false })

export function createPreferencesRepoMemory(db) {
  db.preferences ||= new Map()
  return {
    async getPreferences(userId) {
      return clone(db.preferences.get(userId)) || null
    },
    async savePreferences(userId, { reducedMotion, largerText }) {
      const row = { userId, reducedMotion, largerText, updatedAt: db.clock().toISOString() }
      db.preferences.set(userId, row)
      return clone(row)
    },
  }
}

const pref = (r) => r && ({ userId: r.user_id, reducedMotion: r.reduced_motion, largerText: r.larger_text, updatedAt: iso(r.updated_at) })

export function createPreferencesRepoPg({ query }) {
  return {
    async getPreferences(userId) {
      const { rows } = await query('SELECT * FROM user_preferences WHERE user_id = $1', [userId])
      return pref(rows[0]) || null
    },
    async savePreferences(userId, { reducedMotion, largerText }) {
      const { rows } = await query(
        `INSERT INTO user_preferences (user_id, reduced_motion, larger_text, updated_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (user_id) DO UPDATE SET reduced_motion = EXCLUDED.reduced_motion, larger_text = EXCLUDED.larger_text, updated_at = now()
         RETURNING *`,
        [userId, reducedMotion, largerText],
      )
      return pref(rows[0])
    },
  }
}
