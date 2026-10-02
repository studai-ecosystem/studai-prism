// Private preparation (P7; /api/v1/preparation, /api/v1/checkins). PERSONAL
// workspace only; the server fixes PREPARATION / SELF_REPORT mode. Every call
// carries the active workspace header like the rest of the student app.
import { z } from 'zod'
import { request } from './client.js'

const nullableStr = z.string().nullable()
export const SITUATION_TYPES = ['EXPLAIN_RECOMMENDATION', 'CLARIFY_BRIEF', 'DISAGREE_WITH_COLLEAGUE', 'NEGOTIATE_DEADLINE', 'GIVE_UPDATE', 'MAKE_HANDOVER']
export const SITUATION_LABELS = {
  EXPLAIN_RECOMMENDATION: 'Explain a recommendation',
  CLARIFY_BRIEF: 'Clarify a brief',
  DISAGREE_WITH_COLLEAGUE: 'Disagree with a colleague',
  NEGOTIATE_DEADLINE: 'Negotiate a deadline',
  GIVE_UPDATE: 'Give an update',
  MAKE_HANDOVER: 'Make a handover',
}

const IntentSchema = z.object({ situationType: z.string(), audience: z.string(), goal: z.string(), constraints: z.string() })
export const ActionCardSchema = z.object({
  situation: z.string(), plan: z.array(z.string()), keyMessage: z.string(), risks: z.array(z.string()), checkpoint: z.string(),
  generatedBy: z.literal('AI_ASSISTANCE'), createdAt: nullableStr,
})
export const PreparationAttemptSchema = z.object({
  id: z.string(),
  mode: z.literal('PREPARATION'),
  scope: z.literal('PERSONAL'),
  state: z.enum(['DRAFT', 'REHEARSING', 'COMPLETED', 'ABANDONED']),
  sanitized: z.boolean(),
  intent: IntentSchema,
  situationLabel: nullableStr,
  turns: z.array(z.object({ id: z.string(), actor: z.enum(['CANDIDATE', 'AI_PARTICIPANT', 'SYSTEM']), text: z.string(), createdAt: nullableStr })),
  card: ActionCardSchema.nullable(),
  cardError: nullableStr,
  createdAt: nullableStr,
  completedAt: nullableStr,
  replyError: nullableStr.optional(),
  lastTurnId: nullableStr.optional(),
})
const ListItemSchema = z.object({
  id: z.string(), mode: z.literal('PREPARATION'), scope: z.literal('PERSONAL'), state: PreparationAttemptSchema.shape.state,
  situationType: z.string(), situationLabel: nullableStr, goal: z.string(), createdAt: nullableStr, completedAt: nullableStr,
})
const CreatedSchema = z.object({ attemptId: z.string(), sanitizedIntent: IntentSchema, sanitizedChanged: z.boolean(), needsConfirmation: z.boolean(), state: z.string() })
export const CheckinSchema = z.object({
  id: z.string(), mode: z.literal('SELF_REPORT'), scope: z.literal('PERSONAL'), sourceType: z.enum(['PREPARATION', 'PRACTICE', 'REPORT']),
  sourceId: nullableStr, whatTried: z.string(), outcome: z.string(), createdAt: nullableStr,
})

const path = (id, suffix = '') => `/api/v1/preparation/${encodeURIComponent(id)}${suffix}`

export const fetchPreparations = () => request('/api/v1/preparation', { schema: z.object({ items: z.array(ListItemSchema) }), defaultErrorMessage: 'Your preparations could not be loaded.' }).then((r) => r.data.items)
export const fetchPreparation = (id) => request(path(id), { schema: PreparationAttemptSchema, defaultErrorMessage: 'This preparation could not be loaded.' }).then((r) => r.data)
export const createPreparationIntent = (intent) => request('/api/v1/preparation', { method: 'POST', body: intent, schema: CreatedSchema, defaultErrorMessage: 'The situation could not be saved.' }).then((r) => r.data)
export const confirmPreparation = (id, edits = null) => request(path(id, '/confirm'), { method: 'POST', body: edits ? { edits } : {}, schema: PreparationAttemptSchema, defaultErrorMessage: 'The situation could not be confirmed.' }).then((r) => r.data)
export const sendPreparationTurn = (id, text) => request(path(id, '/turns'), { method: 'POST', body: { text }, schema: PreparationAttemptSchema, defaultErrorMessage: 'Your line could not be sent.' }).then((r) => r.data)
export const finishPreparation = (id) => request(path(id, '/finish'), { method: 'POST', schema: PreparationAttemptSchema, defaultErrorMessage: 'The rehearsal could not be finished.' }).then((r) => r.data)
export const abandonPreparation = (id) => request(path(id, '/abandon'), { method: 'POST', schema: PreparationAttemptSchema, defaultErrorMessage: 'The preparation could not be closed.' }).then((r) => r.data)

export const fetchCheckins = () => request('/api/v1/checkins', { schema: z.object({ items: z.array(CheckinSchema) }), defaultErrorMessage: 'Your notes could not be loaded.' }).then((r) => r.data.items)
export const createCheckin = (body) => request('/api/v1/checkins', { method: 'POST', body, schema: CheckinSchema, defaultErrorMessage: 'Your note could not be saved.' }).then((r) => r.data)
