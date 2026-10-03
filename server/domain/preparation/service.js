// Private preparation service (P7; CH-34, CH-35). A learner prepares for a
// real situation: sanitized intent with explicit assumptions → confirmation →
// untimed rehearsal with an AI counterpart (and clearly labelled AI
// suggestions the learner may ask for) → action card (AI assistance,
// validated) with separately stored rehearsal observations quoting only the
// learner's own lines → one application suggestion → optional SELF_REPORT
// check-ins. PERSONAL workspace only; PREPARATION mode fixed by the server.
// Nothing here reads or writes formal sessions, evidence, reports or
// development attempts, so no preparation or check-in can change a formal
// capability. Learner text is untrusted data in every model call and never
// appears in a system message, an audit event or a telemetry payload.
import { z } from 'zod'
import { ApiError } from '../http/errors.js'
import { renderPrompt } from '../../engine/prompts.js'
import { sanitizeCandidateText } from '../../lib/promptSecurity.js'
import { classifyPreparationText } from './safety.js'

export const PARTICIPANT_PROMPT = 'preparation_participant.v2'
export const ACTION_CARD_PROMPT = 'preparation_action_card.v2'
export const ASSIST_PROMPT = 'preparation_assist.v1'
export const INTENT_FIELD_MAX = 2000
export const TURN_MAX = 4000
export const MAX_TURNS = 40
export const MAX_ASSISTS = 5
export const MAX_ASSUMPTIONS = 6
export const TITLE_MAX = 120

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

// What the learner chooses to practise (P7.1 "chosen practice target"). A
// target is the learner's choice, never an inferred weakness.
export const PRACTICE_TARGETS = Object.freeze([
  'CLARIFY_CONSTRAINT', 'EXPLAIN_TRADEOFF', 'NEGOTIATE_BOUNDARY', 'ASK_OPEN_QUESTIONS', 'CONFIRM_OWNERSHIP',
])
export const PRACTICE_TARGET_LABELS = Object.freeze({
  CLARIFY_CONSTRAINT: 'Name a constraint clearly',
  EXPLAIN_TRADEOFF: 'Explain a trade-off',
  NEGOTIATE_BOUNDARY: 'Hold a realistic boundary',
  ASK_OPEN_QUESTIONS: 'Ask the questions I need answered',
  CONFIRM_OWNERSHIP: 'Confirm ownership and the next check-in',
})

// Behaviours an observation may name (P7.3): what the learner did, never
// whether the counterpart complied.
export const OBSERVED_BEHAVIOURS = Object.freeze([
  'CLARIFIED_CONSTRAINT', 'EXPLAINED_TRADEOFF', 'NEGOTIATED_BOUNDARY', 'ASKED_QUESTION', 'CONFIRMED_OWNERSHIP', 'LEFT_QUESTION_UNRESOLVED',
])
export const OBSERVED_BEHAVIOUR_LABELS = Object.freeze({
  CLARIFIED_CONSTRAINT: 'Clarified a constraint',
  EXPLAINED_TRADEOFF: 'Explained a trade-off',
  NEGOTIATED_BOUNDARY: 'Negotiated a realistic boundary',
  ASKED_QUESTION: 'Asked a question that needed an answer',
  CONFIRMED_OWNERSHIP: 'Confirmed who owns the next step',
  LEFT_QUESTION_UNRESOLVED: 'Left an important question unresolved',
})

// One behaviour to try outside Prism (P7.5), chosen from the learner's own
// practice target. A template from the target the learner chose, labelled as
// such; not a model output and not an observation.
export const APPLICATION_SUGGESTIONS = Object.freeze({
  CLARIFY_CONSTRAINT: 'In the real conversation, state your main constraint in one sentence before you propose anything.',
  EXPLAIN_TRADEOFF: 'In the real conversation, name one trade-off out loud before you ask for a decision.',
  NEGOTIATE_BOUNDARY: 'In the real conversation, say what you can do and what you cannot, then stop and wait for the reply.',
  ASK_OPEN_QUESTIONS: 'In the real conversation, ask the one question you most need answered before you agree to anything.',
  CONFIRM_OWNERSHIP: 'Before the real conversation ends, confirm who owns the next step and when you will check in.',
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

const Field = z.string().trim().max(INTENT_FIELD_MAX)
export const IntentInput = z.object({
  situationType: z.enum(SITUATION_TYPES),
  audience: Field.min(1),
  goal: Field.min(1),
  constraints: Field.default(''),
  practiceTarget: z.enum(PRACTICE_TARGETS),
}).strict()

const Assumptions = z.array(z.string().trim().min(1).max(300)).max(MAX_ASSUMPTIONS)
export const ConfirmEdits = z.object({
  audience: Field.min(1).optional(),
  goal: Field.min(1).optional(),
  constraints: Field.optional(),
  practiceTarget: z.enum(PRACTICE_TARGETS).optional(),
  assumptions: Assumptions.optional(),
}).strict()

// The card the learner keeps (P7.4): short, usable before the real
// conversation. Strict: a model cannot smuggle in extra keys.
const Line = z.string().trim().min(1).max(400)
export const ActionCardSchema = z.object({
  situation: z.string().trim().min(1).max(600),
  plan: z.array(Line).min(3).max(5),
  opening: z.string().trim().min(1).max(300),
  questions: z.array(Line).min(1).max(3),
  tradeoffs: z.array(Line).max(3),
  boundary: Line,
  selfCheck: Line,
}).strict()
export const CardEdits = ActionCardSchema.partial().strict()

// Observations the model proposes about the learner's own lines. Each quote
// must be verbatim from a LEARNER turn; otherwise it is dropped (T44).
const ObservationSchema = z.object({
  behaviour: z.enum(OBSERVED_BEHAVIOURS),
  quote: z.string().trim().min(1).max(400),
}).strict()
export const CardOutputSchema = ActionCardSchema.extend({ observations: z.array(ObservationSchema).max(4).default([]) }).strict()

const CARD_OUTPUT_SCHEMA = {
  name: 'preparation_action_card',
  description: 'Short practical preparation card with rehearsal observations.',
  schema: {
    type: 'object', additionalProperties: false,
    required: ['situation', 'plan', 'opening', 'questions', 'tradeoffs', 'boundary', 'selfCheck', 'observations'],
    properties: {
      situation: { type: 'string' },
      plan: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5 },
      opening: { type: 'string' },
      questions: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 },
      tradeoffs: { type: 'array', items: { type: 'string' }, maxItems: 3 },
      boundary: { type: 'string' },
      selfCheck: { type: 'string' },
      observations: {
        type: 'array', maxItems: 4,
        items: { type: 'object', additionalProperties: false, required: ['behaviour', 'quote'], properties: { behaviour: { type: 'string', enum: [...OBSERVED_BEHAVIOURS] }, quote: { type: 'string' } } },
      },
    },
  },
}

const ApplicationEdits = z.object({
  text: z.string().trim().min(1).max(400).optional(),
  dismissed: z.boolean().optional(),
  reminderOptIn: z.boolean().optional(),
}).strict()

const CheckinInput = z.object({
  sourceType: z.enum(['PREPARATION', 'PRACTICE', 'REPORT']),
  sourceId: z.string().trim().min(1).max(128).nullable().optional(),
  whatTried: Field.min(1),
  outcome: Field.min(1),
  nextStep: Field.optional(),
}).strict()
const CheckinEdits = z.object({ whatTried: Field.min(1).optional(), outcome: Field.min(1).optional(), nextStep: Field.optional() }).strict()

const contentOf = (out) => out?.choices?.[0]?.message?.content ?? out?.content ?? out
function parseJson(content) {
  if (content && typeof content === 'object') return content
  const m = String(content ?? '').match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}

// Authorship (P7.3): who wrote a turn. LEARNER lines are the only ones a
// rehearsal observation may quote; ASSISTANT lines (counterpart replies and
// sample sentences) are never treated as the learner's response.
export const AUTHORSHIP = Object.freeze({ CANDIDATE: 'LEARNER', AI_PARTICIPANT: 'ASSISTANT', AI_ASSISTANT: 'ASSISTANT', SYSTEM: 'SYSTEM' })
const SPEAKER = { CANDIDATE: 'Learner', AI_PARTICIPANT: 'Counterpart' }

// Rehearsal text for a model: learner and counterpart lines only. A sample
// sentence the assistant wrote is not part of what the learner did.
const transcriptOf = (turns) => turns
  .filter((t) => t.actor === 'CANDIDATE' || t.actor === 'AI_PARTICIPANT')
  .map((t) => `${SPEAKER[t.actor]}: ${sanitizeCandidateText(t.text, TURN_MAX).replace(/\n+/g, ' ')}`)
  .join('\n') || '(nothing yet)'

// Deterministic assumptions the learner confirms or edits (P7.1). They are
// restated from the learner's own words, not inferred weaknesses.
export function defaultAssumptions(intent) {
  return [
    `This is a ${SITUATION_LABELS[intent.situationType].toLowerCase()} conversation in a workplace setting.`,
    `The counterpart is: ${intent.audience}`,
    `You want: ${intent.goal}`,
    intent.constraints ? `Constraints you named: ${intent.constraints}` : 'No constraints were named; the counterpart may raise some.',
    'The counterpart will push back reasonably and is not hostile.',
    `You chose to practise: ${PRACTICE_TARGET_LABELS[intent.practiceTarget].toLowerCase()}.`,
  ].map((s) => s.slice(0, 300))
}

// The learner's own words, lower-cased at the start only when they begin
// an ordinary capitalised word ("The project lead" → "the project lead"), so
// the sentence reads naturally; acronyms and names are left alone.
const midSentence = (s) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s)

export function summaryOf(intent) {
  return `You are preparing to ${SITUATION_LABELS[intent.situationType].toLowerCase()} with ${midSentence(intent.audience)}. You want to ${midSentence(intent.goal.replace(/\.$/, ''))}.`.slice(0, 600)
}

// Prompt builder (P7.2): instructions live in the system message; everything
// the learner wrote travels in the user message inside data delimiters. The
// system message never contains learner text.
export function buildMessages(kind, intent, turns, extra = {}) {
  const name = kind === 'participant' ? PARTICIPANT_PROMPT : kind === 'assist' ? ASSIST_PROMPT : ACTION_CARD_PROMPT
  const system = renderPrompt(name, {
    SITUATION_TYPE: SITUATION_LABELS[intent.situationType] || 'Workplace conversation',
    PRACTICE_TARGET: PRACTICE_TARGET_LABELS[intent.practiceTarget] || 'the conversation',
    LIMITATION: intent.limitation ? `SCOPED LIMITATION: ${intent.limitation.message}` : 'SCOPED LIMITATION: none.',
  })
  const data = {
    situationType: intent.situationType,
    counterpart: sanitizeCandidateText(intent.audience, INTENT_FIELD_MAX),
    goal: sanitizeCandidateText(intent.goal, INTENT_FIELD_MAX),
    constraints: sanitizeCandidateText(intent.constraints || 'None named', INTENT_FIELD_MAX),
    assumptions: (intent.assumptions || []).map((a) => sanitizeCandidateText(a, 300)),
  }
  const user = [
    '<learner_context>', JSON.stringify(data), '</learner_context>',
    '<candidate_transcript>', transcriptOf(turns), '</candidate_transcript>',
    extra.instruction || '',
  ].join('\n')
  return [{ role: 'system', content: system }, { role: 'user', content: user }]
}

// Telemetry / audit serializer (P7.2): identifiers, states and counts only.
// No intent text, turn text, card text or check-in text ever leaves here.
export function preparationTelemetry(event, attempt, extra = {}) {
  return {
    event,
    attemptId: attempt?.id ?? null,
    userId: attempt?.userId ?? extra.userId ?? null,
    state: attempt?.state ?? null,
    situationType: attempt?.intent?.situationType ?? null,
    practiceTarget: attempt?.intent?.practiceTarget ?? null,
    sanitized: attempt?.sanitized ?? null,
    limitationCategory: attempt?.intent?.limitation?.category ?? null,
    ...Object.fromEntries(Object.entries(extra).filter(([, v]) => typeof v === 'boolean' || typeof v === 'number' || v === null || /^[A-Z_]+$/.test(String(v)))),
  }
}

export function createPreparationService({ repos, complete = null, clock = () => new Date(), audit = () => {}, timeoutMs = 20_000 }) {
  const store = () => {
    if (!repos.preparation) throw new ApiError('CAMPUS_STORE_UNAVAILABLE', 'Preparation is temporarily unavailable.')
    return repos.preparation
  }
  // Personal only: a campus workspace (student, faculty or admin) sees
  // nothing, indistinguishable from a missing route, so sponsored contexts
  // never learn these exist.
  const personal = (workspace) => {
    if (workspace?.type !== 'PERSONAL') throw new ApiError('NOT_FOUND', 'Not found')
  }
  const notFound = () => new ApiError('NOT_FOUND', 'Not found')
  const emit = (event, attempt, extra) => audit(preparationTelemetry(event, attempt, extra))

  async function withTimeout(promise) {
    let timer
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })), timeoutMs); timer.unref?.() })
    try { return await Promise.race([promise, timeout]) } finally { clearTimeout(timer) }
  }

  // After any model call the attempt is re-read: a deletion that happened
  // while the model was working wins, and the late result is discarded (T52).
  async function stillThere(attemptId, userId) {
    return store().getAttempt(attemptId, userId)
  }

  const turnView = (t) => ({ id: t.id, actor: t.actor, authorship: AUTHORSHIP[t.actor] || 'SYSTEM', text: t.text, createdAt: t.createdAt })

  async function view(attempt, extra = {}) {
    const [turns, card] = await Promise.all([store().listTurns(attempt.id), store().getCard(attempt.id)])
    const learnerTurns = turns.filter((t) => t.actor === 'CANDIDATE').length
    const assists = turns.filter((t) => t.actor === 'AI_ASSISTANT').length
    const intent = attempt.intent
    return {
      id: attempt.id,
      mode: 'PREPARATION',
      scope: 'PERSONAL',
      state: attempt.state,
      title: attempt.title || null,
      sanitized: attempt.sanitized,
      intent: {
        situationType: intent.situationType, audience: intent.audience, goal: intent.goal, constraints: intent.constraints,
        practiceTarget: intent.practiceTarget || null, assumptions: intent.assumptions || [],
      },
      summary: summaryOf(intent),
      limitation: intent.limitation || null,
      situationLabel: SITUATION_LABELS[intent.situationType] || null,
      practiceTargetLabel: PRACTICE_TARGET_LABELS[intent.practiceTarget] || null,
      turns: turns.map(turnView),
      // Explicit allowance (P7.3): preparations are not metered; turns and
      // suggestions per rehearsal are.
      limits: { preparations: 'UNLIMITED', turns: { used: learnerTurns, max: MAX_TURNS }, assistance: { used: assists, max: MAX_ASSISTS } },
      card: card ? { ...card.card, generatedBy: 'AI_ASSISTANCE', editedByLearner: Boolean(card.card.editedByLearner), createdAt: card.createdAt } : null,
      cardError: attempt.cardError || null,
      observations: (attempt.observations || []).map((o) => ({ behaviour: o.behaviour, label: OBSERVED_BEHAVIOUR_LABELS[o.behaviour] || o.behaviour, quote: o.quote, authorship: 'LEARNER' })),
      application: attempt.application || null,
      createdAt: attempt.createdAt,
      completedAt: attempt.completedAt,
      ...extra,
    }
  }

  async function owned(user, workspace, attemptId) {
    personal(workspace)
    const a = await store().getAttempt(attemptId, user.id)
    if (!a) throw notFound()
    return a
  }

  function screen(parts) {
    const verdict = classifyPreparationText(parts.join('\n'))
    if (verdict.kind === 'REFUSED') {
      throw new ApiError('PREPARATION_OUT_OF_SCOPE', verdict.message, { details: { category: verdict.category } })
    }
    return verdict.kind === 'LIMITED' ? { category: verdict.category, message: verdict.message } : null
  }

  async function modelText(messages, task, max = 300) {
    const out = await withTimeout(complete({ messages, temperature: 0.4, max_completion_tokens: max }, { task, retries: 1 }))
    const content = contentOf(out)
    return sanitizeCandidateText(typeof content === 'string' ? content : JSON.stringify(content), TURN_MAX).trim()
  }

  const listItem = (a) => ({
    id: a.id, mode: 'PREPARATION', scope: 'PERSONAL', state: a.state, title: a.title || null,
    situationType: a.intent.situationType, situationLabel: SITUATION_LABELS[a.intent.situationType] || null,
    practiceTargetLabel: PRACTICE_TARGET_LABELS[a.intent.practiceTarget] || null, goal: a.intent.goal,
    reminderDue: Boolean(a.application?.reminderOptIn && !a.application?.dismissed && !a.application?.checkedIn),
    createdAt: a.createdAt, completedAt: a.completedAt,
  })

  return {
    SITUATION_TYPES,
    PRACTICE_TARGETS,

    // Step 1: validate, screen, sanitize and store a DRAFT with its
    // assumptions; the learner must confirm before any model sees it.
    async createIntent(user, workspace, input) {
      personal(workspace)
      const parsed = IntentInput.safeParse(input || {})
      if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Check the situation details.', { details: parsed.error.flatten() })
      const d = parsed.data
      const limitation = screen([d.audience, d.goal, d.constraints])
      const fields = { audience: sanitizeIntentText(d.audience), goal: sanitizeIntentText(d.goal), constraints: sanitizeIntentText(d.constraints) }
      const base = { situationType: d.situationType, audience: fields.audience.text, goal: fields.goal.text, constraints: fields.constraints.text, practiceTarget: d.practiceTarget }
      if (!base.audience || !base.goal) throw new ApiError('VALIDATION_FAILED', 'Describe the counterpart and your goal without personal details.')
      const intent = { ...base, assumptions: defaultAssumptions(base), limitation }
      const attempt = await store().createAttempt({ userId: user.id, intent, sanitized: Object.values(fields).some((f) => f.changed) })
      emit('preparation.intent_created', attempt)
      return {
        attemptId: attempt.id, sanitizedIntent: { ...base, assumptions: intent.assumptions }, summary: summaryOf(base), limitation,
        sanitizedChanged: attempt.sanitized, needsConfirmation: true, state: attempt.state,
      }
    },

    // Step 2: the learner confirms (optionally editing text and
    // assumptions); edits are screened and sanitized again. DRAFT → REHEARSING.
    async confirm(user, workspace, attemptId, edits = null) {
      const a = await owned(user, workspace, attemptId)
      if (a.state !== 'DRAFT') throw new ApiError('CONFLICT', 'This preparation has already been confirmed.')
      let intent = a.intent
      if (edits && typeof edits === 'object' && Object.keys(edits).length) {
        const parsed = ConfirmEdits.safeParse(edits)
        if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Check the situation details.', { details: parsed.error.flatten() })
        const next = { ...intent, ...parsed.data }
        const limitation = screen([next.audience, next.goal, next.constraints || '', ...(next.assumptions || [])])
        intent = {
          situationType: intent.situationType,
          audience: sanitizeIntentText(next.audience).text,
          goal: sanitizeIntentText(next.goal).text,
          constraints: sanitizeIntentText(next.constraints || '').text,
          practiceTarget: next.practiceTarget,
          assumptions: (next.assumptions || intent.assumptions || []).map((s) => sanitizeIntentText(s, 300).text).filter(Boolean),
          limitation,
        }
        if (!intent.audience || !intent.goal) throw new ApiError('VALIDATION_FAILED', 'Describe the counterpart and your goal without personal details.')
      }
      const updated = await store().updateAttempt(a.id, user.id, { intent, sanitized: true, state: 'REHEARSING' })
      await store().addTurn({ attemptId: a.id, actor: 'SYSTEM', text: 'Private preparation started. This is practice, not a formal assessment.' })
      emit('preparation.confirmed', updated)
      return view(updated)
    },

    async list(user, workspace) {
      personal(workspace)
      return { items: (await store().listAttempts(user.id)).map(listItem) }
    },

    async get(user, workspace, attemptId) {
      return view(await owned(user, workspace, attemptId))
    },

    async rename(user, workspace, attemptId, title) {
      const a = await owned(user, workspace, attemptId)
      const parsed = z.string().trim().min(1).max(TITLE_MAX).safeParse(title)
      if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Give this preparation a short name.')
      return view(await store().updateAttempt(a.id, user.id, { title: sanitizeIntentText(parsed.data, TITLE_MAX).text }))
    },

    // Deletion (P7.7): the attempt, its turns, card and linked check-ins go
    // together. A model call still in flight finds no attempt to write to.
    async remove(user, workspace, attemptId) {
      const a = await owned(user, workspace, attemptId)
      await store().deleteAttempt(a.id, user.id)
      emit('preparation.deleted', { id: a.id, userId: user.id })
      return { deleted: true }
    },

    // The learner speaks; the counterpart answers within the bounded facts.
    // A learner line that asks for harassment, coercion, deception or
    // disclosure is kept as theirs but gets a bounded SYSTEM boundary, not
    // a counterpart reply. A failed model call keeps the learner's turn.
    async sendTurn(user, workspace, attemptId, text) {
      const a = await owned(user, workspace, attemptId)
      if (a.state !== 'REHEARSING') throw new ApiError('CONFLICT', 'This preparation is not open for rehearsal.')
      const clean = sanitizeCandidateText(String(text ?? ''), TURN_MAX).trim()
      if (!clean) throw new ApiError('VALIDATION_FAILED', 'Write what you would say.')
      const existing = await store().listTurns(a.id)
      if (existing.filter((t) => t.actor === 'CANDIDATE').length >= MAX_TURNS) throw new ApiError('CONFLICT', 'This rehearsal has reached its length. Finish it to get your card.')
      const mine = await store().addTurn({ attemptId: a.id, actor: 'CANDIDATE', text: clean })
      const verdict = classifyPreparationText(clean)
      let replyError = null
      let boundary = null
      if (verdict.kind === 'REFUSED') {
        boundary = { category: verdict.category, message: verdict.message }
        await store().addTurn({ attemptId: a.id, actor: 'SYSTEM', text: verdict.message })
        emit('preparation.turn_refused', a, { category: verdict.category })
      } else if (!complete) {
        replyError = 'PARTICIPANT_NOT_CONFIGURED'
      } else {
        try {
          const spoken = await modelText(buildMessages('participant', a.intent, [...existing, mine], { instruction: 'Reply in character to the learner\'s last line.' }), 'preparation_participant')
          if (!(await stillThere(a.id, user.id))) throw notFound()
          if (!spoken) replyError = 'EMPTY_REPLY'
          else await store().addTurn({ attemptId: a.id, actor: 'AI_PARTICIPANT', text: spoken })
        } catch (err) {
          if (err instanceof ApiError) throw err
          replyError = err?.code === 'TIMEOUT' ? 'TIMEOUT' : 'PROVIDER_ERROR'
        }
      }
      return view(a, { lastTurnId: mine.id, replyError, boundary })
    },

    // Assistance (P7.3): a sample sentence the learner may ask for. Stored
    // as an AI_ASSISTANT turn so it is never mistaken for the learner's own
    // line; bounded by MAX_ASSISTS. Never evaluated (T44).
    async assist(user, workspace, attemptId) {
      const a = await owned(user, workspace, attemptId)
      if (a.state !== 'REHEARSING') throw new ApiError('CONFLICT', 'This preparation is not open for rehearsal.')
      const turns = await store().listTurns(a.id)
      if (turns.filter((t) => t.actor === 'AI_ASSISTANT').length >= MAX_ASSISTS) throw new ApiError('ALLOWANCE_EXHAUSTED', `You have used the ${MAX_ASSISTS} suggestions for this rehearsal.`)
      if (!complete) return view(a, { assistError: 'ASSIST_NOT_CONFIGURED' })
      try {
        const sample = await modelText(buildMessages('assist', a.intent, turns, { instruction: 'Write ONE sample sentence the learner could say next.' }), 'preparation_assist', 160)
        if (!(await stillThere(a.id, user.id))) throw notFound()
        if (!sample) return view(a, { assistError: 'EMPTY_REPLY' })
        await store().addTurn({ attemptId: a.id, actor: 'AI_ASSISTANT', text: sample })
        emit('preparation.assist', a)
        return view(a, { assistError: null })
      } catch (err) {
        if (err instanceof ApiError) throw err
        return view(a, { assistError: err?.code === 'TIMEOUT' ? 'TIMEOUT' : 'PROVIDER_ERROR' })
      }
    },

    // Finish: REHEARSING → COMPLETED, generate the card and keep only the
    // observations whose quotes are verbatim learner lines. A failed or
    // invalid generation leaves card null with an explicit error; nothing
    // is fabricated. Idempotent: a completed attempt returns its stored view.
    async finish(user, workspace, attemptId) {
      const a = await owned(user, workspace, attemptId)
      if (a.state === 'COMPLETED') return view(a)
      if (a.state !== 'REHEARSING') throw new ApiError('CONFLICT', 'Confirm the situation before finishing.')
      const turns = await store().listTurns(a.id)
      const learnerText = turns.filter((t) => t.actor === 'CANDIDATE').map((t) => t.text)
      let cardError = null
      let observations = []
      if (!learnerText.length) {
        cardError = 'NO_LEARNER_TURNS'
      } else if (!complete) {
        cardError = 'CARD_NOT_CONFIGURED'
      } else {
        try {
          const out = await withTimeout(complete({
            messages: buildMessages('card', a.intent, turns, { instruction: 'Return the JSON object for this rehearsal.' }),
            temperature: 0, max_completion_tokens: 900, json_schema: CARD_OUTPUT_SCHEMA,
          }, { task: 'preparation_action_card', retries: 1 }))
          if (!(await stillThere(a.id, user.id))) throw notFound()
          const parsed = CardOutputSchema.safeParse(parseJson(contentOf(out)))
          if (!parsed.success) cardError = 'UNPARSEABLE_OUTPUT'
          else {
            const { observations: proposed, ...card } = parsed.data
            const norm = (s) => String(s).replace(/\s+/g, ' ').trim()
            observations = proposed.filter((o) => learnerText.some((t) => norm(t).includes(norm(o.quote))))
            await store().saveCard({ attemptId: a.id, userId: user.id, card })
          }
        } catch (err) {
          if (err instanceof ApiError) throw err
          cardError = err?.code === 'TIMEOUT' ? 'TIMEOUT' : 'PROVIDER_ERROR'
        }
      }
      const application = a.intent.practiceTarget
        ? { text: APPLICATION_SUGGESTIONS[a.intent.practiceTarget], source: 'PRACTICE_TARGET', editedByLearner: false, dismissed: false, reminderOptIn: false, checkedIn: false }
        : null
      const updated = await store().updateAttempt(a.id, user.id, { state: 'COMPLETED', completedAt: clock().toISOString(), cardError, observations, application })
      if (!updated) throw notFound()
      emit('preparation.finished', updated, { cardGenerated: !cardError, observationCount: observations.length })
      return view(updated)
    },

    // The learner may edit the card (P7.4); the result is still labelled as
    // assistance they adjusted, never a credential.
    async editCard(user, workspace, attemptId, edits) {
      const a = await owned(user, workspace, attemptId)
      const current = await store().getCard(a.id)
      if (!current) throw new ApiError('CONFLICT', 'There is no card to edit.')
      const parsed = CardEdits.safeParse(edits || {})
      if (!parsed.success || !Object.keys(parsed.data).length) throw new ApiError('VALIDATION_FAILED', 'Check the card text.')
      const { editedByLearner: _e, ...body } = current.card
      const merged = ActionCardSchema.safeParse({ ...body, ...parsed.data })
      if (!merged.success) throw new ApiError('VALIDATION_FAILED', 'Check the card text.')
      await store().saveCard({ attemptId: a.id, userId: user.id, card: { ...merged.data, editedByLearner: true } })
      return view(a)
    },

    async discardCard(user, workspace, attemptId) {
      const a = await owned(user, workspace, attemptId)
      await store().deleteCard(a.id)
      return view(await store().updateAttempt(a.id, user.id, { cardError: 'DISCARDED_BY_LEARNER' }))
    },

    // Application card (P7.5): edit the suggestion, dismiss it, or opt into
    // an in-app reminder. Nothing is sent anywhere.
    async editApplication(user, workspace, attemptId, edits) {
      const a = await owned(user, workspace, attemptId)
      if (!a.application) throw new ApiError('CONFLICT', 'There is no application suggestion yet.')
      const parsed = ApplicationEdits.safeParse(edits || {})
      if (!parsed.success || !Object.keys(parsed.data).length) throw new ApiError('VALIDATION_FAILED', 'Check the suggestion.')
      const next = { ...a.application }
      if (parsed.data.text !== undefined) { next.text = sanitizeIntentText(parsed.data.text, 400).text; next.editedByLearner = true; next.source = 'LEARNER' }
      if (parsed.data.dismissed !== undefined) next.dismissed = parsed.data.dismissed
      if (parsed.data.reminderOptIn !== undefined) next.reminderOptIn = parsed.data.reminderOptIn
      return view(await store().updateAttempt(a.id, user.id, { application: next }))
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
        id: a.id, state: a.state, title: a.title || SITUATION_LABELS[a.intent.situationType] || null, createdAt: a.createdAt, completedAt: a.completedAt,
      }))
    },

    // SELF_REPORT check-ins (CH-35): the learner's own account of outside
    // use. Never evidence; never readable from a campus workspace.
    async createCheckin(user, workspace, input) {
      personal(workspace)
      const parsed = CheckinInput.safeParse(input || {})
      if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Say what you tried and what happened.', { details: parsed.error.flatten() })
      const d = parsed.data
      let attempt = null
      if (d.sourceType === 'PREPARATION' && d.sourceId) {
        attempt = await store().getAttempt(d.sourceId, user.id)
        if (!attempt) throw notFound()
      }
      const row = await store().createCheckin({
        userId: user.id, sourceType: d.sourceType, sourceId: d.sourceId ?? null,
        whatTried: sanitizeIntentText(d.whatTried).text, outcome: sanitizeIntentText(d.outcome).text, nextStep: sanitizeIntentText(d.nextStep || '').text || null,
      })
      if (attempt?.application) await store().updateAttempt(attempt.id, user.id, { application: { ...attempt.application, checkedIn: true } })
      emit('preparation.checkin_created', attempt, { userId: user.id, sourceType: d.sourceType })
      return checkinView(row)
    },

    async editCheckin(user, workspace, checkinId, edits) {
      personal(workspace)
      const parsed = CheckinEdits.safeParse(edits || {})
      if (!parsed.success || !Object.keys(parsed.data).length) throw new ApiError('VALIDATION_FAILED', 'Say what you tried and what happened.')
      const patch = {}
      if (parsed.data.whatTried !== undefined) patch.whatTried = sanitizeIntentText(parsed.data.whatTried).text
      if (parsed.data.outcome !== undefined) patch.outcome = sanitizeIntentText(parsed.data.outcome).text
      if (parsed.data.nextStep !== undefined) patch.nextStep = sanitizeIntentText(parsed.data.nextStep).text || null
      const row = await store().updateCheckin(checkinId, user.id, patch)
      if (!row) throw notFound()
      return checkinView(row)
    },

    async deleteCheckin(user, workspace, checkinId) {
      personal(workspace)
      if (!(await store().deleteCheckin(checkinId, user.id))) throw notFound()
      return { deleted: true }
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
  return {
    id: c.id, mode: 'SELF_REPORT', scope: 'PERSONAL', sourceType: c.sourceType, sourceId: c.sourceId,
    whatTried: c.whatTried, outcome: c.outcome, nextStep: c.nextStep ?? null, createdAt: c.createdAt, updatedAt: c.updatedAt ?? c.createdAt,
  }
}
