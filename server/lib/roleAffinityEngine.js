// server/lib/roleAffinityEngine.js — Role Affinity Engine (Phase 8)
// Explainable career guidance without counterfeit fit percentages

function cosineSimilarity(vecA, vecB) {
  const keys = Array.from(new Set([...Object.keys(vecA), ...Object.keys(vecB)]))
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (const k of keys) {
    const valA = vecA[k] || 0
    const valB = vecB[k] || 0
    dotProduct += valA * valB
    normA += valA * valA
    normB += valB * valB
  }
  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

export class RoleAffinityEngine {
  /**
   * High-level entry point to compute role affinity from capability profile
   */
  async computeRoleAffinity(capabilityProfile = {}, candidateInterests) {
    const { default: occupationalGraph } = await import('./occupationalGraph.js')
    const families = await occupationalGraph.getAllJobFamilies()
    const fullBlueprints = await Promise.all(
      families.map(f => occupationalGraph.getJobFamilyBlueprint(f.job_family_id))
    )
    return this.evaluateAffinity({
      candidateInterests,
      capabilityProfile,
      blueprints: fullBlueprints.filter(Boolean)
    })
  }

  /**
   * Computes qualitative role affinity across candidate interests and verified capability evidence
   */
  evaluateAffinity({
    candidateInterests = { E: 0.5, A: 0.3, I: 0.2 },
    capabilityProfile = {},
    blueprints = []
  }) {
    const results = []

    for (const bp of blueprints) {
      // 1. Interest Similarity (RIASEC)
      const targetRiasec = bp.riasec_profile?.composite_weights || { E: 0.3, A: 0.2, I: 0.2, S: 0.1, C: 0.1, R: 0.1 }
      const interestScore = cosineSimilarity(candidateInterests, targetRiasec)

      // 2. Demonstrated Transferable Evidence Alignment
      const l1Caps = bp.layer1_transferable_capabilities || []
      let demonstratedSum = 0
      let maxPossible = 0
      let observedEvidenceCount = 0

      for (const cap of l1Caps) {
        const capId = cap.id || cap.capability_id
        const observed = capabilityProfile[capId]
        if (observed && observed.score_level) {
          demonstratedSum += (observed.score_level / 5) * (cap.weight || 0.2)
          observedEvidenceCount += observed.evidence_count || 1
        }
        maxPossible += (cap.weight || 0.2)
      }

      const capabilityAlignment = maxPossible > 0 ? (demonstratedSum / maxPossible) : 0.5
      const compositeAffinity = +(0.45 * interestScore + 0.55 * capabilityAlignment).toFixed(3)

      // 3. Qualitative Exploration Tier Assignment
      let tier = 'MODERATE_EXPLORATION_RELEVANCE'
      if (observedEvidenceCount < 2) {
        tier = 'INSUFFICIENT_EVIDENCE'
      } else if (compositeAffinity >= 0.70) {
        tier = 'HIGH_EXPLORATION_RELEVANCE'
      } else if (compositeAffinity >= 0.50) {
        tier = 'MODERATE_EXPLORATION_RELEVANCE'
      } else {
        tier = 'DEVELOPMENT_PATHWAY'
      }

      // 4. Dual-Sided Explainability Synthesis
      const whyItAppeared = []
      const whatRemainsUnknown = []

      // Analyze observed strengths
      for (const [capId, data] of Object.entries(capabilityProfile)) {
        if (data.score_level >= 4) {
          whyItAppeared.push({
            type: 'OBSERVED_STRENGTH',
            statement: `You demonstrated high-level performance (${data.score_level}/5) in ${capId.replace('CAP-', '')}, backed by ${data.evidence_count} simulation actions.`
          })
        }
      }

      if (interestScore >= 0.70) {
        whyItAppeared.push({
          type: 'VOCATIONAL_INTEREST',
          statement: `Your stated preferences align strongly with the primary work environment of ${bp.name}.`
        })
      }

      // Analyze gaps
      const l2Caps = bp.layer2_role_capabilities || []
      for (const cap of l2Caps) {
        const capId = cap.id || cap.capability_id
        if (!capabilityProfile[capId]) {
          whatRemainsUnknown.push({
            capability_id: capId,
            name: cap.name || capId,
            note: `No direct evidence observed in current simulation for ${cap.name || capId}.`
          })
        }
      }

      results.push({
        job_family_id: bp.job_family_id,
        title: bp.name,
        track: bp.track,
        exploration_tier: tier,
        composite_score: compositeAffinity,
        why_this_role_appeared: whyItAppeared,
        what_remains_unknown: whatRemainsUnknown,
        suggested_next_step: {
          type: 'DEVELOPMENT_MISSION',
          mission_id: bp.job_family_id.includes('MKT') ? 'MIS-MKT-EXP-01' : 'MIS-CSU-EXP-02',
          title: bp.job_family_id.includes('MKT') ? 'A/B Experimentation & Budget Reallocation' : 'Enterprise Contract Expansion',
          duration_minutes: 20
        }
      })
    }

    // Sort by composite score descending
    return results.sort((a, b) => b.composite_score - a.composite_score)
  }
}

export default new RoleAffinityEngine()
