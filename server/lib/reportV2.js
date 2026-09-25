// server/lib/reportV2.js — legacy Student/Employee Report V2 builder, now
// FAIL CLOSED (spec §2.4, §33; K6). Every capability status comes from the
// sufficiency engine; every conclusion is a claim with evidence ids (claim
// registry); quotes are verbatim candidate turns or absent. No fallback
// scores, quotes, archetypes, readiness, strengths, precision or roles.
// Issued legacy reports are never re-rendered here (K7) — this builds the
// on-demand V2 view only. Report V3 (Phase 6) supersedes it.

import evidenceGraph from './evidenceGraph.js'
import roleAffinityEngine from './roleAffinityEngine.js'
import occupationalGraph from './occupationalGraph.js'
import { LAYER_1_TRANSFERABLE_CAPABILITIES, LAYER_2_MARKETING_CAPABILITIES } from './competencyModelV2.js'
import { getScenarioByAssessmentId } from './scenarioBank.js'
import { buildClaim, validateClaims, candidateTurnsFrom } from '../domain/reports/claims.js'
import { SUFFICIENCY_RULES_VERSION } from '../domain/evidence/sufficiencyRules.js'
import { LEVEL_LABELS_STATUS } from '../domain/evidence/levels.js'

const ADMISSIBLE = new Set(['PROVISIONAL', 'SUFFICIENT'])
const STRONG_BANDS = new Set(['DEMONSTRATED', 'STRONG'])
const GROWTH_BANDS = new Set(['EARLY', 'DEVELOPING'])

function countStatuses(caps) {
  const out = { sufficient: 0, provisional: 0, insufficient: 0, humanReview: 0, total: caps.length }
  for (const c of caps) {
    if (c.status === 'SUFFICIENT') out.sufficient += 1
    else if (c.status === 'PROVISIONAL') out.provisional += 1
    else if (c.status === 'HUMAN_REVIEW_REQUIRED') out.humanReview += 1
    else out.insufficient += 1
  }
  return out
}

function capabilityCard(cap, decision, units, turns) {
  const status = decision?.status || 'INSUFFICIENT_EVIDENCE'
  const level = ADMISSIBLE.has(status) ? decision.level : null
  const anchorLevel = level ? decision.score_level : null
  const cited = units.filter((u) => (decision?.unit_ids || []).includes(u.evidence_id))
  const excerpt = cited.map((u) => u.candidate_action_json?.dialogue_excerpt).find((q) => typeof q === 'string' && q.trim())
  const quote = excerpt && turns.some((t) => t.replace(/\s+/g, ' ').includes(excerpt.replace(/\s+/g, ' ').trim())) ? excerpt : null
  const firstTurn = cited.find((u) => u.source_turn != null)?.source_turn ?? null
  return {
    id: cap.id,
    name: cap.name,
    definition: cap.description || '',
    status,
    statusReasons: decision?.reasons || ['NO_EVIDENCE'],
    level,
    levelDescriptor: anchorLevel && cap.anchors?.[anchorLevel] ? cap.anchors[anchorLevel].criteria : null,
    evidenceIds: decision?.unit_ids || [],
    observedEvidence: {
      quote,
      context: firstTurn != null ? `Observed at exchange ${firstTurn}.` : null,
    },
  }
}

export async function buildStudentReportV2(sessionId, session, baseReport = {}) {
  const scenario = session?.scenarioId ? getScenarioByAssessmentId(session.scenarioId) : null
  const blueprintId = scenario?.blueprintId || null
  const blueprint = blueprintId ? await occupationalGraph.getJobFamilyBlueprint(blueprintId) : null

  const l1 = Object.values(LAYER_1_TRANSFERABLE_CAPABILITIES)
  const l2 = (blueprint?.layer2_role_capabilities || [])
    .map((c) => LAYER_2_MARKETING_CAPABILITIES[c.id || c.capability_id] || { id: c.id || c.capability_id, name: c.name || c.id || c.capability_id, description: c.description || '' })
    .filter((c) => c.id)
  const capabilityIds = [...l1, ...l2].map((c) => c.id)

  const units = await evidenceGraph.getEvidenceUnits(sessionId)
  const profile = await evidenceGraph.aggregateCapabilityProfile(sessionId, { capabilityIds })
  const turns = candidateTurnsFrom(session?.history || [])

  const layer1Caps = l1.map((cap) => capabilityCard(cap, profile[cap.id], units, turns))
  const layer2Caps = l2.map((cap) => capabilityCard(cap, profile[cap.id], units, turns))
  const allCaps = [...layer1Caps, ...layer2Caps]

  // Claims: every strength / development need cites the units behind it.
  const drafts = []
  for (const c of allCaps) {
    if (!ADMISSIBLE.has(c.status) || !c.level) {
      drafts.push(buildClaim({ claimType: 'INSUFFICIENT', capabilityId: c.id, text: `Not enough evidence yet to describe ${c.name}.`, status: 'INSUFFICIENT' }))
      continue
    }
    const status = c.status === 'SUFFICIENT' ? 'SUPPORTED' : 'PROVISIONAL'
    if (STRONG_BANDS.has(c.level.band)) {
      drafts.push(buildClaim({ claimType: 'STRENGTH', capabilityId: c.id, text: `${c.name}: ${c.level.label}.`, evidenceIds: c.evidenceIds, status, quote: c.observedEvidence.quote }))
    } else if (GROWTH_BANDS.has(c.level.band)) {
      drafts.push(buildClaim({ claimType: 'DEVELOPMENT_NEED', capabilityId: c.id, text: `${c.name}: ${c.level.label}.`, evidenceIds: c.evidenceIds, status }))
    }
  }
  const evidenceIndex = new Map(units.filter((u) => ADMISSIBLE.has(u.evidence_status)).map((u) => [u.evidence_id, u]))
  const { accepted: claims } = validateClaims(drafts, evidenceIndex, { turns })
  const strengths = claims.filter((c) => c.claim_type === 'STRENGTH')
  const growth = claims.filter((c) => c.claim_type === 'DEVELOPMENT_NEED')

  const exploration = await roleAffinityEngine.computeRoleAffinity(profile, null)
  const evidenced = exploration.filter((r) => r.basis === 'DEMONSTRATED' || r.basis === 'BOTH')
  const neighborhood = blueprintId ? await occupationalGraph.findRoleNeighborhood(blueprintId) : []

  const artifactsWithEvidence = new Set(units.filter((u) => ADMISSIBLE.has(u.evidence_status) && u.source_artifact_id).map((u) => u.source_artifact_id))
  const anyEvidence = allCaps.some((c) => ADMISSIBLE.has(c.status))
  const credentialId = baseReport?.credential?.credentialId || null

  return {
    reportVersion: '2.1.0-fail-closed',
    sessionId,
    status: anyEvidence ? 'PROVISIONAL' : 'INSUFFICIENT_EVIDENCE',
    method: { sufficiencyRules: SUFFICIENCY_RULES_VERSION, levelLabels: LEVEL_LABELS_STATUS },
    candidate: {
      name: session?.candidateName || baseReport?.candidateName || null,
      credentialId,
      issuedAt: baseReport?.issuedAt || null,
      shareUrl: credentialId ? `/verify/${credentialId}` : null,
    },
    claims,
    section1_executiveSummary: {
      summaryStatus: anyEvidence ? 'PROVISIONAL' : 'INSUFFICIENT_EVIDENCE',
      strengthClaimIds: strengths.map((c) => c.claim_id),
      developmentClaimIds: growth.map((c) => c.claim_id),
    },
    section2_methodologicalIntegrity: {
      evidenceSufficiency: {
        coreTransferable: countStatuses(layer1Caps),
        roleCapabilities: countStatuses(layer2Caps),
        workArtifactsWithEvidence: artifactsWithEvidence.size,
      },
      alternateAdministration: session?.administrationMode?.alternate ? 'Alternate administration' : null,
    },
    section3_layer1TransferableCapabilities: layer1Caps,
    section4_layer2RoleCapabilities: layer2Caps,
    section5_appliedWorkDemonstration: {
      scenarioTitle: scenario?.title ?? null,
      jobFamilyId: blueprintId,
      jobFamilyName: blueprint?.name ?? null,
      artifactHighlights: [],
    },
    section7_careerExploration: {
      roles: evidenced.map((r) => ({ roleId: r.roleId, title: r.title, whyShown: r.whyShown, unknowns: r.unknowns, nextStep: r.nextStep })),
    },
    section8_roleNeighborhood: {
      focalJobFamilyId: blueprintId,
      edges: (Array.isArray(neighborhood) ? neighborhood : []).map((edge) => ({
        targetRole: edge.title || edge.target_family_id,
        edgeType: edge.edge_type || null,
        bridgeCompetency: edge.bridge_competency || null,
      })),
    },
    section9_strengthsAndGrowth: {
      strengths: strengths.map((c) => ({ claimId: c.claim_id, capabilityId: c.capability_id, text: c.text, status: c.status, evidenceIds: c.evidence_ids, quote: c.quote })),
      growthOpportunities: growth.map((c) => ({ claimId: c.claim_id, capabilityId: c.capability_id, text: c.text, status: c.status, evidenceIds: c.evidence_ids })),
      insufficient: allCaps.filter((c) => !ADMISSIBLE.has(c.status)).map((c) => ({ capabilityId: c.id, name: c.name })),
    },
    section11_developmentMissions: [],
    section12_verification: {
      credentialVerificationUrl: credentialId ? `/verify/${credentialId}` : null,
    },
  }
}

export async function buildEmployeeReportV2(sessionId, session, baseReport = {}) {
  const studentReport = await buildStudentReportV2(sessionId, session, baseReport)
  const blueprintId = studentReport.section5_appliedWorkDemonstration.jobFamilyId
  const blueprint = blueprintId ? await occupationalGraph.getJobFamilyBlueprint(blueprintId) : null
  const neighborhood = blueprintId ? await occupationalGraph.findRoleNeighborhood(blueprintId) : []
  const byId = new Map([...studentReport.section3_layer1TransferableCapabilities, ...studentReport.section4_layer2RoleCapabilities].map((c) => [c.id, c]))

  return {
    ...studentReport,
    reportType: 'EMPLOYEE_GROWTH_AND_MOBILITY',
    currentRole: {
      title: session?.currentRoleTitle || null,
      currentJobFamilyId: blueprintId,
    },
    targetRoleEvaluation: {
      targetRoleTitle: session?.targetRoleTitle || null,
      capabilityStatus: (blueprint?.layer2_role_capabilities || []).map((cap) => {
        const id = cap.id || cap.capability_id
        const card = byId.get(id)
        return {
          capability: id,
          name: cap.name || id,
          status: card?.status || 'INSUFFICIENT_EVIDENCE',
          level: card?.level || null,
          evidenceIds: card?.evidenceIds || [],
        }
      }),
    },
    internalMobilityPathways: (Array.isArray(neighborhood) ? neighborhood : []).map((edge) => ({
      role: edge.title || edge.target_family_id,
      edgeType: edge.edge_type || null,
      bridgeCompetency: edge.bridge_competency || null,
    })),
  }
}
