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
export const PRACTICE_TARGETS = ['CLARIFY_CONSTRAINT', 'EXPLAIN_TRADEOFF', 'NEGOTIATE_BOUNDARY', 'ASK_OPEN_QUESTIONS', 'CONFIRM_OWNERSHIP']
export const PRACTICE_TARGET_LABELS = {
  CLARIFY_CONSTRAINT: 'Name a constraint clearly',
  EXPLAIN_TRADEOFF: 'Explain a trade-off',
  NEGOTIATE_BOUNDARY: 'Hold a realistic boundary',
  ASK_OPEN_QUESTIONS: 'Ask the questions I need answered',
  CONFIRM_OWNERSHIP: 'Confirm ownership and the next check-in',
}

const IntentSchema = z.object({
  situationType: z.string(), audience: z.string(), goal: z.string(), constraints: z.string(),
  practiceTarget: nullableStr.optional().default(null), assumptions: z.array(z.string()).optional().default([]),
})
const LimitationSchema = z.object({ category: z.string(), message: z.string() }).nullable()
export const ActionCardSchema = z.object({
  situation: z.string(), plan: z.array(z.string()), opening: z.string(), questions: z.array(z.string()), tradeoffs: z.array(z.string()),
  boundary: z.string(), selfCheck: z.string(),
  generatedBy: z.literal('AI_ASSISTANCE'), editedByLearner: z.boolean().optional().default(false), createdAt: nullableStr,
})
const ObservationSchema = z.object({ behaviour: z.string(), label: z.string(), quote: z.string(), authorship: z.literal('LEARNER') })
const ApplicationSchema = z.object({
  text: z.string(), source: z.enum(['PRACTICE_TARGET', 'LEARNER']), editedByLearner: z.boolean(), dismissed: z.boolean(), reminderOptIn: z.boolean(), checkedIn: z.boolean(),
}).nullable()
export const TurnSchema = z.object({
  id: z.string(), actor: z.enum(['CANDIDATE', 'AI_PARTICIPANT', 'AI_ASSISTANT', 'SYSTEM']), authorship: z.enum(['LEARNER', 'ASSISTANT', 'SYSTEM']), text: z.string(), createdAt: nullableStr,
})
export const PreparationAttemptSchema = z.object({
  id: z.string(),
  mode: z.literal('PREPARATION'),
  scope: z.literal('PERSONAL'),
  state: z.enum(['DRAFT', 'REHEARSING', 'COMPLETED', 'ABANDONED']),
  title: nullableStr,
  sanitized: z.boolean(),
  intent: IntentSchema,
  summary: z.string(),
  limitation: LimitationSchema,
  situationLabel: nullableStr,
  practiceTargetLabel: nullableStr,
  turns: z.array(TurnSchema),
  limits: z.object({ preparations: z.literal('UNLIMITED'), turns: z.object({ used: z.number().int(), max: z.number().int() }), assistance: z.object({ used: z.number().int(), max: z.number().int() }) }),
  card: ActionCardSchema.nullable(),
  cardError: nullableStr,
  observations: z.array(ObservationSchema),
  application: ApplicationSchema,
  createdAt: nullableStr,
  completedAt: nullableStr,
  replyError: nullableStr.optional(),
  boundary: LimitationSchema.optional(),
  assistError: nullableStr.optional(),
  lastTurnId: nullableStr.optional(),
})
const ListItemSchema = z.object({
  id: z.string(), mode: z.literal('PREPARATION'), scope: z.literal('PERSONAL'), state: PreparationAttemptSchema.shape.state, title: nullableStr,
  situationType: z.string(), situationLabel: nullableStr, practiceTargetLabel: nullableStr, goal: z.string(), reminderDue: z.boolean(), createdAt: nullableStr, completedAt: nullableStr,
})
const CreatedSchema = z.object({
  attemptId: z.string(), sanitizedIntent: IntentSchema, summary: z.string(), limitation: LimitationSchema, sanitizedChanged: z.boolean(), needsConfirmation: z.boolean(), state: z.string(),
})
export const CheckinSchema = z.object({
  id: z.string(), mode: z.literal('SELF_REPORT'), scope: z.literal('PERSONAL'), sourceType: z.enum(['PREPARATION', 'PRACTICE', 'REPORT']),
  sourceId: nullableStr, whatTried: z.string(), outcome: z.string(), nextStep: nullableStr, createdAt: nullableStr, updatedAt: nullableStr.optional(),
})
const Deleted = z.object({ deleted: z.literal(true) })

const path = (id, suffix = '') => `/api/v1/preparation/${encodeURIComponent(id)}${suffix}`
const attemptReq = (p, init, msg) => request(p, { ...init, schema: PreparationAttemptSchema, defaultErrorMessage: msg }).then((r) => r.data)

export const fetchPreparations = () => request('/api/v1/preparation', { schema: z.object({ items: z.array(ListItemSchema) }), defaultErrorMessage: 'Your preparations could not be loaded.' }).then((r) => r.data.items)
export const fetchPreparation = (id) => attemptReq(path(id), {}, 'This preparation could not be loaded.')
export const createPreparationIntent = (intent) => request('/api/v1/preparation', { method: 'POST', body: intent, schema: CreatedSchema, defaultErrorMessage: 'The situation could not be saved.' }).then((r) => r.data)
export const confirmPreparation = (id, edits = null) => attemptReq(path(id, '/confirm'), { method: 'POST', body: edits ? { edits } : {} }, 'The situation could not be confirmed.')
export const sendPreparationTurn = (id, text) => attemptReq(path(id, '/turns'), { method: 'POST', body: { text } }, 'Your line could not be sent.')
export const requestPreparationAssist = (id) => attemptReq(path(id, '/assist'), { method: 'POST' }, 'No suggestion could be written.')
export const finishPreparation = (id) => attemptReq(path(id, '/finish'), { method: 'POST' }, 'The rehearsal could not be finished.')
export const abandonPreparation = (id) => attemptReq(path(id, '/abandon'), { method: 'POST' }, 'The preparation could not be closed.')
export const renamePreparation = (id, title) => attemptReq(path(id), { method: 'PATCH', body: { title } }, 'The name could not be saved.')
export const deletePreparation = (id) => request(path(id), { method: 'DELETE', schema: Deleted, defaultErrorMessage: 'The preparation could not be deleted.' }).then((r) => r.data)
export const editPreparationCard = (id, edits) => attemptReq(path(id, '/card'), { method: 'PATCH', body: edits }, 'The card could not be saved.')
export const discardPreparationCard = (id) => attemptReq(path(id, '/card'), { method: 'DELETE' }, 'The card could not be discarded.')
export const editPreparationApplication = (id, edits) => attemptReq(path(id, '/application'), { method: 'PATCH', body: edits }, 'The suggestion could not be saved.')

export const fetchCheckins = () => request('/api/v1/checkins', { schema: z.object({ items: z.array(CheckinSchema) }), defaultErrorMessage: 'Your notes could not be loaded.' }).then((r) => r.data.items)
export const createCheckin = (body) => request('/api/v1/checkins', { method: 'POST', body, schema: CheckinSchema, defaultErrorMessage: 'Your note could not be saved.' }).then((r) => r.data)
export const editCheckin = (id, edits) => request(`/api/v1/checkins/${encodeURIComponent(id)}`, { method: 'PATCH', body: edits, schema: CheckinSchema, defaultErrorMessage: 'Your note could not be saved.' }).then((r) => r.data)
export const deleteCheckin = (id) => request(`/api/v1/checkins/${encodeURIComponent(id)}`, { method: 'DELETE', schema: Deleted, defaultErrorMessage: 'Your note could not be deleted.' }).then((r) => r.data)
