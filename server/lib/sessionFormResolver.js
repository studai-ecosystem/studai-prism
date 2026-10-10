// PROD-READY Phase 3: every new session records the assessment form it is
// taken on (v1_sessions.assessment_form_id, migration 0057; `assessmentFormId`
// in the JSON store), so a later bank version bump cannot remap it. The
// resolver is registered by the campus context (it owns the catalog). Without
// one, or if it fails, the session is created exactly as before and readers
// fall back to today's catalog.
import logger from './logger.js'

let resolver = null

export function registerSessionFormResolver(fn) {
  resolver = typeof fn === 'function' ? fn : null
}

// The record to store: `data` plus `assessmentFormId` when one can be
// resolved for its scenario and none was given.
export async function withRecordedForm(data) {
  if (!resolver || !data || data.assessmentFormId || !data.scenarioId) return data
  try {
    const formId = await resolver(data.scenarioId)
    return formId ? { ...data, assessmentFormId: String(formId) } : data
  } catch (error) {
    logger.warn('session_form_resolve_failed', { code: error?.code || error?.name || 'ERROR' })
    return data
  }
}
