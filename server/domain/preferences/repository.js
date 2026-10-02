// Account accessibility preferences (C4.11) — memory + Postgres adapters (0031).
// P8.2 adds display-only intent fields (0048): segment, intention and
// responseMode. They route the learner to a relevant action and are NEVER a
// scoring input; all three are optional and nullable.
import { iso } from '../campusStore/pgUtil.js'
import { clone } from '../campusStore/memoryDb.js'

export const DEFAULT_PREFERENCES = Object.freeze({ reducedMotion: false, largerText: false, segment: null, intention: null, responseMode: null })
export const SEGMENTS = Object.freeze(['STUDENT', 'EARLY_CAREER', 'OTHER'])
export const INTENTIONS = Object.freeze(['UNDERSTAND', 'PRACTISE', 'PREPARE'])
// Speech is not yet available; the only supported response mode is text.
export const RESPONSE_MODES = Object.freeze(['TEXT'])

const intent = (input, previous = {}) => ({
  segment: input.segment === undefined ? previous.segment ?? null : input.segment,
  intention: input.intention === undefined ? previous.intention ?? null : input.intention,
  responseMode: input.responseMode === undefined ? previous.responseMode ?? null : input.responseMode,
})

export function createPreferencesRepoMemory(db) {
  db.preferences ||= new Map()
  return {
    async getPreferences(userId) {
      return clone(db.preferences.get(userId)) || null
    },
    async savePreferences(userId, { reducedMotion, largerText, ...rest }) {
      const previous = db.preferences.get(userId) || {}
      const row = { userId, reducedMotion, largerText, ...intent(rest, previous), updatedAt: db.clock().toISOString() }
      db.preferences.set(userId, row)
      return clone(row)
    },
  }
}

const pref = (r) => r && ({
  userId: r.user_id, reducedMotion: r.reduced_motion, largerText: r.larger_text,
  segment: r.segment ?? null, intention: r.intention ?? null, responseMode: r.response_mode ?? null, updatedAt: iso(r.updated_at),
})

export function createPreferencesRepoPg({ query }) {
  return {
    async getPreferences(userId) {
      const { rows } = await query('SELECT * FROM user_preferences WHERE user_id = $1', [userId])
      return pref(rows[0]) || null
    },
    async savePreferences(userId, { reducedMotion, largerText, ...rest }) {
      const previous = (await this.getPreferences(userId)) || {}
      const i = intent(rest, previous)
      const { rows } = await query(
        `INSERT INTO user_preferences (user_id, reduced_motion, larger_text, segment, intention, response_mode, updated_at) VALUES ($1, $2, $3, $4, $5, $6, now())
         ON CONFLICT (user_id) DO UPDATE SET reduced_motion = EXCLUDED.reduced_motion, larger_text = EXCLUDED.larger_text,
           segment = EXCLUDED.segment, intention = EXCLUDED.intention, response_mode = EXCLUDED.response_mode, updated_at = now()
         RETURNING *`,
        [userId, reducedMotion, largerText, i.segment, i.intention, i.responseMode],
      )
      return pref(rows[0])
    },
  }
}
