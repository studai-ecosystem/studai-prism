import { createHash } from 'node:crypto'
import { ApiError } from '../http/errors.js'
import { loadPrompt } from '../../engine/prompts.js'
import { policyFor, aiProvider } from '../../services/ai/modelRouter.js'
import { capabilityInfo } from './catalog.js'
import { DRAFT_UNIVERSAL, policyRecord } from './timingPolicy.js'
import { rulesFor, SUFFICIENCY_RULES_VERSION } from '../evidence/sufficiencyRules.js'

export const METHOD_SCHEMA = 'assessment-method.v1'
export const EVIDENCE_PROMPT = 'evidence_evaluator.v3'
export const EVIDENCE_EVALUATOR = 'slice-evaluator.v3'
export const FROZEN_METHOD_VERSION = 'v3-slice-0.2'
const copy = (value) => JSON.parse(JSON.stringify(value))
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value
export const methodHash = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
export const unavailable = () => new ApiError('PINNED_METHOD_UNAVAILABLE', 'The exact assessment method is unavailable. Your work and issued reports are preserved; please request review.')

export function rubricForSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.opportunities) || !snapshot.opportunities.length) throw unavailable()
  const rubric = snapshot.form?.rubric || snapshot.rubric
  if (!rubric || rubric.ref !== snapshot.rubricRef) throw unavailable()
  for (const opportunity of snapshot.opportunities || []) {
    for (const id of opportunity.behaviourIds || [opportunity.behaviourId]) {
      const anchors = rubric.anchorsByBehaviour?.[id]
      if (!anchors || [1, 2, 3, 4, 5].some((level) => {
        const anchor = anchors[level]
        return typeof anchor === 'string' ? !anchor.trim() : !anchor || typeof anchor.criteria !== 'string' || !anchor.criteria.trim()
      })) throw unavailable()
    }
  }
  return rubric
}

// Captured once at allocation, never reconstructed from a later catalogue.
// The old handover method used capability anchors; freeze those actual
// instructions explicitly rather than pretending they were behaviour anchors.
export function captureMethod(snapshot, { formId = null, engineVersion = 'legacy-engine' } = {}) {
  const frozen = copy(snapshot)
  if (!frozen.universal && !frozen.rubric) {
    frozen.rubric = {
      ref: frozen.rubricRef, source: 'LEGACY_CAPABILITY_ANCHORS_AT_ALLOCATION',
      anchorsByBehaviour: Object.fromEntries(frozen.opportunities.map((o) => [o.behaviourId, copy(capabilityInfo(o.capabilityId).anchors)])),
    }
  }
  const rubric = rubricForSnapshot(frozen)
  return {
    schemaVersion: METHOD_SCHEMA, methodVersion: FROZEN_METHOD_VERSION, formId, engineVersion, snapshot: frozen,
    rubricHash: methodHash(rubric), timing: policyRecord(DRAFT_UNIVERSAL),
    responseModes: frozen.form?.briefing?.responseModes || ['TEXT', 'BOARD'],
    prompt: { version: EVIDENCE_PROMPT, template: loadPrompt(EVIDENCE_PROMPT) },
    evaluatorVersion: EVIDENCE_EVALUATOR,
    modelPolicy: { ...policyFor('evidence_evaluator'), provider: aiProvider(), temperature: 0, maxCompletionTokens: 900, retries: 1 },
    interpretation: {
      version: SUFFICIENCY_RULES_VERSION,
      sourceGrouping: 'opportunity-group.v1',
      rules: Object.fromEntries([...new Set(frozen.opportunities.map((o) => o.capabilityId))].map((id) => [id, copy(rulesFor(id))])),
    },
    capabilityDefinitions: Object.fromEntries([...new Set(frozen.opportunities.map((o) => o.capabilityId))].map((id) => {
      const cap = capabilityInfo(id)
      return [id, { id, name: cap.name, description: cap.description, displayLabel: cap.displayLabel || null, layer: cap.layer }]
    })),
  }
}

export function resolvePinnedMethod(pin, snapshot = null) {
  const method = pin?.methodSnapshot
  if (!method || method.schemaVersion !== METHOD_SCHEMA || methodHash(method) !== pin.methodHash) throw unavailable()
  if (pin.methodVersion !== method.methodVersion || method.methodVersion !== FROZEN_METHOD_VERSION) throw unavailable()
  const frozen = method.snapshot
  const rubric = rubricForSnapshot(frozen)
  if (frozen.universal && (frozen.form.version !== frozen.version || frozen.form.id !== frozen.id
    || (pin.formId != null && frozen.form.formId !== pin.formId))) throw unavailable()
  if (frozen.opportunities.some((o) => !method.interpretation?.rules?.[o.capabilityId])) throw unavailable()
  const content = frozen.universal ? frozen.form : { ...frozen }
  if (!frozen.universal) delete content.rubric
  if (pin.formId !== method.formId || pin.engineVersion !== method.engineVersion || methodHash(content) !== pin.snapshotHash) throw unavailable()
  if (frozen.id !== pin.scenarioId || frozen.version !== pin.snapshotVersion || rubric.ref !== pin.rubricRef
    || methodHash(rubric) !== method.rubricHash || method.evaluatorVersion !== EVIDENCE_EVALUATOR
    || method.prompt?.version !== EVIDENCE_PROMPT || typeof method.prompt.template !== 'string'
    || !method.modelPolicy?.modelId || !method.modelPolicy.provider || method.modelPolicy.temperature !== 0
    || method.modelPolicy.maxCompletionTokens !== 900 || method.modelPolicy.retries !== 1
    || !method.timing?.version || !method.interpretation?.rules) throw unavailable()
  if (snapshot && methodHash(snapshot) !== methodHash(frozen)) {
    // Non-universal compatibility callers pass the authored segment, which
    // predates the allocation-time frozen rubric field.
    const segment = copy(frozen)
    if (!segment.universal) delete segment.rubric
    if (methodHash(snapshot) !== methodHash(segment)) throw unavailable()
  }
  return copy(method)
}

export function anchorFromEvidence(unit, level = unit?.rubric_level) {
  const rubric = unit?.provenance_json?.resolvedRubric || unit?.provenance?.resolvedRubric
  if (!rubric || methodHash(rubric.anchors) !== rubric.anchorsHash) return null
  const anchor = rubric.anchors?.[level]
  return typeof anchor === 'string' ? { criteria: anchor, label: null } : anchor || null
}
