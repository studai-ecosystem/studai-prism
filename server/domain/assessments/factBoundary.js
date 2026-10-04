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
// Triggers of `fact` that appear in `text`, most specific first ("confirmed
// number" beats a bare "support"). Empty = no match.
function matchedTriggers(text, fact) {
  const t = norm(text)
  return (fact.triggers || []).map(norm).filter((k) => k && t.includes(k)).sort((a, b) => b.length - a.length)
}
function triggerScore(text, fact) { return matchedTriggers(text, fact)[0]?.length || 0 }
function matchesTriggers(text, fact) { return triggerScore(text, fact) > 0 }

// A learner question is answered from the fact table only: the best-matching
// known fact (public or already revealed) is pointed to neutrally, the
// best-matching unrevealed conditional fact is revealed. A compound question
// ("is 24 confirmed, and can we print on the day?") gets up to two distinct
// facts, most specific first; nothing is invented and nothing hidden leaks
// without a matching ask.
const MAX_FACTS_PER_ANSWER = 2
const MIN_SECOND_TRIGGER = 5
export function answerFactQuestion({ form, worldState, text }) {
  if (typeof text !== 'string' || !text.trim()) return { kind: 'UNKNOWN', factId: null, factIds: [], revealedFactIds: [], text: null }
  // Only the question sentences are matched: a plan that merely mentions the
  // venue while stating a decision is not a request for information.
  const questions = String(text).split(/(?<=[.!?])\s+/).filter((s) => /\?\s*$/.test(s))
  const asked = questions.length ? questions.join(' ') : text
  // A request to a colleague ("can you cover…?", "would you take…?") is a
  // proposal, not a fact lookup: the Director handles it, not the fact table.
  const infoQuestion = /\b(what|which|how (?:many|much|long)|when|where|who|is there|are there|do we|does the|did|is \d+|is the|are the)\b/i.test(asked)
  const known = Object.values(worldState?.facts || {})
    .map((fact) => ({ fact, triggers: matchedTriggers(asked, fact), kind: 'ALREADY_GIVEN' })).filter((m) => m.triggers.length)
  const conditional = (form.conditionalFacts || []).filter((cf) => !worldState?.facts?.[cf.id])
    .map((fact) => ({ fact, triggers: matchedTriggers(asked, fact), kind: 'AUTHORED' })).filter((m) => m.triggers.length)
  // Known facts win ties: a question the brief already answers never
  // reveals a hidden fact that happens to share a trigger word.
  const ranked = [...known, ...conditional].sort((a, b) => b.triggers[0].length - a.triggers[0].length)
  const chosen = []
  for (const m of ranked) {
    if (chosen.length >= MAX_FACTS_PER_ANSWER) break
    if (!chosen.length) { chosen.push(m); continue }
    // A second fact joins only when it answers a different part of the
    // question: its triggers must not be the ones the first fact matched.
    const covered = new Set(chosen.flatMap((c) => c.triggers))
    const own = m.triggers.filter((k) => !covered.has(k) && !chosen.some((c) => c.triggers.some((ck) => ck.includes(k) || k.includes(ck))))
    if (own.length && own[0].length >= MIN_SECOND_TRIGGER) chosen.push({ ...m, triggers: own })
  }
  if (chosen.length) {
    const revealed = chosen.filter((m) => m.kind === 'AUTHORED').map((m) => m.fact.id)
    const parts = chosen.map((m) => (m.kind === 'ALREADY_GIVEN' ? `That is already in the brief: ${m.fact.text}` : m.fact.text))
    return {
      kind: revealed.length ? 'AUTHORED' : 'ALREADY_GIVEN',
      factId: chosen[0].fact.id,
      factIds: chosen.map((m) => m.fact.id),
      revealedFactIds: revealed,
      text: parts.join(' '),
      ...(revealed.length ? {} : { neutral: true }),
    }
  }
  if (!infoQuestion) return { kind: 'NONE', factId: null, factIds: [], revealedFactIds: [], text: null }
  return { kind: 'UNKNOWN', factId: null, factIds: [], revealedFactIds: [], text: 'That is not known at this point; nobody on the team has that information.' }
}

export const LEARNER_INTENT = Object.freeze({
  INFORMATION_REQUEST: 'INFORMATION_REQUEST',
  PROPOSAL: 'PROPOSAL',
  DECISION: 'DECISION',
  REFUSAL: 'REFUSAL',
  HELP_REQUEST: 'HELP_REQUEST',
  UNCLEAR: 'UNCLEAR',
  WORK_ACTION: 'WORK_ACTION',
})

const INQUIRY_BEHAVIOURS = new Set(['QUESTION_ASSUMPTION', 'CLARIFY_REQUEST', 'CHECK_UNDERSTANDING'])
const meaningful = (text, pattern) => pattern.test(String(text || '').toLowerCase())

// Deterministic, task-aware interpretation. This decides whether the learner
// has only requested information or has also made an actionable response; it
// never infers personality, quality or a rubric level.
export function interpretLearnerMessage({ text, opportunity, factAnswer = null }) {
  const raw = String(text || '').trim()
  const inquiryOpportunity = (opportunity?.behaviourIds || []).some((id) => INQUIRY_BEHAVIOURS.has(id))
  const hasFactRequest = Boolean(factAnswer && !['NONE'].includes(factAnswer.kind))
  const scopeDecision = meaningful(raw, /\b(postpone|delay|defer|reduce|reduced|trim|smaller|drop|skip|go ahead|proceed|keep)\b/)
  const helpRequest = meaningful(raw, /\b(ask|need|request|could|can|would)\b.{0,50}\b(priya|sam|help|cover|support|take)\b|\b(priya|sam)\b.{0,30}\b(help|cover|take)\b/)
  const refusal = meaningful(raw, /\b(i|we)\s+(?:cannot|can't|won't|will not|would not|decline|refuse)\b|\bnot workable\b/)
  const decision = scopeDecision || meaningful(raw, /\b(i|we)\s+(?:will|would|choose|recommend|prefer|plan|can take|can handle)\b|\b(first|then|priority|prioriti[sz]e|assign|owner|move|schedule|by day|due)\b/)
  const proposal = meaningful(raw, /\b(should|could|let'?s|how about|proposal|option)\b/)
  const acceptance = meaningful(raw, /\b(i agree|that works|accept|go with)\b/)
  const fillerOnly = /^(?:(?:ok(?:ay)?|sure|maybe|fine|yes|no)(?:[ ,]+(?:ok(?:ay)?|sure|maybe|fine|yes|no))*|i don'?t know|not sure)[.! ]*$/i.test(raw)

  let kind
  if (refusal) kind = LEARNER_INTENT.REFUSAL
  else if (helpRequest) kind = LEARNER_INTENT.HELP_REQUEST
  else if (scopeDecision || decision || acceptance) kind = LEARNER_INTENT.DECISION
  else if (proposal) kind = LEARNER_INTENT.PROPOSAL
  else if (hasFactRequest) kind = LEARNER_INTENT.INFORMATION_REQUEST
  else kind = fillerOnly || !raw ? LEARNER_INTENT.UNCLEAR : LEARNER_INTENT.PROPOSAL

  return {
    kind,
    servesOpportunity: kind === LEARNER_INTENT.INFORMATION_REQUEST ? inquiryOpportunity : kind !== LEARNER_INTENT.UNCLEAR,
    factQuestion: hasFactRequest,
    reason: kind === LEARNER_INTENT.INFORMATION_REQUEST && !inquiryOpportunity
      ? 'INFORMATION_ONLY'
      : kind === LEARNER_INTENT.UNCLEAR ? 'NEEDS_CLARIFICATION' : 'ACTIONABLE',
  }
}

export function materializeBoard(form, data = {}) {
  return form.board.rows.map((row) => {
    const out = { ...row }
    for (const field of form.board.editable) {
      const key = `${row.rowId}.${field}`
      if (Object.prototype.hasOwnProperty.call(data || {}, key)) out[field] = data[key]
    }
    return out
  })
}

export function boardReviewReadiness(form, opportunity, data = {}) {
  const rule = opportunity?.reviewReadiness
  if (!rule) return { ready: true, state: 'READY_FOR_REVIEW', reason: null }
  const rows = new Map(materializeBoard(form, data).map((row) => [row.rowId, row]))
  const value = (key) => {
    const [rowId, field] = String(key).split('.')
    return rows.get(rowId)?.[field]
  }
  const present = (key) => value(key) !== null && value(key) !== undefined && String(value(key)).trim() !== ''
  const edited = (key) => Object.prototype.hasOwnProperty.call(data || {}, key) && present(key)
  const missing = (rule.all || []).filter((key) => !present(key))
  const unedited = (rule.edited || []).filter((key) => !edited(key))
  const anySatisfied = !(rule.any || []).length || rule.any.some((key) => edited(key))
  const ready = missing.length === 0 && unedited.length === 0 && anySatisfied
  return {
    ready,
    state: ready ? 'READY_FOR_REVIEW' : 'DRAFT_SAVED',
    reason: ready ? null : 'Keep working until the requested plan fields are complete.',
  }
}

export function boardHasTimingIssue(form, data = {}) {
  const rows = materializeBoard(form, data)
  const byId = new Map(rows.map((row) => [row.rowId, row]))
  const day = (value) => {
    const m = /\bday\s*(\d+)\b/i.exec(String(value || ''))
    return m ? Number(m[1]) : null
  }
  for (const row of rows) {
    if (/\b(after|day\s*[3-9])\b/i.test(String(row.due || ''))) return true
    const dependency = row.dependency ? byId.get(row.dependency) : null
    if (dependency?.dependency === row.rowId) return true
    const ownDay = day(row.due)
    const dependencyDay = day(dependency?.due)
    if (ownDay != null && dependencyDay != null && ownDay < dependencyDay) return true
  }
  return false
}

export function stimulusForWorkState({ form, opportunity, workState }) {
  if (opportunity?.statefulStimuli?.boardConsistent && !boardHasTimingIssue(form, workState)) {
    return opportunity.statefulStimuli.boardConsistent
  }
  return opportunity?.stimulus
}

export function stakeholderReaction({ form, opportunity, interpretation, action, boardState = {}, worldState = null }) {
  const authored = opportunity?.reactions || {}
  const text = String(action?.payload?.text || '')
  if (opportunity?.id === 'OPP-EXEC-BOARD-OWNERS') {
    const rows = materializeBoard(form, boardState)
    const overloadsSam = rows.filter((row) => row.owner === 'Sam').length >= 3
      || /\bsam\b.{0,60}\b(both|all|two)\b|\b(both|all|two)\b.{0,60}\bsam\b/i.test(text)
    if (overloadsSam && authored.OVERLOADED_SAM) return { ...authored.OVERLOADED_SAM, revealedFactIds: ['CF-FACILITATOR-HOURS'], continue: true }
    const namesWork = /\b(priya|sam|i|me|you)\b.{0,45}\b(handle|take|own|assign|cover|responsible)\b|\b(handle|take|own|assign|cover)\b.{0,45}\b(priya|sam|me|you)\b/i.test(text)
    const taskReferences = text.match(/\b(room|setup|materials?|handouts?|participant list|list|needs)\b/gi) || []
    const proposesAllocation = action?.kind === 'ARTIFACT' || (namesWork && new Set(taskReferences.map((value) => value.toLowerCase())).size >= 2)
    if (proposesAllocation && authored.FEASIBLE_ALLOCATION) return { ...authored.FEASIBLE_ALLOCATION, continue: false }
  }
  if (opportunity?.id === 'OPP-ADAPT-REPLAN') {
    // Grounded in the board first: Sam owns a task due on the Day 1
    // afternoon he can no longer work. The message counts only when a
    // sentence actually assigns Sam afternoon work ("Sam takes … afternoon",
    // "move … to Sam … afternoon"); mentioning Sam and the afternoon in one
    // breath ("…afternoon so Sam has the morning free") is not an assignment.
    const boardAssignsSamAfternoon = materializeBoard(form, boardState)
      .some((row) => row.owner === 'Sam' && /\bday\s*1\b/i.test(String(row.due || '')) && /\bafternoon\b/i.test(String(row.due || '')))
    const sentences = text.split(/(?<=[.!?])\s+/)
    const textAssignsSamAfternoon = sentences.some((s) => /\bafternoon\b/i.test(s)
      && (/\bsam\b\s*(?:,\s*)?(?:will|takes?|does|handles?|owns?|covers?|runs?|can|should|is on|gets)\b[^.!?]{0,40}\bafternoon\b/i.test(s)
        || /\b(?:give|move|assign|hand|shift|put)\b[^.!?]{0,40}\bto\s+sam\b[^.!?]{0,40}\bafternoon\b/i.test(s)
        || /\bafternoon\b[^.!?]{0,20}\b(?:for|to|with)\s+sam\b/i.test(s))
      && !/\b(not|cannot|can't|unavailable|out|free|instead of sam|away from sam|off sam)\b/i.test(s))
    if ((boardAssignsSamAfternoon || textAssignsSamAfternoon) && authored.SAM_AFTERNOON_CONFLICT) return { ...authored.SAM_AFTERNOON_CONFLICT, continue: true }
  }
  const reaction = authored[interpretation?.kind]
  if (!reaction) return null
  return { ...reaction, continue: Boolean(reaction.continue), worldStateVersion: worldState?.appliedWorldChangeIds || [] }
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
