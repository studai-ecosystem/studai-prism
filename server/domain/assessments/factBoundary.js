// P4.7 — the factual and tool boundary for Director-driven runs.
//
//   renderStimulus       authored text ONLY from permitted facts (no model);
//                        every fact token must resolve inside the world state
//                        or the render is REVIEW_REQUIRED, never shown as if
//                        it were the intended version. The render hash is
//                        recorded with the presentation.
//   answerFactQuestion   a learner question about facts: a relevant missing
//                        fact → the authored answer (revealed); an already
//                        given fact → a neutral pointer (never a penalty);
//                        anything else → stays unknown.
//   validateGeneratedAction  structured actions proposed by any generator
//                        (model or template) are checked against the state
//                        graph: no deadline, identity, scope, payment,
//                        threshold, approved-fact, version or access change.
import { createHash } from 'node:crypto'

const TOKEN = /\{\{\s*([A-Z0-9-]+)\s*\}\}/g
const sha = (s) => createHash('sha256').update(s).digest('hex')

export function renderStimulus({ form, opportunity, worldState, variant = null }) {
  const stim = variant || opportunity?.stimulus
  if (!stim || typeof stim.template !== 'string') {
    return { ok: false, status: 'REVIEW_REQUIRED', issues: ['NO_AUTHORED_STIMULUS'], text: null, renderHash: null, factsUsed: [] }
  }
  const issues = []
  const factsUsed = []
  const permitted = new Set(stim.factIds || [])
  const text = stim.template.replace(TOKEN, (_, factId) => {
    const fact = worldState?.facts?.[factId]
    if (!permitted.has(factId)) issues.push(`FACT_NOT_PERMITTED:${factId}`)
    if (!fact) { issues.push(`FACT_UNKNOWN:${factId}`); return '' }
    factsUsed.push(factId)
    return fact.text
  }).replace(/\s{2,}/g, ' ').trim()
  for (const id of permitted) if (!factsUsed.includes(id)) issues.push(`FACT_UNUSED:${id}`)
  const ok = issues.filter((i) => !i.startsWith('FACT_UNUSED')).length === 0
  const message = {
    speaker: stim.speaker, role: stim.role || null, actorKind: stim.actorKind || 'AI_PARTICIPANT',
    label: stim.label || null, aiGenerated: Boolean(opportunity?.aiGenerated), content: text,
  }
  const renderHash = sha(JSON.stringify({ opportunityId: opportunity?.id || null, speaker: message.speaker, actorKind: message.actorKind, content: text, factsUsed, formVersion: form?.version || null }))
  return { ok, status: ok ? 'OK' : 'REVIEW_REQUIRED', issues, text, message, renderHash, factsUsed }
}

// A stimulus actually shown must hash to what the Director intended.
export function verifyRender(intendedHash, shownHash) {
  return intendedHash && shownHash && intendedHash === shownHash ? { ok: true } : { ok: false, status: 'REVIEW_REQUIRED', reason: 'RENDER_MISMATCH' }
}

const norm = (s) => String(s || '').toLowerCase()
function matchesTriggers(text, fact) {
  const t = norm(text)
  return (fact.triggers || []).some((k) => t.includes(norm(k)))
}

export function answerFactQuestion({ form, worldState, text }) {
  if (typeof text !== 'string' || !text.trim()) return { kind: 'UNKNOWN', factId: null, text: null }
  // Already given (public or already revealed) → neutral pointer, no penalty.
  for (const fact of Object.values(worldState?.facts || {})) {
    if (matchesTriggers(text, fact)) return { kind: 'ALREADY_GIVEN', factId: fact.id, text: `That is already in the brief: ${fact.text}`, neutral: true }
  }
  // Relevant conditional fact → authored answer, revealed from now on.
  for (const cf of form.conditionalFacts || []) {
    if (worldState?.facts?.[cf.id]) continue
    if (matchesTriggers(text, cf)) return { kind: 'AUTHORED', factId: cf.id, text: cf.text }
  }
  return { kind: 'UNKNOWN', factId: null, text: 'That is not known at this point; nobody on the team has that information.' }
}

// --- structured action validation --------------------------------------------------
const PROTECTED_FIELDS = new Set(['deadline', 'deadlineAt', 'answerDeadlineAt', 'graceDeadlineAt', 'durationMs', 'timing', 'userId', 'sessionId', 'identity', 'candidateName', 'scope', 'formId', 'version', 'snapshotHash', 'payment', 'price', 'amount', 'entitlement', 'threshold', 'rubricLevel', 'level', 'score', 'access', 'permissions', 'role', 'mode'])
const ALLOWED_TYPES = new Set(['SAY', 'BOARD_PATCH', 'REVEAL_FACT', 'APPLY_WORLD_CHANGE'])

function keysDeep(value, out = new Set()) {
  if (value && typeof value === 'object' && !Array.isArray(value)) for (const [k, v] of Object.entries(value)) { out.add(k); keysDeep(v, out) }
  else if (Array.isArray(value)) for (const v of value) keysDeep(v, out)
  return out
}

/**
 * validateGeneratedAction(action, stateGraph) → { ok, reasons }
 *   stateGraph = { form, worldState, allowedFactReveals?: [ids], allowedWorldChanges?: [ids] }
 */
export function validateGeneratedAction(action, stateGraph) {
  const reasons = []
  if (!action || typeof action !== 'object') return { ok: false, reasons: ['NOT_AN_OBJECT'] }
  if (!ALLOWED_TYPES.has(action.type)) reasons.push(`TYPE_NOT_ALLOWED:${action.type}`)
  const keys = keysDeep(action.payload || {})
  for (const k of keys) if (PROTECTED_FIELDS.has(k)) reasons.push(`PROTECTED_FIELD:${k}`)
  const form = stateGraph?.form
  if (action.type === 'BOARD_PATCH' && form) {
    const rowIds = new Set(form.board.rows.map((r) => r.rowId))
    for (const [key, value] of Object.entries(action.payload?.updates || {})) {
      const [rowId, field] = String(key).split('.')
      if (!rowIds.has(rowId)) reasons.push(`BOARD_ROW_UNKNOWN:${rowId}`)
      if (field === 'task') reasons.push('SCOPE_CHANGE:task')
      else if (!form.board.editable.includes(field)) reasons.push(`BOARD_FIELD_NOT_EDITABLE:${field}`)
      if (field === 'owner' && value != null && !form.board.owners.includes(value)) reasons.push(`IDENTITY_UNKNOWN:${value}`)
    }
    if (action.payload?.addRows || action.payload?.removeRows) reasons.push('SCOPE_CHANGE:rows')
  }
  if (action.type === 'REVEAL_FACT') {
    const allowed = new Set(stateGraph?.allowedFactReveals || (form?.conditionalFacts || []).map((f) => f.id))
    if (!allowed.has(action.payload?.factId)) reasons.push(`FACT_NOT_REVEALABLE:${action.payload?.factId}`)
    if (typeof action.payload?.text === 'string') reasons.push('FACT_TEXT_OVERRIDE')
  }
  if (action.type === 'APPLY_WORLD_CHANGE') {
    const allowed = new Set(stateGraph?.allowedWorldChanges || (form?.worldChanges || []).map((w) => w.id))
    if (!allowed.has(action.payload?.worldChangeId)) reasons.push(`WORLD_CHANGE_NOT_ALLOWED:${action.payload?.worldChangeId}`)
    if (action.payload?.setFacts) reasons.push('FACT_OVERRIDE')
  }
  if (action.type === 'SAY') {
    const facts = stateGraph?.worldState?.facts || {}
    for (const m of String(action.payload?.content || '').matchAll(TOKEN)) if (!facts[m[1]]) reasons.push(`FACT_UNKNOWN:${m[1]}`)
  }
  return { ok: reasons.length === 0, reasons }
}

// Any tool surface a generator could ask for is refused: the Director has no
// browser, email, shell or database tools, only the authored event set.
export const FORBIDDEN_TOOLS = Object.freeze(['browser', 'email', 'shell', 'database', 'http', 'filesystem'])
export const toolAllowed = (name) => !FORBIDDEN_TOOLS.includes(String(name || '').toLowerCase())
