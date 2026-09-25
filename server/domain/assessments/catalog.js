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

export function capabilityName(id) {
  return LAYER_1_TRANSFERABLE_CAPABILITIES[id]?.name || CONTEXTUAL[id]?.name || null
}

export function capabilityInfo(id) {
  const cap = LAYER_1_TRANSFERABLE_CAPABILITIES[id] || CONTEXTUAL[id]
  if (!cap) return null
  return { id: cap.id, name: cap.name, description: cap.description || '', layer: LAYER_1_TRANSFERABLE_CAPABILITIES[id] ? 'PRIMARY' : 'CONTEXTUAL', anchors: cap.anchors || {} }
}

export const PRIMARY_CAPABILITY_IDS = Object.freeze([...PRIMARY])
