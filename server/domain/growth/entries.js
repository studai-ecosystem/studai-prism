// One formal session as the growth comparison needs it (C9.04/C9.05): its
// form, its completion date and the sufficiency decision per capability. Held
// or invalidated sessions and sessions without an issued report are never
// formal evidence (K59) and load as null.
import { evaluateProfile } from '../evidence/sufficiency.js'
import { PRIMARY_CAPABILITY_IDS, definitionForScenario, formForSession } from '../assessments/catalog.js'

const toIso = (v) => {
  if (v == null || v === '') return null
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function createSessionEntryLoader({ catalog, evidence, legacy }) {
  return async function entryFor(sessionId) {
    if (!sessionId) return null
    const [session, report] = await Promise.all([legacy.getSession(sessionId), legacy.getReport(sessionId)])
    if (!report) return null
    const admin = legacy.adminState ? await legacy.adminState(sessionId) : null
    if (admin?.invalid || admin?.reviewState === 'held') return null
    const cat = await catalog.getCatalog()
    const scenarioId = session?.scenarioId || report?.scenarioId || null
    const definition = cat.definitions.find((d) => d.id === definitionForScenario(cat, scenarioId)) || null
    const units = await evidence.units(sessionId)
    return {
      session: { sessionId, completedAt: toIso(report.issuedAt) || toIso(session?.completedAt) },
      definition,
      form: formForSession(cat, scenarioId),
      decisions: evaluateProfile(units, { capabilityIds: definition?.measures || PRIMARY_CAPABILITY_IDS }),
    }
  }
}
