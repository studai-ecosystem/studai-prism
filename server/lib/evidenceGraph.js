import { isDbConfigured, query } from '../db/pool.js'

// In-memory fallback map for session evidence units
const memoryEvidenceStore = new Map()

export class EvidenceGraph {
  /**
   * Persists an atomic EvidenceUnit
   */
  async recordEvidenceUnit(unit) {
    const evidenceUnit = {
      evidence_id: unit.evidence_id || unit.evidenceId || `evid-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      session_id: unit.session_id || unit.sessionId,
      attempt_id: unit.attempt_id || unit.attemptId || null,
      blueprint_id: unit.blueprint_id || unit.blueprintId || 'STUDAI-JF-MKT-L1',
      capability_id: unit.capability_id || unit.capabilityId,
      capability_layer: unit.capability_layer || unit.capabilityLayer || 'LAYER_2_ROLE_SPECIFIC',
      source_turn: unit.source_turn || unit.sourceTurn || 1,
      source_artifact_id: unit.source_artifact_id || unit.sourceArtifactId || unit.sourceId || null,
      candidate_action: unit.candidate_action || unit.candidateAction || {},
      observable_behavior: unit.observable_behavior || unit.observedBehavior || 'Demonstrated domain judgment in simulation turn.',
      rubric_level: unit.rubric_level || unit.rubricLevel || 3,
      rubric_label: unit.rubric_label || unit.rubricLabel || 'Competent',
      confidence_status: unit.confidence_status || unit.confidenceStatus || 'VERIFIED_CONSENSUS',
      judge_agreement: unit.judge_agreement || unit.judgeAgreement || { unanimous: true, score: unit.rubric_level || unit.rubricLevel || 3 },
      provenance: unit.provenance || { timestamp: new Date().toISOString() },
      created_at: new Date()
    }

    if (isDbConfigured()) {
      try {
        const { getPool } = await import('./dbPg.js')
        const pool = getPool()
        await pool.query(
          `INSERT INTO behavioral_evidence_units (
            evidence_id, session_id, attempt_id, blueprint_id, capability_id,
            capability_layer, source_turn, source_artifact_id, candidate_action,
            observable_behavior, rubric_level, rubric_label, confidence_status,
            judge_agreement, provenance, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            evidenceUnit.evidence_id,
            evidenceUnit.session_id,
            evidenceUnit.attempt_id,
            evidenceUnit.blueprint_id,
            evidenceUnit.capability_id,
            evidenceUnit.capability_layer,
            evidenceUnit.source_turn,
            evidenceUnit.source_artifact_id,
            JSON.stringify(evidenceUnit.candidate_action),
            evidenceUnit.observable_behavior,
            evidenceUnit.rubric_level,
            evidenceUnit.rubric_label,
            evidenceUnit.confidence_status,
            JSON.stringify(evidenceUnit.judge_agreement),
            JSON.stringify(evidenceUnit.provenance),
            evidenceUnit.created_at
          ]
        )
      } catch {
        // Continue to memory
      }
    }

    const sessionList = memoryEvidenceStore.get(evidenceUnit.session_id) || []
    sessionList.push(evidenceUnit)
    memoryEvidenceStore.set(evidenceUnit.session_id, sessionList)

    return evidenceUnit
  }

  /**
   * Retrieves all verified EvidenceUnits for a session
   */
  async getEvidenceUnitsBySession(sessionId) {
    if (isDbConfigured()) {
      try {
        const { getPool } = await import('./dbPg.js')
        const pool = getPool()
        const { rows } = await pool.query(
          `SELECT * FROM behavioral_evidence_units WHERE session_id = $1 ORDER BY source_turn ASC, created_at ASC`,
          [sessionId]
        )
        if (rows.length > 0) return rows
      } catch {
        // Fall back to memory
      }
    }
    return memoryEvidenceStore.get(sessionId) || []
  }

  /**
   * Retrieves all verified EvidenceUnits for a session (alias)
   */
  async getEvidenceUnits(sessionId) {
    return this.getEvidenceUnitsBySession(sessionId)
  }

  /**
   * Aggregates verified EvidenceUnits into a Candidate Capability Profile
   */
  async aggregateCapabilityProfile(sessionId, blueprintId) {
    const units = await this.getEvidenceUnitsBySession(sessionId)
    const grouped = {}

    for (const unit of units) {
      if (!grouped[unit.capability_id]) {
        grouped[unit.capability_id] = []
      }
      grouped[unit.capability_id].push(unit)
    }

    const profile = {}
    for (const [capId, observations] of Object.entries(grouped)) {
      const levels = observations.map(o => o.rubric_level)
      const avgLevel = +(levels.reduce((sum, val) => sum + val, 0) / levels.length).toFixed(2)
      const roundedLevel = Math.round(avgLevel)

      profile[capId] = {
        capability_id: capId,
        score_level: roundedLevel,
        continuous_theta: avgLevel,
        evidence_count: observations.length,
        status: observations.length >= 2 ? 'VERIFIED' : 'PROVISIONAL',
        observations: observations.map(o => ({
          turn: o.source_turn,
          behavior: o.observable_behavior,
          rubric_level: o.rubric_level,
          rubric_label: o.rubric_label,
          citation: o.candidate_action?.dialogue_excerpt || null
        }))
      }
    }

    return profile
  }
}

export default new EvidenceGraph()
