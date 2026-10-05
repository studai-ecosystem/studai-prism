// Blinded human double-rating of V3 evidence units (spec §45, §48; C12.01).
// Pure functions: turn an evidence unit into a rating item a rater can judge
// without knowing who the candidate is or what the AI concluded, and choose
// the next item for a rater so every item collects two independent ratings.
import { createHash } from 'node:crypto'
import { tokenizeForModel, CANDIDATE_TOKEN } from '../../lib/identityIsolation.js'
import { methodHash } from '../assessments/frozenMethod.js'

export const RATING_RUBRIC_VERSION = 'evidence-rubric.v1-provisional'
export const RATINGS_PER_ITEM = 2
export const RATABLE_SOURCES = Object.freeze(['DIALOGUE_TURN', 'WORK_ARTIFACT', 'ANCHOR_PROBE'])
export const MAX_EXCERPT = 2000

// One-way reference: the queue never holds a raw evidence or session id.
export const refOf = (kind, id, salt) => createHash('sha256').update(`${kind}:${salt}:${id}`).digest('hex')

// The candidate's own words only — never the AI's description of them, which
// would anchor the rater on the model's reading.
function candidateText(unit) {
  const a = unit.candidate_action_json
  if (!a || typeof a !== 'object') return null
  for (const key of ['dialogue_excerpt', 'quote', 'text']) {
    if (typeof a[key] === 'string' && a[key].trim()) return a[key].trim()
  }
  return null
}

const EMAIL = /[^\s@<>()]+@[^\s@<>()]+\.[A-Za-z]{2,}/g
const PHONE = /\+?\d[\d\s-]{8,}\d/g

/**
 * Evidence unit → rating item, or { skip: reason }. Legacy rows, human-rating
 * units and units without candidate words are not queued (fail closed).
 */
export function ratingItemFrom(unit, { candidateName = null, salt, enqueuedBy }) {
  if (!unit?.evidence_id || !unit?.session_id || !unit?.capability_id) return { skip: 'INCOMPLETE_UNIT' }
  if (unit.legacy_row) return { skip: 'LEGACY_ROW' }
  if (!RATABLE_SOURCES.includes(unit.source_type)) return { skip: 'NOT_RATABLE_SOURCE' }
  const raw = candidateText(unit)
  if (!raw) return { skip: 'NO_CANDIDATE_WORDS' }
  const excerpt = tokenizeForModel(raw, candidateName).replace(EMAIL, '[email]').replace(PHONE, '[number]').slice(0, MAX_EXCERPT)
  const provenance = unit.provenance_json || {}
  const rubric = provenance.resolvedRubric
  if ((provenance.methodHash || rubric) && (!provenance.methodHash || !rubric?.ref || !rubric.anchors
    || [1, 2, 3, 4, 5].some((level) => !rubric.anchors[level]) || methodHash(rubric.anchors) !== rubric.anchorsHash)) return { skip: 'PINNED_METHOD_UNAVAILABLE' }
  const clean = (text) => tokenizeForModel(String(text), candidateName).replace(EMAIL, '[email]').replace(PHONE, '[number]').slice(0, MAX_EXCERPT)
  const context = provenance.evaluationContext
  const before = context?.workState?.before
  const after = context?.workState?.after
  const changes = unit.source_type === 'WORK_ARTIFACT' && before && after ? Object.entries(after).flatMap(([key, value]) => {
    const [rowId, field] = key.split('.')
    const row = before.rows?.find((r) => r.rowId === rowId)
    if (!field || !row) return []
    const previous = Object.prototype.hasOwnProperty.call(before, key) ? before[key] : row[field]
    if (previous === undefined || JSON.stringify(previous) === JSON.stringify(value)) return []
    return [{ rowId, task: clean(row.task), field, before: previous == null ? null : clean(previous), after: value == null ? null : clean(value) }]
  }) : []
  const sourceMethod = rubric ? {
    behaviourId: rubric.behaviourId, methodHash: provenance.methodHash, rubricHash: rubric.contentHash,
    anchors: Object.fromEntries(Object.entries(rubric.anchors).map(([level, anchor]) => [level, typeof anchor === 'string' ? anchor : anchor.criteria])),
    facts: (context?.situation?.applicableFacts || []).map((fact) => clean(typeof fact === 'string' ? fact : fact.text)),
    stimulus: (context?.stimulus?.messages || []).map((message) => ({ speaker: clean(message.speaker || message.actorKind), content: clean(message.content) })),
    workChanges: changes,
  } : null
  return {
    item: {
      evidenceRef: refOf('evidence', unit.evidence_id, salt),
      sessionRef: refOf('session', unit.session_id, salt),
      capabilityId: unit.capability_id,
      sourceType: unit.source_type,
      behaviorAnchorId: unit.behavior_anchor_id || null,
      excerpt,
      aiLevel: Number.isInteger(unit.rubric_level) ? unit.rubric_level : null,
      aiStatus: unit.evidence_status || null,
      rubricVersion: rubric?.ref || RATING_RUBRIC_VERSION,
      ...(sourceMethod ? { sourceMethod } : {}),
      enqueuedBy,
    },
  }
}

/**
 * The next item for a rater: one they have not rated, still short of two
 * ratings; half-rated items first (so pairs complete), then oldest. The same
 * rater never rates both halves of a pair.
 */
export function pickNext(items, ratings, raterId, perItem = RATINGS_PER_ITEM) {
  const byItem = new Map()
  for (const r of ratings) {
    if (!byItem.has(r.itemId)) byItem.set(r.itemId, [])
    byItem.get(r.itemId).push(r)
  }
  const open = items.filter((i) => {
    const rs = byItem.get(i.id) || []
    return rs.length < perItem && !rs.some((r) => r.raterId === raterId)
  })
  open.sort((a, b) => (byItem.get(b.id)?.length || 0) - (byItem.get(a.id)?.length || 0) || String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id)))
  return open[0] || null
}

// What a rater sees: no AI level, no AI status, no references back to the
// session or the evidence row.
export function blindedView(item, { capabilityName = null } = {}) {
  return {
    itemId: item.id,
    capabilityId: item.capabilityId,
    capabilityName,
    sourceType: item.sourceType,
    excerpt: item.excerpt,
    candidateToken: CANDIDATE_TOKEN,
    rubricVersion: item.rubricVersion,
    ...(item.sourceMethod ? { sourceMethod: item.sourceMethod } : {}),
    scale: [1, 2, 3, 4, 5],
  }
}
