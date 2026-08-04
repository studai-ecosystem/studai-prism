// Charter MASTER-2026-08-04 §5 — no candidate identity in language/scoring models.
//
// The invariant, end to end:
//   1. AI prompts carry the neutral token {{candidate}} — never the real name.
//      (renderPrompt only substitutes {{UPPER_CASE}} placeholders, so the
//      lowercase token passes through templates untouched.)
//   2. Model output comes back WITH the token; the app deterministically
//      substitutes the display name AFTER generation (renderCandidateText).
//   3. Scoring/rating/calibration artifacts replace every candidate-identity
//      reference — the token AND any literal occurrence of the display name —
//      with the neutral label CANDIDATE (scrubCandidateIdentity).
//   4. Conversation-model context is re-tokenized on every call
//      (tokenizeForModel) so legacy in-flight sessions started before this
//      change also stop leaking the name to Bedrock.
//
// Amazon Polly is the ONLY narrowly-scoped exception (charter §5): it may
// receive the already-rendered candidate-facing sentence, because speaking the
// candidate's name requires the name. Polly is a speech renderer, not a
// language/reasoning/scoring model; payloads are streamed and never persisted.

export const CANDIDATE_TOKEN = '{{candidate}}'

// Escape a string for use inside a RegExp.
function reEscape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Build one Unicode-aware, case-insensitive matcher for the display name:
// the full name plus each part of length >= 2 (parts shorter than that would
// mangle ordinary words). Lookarounds keep matches on letter boundaries so
// "Ram" never matches inside "program". Returns null when there is no name.
function nameMatcher(candidateName) {
  const name = typeof candidateName === 'string' ? candidateName.trim() : ''
  if (!name) return null
  const parts = new Set([name])
  for (const part of name.split(/[\s.'-]+/)) {
    if (part.length >= 2) parts.add(part)
  }
  const alternatives = [...parts].sort((a, b) => b.length - a.length).map(reEscape)
  return new RegExp(`(?<![\\p{L}\\p{M}])(?:${alternatives.join('|')})(?![\\p{L}\\p{M}])`, 'giu')
}

// ── Post-generation rendering (candidate-facing only) ────────────────────────
// Deterministically replace the neutral token with the display name. When no
// name is known, the token is removed and the surrounding spacing tidied so a
// stray token can never surface to the candidate.
export function renderCandidateText(text, candidateName) {
  const s = String(text ?? '')
  const name = typeof candidateName === 'string' ? candidateName.trim() : ''
  if (!s.includes('{{')) return s
  if (name) return s.split(CANDIDATE_TOKEN).join(name)
  return s
    .replace(/[ \t]*\{\{candidate\}\}[ \t]*([,:;]\s*)?/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ ([.!?,;:])/g, '$1')
    .trim()
}

// Render a parsed avatar turn ({messages:[{speaker,role,content}...]}) for the
// client. Never mutates the stored (tokenized) object.
export function renderParsedTurn(parsed, candidateName) {
  if (!parsed || !Array.isArray(parsed.messages)) return parsed
  return {
    ...parsed,
    messages: parsed.messages.map((m) => ({
      ...m,
      content: renderCandidateText(m.content, candidateName),
    })),
  }
}

// ── Model-facing scrubbing ────────────────────────────────────────────────────
// For SCORING artifacts (judge transcripts, rater material, dual-scorer turns,
// micro-rater input): token and literal name both become the neutral label.
export function scrubCandidateIdentity(text, candidateName, label = 'CANDIDATE') {
  let s = String(text ?? '').split(CANDIDATE_TOKEN).join(label)
  const re = nameMatcher(candidateName)
  if (re) s = s.replace(re, label)
  return s
}

// For CONVERSATION context (avatar model continuations): literal names become
// the neutral token, so the model's past-turn context matches the v3 prompt
// convention. New turns are token-native; this catches legacy history and any
// name the candidate typed about themselves.
export function tokenizeForModel(text, candidateName) {
  const re = nameMatcher(candidateName)
  if (!re) return String(text ?? '')
  return String(text ?? '').replace(re, CANDIDATE_TOKEN)
}
