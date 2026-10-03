// P6.4 / P6.6 practice feedback helpers. Pure functions over the evaluation
// pipeline's criterion results:
//   copiedFrom        — a submitted text that reproduces (≥ 80 % of the word
//                       pairs of) a sentence the learner was SHOWN (an
//                       example or a scaffold hint) is assistance, not the
//                       learner's own behaviour; the criterion is marked
//                       COPIED_ASSISTANCE and never praised or counted.
//   buildFocus        — one completed criterion to acknowledge (quoting the
//                       learner's own change) and one highest-value next
//                       change, in the order the mission's first-attempt
//                       feedback logic names; all-met and review-incomplete
//                       are said plainly, nothing is invented.
//   compareAttempts   — criterion ids newly met / no longer met between two
//                       attempts, only where both attempts could check them.
//                       Never a percentage, never a growth claim.
export const FEEDBACK_VERSION = 'mission-feedback.v1'
export const COPY_THRESHOLD = 0.8
export const COPY_MIN_WORDS = 6
export const COPIED_NOTE = 'This matches the example you were shown, so it is not counted as your own.'
const SNIPPET = 160

const norm = (s) => String(s || '').toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()
const words = (s) => norm(s).split(' ').filter(Boolean)
const bigrams = (ws) => { const out = []; for (let i = 0; i + 1 < ws.length; i += 1) out.push(`${ws[i]} ${ws[i + 1]}`); return out }
export const splitSentences = (text) => String(text || '').split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean)

// `exposed`: [{ source: 'EXAMPLE' | 'HINT', id, text }]. Returns the first
// exposed sentence the learner's texts reproduce, or null.
export function copiedFrom(learnerTexts, exposed, { threshold = COPY_THRESHOLD, minWords = COPY_MIN_WORDS } = {}) {
  const have = new Set((learnerTexts || []).flatMap((t) => bigrams(words(t))))
  if (!have.size) return null
  for (const e of exposed || []) {
    for (const sentence of splitSentences(e.text)) {
      const ws = words(sentence)
      if (ws.length < minWords) continue
      const bg = bigrams(ws)
      const hit = bg.filter((b) => have.has(b)).length / bg.length
      if (hit >= threshold) return { source: e.source, id: e.id, sentence }
    }
  }
  return null
}

const snippet = (text) => {
  const first = splitSentences(text)[0] || String(text || '').trim()
  return first.length > SNIPPET ? `${first.slice(0, SNIPPET - 1).trimEnd()}…` : first
}

// `learnerTextFor(criterion)` → the learner's own texts in the artifacts the
// criterion reads (used to quote a deterministic completion and to show the
// words the next change refers to).
export function buildFocus({ mission, criteria, status, learnerTextFor }) {
  const ids = criteria.map((c) => c.criterionId)
  const order = (priority) => (priority ? [...priority.filter((id) => ids.includes(id)), ...ids.filter((id) => !priority.includes(id))] : ids)
  const byId = new Map(criteria.map((c) => [c.criterionId, c]))
  const completedOrder = order(mission.first_attempt_feedback?.completed_priority)
  const nextOrder = order(mission.first_attempt_feedback?.next_change_priority)
  const completed = completedOrder.map((id) => byId.get(id)).find((c) => c.result === 'OBSERVED') || null
  const next = nextOrder.map((id) => byId.get(id)).find((c) => c.result === 'NOT_OBSERVED' || c.result === 'COPIED_ASSISTANCE') || null
  const reviewIncomplete = status !== 'EVALUATED'
  const allMet = !reviewIncomplete && criteria.length > 0 && criteria.every((c) => c.result === 'OBSERVED')
  const ownWords = (c, { minWords = 1 } = {}) => {
    const texts = (learnerTextFor ? learnerTextFor(c) : []).map((t) => String(t).trim()).filter(Boolean)
    const first = texts.find((t) => words(t).length >= minWords)
    return first ? snippet(first) : null
  }
  const because = (c) => {
    if (c.result === 'COPIED_ASSISTANCE') return COPIED_NOTE
    const failed = (c.rules || []).find((r) => !r.passed)?.description
    if (failed && norm(failed) !== norm(c.description)) return failed
    return c.check === 'DETERMINISTIC' ? 'Not met by the automatic check in this attempt.' : 'Not shown in this attempt.'
  }
  return {
    version: FEEDBACK_VERSION,
    completed: completed ? {
      criterionId: completed.criterionId,
      description: completed.description,
      quote: completed.quote || ownWords(completed),
      source: completed.check === 'DETERMINISTIC' ? 'AUTOMATIC_CHECK' : completed.check === 'MEANING' ? 'MEANING_CHECK' : 'EVALUATOR',
    } : null,
    nextChange: next ? {
      criterionId: next.criterionId,
      description: next.description,
      because: because(next),
      // Only a real sentence of the learner's is worth quoting back here, and
      // only for a meaning check (an automatic check already names what is missing).
      yourWords: next.check === 'DETERMINISTIC' ? null : ownWords(next, { minWords: 4 }),
    } : null,
    allMet,
    reviewIncomplete,
    note: reviewIncomplete
      ? 'The review could not be completed this time. Your work is kept; nothing was guessed, and you can submit it again.'
      : allMet ? 'Every checked behaviour was shown in this attempt. There is nothing to add.' : null,
  }
}

// Only criteria that BOTH attempts could check (neither UNCERTAIN) are
// compared. COPIED_ASSISTANCE counts as not met.
export function compareAttempts(previous, current) {
  if (!previous?.criteria || !current?.criteria) return null
  const prev = new Map(previous.criteria.map((c) => [c.criterionId, c.result]))
  const met = (r) => r === 'OBSERVED'
  const checkable = (r) => r && r !== 'UNCERTAIN'
  const newlyMet = []
  const noLongerMet = []
  const notCompared = []
  for (const c of current.criteria) {
    const before = prev.get(c.criterionId)
    if (!checkable(before) || !checkable(c.result)) { notCompared.push(c.criterionId); continue }
    if (met(c.result) && !met(before)) newlyMet.push(c.criterionId)
    if (!met(c.result) && met(before)) noLongerMet.push(c.criterionId)
  }
  return {
    previousAttemptId: previous.attemptId || null,
    newlyMet,
    noLongerMet,
    notCompared,
    note: 'Compared with your earlier attempt on the behaviours that could be checked in both. This is practice; it does not measure growth and it does not change any assessment.',
  }
}
