// Private preparation service (P7; CH-34, CH-35). A learner prepares for a
// real situation: sanitized intent → confirmation → untimed rehearsal with an
// AI participant → action card (AI assistance, validated) → optional
// SELF_REPORT check-ins. PERSONAL workspace only; PREPARATION mode fixed by
// the server. Nothing here reads or writes formal sessions, evidence,
// reports or development attempts, so no preparation or check-in can change
// a formal capability. Learner text is untrusted data in every model call.
import { z } from 'zod'
import { ApiError } from '../http/errors.js'
import { renderPrompt } from '../../engine/prompts.js'
import { sanitizeCandidateText } from '../../lib/promptSecurity.js'

export const PARTICIPANT_PROMPT = 'preparation_participant.v1'
export const ACTION_CARD_PROMPT = 'preparation_action_card.v1'
export const INTENT_FIELD_MAX = 2000
export const TURN_MAX = 4000
export const MAX_TURNS = 40

// Bounded situations (P7.1). The wizard offers only these.
export const SITUATION_TYPES = Object.freeze([
  'EXPLAIN_RECOMMENDATION', 'CLARIFY_BRIEF', 'DISAGREE_WITH_COLLEAGUE', 'NEGOTIATE_DEADLINE', 'GIVE_UPDATE', 'MAKE_HANDOVER',
])
export const SITUATION_LABELS = Object.freeze({
  EXPLAIN_RECOMMENDATION: 'Explain a recommendation',
  CLARIFY_BRIEF: 'Clarify a brief',
  DISAGREE_WITH_COLLEAGUE: 'Disagree with a colleague',
  NEGOTIATE_DEADLINE: 'Negotiate a deadline',
  GIVE_UPDATE: 'Give an update',
  MAKE_HANDOVER: 'Make a handover',
})

const RE_EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const RE_URL = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi
// Phone numbers: 7+ digits with optional separators, optional leading +.
const RE_PHONE = /(?:\+?\d[\d\s().-]{6,}\d)/g

// Strips the direct identifiers a learner is told not to enter. Redaction
// assistance, not a guarantee of anonymisation (P7.2).
export function sanitizeIntentText(text, maxLen = INTENT_FIELD_MAX) {
  let t = sanitizeCandidateText(text ?? '', maxLen * 2)
  let redactions = 0
  const redact = (rx, label) => { t = t.replace(rx, () => { redactions += 1; return label }) }
  redact(RE_EMAIL, '[email removed]')
  redact(RE_URL, '[link removed]')
  redact(RE_PHONE, '[number removed]')
  t = t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, maxLen)
  return { text: t, changed: redactions > 0 }
}

export const IntentInput = z.object({
  situationType: z.enum(SITUATION_TYPES),
  audience: z.string().trim().min(1).max(INTENT_FIELD_MAX),
  goal: z.string().trim().min(1).max(INTENT_FIELD_MAX),
  constraints: z.string().trim().max(INTENT_FIELD_MAX).default(''),
}).strict()

export const ActionCardSchema = z.object({
  situation: z.string().trim().min(1).max(600),
  plan: z.array(z.string().trim().min(1).max(400)).min(3).max(5),
  keyMessage: z.string().trim().min(1).max(300),
  risks: z.array(z.string().trim().min(1).max(400)).max(3),
  checkpoint: z.string().trim().min(1).max(400),
}).strict()

const CARD_OUTPUT_SCHEMA = {
  name: 'preparation_action_card',
  description: 'Short practical preparation card.',
  schema: {
    type: 'object', additionalProperties: false,
    required: ['situation', 'plan', 'keyMessage', 'risks', 'checkpoint'],
    properties: {
      situation: { type: 'string' },
      plan: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5 },
      keyMessage: { type: 'string' },
      risks: { type: 'array', items: { type: 'string' }, maxItems: 3 },
      checkpoint: { type: 'string' },
    },
  },
}

const contentOf = (out) => out?.choices?.[0]?.message?.content ?? out?.content ?? out
function parseJson(content) {
  if (content && typeof content === 'object') return content
  const m = String(content ?? '').match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}

const transcriptOf = (turns) => turns
  .filter((t) => t.actor !== 'SYSTEM')
  .map((t) => `${t.actor === 'CANDIDATE' ? 'Learner' : 'Counterpart'}: ${sanitizeCandidateText(t.text, TURN_MAX)}`)
  .join('\n') || '(nothing yet)'

export function createPreparationService({ repos, complete = null, clock = () => new Date(), audit = () => {}, timeoutMs = 20_000 }) {
  const store = () => {
    if (!repos.preparation) throw new ApiError('CAMPUS_STORE_UNAVAILABLE', 'Preparation is temporarily unavailable.')
    return repos.preparation
  }
  // Personal only: a campus-student workspace sees nothing (indistinguishable
  // from a missing route), so sponsored contexts never learn these exist.
  const personal = (workspace) => {
    if (workspace?.type !== 'PERSONAL') throw new ApiError('NOT_FOUND', 'Not found')
  }
  const notFound = () => new ApiError('NOT_FOUND', 'Not found')

  async function withTimeout(promise) {
    let timer
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })), timeoutMs); timer.unref?.() })
    try { return await Promise.race([promise, timeout]) } finally { clearTimeout(timer) }
  }

  const promptVars = (intent, turns) => ({
    SITUATION_TYPE: SITUATION_LABELS[intent.situationType] || intent.situationType,
    AUDIENCE: sanitizeCandidateText(intent.audience, INTENT_FIELD_MAX),
    GOAL: sanitizeCandidateText(intent.goal, INTENT_FIELD_MAX),
    CONSTRAINTS: sanitizeCandidateText(intent.constraints || 'None named', INTENT_FIELD_MAX),
    TRANSCRIPT: transcriptOf(turns),
  })

  async function view(attempt) {
    const [turns, card] = await Promise.all([store().listTurns(attempt.id), store().getCard(attempt.id)])
    return {
      id: attempt.id,
      mode: 'PREPARATION',
      scope: 'PERSONAL',
      state: attempt.state,
      sanitized: attempt.sanitized,
      intent: attempt.intent,
      situationLabel: SITUATION_LABELS[attempt.intent.situationType] || null,
      turns: turns.map((t) => ({ id: t.id, actor: t.actor, text: t.text, createdAt: t.createdAt })),
      card: card ? { ...card.card, generatedBy: 'AI_ASSISTANCE', createdAt: card.createdAt } : null,
      cardError: attempt.cardError || null,
      createdAt: attempt.createdAt,
      completedAt: attempt.completedAt,
    }
  }

  async function owned(user, workspace, attemptId) {
    personal(workspace)
    const a = await store().getAttempt(attemptId, user.id)
    if (!a) throw notFound()
    return a
  }

  return {
    SITUATION_TYPES,
    // Step 1: sanitize and store a DRAFT; the learner must confirm the
    // sanitized text before any model sees it.
    async createIntent(user, workspace, input) {
      personal(workspace)
      const parsed = IntentInput.safeParse(input || {})
      if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Check the situation details.', { details: parsed.error.flatten() })
      const d = parsed.data
      const fields = { audience: sanitizeIntentText(d.audience), goal: sanitizeIntentText(d.goal), constraints: sanitizeIntentText(d.constraints) }
      const intent = { situationType: d.situationType, audience: fields.audience.text, goal: fields.goal.text, constraints: fields.constraints.text }
      if (!intent.audience || !intent.goal) throw new ApiError('VALIDATION_FAILED', 'Describe the counterpart and your goal without personal details.')
      const attempt = await store().createAttempt({ userId: user.id, intent, sanitized: Object.values(fields).some((f) => f.changed) })
      audit({ event: 'preparation.intent_created', userId: user.id, attemptId: attempt.id, sanitized: attempt.sanitized })
      return { attemptId: attempt.id, sanitizedIntent: intent, sanitizedChanged: attempt.sanitized, needsConfirmation: true, state: attempt.state }
    },

    // Step 2: the learner confirms (optionally editing) the sanitized text;
    // edits are sanitized again. Moves DRAFT → REHEARSING.
    async confirm(user, workspace, attemptId, edits = null) {
      const a = await owned(user, workspace, attemptId)
      if (a.state !== 'DRAFT') throw new ApiError('CONFLICT', 'This preparation has already been confirmed.')
      let intent = a.intent
      if (edits && typeof edits === 'object') {
        const parsed = IntentInput.partial().strict().safeParse(edits)
        if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Check the situation details.', { details: parsed.error.flatten() })
        const next = { ...intent, ...parsed.data }
        intent = {
          situationType: next.situationType,
          audience: sanitizeIntentText(next.audience).text,
          goal: sanitizeIntentText(next.goal).text,
          constraints: sanitizeIntentText(next.constraints || '').text,
        }
        if (!intent.audience || !intent.goal) throw new ApiError('VALIDATION_FAILED', 'Describe the counterpart and your goal without personal details.')
      }
      const updated = await store().updateAttempt(a.id, user.id, { intent, sanitized: true, state: 'REHEARSING' })
      await store().addTurn({ attemptId: a.id, actor: 'SYSTEM', text: 'Private preparation started. This is practice, not a formal assessment.' })
      return view(updated)
    },

    async list(user, workspace) {
      personal(workspace)
      const items = await store().listAttempts(user.id)
      return { items: items.map((a) => ({ id: a.id, mode: 'PREPARATION', scope: 'PERSONAL', state: a.state, situationType: a.intent.situationType, situationLabel: SITUATION_LABELS[a.intent.situationType] || null, goal: a.intent.goal, createdAt: a.createdAt, completedAt: a.completedAt })) }
    },

    async get(user, workspace, attemptId) {
      return view(await owned(user, workspace, attemptId))
    },

    // The learner speaks; the AI participant answers within the bounded
    // facts. The participant can write only preparation_turns. A failed
    // model call keeps the learner's turn and says so.
    async sendTurn(user, workspace, attemptId, text) {
      const a = await owned(user, workspace, attemptId)
      if (a.state !== 'REHEARSING') throw new ApiError('CONFLICT', 'This preparation is not open for rehearsal.')
      const clean = sanitizeCandidateText(String(text ?? ''), TURN_MAX).trim()
      if (!clean) throw new ApiError('VALIDATION_FAILED', 'Write what you would say.')
      const existing = await store().listTurns(a.id)
      if (existing.filter((t) => t.actor === 'CANDIDATE').length >= MAX_TURNS) throw new ApiError('CONFLICT', 'This rehearsal has reached its length. Finish it to get your card.')
      const mine = await store().addTurn({ attemptId: a.id, actor: 'CANDIDATE', text: clean })
      let reply = null
      let replyError = null
      if (!complete) {
        replyError = 'PARTICIPANT_NOT_CONFIGURED'
      } else {
        try {
          const prompt = renderPrompt(PARTICIPANT_PROMPT, promptVars(a.intent, [...existing, mine]))
          const out = await withTimeout(complete({
            messages: [{ role: 'system', content: prompt }, { role: 'user', content: 'Reply in character to the learner\'s last line.' }],
            temperature: 0.4, max_completion_tokens: 300,
          }, { task: 'preparation_participant', retries: 1 }))
          const content = contentOf(out)
          const spoken = sanitizeCandidateText(typeof content === 'string' ? content : JSON.stringify(content), TURN_MAX).trim()
          if (!spoken) replyError = 'EMPTY_REPLY'
          else reply = await store().addTurn({ attemptId: a.id, actor: 'AI_PARTICIPANT', text: spoken })
        } catch (err) {
          replyError = err?.code === 'TIMEOUT' ? 'TIMEOUT' : 'PROVIDER_ERROR'
        }
      }
      return { ...(await view(a)), lastTurnId: mine.id, replyError }
    },

    // Finish: REHEARSING → COMPLETED and generate the card. A failed or
    // invalid generation leaves card null with an explicit error; nothing is
    // fabricated. Idempotent: a completed attempt returns its stored view.
    async finish(user, workspace, attemptId) {
      const a = await owned(user, workspace, attemptId)
      if (a.state === 'COMPLETED') return view(a)
      if (a.state !== 'REHEARSING') throw new ApiError('CONFLICT', 'Confirm the situation before finishing.')
      const turns = await store().listTurns(a.id)
      let cardError = null
      if (!turns.some((t) => t.actor === 'CANDIDATE')) {
        cardError = 'NO_LEARNER_TURNS'
      } else if (!complete) {
        cardError = 'CARD_NOT_CONFIGURED'
      } else {
        try {
          const prompt = renderPrompt(ACTION_CARD_PROMPT, promptVars(a.intent, turns))
          const out = await withTimeout(complete({
            messages: [{ role: 'system', content: prompt }, { role: 'user', content: 'Return the JSON object for this rehearsal.' }],
            temperature: 0, max_completion_tokens: 700, json_schema: CARD_OUTPUT_SCHEMA,
          }, { task: 'preparation_action_card', retries: 1 }))
          const parsed = ActionCardSchema.safeParse(parseJson(contentOf(out)))
          if (!parsed.success) cardError = 'UNPARSEABLE_OUTPUT'
          else await store().saveCard({ attemptId: a.id, userId: user.id, card: parsed.data })
        } catch (err) {
          cardError = err?.code === 'TIMEOUT' ? 'TIMEOUT' : 'PROVIDER_ERROR'
        }
      }
      const updated = await store().updateAttempt(a.id, user.id, { state: 'COMPLETED', completedAt: clock().toISOString(), cardError })
      audit({ event: 'preparation.finished', userId: user.id, attemptId: a.id, cardGenerated: !cardError })
      return view(updated)
    },

    async abandon(user, workspace, attemptId) {
      const a = await owned(user, workspace, attemptId)
      if (a.state === 'COMPLETED' || a.state === 'ABANDONED') return view(a)
      return view(await store().updateAttempt(a.id, user.id, { state: 'ABANDONED', completedAt: clock().toISOString() }))
    },

    // History projection input (P7.6): own attempts, separately typed.
    async listAttemptHistory(user, workspace) {
      if (workspace?.type !== 'PERSONAL' || !repos.preparation) return []
      return (await repos.preparation.listAttempts(user.id)).map((a) => ({
        id: a.id, state: a.state, title: SITUATION_LABELS[a.intent.situationType] || null, createdAt: a.createdAt, completedAt: a.completedAt,
      }))
    },

    // SELF_REPORT check-ins (CH-35): the learner's own account of outside
    // use. Never evidence; never readable from a campus workspace.
    async createCheckin(user, workspace, input) {
      personal(workspace)
      const parsed = z.object({
        sourceType: z.enum(['PREPARATION', 'PRACTICE', 'REPORT']),
        sourceId: z.string().trim().min(1).max(128).nullable().optional(),
        whatTried: z.string().trim().min(1).max(INTENT_FIELD_MAX),
        outcome: z.string().trim().min(1).max(INTENT_FIELD_MAX),
      }).strict().safeParse(input || {})
      if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Say what you tried and what happened.', { details: parsed.error.flatten() })
      const d = parsed.data
      if (d.sourceType === 'PREPARATION' && d.sourceId && !(await store().getAttempt(d.sourceId, user.id))) throw notFound()
      const row = await store().createCheckin({
        userId: user.id, sourceType: d.sourceType, sourceId: d.sourceId ?? null,
        whatTried: sanitizeIntentText(d.whatTried).text, outcome: sanitizeIntentText(d.outcome).text,
      })
      return checkinView(row)
    },

    async listCheckins(user, workspace) {
      personal(workspace)
      return { items: (await store().listCheckins(user.id)).map(checkinView) }
    },

    async listCheckinHistory(user, workspace) {
      if (workspace?.type !== 'PERSONAL' || !repos.preparation) return []
      return (await repos.preparation.listCheckins(user.id)).map(checkinView)
    },
  }
}

function checkinView(c) {
  return { id: c.id, mode: 'SELF_REPORT', scope: 'PERSONAL', sourceType: c.sourceType, sourceId: c.sourceId, whatTried: c.whatTried, outcome: c.outcome, createdAt: c.createdAt }
}
