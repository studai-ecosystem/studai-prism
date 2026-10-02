// P8.3 — the honest free first experience: one short PRACTICE scene, one
// source-backed observation, one retry. No model call, no rubric, no
// capability map, no credential. The scene is the DRAFT handover segment read
// ONLY for its briefing (facts, people, board, one prompt); opportunities,
// rubric reference and conditional facts never leave the server.
//
// Guest attempts are stored in preview_attempts under a scoped opaque token:
//   <attemptId>.<expiresAtMs>.<hmac>   (1 hour; hash stored, token never logged)
// Linking to an account is an explicit POST /claim with that token after
// sign-in — never a guessed session id or a raw URL.
import { createHmac, createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { ApiError } from '../http/errors.js'
import { DRAFT_CORE_TEAMREADY_A_HANDOVER } from '../assessments/draftSegments.js'
import { getJwtSecret } from '../../lib/security.js'

export const PREVIEW_MODE = 'PRACTICE'
export const PREVIEW_MAX_ATTEMPTS = 2 // one answer + one retry
export const PREVIEW_TOKEN_TTL_MS = 60 * 60 * 1000
export const PREVIEW_METHOD_VERSION = 'preview-deterministic-0.1'
const MAX_ANSWER_CHARS = 1500

// Public scene: briefing + one prompt. Nothing private is read from the segment.
export function previewScene() {
  const s = DRAFT_CORE_TEAMREADY_A_HANDOVER
  return {
    id: `preview:${s.id}`,
    mode: PREVIEW_MODE,
    contentStatus: s.status,
    title: s.title,
    briefing: {
      facts: [...s.publicFacts],
      participants: s.participants.map((p) => ({ name: p.name, role: p.role })),
      board: { title: s.artifactSchema.title, rows: s.artifactSchema.rows.map((r) => ({ task: r.task, owner: r.owner, due: r.due })) },
    },
    prompt: 'Dev leaves tomorrow and two tasks on the board have no owner. In a few sentences, say what you would tell Dev and Nia now: who does what, by when, and anything you still need to know.',
    limits: { attempts: PREVIEW_MAX_ATTEMPTS, maxAnswerChars: MAX_ANSWER_CHARS },
    notice: 'This is a short practice scene, not a formal assessment. Your answer is kept for one hour unless you save it to an account.',
  }
}

// ── Deterministic observation ───────────────────────────────────────────────
// Three plain-language criteria derived from the segment's public structure.
// Each returns the learner's OWN sentence that satisfied it, or null.
const NAMES = /\b(I|I'll|I will|we|Dev|Nia|you)\b/i
const TASKS = /\b(invitation|invite|invitations|handout|handouts|room|booking|print|file|list|task|tasks)\b/i
const TIME = /\b(monday|tuesday|wednesday|thursday|friday|today|tomorrow|tonight|by|before|morning|evening|day|week|deadline)\b/i
const OWNERSHIP = /\b(take|takes|own|owns|handle|handles|cover|covers|do|does|look after|responsible|owner|assign)\b/i
const ASK = /\b(what|who|which|when|how|can|could|do you|is there|are there|need to know|let me know|confirm)\b/i

export const PREVIEW_CRITERIA = Object.freeze([
  {
    id: 'STATES_HANDOVER',
    label: 'You said who does what by when',
    why: 'A handover the colleague who stays can act on names a person, a task and a time.',
    test: (sentence) => NAMES.test(sentence) && TASKS.test(sentence) && TIME.test(sentence) && OWNERSHIP.test(sentence),
    missing: 'a sentence that names who does which task by when',
  },
  {
    id: 'ASSIGNS_OWNER',
    label: 'You gave an unowned task an owner',
    why: 'Two tasks had no owner; naming one is what moves the plan.',
    test: (sentence) => NAMES.test(sentence) && TASKS.test(sentence) && OWNERSHIP.test(sentence),
    missing: 'a sentence that gives one of the unowned tasks an owner',
  },
  {
    id: 'ASKS_BEFORE_DECIDING',
    label: 'You checked something before deciding',
    why: 'Asking what the colleague who stays can take on avoids handing over an impossible plan.',
    test: (sentence) => /\?/.test(sentence) && ASK.test(sentence),
    missing: 'a question about what you still need to know',
  },
])

const splitSentences = (text) => String(text || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)

export function observe(answer) {
  const text = String(answer || '').trim()
  if (!text) throw new ApiError('VALIDATION_FAILED', 'Write a few sentences first.')
  if (text.length > MAX_ANSWER_CHARS) throw new ApiError('VALIDATION_FAILED', `Keep your answer under ${MAX_ANSWER_CHARS} characters.`)
  const sentences = splitSentences(text)
  for (const c of PREVIEW_CRITERIA) {
    const hit = sentences.find((s) => c.test(s))
    if (hit) {
      return {
        kind: 'OBSERVED',
        mode: PREVIEW_MODE,
        methodVersion: PREVIEW_METHOD_VERSION,
        criterionId: c.id,
        label: c.label,
        why: c.why,
        quote: hit.slice(0, 300),
        nextBehaviour: c.id === 'STATES_HANDOVER' ? 'Next time, also check what the person staying can realistically take on.' : 'Next time, close with one line that names who does what by when.',
        disclaimer: 'A practice observation from a deterministic check of your own words. It is not a capability level and does not appear in any formal report.',
      }
    }
  }
  const first = PREVIEW_CRITERIA[0]
  return {
    kind: 'NOT_FOUND',
    mode: PREVIEW_MODE,
    methodVersion: PREVIEW_METHOD_VERSION,
    criterionId: null,
    label: 'We could not find a clear handover yet',
    why: first.why,
    quote: null,
    message: `We could not find ${first.missing} in your reply \u2014 try again.`,
    nextBehaviour: 'Name one person, one task and one time in a single sentence.',
    disclaimer: 'A practice observation from a deterministic check of your own words. It is not a capability level and does not appear in any formal report.',
  }
}

// ── Scoped opaque token ─────────────────────────────────────────────────────
const secret = () => process.env.PRISM_PREVIEW_TOKEN_SECRET || getJwtSecret()
const sign = (id, exp) => createHmac('sha256', secret()).update(`preview:${id}.${exp}`).digest('base64url')
export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex')

export function mintPreviewToken(id, now = new Date()) {
  const exp = now.getTime() + PREVIEW_TOKEN_TTL_MS
  return { token: `${id}.${exp}.${sign(id, exp)}`, expiresAt: new Date(exp).toISOString() }
}

// Returns { id, expiresAt } or throws (shape, signature or expiry).
export function verifyPreviewToken(token, now = new Date()) {
  if (typeof token !== 'string' || token.length > 200) throw new ApiError('VALIDATION_FAILED', 'That preview link is not valid.')
  const parts = token.split('.')
  if (parts.length !== 3) throw new ApiError('VALIDATION_FAILED', 'That preview link is not valid.')
  const [id, expRaw, sig] = parts
  const exp = Number(expRaw)
  if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isFinite(exp)) throw new ApiError('VALIDATION_FAILED', 'That preview link is not valid.')
  const expected = Buffer.from(sign(id, exp))
  const provided = Buffer.from(String(sig))
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) throw new ApiError('VALIDATION_FAILED', 'That preview link is not valid.')
  if (exp <= now.getTime()) throw new ApiError('INVITE_EXPIRED', 'This preview has expired. You can try the scene again.', { status: 410 })
  return { id, expiresAt: new Date(exp).toISOString() }
}

// ── Service ─────────────────────────────────────────────────────────────────
export function createPreviewService({ repos, clock = () => new Date(), telemetry = null, synthetic = () => false }) {
  const store = () => {
    const r = repos?.commerce
    if (!r) throw new ApiError('CAMPUS_STORE_UNAVAILABLE', 'The preview is temporarily unavailable.')
    return r
  }
  const emit = (event, props) => {
    if (!telemetry) return
    Promise.resolve(telemetry.record({ user: null, workspace: null, event, props })).catch(() => {})
  }
  async function load(token) {
    const { id } = verifyPreviewToken(token, clock())
    const row = await store().getPreviewAttempt(id)
    if (!row || row.tokenHash !== hashToken(token)) throw new ApiError('NOT_FOUND', 'Not found')
    return row
  }
  const view = (row, token) => ({
    previewToken: token,
    expiresAt: row.expiresAt,
    attemptsUsed: row.payload.attempts.length,
    attemptsRemaining: Math.max(0, PREVIEW_MAX_ATTEMPTS - row.payload.attempts.length),
    observation: row.payload.attempts[row.payload.attempts.length - 1].observation,
    claimed: Boolean(row.claimedUserId),
  })

  return {
    scene: previewScene,
    async start({ answer }) {
      const observation = observe(answer)
      const id = randomUUID()
      const at = clock()
      const { token, expiresAt } = mintPreviewToken(id, at)
      const payload = { sceneId: previewScene().id, mode: PREVIEW_MODE, attempts: [{ answer: String(answer).trim(), observation, at: at.toISOString() }] }
      const row = await store().createPreviewAttempt({ id, tokenHash: hashToken(token), payload, expiresAt, isSynthetic: Boolean(synthetic()) })
      if (!row.isSynthetic) emit('preview_completed', { outcome: observation.kind, count: 1 })
      return view(row, token)
    },
    async retry({ previewToken, answer }) {
      const row = await load(previewToken)
      if (row.payload.attempts.length >= PREVIEW_MAX_ATTEMPTS) throw new ApiError('ALLOWANCE_EXHAUSTED', 'The preview includes one answer and one retry. Create an account to keep practising.')
      const observation = observe(answer)
      const payload = { ...row.payload, attempts: [...row.payload.attempts, { answer: String(answer).trim(), observation, at: clock().toISOString() }] }
      const updated = await store().updatePreviewPayload(row.id, payload)
      if (!updated.isSynthetic) emit('preview_completed', { outcome: observation.kind, count: payload.attempts.length })
      return view(updated, previewToken)
    },
    async read({ previewToken }) {
      return view(await load(previewToken), previewToken)
    },
    // Explicit linking after sign-in. Idempotent for the same account; a
    // preview already linked elsewhere is a conflict, never a transfer.
    async claim({ previewToken, user }) {
      if (!user?.id) throw new ApiError('UNAUTHENTICATED', 'Sign in to keep this preview.')
      const row = await load(previewToken)
      const claimed = await store().claimPreviewAttempt(row.id, user.id)
      return { attemptId: claimed.id, claimed: true, alreadyClaimed: Boolean(row.claimedUserId), observation: claimed.payload.attempts[claimed.payload.attempts.length - 1].observation }
    },
    async listForUser(user) {
      return (await store().listPreviewAttemptsForUser(user.id)).map((r) => ({ id: r.id, mode: PREVIEW_MODE, claimedAt: r.claimedAt, attempts: r.payload.attempts.map((a) => ({ at: a.at, observation: a.observation })) }))
    },
    purgeExpired: () => store().purgeExpiredPreviews(clock()),
  }
}
