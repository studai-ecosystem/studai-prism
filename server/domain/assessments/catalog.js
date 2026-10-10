// Assessment catalog (spec §10, §11; C4.01; K1, K51). Definitions and forms
// are DERIVED from the frozen scenario bank — the general scenario pool and
// the governed pre-approved bank — never authored here. No scenario id,
// title or content is written in this module; everything comes from the
// injected sources, so freezing/retiring a scenario in the bank is the only
// way to change what a student can be assigned.
import { LAYER_1_TRANSFERABLE_CAPABILITIES, LAYER_2_MARKETING_CAPABILITIES, CONTEXTUAL_DIGITAL_CAPABILITIES } from '../../lib/competencyModelV2.js'

export const CATALOG_VERSION = 'assessment-catalog.v1'
export const CORE_DEFINITION_ID = 'prism-workplace-core'
const CORE_FORM_VERSION = '1.0.0'
// The date this catalog snapshot of the frozen bank was taken (Phase 4).
const CATALOG_FROZEN_AT = '2026-09-25T00:00:00.000Z'
// Estimated administration time, as published in the 0022 catalog.
const ESTIMATED_MINUTES = 35

// What no Prism assessment measures (enum; copy lives in src/lib/copy/student.js).
export const NOT_MEASURED = Object.freeze(['PERSONALITY', 'INTELLIGENCE', 'EMOTION_OR_TONE', 'APPEARANCE', 'ACADEMIC_RECORD', 'EMPLOYER_FIT'])
export const INTEGRITY_MODES = Object.freeze(['STANDARD', 'PROCTORED'])

const PRIMARY = Object.keys(LAYER_1_TRANSFERABLE_CAPABILITIES)
const CONTEXTUAL = { ...LAYER_2_MARKETING_CAPABILITIES, ...CONTEXTUAL_DIGITAL_CAPABILITIES }

function bankCapabilities(scenario) {
  const targeted = (scenario?.probingTree?.turns || []).map((t) => t.targetCapability).filter((id) => CONTEXTUAL[id])
  return [...PRIMARY, ...new Set(targeted)]
}

/**
 * buildCatalog({ generalScenarios, bankScenarios }) → { version, definitions, forms }
 *   generalScenarios — the legacy frozen pool (array of { id, retired? })
 *   bankScenarios    — the governed pre-approved bank ({ key: scenario })
 */
export function buildCatalog({ generalScenarios = [], bankScenarios = {} } = {}) {
  const definitions = []
  const forms = []
  const pool = generalScenarios.filter((s) => s && typeof s.id === 'string' && !s.retired)
  if (pool.length) {
    definitions.push({
      id: CORE_DEFINITION_ID,
      title: 'Prism Workplace Simulation',
      description: 'A conversation with workplace colleagues about a realistic problem. You explain your thinking and decide what to do.',
      jobFamily: 'GENERAL',
      status: 'active',
      durationMinutes: ESTIMATED_MINUTES,
      measures: PRIMARY,
      notMeasured: NOT_MEASURED,
      integrityModes: INTEGRITY_MODES,
      formPolicy: 'SERVER_SELECTED',
      hasArtifacts: false,
    })
    for (const s of pool) {
      forms.push({
        id: `${CORE_DEFINITION_ID}:${s.id}:${CORE_FORM_VERSION}`,
        definitionId: CORE_DEFINITION_ID,
        version: CORE_FORM_VERSION,
        scenarioId: s.id,
        jobFamilyId: null,
        capabilityIds: PRIMARY,
        status: 'FROZEN',
        frozenAt: CATALOG_FROZEN_AT,
      })
    }
  }
  for (const [key, scenario] of Object.entries(bankScenarios)) {
    if (!scenario || typeof scenario.title !== 'string') continue
    const capabilityIds = bankCapabilities(scenario)
    const version = scenario.version || CORE_FORM_VERSION
    definitions.push({
      id: key,
      title: scenario.title,
      description: scenario.briefing?.objective || null,
      jobFamily: scenario.blueprintId || 'GENERAL',
      status: 'active',
      durationMinutes: ESTIMATED_MINUTES,
      measures: capabilityIds,
      notMeasured: NOT_MEASURED,
      integrityModes: INTEGRITY_MODES,
      formPolicy: 'FIXED_FORM',
      hasArtifacts: (scenario.interactiveArtifacts || []).length > 0,
    })
    forms.push({
      id: `${key}:${version}`,
      definitionId: key,
      version,
      scenarioId: key,
      jobFamilyId: scenario.blueprintId || null,
      capabilityIds,
      status: 'FROZEN',
      frozenAt: CATALOG_FROZEN_AT,
    })
  }
  return { version: CATALOG_VERSION, definitions, forms }
}

// Which definition a stored session belongs to: a governed-bank session maps
// to its own definition; every other session was served from the general
// pool (including scenarios retired since) and belongs to the core one.
export function definitionForScenario(catalog, scenarioId) {
  const bank = catalog.definitions.find((d) => d.id === scenarioId && d.id !== CORE_DEFINITION_ID)
  return bank ? bank.id : CORE_DEFINITION_ID
}

// The frozen form a stored session was taken on, or null when its scenario is
// no longer in the catalog (then no growth comparison can use it).
// PROD-READY Phase 3: the form id persisted with the session (0057) wins.
// It is looked up in today's catalog; if a bank version bump has removed it,
// the session keeps its own form id (status NOT_IN_CATALOG) — it is never
// remapped to the scenario's current form. Today's catalog mapping is used
// only when no form id was recorded.
export function formForSession(catalog, scenarioId, persistedFormId = null) {
  if (persistedFormId) {
    const recorded = catalog.forms.find((f) => f.id === persistedFormId)
    if (recorded) return recorded
    return {
      id: persistedFormId,
      definitionId: scenarioId ? definitionForScenario(catalog, scenarioId) : null,
      version: null,
      scenarioId: scenarioId || null,
      capabilityIds: [],
      status: 'NOT_IN_CATALOG',
    }
  }
  if (!scenarioId) return null
  const definitionId = definitionForScenario(catalog, scenarioId)
  return catalog.forms.find((f) => f.definitionId === definitionId && f.scenarioId === scenarioId) || null
}

// The form id recorded for a session: the session's own column first, then
// the single form id its evidence units carry (draft runs record it there);
// null when neither names exactly one form.
export function recordedFormId(session, units = []) {
  if (session?.assessmentFormId) return String(session.assessmentFormId)
  const ids = [...new Set((units || []).map((u) => u?.assessment_form_id).filter(Boolean))]
  return ids.length === 1 ? String(ids[0]) : null
}

export function capabilityName(id) {
  return LAYER_1_TRANSFERABLE_CAPABILITIES[id]?.name || CONTEXTUAL[id]?.name || null
}

// Plain-language family labels for the first screen of a report (P5.2). The
// precise framework name stays alongside; neither replaces the other.
export const CAPABILITY_DISPLAY_LABELS = Object.freeze({
  'CAP-L1-REASONING': 'Making decisions',
  'CAP-L1-COMMUNICATION': 'Getting your point across',
  'CAP-L1-COLLABORATION': 'Working with people',
  'CAP-L1-ADAPTABILITY': 'Responding to change',
  'CAP-L1-EXECUTION': 'Making things happen',
})

export function capabilityDisplayLabel(id) {
  return CAPABILITY_DISPLAY_LABELS[id] || null
}

export function capabilityInfo(id) {
  const cap = LAYER_1_TRANSFERABLE_CAPABILITIES[id] || CONTEXTUAL[id]
  if (!cap) return null
  return {
    id: cap.id, name: cap.name, displayLabel: CAPABILITY_DISPLAY_LABELS[id] || null, description: cap.description || '',
    layer: LAYER_1_TRANSFERABLE_CAPABILITIES[id] ? 'PRIMARY' : 'CONTEXTUAL', anchors: cap.anchors || {},
  }
}

export const PRIMARY_CAPABILITY_IDS = Object.freeze([...PRIMARY])
