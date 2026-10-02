// Strict evidence-unit contract (spec §30.8, §33.1). Nothing about a
// judgement is ever defaulted: missing candidate action or provenance →
// INSUFFICIENT_EVIDENCE with rubric_level/rubric_label NULL.
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { DEFAULT_SUFFICIENCY_RULES } from './sufficiencyRules.js'

const nonEmptyObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0

const JudgeAgreement = z.object({
  agreement: z.number().min(0).max(1),
  samples: z.number().int().positive().optional(),
  method: z.string().optional(),
}).passthrough()

const InputSchema = z.object({
  evidence_id: z.string().min(1).max(64).optional(),
  session_id: z.string().min(1).max(64),
  attempt_id: z.string().max(64).nullable().optional(),
  blueprint_id: z.string().max(64).nullable().optional(),
  capability_id: z.string().min(1).max(64),
  capability_layer: z.string().max(32).nullable().optional(),
  source_type: z.enum(['DIALOGUE_TURN', 'WORK_ARTIFACT', 'ANCHOR_PROBE', 'HUMAN_RATING']).nullable().optional(),
  source_turn: z.number().int().positive().nullable().optional(),
  source_artifact_id: z.string().max(64).nullable().optional(),
  behavior_anchor_id: z.string().max(128).nullable().optional(),
  candidate_action: z.record(z.unknown()).nullable().optional(),
  observable_behavior: z.string().max(2000).nullable().optional(),
  rubric_level: z.number().int().min(1).max(5).nullable().optional(),
  rubric_label: z.string().max(64).nullable().optional(),
  judge_agreement: JudgeAgreement.nullable().optional(),
  human_review_status: z.enum(['NOT_REQUIRED', 'REQUIRED', 'IN_REVIEW', 'COMPLETED']).nullable().optional(),
  provenance: z.record(z.unknown()).nullable().optional(),
  assessment_form_id: z.string().max(64).nullable().optional(),
})

// camelCase callers are accepted; nothing else is inferred.
const ALIASES = {
  evidenceId: 'evidence_id', sessionId: 'session_id', attemptId: 'attempt_id', blueprintId: 'blueprint_id',
  capabilityId: 'capability_id', capabilityLayer: 'capability_layer', sourceType: 'source_type',
  sourceTurn: 'source_turn', sourceArtifactId: 'source_artifact_id', behaviorAnchorId: 'behavior_anchor_id',
  candidateAction: 'candidate_action', candidate_action_json: 'candidate_action', observableBehavior: 'observable_behavior',
  rubricLevel: 'rubric_level', rubricLabel: 'rubric_label', judgeAgreement: 'judge_agreement',
  judge_agreement_json: 'judge_agreement', humanReviewStatus: 'human_review_status',
  provenance_json: 'provenance', assessmentFormId: 'assessment_form_id',
}

function canonical(input = {}) {
  const out = {}
  for (const [k, v] of Object.entries(input)) {
    const key = ALIASES[k] || k
    if (key in InputSchema.shape && v !== undefined) out[key] = v
  }
  return out
}

export class EvidenceValidationError extends Error {
  constructor(details) {
    super('Evidence unit failed validation')
    this.name = 'EvidenceValidationError'
    this.code = 'VALIDATION_FAILED'
    this.details = details
  }
}

/**
 * Decide the stored shape + evidence_status of one unit.
 * Returns { unit, reasons } — `unit` is exactly what is persisted.
 */
export function normalizeEvidenceUnit(input, { now = () => new Date(), idFactory = () => `evid-${randomUUID()}`, rules = DEFAULT_SUFFICIENCY_RULES } = {}) {
  const parsed = InputSchema.safeParse(canonical(input))
  if (!parsed.success) throw new EvidenceValidationError(parsed.error.flatten())
  const u = parsed.data
  const reasons = []

  const hasAction = nonEmptyObject(u.candidate_action)
  const hasProvenance = nonEmptyObject(u.provenance)
  if (!hasAction) reasons.push('MISSING_CANDIDATE_ACTION')
  if (!hasProvenance) reasons.push('MISSING_PROVENANCE')

  let status
  let rubricLevel = u.rubric_level ?? null
  let rubricLabel = u.rubric_label ?? null
  let humanReview = u.human_review_status ?? null

  if (!hasAction || !hasProvenance) {
    status = 'INSUFFICIENT_EVIDENCE'
    rubricLevel = null
    rubricLabel = null
  } else if (rubricLevel === null && (humanReview === 'REQUIRED' || humanReview === 'IN_REVIEW')) {
    // An explicitly withheld interpretation (e.g. a quote the evaluator could
    // not attribute exactly): no level, no label, and a person decides.
    status = 'HUMAN_REVIEW_REQUIRED'
    rubricLabel = null
    reasons.push('HUMAN_REVIEW_PENDING')
  } else if (rubricLevel === null) {
    status = 'INSUFFICIENT_EVIDENCE'
    rubricLabel = null
    reasons.push('NOT_JUDGED')
  } else if (!u.judge_agreement) {
    status = 'PROVISIONAL'
    reasons.push('NO_JUDGE_AGREEMENT')
  } else if (u.judge_agreement.agreement < rules.minimum_judge_agreement) {
    status = 'HUMAN_REVIEW_REQUIRED'
    humanReview = humanReview || 'REQUIRED'
    reasons.push('JUDGE_DISAGREEMENT')
  } else if (humanReview === 'REQUIRED' || humanReview === 'IN_REVIEW') {
    status = 'HUMAN_REVIEW_REQUIRED'
    reasons.push('HUMAN_REVIEW_PENDING')
  } else {
    status = 'SUFFICIENT'
  }

  const unit = {
    evidence_id: u.evidence_id || idFactory(),
    session_id: u.session_id,
    attempt_id: u.attempt_id ?? null,
    blueprint_id: u.blueprint_id ?? null,
    capability_id: u.capability_id,
    capability_layer: u.capability_layer ?? null,
    source_type: u.source_type ?? null,
    source_turn: u.source_turn ?? null,
    source_artifact_id: u.source_artifact_id ?? null,
    behavior_anchor_id: u.behavior_anchor_id ?? null,
    candidate_action_json: hasAction ? u.candidate_action : null,
    observable_behavior: u.observable_behavior ?? null,
    rubric_level: rubricLevel,
    rubric_label: rubricLabel,
    judge_agreement_json: u.judge_agreement ?? null,
    human_review_status: humanReview,
    provenance_json: hasProvenance ? u.provenance : null,
    assessment_form_id: u.assessment_form_id ?? null,
    evidence_status: status,
    status_reasons: reasons,
    legacy_row: false,
    created_at: now(),
  }
  return { unit, reasons }
}

// The ONE adapter that reads rows written before 0025 (legacy_row = true).
// Stored values are never rewritten; a legacy row is admitted at most as
// PROVISIONAL evidence because its verification fields were defaulted.
const LEGACY_DEFAULTED_STATUS = 'VERIFIED_CONSENSUS' // campus-allow VERIFIED_CLAIM: legacy mapping (0024 default value, read-only)

export function readEvidenceRow(row) {
  if (!row) return null
  const legacy = row.legacy_row === true || (row.evidence_status == null && 'confidence_status' in row)
  if (!legacy) {
    return { ...row, status_reasons: row.status_reasons || [] }
  }
  const judged = Number.isFinite(row.rubric_level)
  return {
    evidence_id: row.evidence_id,
    session_id: row.session_id,
    attempt_id: row.attempt_id ?? null,
    blueprint_id: row.blueprint_id ?? null,
    capability_id: row.capability_id,
    capability_layer: row.capability_layer ?? null,
    source_type: row.source_type ?? null,
    source_turn: row.source_turn ?? null,
    source_artifact_id: row.source_artifact_id ?? null,
    behavior_anchor_id: row.behavior_anchor_id ?? null,
    candidate_action_json: nonEmptyObject(row.candidate_action) ? row.candidate_action : null,
    observable_behavior: row.observable_behavior ?? null,
    rubric_level: judged ? row.rubric_level : null,
    rubric_label: judged ? row.rubric_label ?? null : null,
    judge_agreement_json: null,
    human_review_status: null,
    provenance_json: nonEmptyObject(row.provenance) ? row.provenance : null,
    assessment_form_id: null,
    evidence_status: judged ? 'PROVISIONAL' : 'INSUFFICIENT_EVIDENCE',
    status_reasons: [
      'LEGACY_ROW',
      ...(row.confidence_status === LEGACY_DEFAULTED_STATUS ? ['LEGACY_DEFAULTED_VERIFICATION'] : []),
    ],
    legacy_row: true,
    created_at: row.created_at,
  }
}
