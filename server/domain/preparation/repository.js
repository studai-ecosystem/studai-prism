// Private preparation store (P7; 0047 + 0052) — memory + Postgres adapters
// with the same interface. Rows are PERSONAL / PREPARATION / SELF_REPORT by
// constraint. Nothing here references a formal session, evidence unit or
// report, and no Campus reader uses this repository. Writes that follow a
// model call check the attempt still exists: a deleted attempt cannot be
// recreated by a late result (T52).
import { ApiError } from '../http/errors.js'
import { clone } from '../campusStore/memoryDb.js'
import { iso } from '../campusStore/pgUtil.js'

const ATTEMPT_PATCH = ['intent', 'sanitized', 'state', 'cardError', 'completedAt', 'title', 'observations', 'application']
const CHECKIN_PATCH = ['whatTried', 'outcome', 'nextStep']

export function createPreparationRepoMemory(db) {
  db.preparationAttempts ||= new Map()
  db.preparationTurns ||= []
  db.actionCards ||= new Map()
  db.applicationCheckins ||= []
  const now = () => db.clock().toISOString()
  const newest = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || String(b.id).localeCompare(String(a.id))
  const gone = () => new ApiError('NOT_FOUND', 'Not found')
  const requireAttempt = (id) => { if (!db.preparationAttempts.has(String(id))) throw gone() }
  return {
    async createAttempt({ userId, intent, sanitized }) {
      const row = {
        id: db.id(), userId, workspaceType: 'PERSONAL', mode: 'PREPARATION', intent: clone(intent), sanitized: Boolean(sanitized), state: 'DRAFT',
        title: null, cardError: null, observations: [], application: null, createdAt: now(), completedAt: null,
      }
      db.preparationAttempts.set(row.id, row)
      return clone(row)
    },
    async getAttempt(id, userId) {
      const row = db.preparationAttempts.get(String(id))
      return row && row.userId === userId ? clone(row) : null
    },
    async listAttempts(userId) {
      return [...db.preparationAttempts.values()].filter((a) => a.userId === userId).sort(newest).map(clone)
    },
    async updateAttempt(id, userId, patch) {
      const row = db.preparationAttempts.get(String(id))
      if (!row || row.userId !== userId) return null
      for (const k of ATTEMPT_PATCH) if (k in patch) row[k] = clone(patch[k])
      return clone(row)
    },
    async deleteAttempt(id, userId) {
      const row = db.preparationAttempts.get(String(id))
      if (!row || row.userId !== userId) return false
      db.preparationAttempts.delete(String(id))
      db.preparationTurns = db.preparationTurns.filter((t) => t.attemptId !== String(id))
      db.actionCards.delete(String(id))
      db.applicationCheckins = db.applicationCheckins.filter((c) => !(c.sourceType === 'PREPARATION' && c.sourceId === String(id)))
      return true
    },
    async addTurn({ attemptId, actor, text }) {
      requireAttempt(attemptId)
      const row = { id: db.id(), attemptId, actor, text, createdAt: now() }
      db.preparationTurns.push(row)
      return clone(row)
    },
    async listTurns(attemptId) {
      return db.preparationTurns.filter((t) => t.attemptId === attemptId).map(clone)
    },
    async saveCard({ attemptId, userId, card }) {
      requireAttempt(attemptId)
      const existing = db.actionCards.get(attemptId)
      const row = { id: existing?.id || db.id(), attemptId, userId, card: clone(card), createdAt: existing?.createdAt || now() }
      db.actionCards.set(attemptId, row)
      return clone(row)
    },
    async getCard(attemptId) {
      return clone(db.actionCards.get(attemptId) || null)
    },
    async deleteCard(attemptId) {
      return db.actionCards.delete(attemptId)
    },
    async createCheckin({ userId, sourceType, sourceId, whatTried, outcome, nextStep = null }) {
      const row = { id: db.id(), userId, mode: 'SELF_REPORT', sourceType, sourceId: sourceId ?? null, whatTried, outcome, nextStep, createdAt: now(), updatedAt: now() }
      db.applicationCheckins.push(row)
      return clone(row)
    },
    async updateCheckin(id, userId, patch) {
      const row = db.applicationCheckins.find((c) => c.id === String(id) && c.userId === userId)
      if (!row) return null
      for (const k of CHECKIN_PATCH) if (k in patch) row[k] = patch[k]
      row.updatedAt = now()
      return clone(row)
    },
    async deleteCheckin(id, userId) {
      const before = db.applicationCheckins.length
      db.applicationCheckins = db.applicationCheckins.filter((c) => !(c.id === String(id) && c.userId === userId))
      return db.applicationCheckins.length < before
    },
    async listCheckins(userId) {
      return db.applicationCheckins.filter((c) => c.userId === userId).sort(newest).map(clone)
    },
  }
}

function mapError(err) {
  if (err.code === '23514') return new ApiError('VALIDATION_FAILED', 'Those details are not valid.')
  // A turn or card for an attempt that no longer exists: the attempt was
  // deleted while a model call was in flight. Nothing is recreated.
  if (err.code === '23503') return new ApiError('NOT_FOUND', 'Not found')
  return err
}
const run = async (fn) => { try { return await fn() } catch (err) { throw mapError(err) } }

export function createPreparationRepoPg({ query }) {
  const attempt = (r) => r && ({
    id: r.id, userId: r.user_id, workspaceType: r.workspace_type, mode: r.mode, intent: r.intent_json, sanitized: r.sanitized, state: r.state,
    title: r.title ?? null, cardError: r.card_error, observations: r.observations_json || [], application: r.application_json || null,
    createdAt: iso(r.created_at), completedAt: iso(r.completed_at),
  })
  const turn = (r) => r && ({ id: r.id, attemptId: r.attempt_id, actor: r.actor, text: r.text, createdAt: iso(r.created_at) })
  const card = (r) => r && ({ id: r.id, attemptId: r.attempt_id, userId: r.user_id, card: r.card_json, createdAt: iso(r.created_at) })
  const checkin = (r) => r && ({
    id: r.id, userId: r.user_id, mode: r.mode, sourceType: r.source_type, sourceId: r.source_id, whatTried: r.what_tried, outcome: r.outcome,
    nextStep: r.next_step ?? null, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at ?? r.created_at),
  })
  const cols = { intent: 'intent_json', sanitized: 'sanitized', state: 'state', cardError: 'card_error', completedAt: 'completed_at', title: 'title', observations: 'observations_json', application: 'application_json' }
  const jsonCols = new Set(['intent', 'observations', 'application'])
  const getAttempt = async (id, userId) => {
    const { rows: [row] } = await query('SELECT * FROM preparation_attempts WHERE id = $1 AND user_id = $2', [id, userId])
    return attempt(row || null)
  }
  return {
    async createAttempt({ userId, intent, sanitized }) {
      return run(async () => {
        const { rows: [row] } = await query(
          "INSERT INTO preparation_attempts (user_id, intent_json, sanitized, state) VALUES ($1, $2::jsonb, $3, 'DRAFT') RETURNING *",
          [userId, JSON.stringify(intent), Boolean(sanitized)],
        )
        return attempt(row)
      })
    },
    getAttempt,
    async listAttempts(userId) {
      const { rows } = await query('SELECT * FROM preparation_attempts WHERE user_id = $1 ORDER BY created_at DESC, id DESC', [userId])
      return rows.map(attempt)
    },
    async updateAttempt(id, userId, patch) {
      return run(async () => {
        const sets = []
        const params = [id, userId]
        for (const [k, col] of Object.entries(cols)) {
          if (!(k in patch)) continue
          params.push(jsonCols.has(k) ? JSON.stringify(patch[k]) : patch[k])
          sets.push(`${col} = $${params.length}${jsonCols.has(k) ? '::jsonb' : ''}`)
        }
        if (!sets.length) return getAttempt(id, userId)
        const { rows: [row] } = await query(`UPDATE preparation_attempts SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`, params)
        return attempt(row || null)
      })
    },
    async deleteAttempt(id, userId) {
      return run(async () => {
        const { rowCount } = await query('DELETE FROM preparation_attempts WHERE id = $1 AND user_id = $2', [id, userId])
        if (!rowCount) return false
        await query("DELETE FROM application_checkins WHERE user_id = $1 AND source_type = 'PREPARATION' AND source_id = $2", [userId, String(id)])
        return true
      })
    },
    async addTurn({ attemptId, actor, text }) {
      return run(async () => {
        const { rows: [row] } = await query('INSERT INTO preparation_turns (attempt_id, actor, text) VALUES ($1, $2, $3) RETURNING *', [attemptId, actor, text])
        return turn(row)
      })
    },
    async listTurns(attemptId) {
      const { rows } = await query('SELECT * FROM preparation_turns WHERE attempt_id = $1 ORDER BY created_at, id', [attemptId])
      return rows.map(turn)
    },
    async saveCard({ attemptId, userId, card: c }) {
      return run(async () => {
        const { rows: [row] } = await query(
          'INSERT INTO action_cards (attempt_id, user_id, card_json) VALUES ($1, $2, $3::jsonb) ON CONFLICT (attempt_id) DO UPDATE SET card_json = EXCLUDED.card_json RETURNING *',
          [attemptId, userId, JSON.stringify(c)],
        )
        return card(row)
      })
    },
    async getCard(attemptId) {
      const { rows: [row] } = await query('SELECT * FROM action_cards WHERE attempt_id = $1', [attemptId])
      return card(row || null)
    },
    async deleteCard(attemptId) {
      const { rowCount } = await query('DELETE FROM action_cards WHERE attempt_id = $1', [attemptId])
      return rowCount > 0
    },
    async createCheckin({ userId, sourceType, sourceId, whatTried, outcome, nextStep = null }) {
      return run(async () => {
        const { rows: [row] } = await query(
          'INSERT INTO application_checkins (user_id, source_type, source_id, what_tried, outcome, next_step) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
          [userId, sourceType, sourceId ?? null, whatTried, outcome, nextStep],
        )
        return checkin(row)
      })
    },
    async updateCheckin(id, userId, patch) {
      return run(async () => {
        const map = { whatTried: 'what_tried', outcome: 'outcome', nextStep: 'next_step' }
        const sets = ['updated_at = now()']
        const params = [id, userId]
        for (const [k, col] of Object.entries(map)) {
          if (!(k in patch)) continue
          params.push(patch[k])
          sets.push(`${col} = $${params.length}`)
        }
        const { rows: [row] } = await query(`UPDATE application_checkins SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`, params)
        return checkin(row || null)
      })
    },
    async deleteCheckin(id, userId) {
      const { rowCount } = await query('DELETE FROM application_checkins WHERE id = $1 AND user_id = $2', [id, userId])
      return rowCount > 0
    },
    async listCheckins(userId) {
      const { rows } = await query('SELECT * FROM application_checkins WHERE user_id = $1 ORDER BY created_at DESC, id DESC', [userId])
      return rows.map(checkin)
    },
  }
}
