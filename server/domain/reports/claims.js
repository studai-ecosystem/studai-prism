// Report claim registry (spec §33.3). Every conclusion a report shows is a
// claim with machine-readable provenance. validateClaims() is the gate the
// renderers use: a claim without real evidence ids (unless it states
// INSUFFICIENT) or with a quote that is not a verbatim substring of a stored
// candidate turn never reaches a report.
import { createHash } from 'node:crypto'

export const CLAIM_TYPES = Object.freeze(['STRENGTH', 'DEVELOPMENT_NEED', 'OBSERVED_BEHAVIOR', 'CAPABILITY_LEVEL', 'ROLE_EXPLORATION', 'INSUFFICIENT'])
export const CLAIM_STATUSES = Object.freeze(['SUPPORTED', 'PROVISIONAL', 'INSUFFICIENT'])

function stableId(parts) {
  return `claim-${createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16)}`
}

export function buildClaim({ claimType, capabilityId = null, text, evidenceIds = [], status, quote = null }) {
  if (!CLAIM_TYPES.includes(claimType)) throw new Error(`Unknown claim type: ${claimType}`)
  if (!CLAIM_STATUSES.includes(status)) throw new Error(`Unknown claim status: ${status}`)
  if (typeof text !== 'string' || !text.trim()) throw new Error('Claim text is required')
  const ids = [...new Set(evidenceIds.filter(Boolean))].sort()
  return {
    claim_id: stableId([claimType, capabilityId || '', text, ids.join(','), quote || '']),
    claim_type: claimType,
    capability_id: capabilityId,
    text: text.trim(),
    evidence_ids: ids,
    status,
    quote,
  }
}

function normalise(s) {
  return String(s).replace(/\s+/g, ' ').trim()
}

// Candidate turns only: the engine stores every candidate message as a 'user'
// turn prefixed `[Candidate]:`. Other 'user'-role entries (e.g. the opening
// instruction prompt) are system text and can never be quoted as the
// candidate's words.
const CANDIDATE_PREFIX = /^\[Candidate\]:\s*/
export function candidateTurnsFrom(history = []) {
  return history
    .filter((m) => m && m.role === 'user' && typeof m.content === 'string' && CANDIDATE_PREFIX.test(m.content))
    .map((m) => m.content.replace(CANDIDATE_PREFIX, ''))
}

// Candidate-authored text of durably accepted actions (P2.3). Report
// retention may purge session history after scoring; the accepted action
// rows outlive it, so a verified quote still has its source. Only CANDIDATE
// message text and candidate-changed artifact values count — never seeded
// rows, system text or participant turns.
function flattenStrings(value, out = []) {
  if (typeof value === 'string') { if (value.trim()) out.push(value); return out }
  if (Array.isArray(value)) { for (const v of value) flattenStrings(v, out); return out }
  if (value && typeof value === 'object') { for (const v of Object.values(value)) flattenStrings(v, out); return out }
  return out
}
export function candidateTurnsFromActions(actions = []) {
  const out = []
  for (const a of actions) {
    if (!a || a.actorKind !== 'CANDIDATE' || a.state !== 'APPLIED') continue
    if (a.kind === 'MESSAGE' && typeof a.payload?.text === 'string') out.push(a.payload.text)
    else if (a.kind === 'ARTIFACT') {
      flattenStrings(a.payload?.updates, out)
      if (typeof a.payload?.notes === 'string' && a.payload.notes.trim()) out.push(a.payload.notes)
    }
  }
  return out
}

// Union of the two sources; history and actions may each be absent.
export function candidateTurnsUnion(history = [], actions = []) {
  return [...new Set([...candidateTurnsFrom(history || []), ...candidateTurnsFromActions(actions || [])])]
}

// A unit's dialogue excerpt, only when it is a verbatim part of a stored
// candidate turn; otherwise null (never an invented quote).
export function verifiedQuote(unit, turns = []) {
  const excerpt = unit?.candidate_action_json?.dialogue_excerpt
  if (typeof excerpt !== 'string' || !excerpt.trim()) return null
  const q = normalise(excerpt)
  return turns.some((t) => normalise(t).includes(q)) ? excerpt.trim() : null
}

/**
 * @param claims       built claims
 * @param evidenceIndex Map<evidenceId, unit> of the session's admissible units
 * @param turns        verbatim candidate turns (for quote checks)
 * @returns {{ accepted, rejected: [{ claim, reason }] }}
 */
export function validateClaims(claims = [], evidenceIndex = new Map(), { turns = [] } = {}) {
  const accepted = []
  const rejected = []
  const corpus = turns.map(normalise)
  for (const claim of claims) {
    const reason = rejectionReason(claim, evidenceIndex, corpus)
    if (reason) rejected.push({ claim, reason })
    else accepted.push(claim)
  }
  return { accepted, rejected }
}

function rejectionReason(claim, evidenceIndex, corpus) {
  if (!claim || !CLAIM_TYPES.includes(claim.claim_type) || !CLAIM_STATUSES.includes(claim.status)) return 'MALFORMED'
  if (claim.status === 'INSUFFICIENT') {
    // An insufficiency statement asserts absence; it may cite nothing and may not quote.
    return claim.quote ? 'QUOTE_ON_INSUFFICIENT_CLAIM' : null
  }
  if (!Array.isArray(claim.evidence_ids) || claim.evidence_ids.length === 0) return 'NO_EVIDENCE_IDS'
  for (const id of claim.evidence_ids) {
    const unit = evidenceIndex.get(id)
    if (!unit) return 'UNKNOWN_EVIDENCE_ID'
    if (claim.capability_id && unit.capability_id !== claim.capability_id) return 'EVIDENCE_CAPABILITY_MISMATCH'
  }
  if (claim.quote) {
    const q = normalise(claim.quote)
    if (!q || !corpus.some((t) => t.includes(q))) return 'QUOTE_NOT_VERBATIM'
  }
  return null
}
