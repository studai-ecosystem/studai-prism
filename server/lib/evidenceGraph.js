// Behavioural evidence ledger (spec §30.8, §33). Every write goes through the
// strict contract in domain/evidence/evidenceUnit.js — nothing is defaulted —
// and every capability status comes from the sufficiency engine.
import { isDbConfigured, getPool } from '../db/pool.js'
import logger from './logger.js'
import { normalizeEvidenceUnit, readEvidenceRow } from '../domain/evidence/evidenceUnit.js'
import { evaluateProfile } from '../domain/evidence/sufficiency.js'

// In-memory ledger used when no database is configured (and in unit tests).
const memoryEvidenceStore = new Map()

const json = (v) => (v == null ? null : JSON.stringify(v))

export class EvidenceGraph {
  /** Persist one evidence unit. Returns the stored (normalised) unit. */
  async recordEvidenceUnit(input) {
    const { unit } = normalizeEvidenceUnit(input)

    if (isDbConfigured()) {
      try {
        await getPool().query(
          `INSERT INTO behavioral_evidence_units (
            evidence_id, session_id, attempt_id, blueprint_id, capability_id, capability_layer,
            source_type, source_turn, source_artifact_id, behavior_anchor_id,
            candidate_action, candidate_action_json, observable_behavior, rubric_level, rubric_label,
            confidence_status, judge_agreement, judge_agreement_json, human_review_status,
            provenance, provenance_json, assessment_form_id, evidence_status, legacy_row, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12,$13,$14,$15,$16,$16,$17,$18,$18,$19,$20,false,$21)`,
          [
            unit.evidence_id, unit.session_id, unit.attempt_id, unit.blueprint_id, unit.capability_id, unit.capability_layer,
            unit.source_type, unit.source_turn, unit.source_artifact_id, unit.behavior_anchor_id,
            json(unit.candidate_action_json), unit.observable_behavior, unit.rubric_level, unit.rubric_label,
            unit.evidence_status, json(unit.judge_agreement_json), unit.human_review_status,
            json(unit.provenance_json), unit.assessment_form_id, unit.evidence_status, unit.created_at,
          ],
        )
        return unit
      } catch (err) {
        // With a database configured, a rejected write is an error, never a
        // silent memory fallback that bypasses the schema checks (fail closed).
        logger.captureException(err, { msg: 'evidence_unit_pg_write_failed', sessionId: unit.session_id })
        throw err
      }
    }

    const list = memoryEvidenceStore.get(unit.session_id) || []
    list.push(unit)
    memoryEvidenceStore.set(unit.session_id, list)
    return unit
  }

  /** All evidence units for a session, legacy rows read through the adapter. */
  async getEvidenceUnitsBySession(sessionId) {
    if (isDbConfigured()) {
      try {
        const { rows } = await getPool().query(
          'SELECT * FROM behavioral_evidence_units WHERE session_id = $1 ORDER BY source_turn ASC NULLS LAST, created_at ASC',
          [sessionId],
        )
        if (rows.length > 0) return rows.map(readEvidenceRow)
      } catch (err) {
        // A read failure is an outage, not missing evidence: never let it
        // surface as INSUFFICIENT_EVIDENCE on a report or in the audit trail.
        logger.captureException(err, { msg: 'evidence_unit_pg_read_failed', sessionId })
        throw err
      }
    }
    return (memoryEvidenceStore.get(sessionId) || []).map(readEvidenceRow)
  }

  async getEvidenceUnits(sessionId) {
    return this.getEvidenceUnitsBySession(sessionId)
  }

  /**
   * Capability profile for a session: one sufficiency decision per capability.
   * A level (band + label) exists only for PROVISIONAL / SUFFICIENT
   * capabilities; everything else carries `level: null` and its reasons.
   */
  async aggregateCapabilityProfile(sessionId, { capabilityIds = [] } = {}) {
    const units = await this.getEvidenceUnitsBySession(sessionId)
    const decisions = evaluateProfile(units, { capabilityIds })
    const profile = {}
    for (const [capId, d] of Object.entries(decisions)) {
      const eligible = new Set(d.unitIds)
      profile[capId] = {
        capability_id: capId,
        status: d.status,
        reasons: d.reasons,
        level: d.level ? { band: d.level.band, label: d.level.label } : null,
        score_level: d.level ? Math.round(d.level.rubricMedian) : null,
        evidence_count: d.unitIds.length,
        opportunities: d.opportunities,
        unit_ids: d.unitIds,
        rules_version: d.rulesVersion,
        observations: units
          .filter((u) => eligible.has(u.evidence_id))
          .map((u) => ({
            evidence_id: u.evidence_id,
            turn: u.source_turn,
            artifact: u.source_artifact_id,
            behavior: u.observable_behavior,
            rubric_level: u.rubric_level,
            rubric_label: u.rubric_label,
            citation: u.candidate_action_json?.dialogue_excerpt || null,
          })),
      }
    }
    return profile
  }
}

export default new EvidenceGraph()
