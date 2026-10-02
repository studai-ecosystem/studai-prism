// Student Report V3 builder (spec §14, §33.3; C6.01). Pure: the same inputs
// always give the same report. Every capability status comes from the
// sufficiency engine over the session's stored evidence units; every sentence
// shown is a validated claim (real evidence ids, verbatim quotes only) or a
// statement of absence. No composite, no score, no percentile, no ranking and
// no numeric level: levels are governed labels (PROVISIONAL, HA-C002).
import { createHash } from 'node:crypto'
import { evaluateProfile } from '../../evidence/sufficiency.js'
import { SUFFICIENCY_RULES_VERSION } from '../../evidence/sufficiencyRules.js'
import { LEVEL_LABELS_STATUS } from '../../evidence/levels.js'
import { buildClaim, validateClaims, verifiedQuote } from '../claims.js'
import { CATALOG_VERSION, PRIMARY_CAPABILITY_IDS, capabilityInfo } from '../../assessments/catalog.js'

export const REPORT_V3_BUILDER_VERSION = 'student-report.v3.1'
export const DISCLOSURE_LEVELS = Object.freeze(['SUMMARY', 'FULL'])
export const MAX_PRIORITIES = 3
export const MAX_MOMENTS = 3
const MAX_EVIDENCE_PER_CAPABILITY = 3
const ADMISSIBLE = new Set(['PROVISIONAL', 'SUFFICIENT'])
const GROWTH_BANDS = new Set(['EARLY', 'DEVELOPING'])
const BAND_ORDER = { EARLY: 0, DEVELOPING: 1, DEMONSTRATED: 2, STRONG: 3 }
const CONTEXT_MAX_CHARS = 220

// The stimulus a learner actually saw for an opportunity (0044 ledger), as a
// short plain line. Never the learner's words, never a rubric. Null when the
// ledger has no presented stimulus for it.
function opportunityContext(opportunity) {
  const messages = opportunity?.stimulus?.messages
  if (!Array.isArray(messages)) return null
  const m = [...messages].reverse().find((x) => x && typeof x.content === 'string' && x.content.trim() && x.actorKind !== 'SYSTEM') || messages.find((x) => typeof x?.content === 'string' && x.content.trim())
  if (!m) return null
  const text = m.content.replace(/\s+/g, ' ').trim()
  const short = text.length > CONTEXT_MAX_CHARS ? `${text.slice(0, CONTEXT_MAX_CHARS - 1).trimEnd()}…` : text
  return m.speaker ? `${m.speaker}${m.role ? ` (${m.role})` : ''}: ${short}` : short
}

function sentence(text) {
  const t = String(text || '').trim()
  return /[.!?]$/.test(t) ? t : `${t}.`
}

// Why a capability has no description, in plain words (never a number).
function absenceText(decision, title) {
  if (decision?.status === 'HUMAN_REVIEW_REQUIRED') return 'A person is reviewing the evidence for this before it is described.'
  if (!decision || decision.reasons?.includes('NO_EVIDENCE')) return `No evidence for this was recorded in ${title}, so it is not described.`
  return `There was not enough evidence in ${title} to describe this.`
}

function provenanceOf(unit) {
  const p = unit.provenance_json || {}
  return {
    evidenceId: unit.evidence_id,
    source: unit.source_artifact_id ? 'WORK_MATERIAL' : 'CONVERSATION',
    turn: Number.isInteger(unit.source_turn) ? unit.source_turn : null,
    artifactId: unit.source_artifact_id || null,
    rubricVersion: typeof p.rubric_version === 'string' ? p.rubric_version : null,
    reviewedBy: p.human_reviewed ? 'AI_AND_HUMAN' : 'AI',
    legacy: Boolean(unit.legacy_row),
  }
}

/**
 * @param input.sessionId, input.definition (catalog definition), input.formId
 * @param input.units      stored evidence units of THIS session
 * @param input.turns      verbatim candidate turns of THIS session
 * @param input.header     { candidateName, assessmentTitle, scenarioTitle, completedAt, sponsorName, scope, verification }
 * @param input.disclosure 'FULL' | 'SUMMARY' (share links may restrict)
 * @param input.opportunities opportunity ledger rows of THIS session (context for moments; optional)
 */
export function buildStudentReportV3({ sessionId, definition = null, formId = null, units = [], turns = [], header = {}, disclosure = 'FULL', opportunities = [] }) {
  if (!DISCLOSURE_LEVELS.includes(disclosure)) throw new Error(`Unknown disclosure level: ${disclosure}`)
  const title = header.assessmentTitle || definition?.title || 'your assessment'
  const capabilityIds = definition?.measures?.length ? definition.measures : PRIMARY_CAPABILITY_IDS
  // Only this session's units are ever considered (a stray row cannot count).
  const ownUnits = units.filter((u) => u.session_id === sessionId)
  const decisions = evaluateProfile(ownUnits, { capabilityIds })
  const index = new Map(ownUnits.filter((u) => ADMISSIBLE.has(u.evidence_status)).map((u) => [u.evidence_id, u]))

  // 1. Draft every claim, then let the registry gate decide what is shown.
  const drafts = []
  const perCapability = []
  for (const capId of capabilityIds) {
    const cap = capabilityInfo(capId)
    if (!cap) continue
    const decision = decisions[capId] || null
    const admissible = Boolean(decision && ADMISSIBLE.has(decision.status) && decision.level)
    const entry = { cap, decision, admissible, levelClaim: null, observations: [], development: null }
    if (admissible) {
      const eligible = decision.unitIds.map((id) => index.get(id)).filter(Boolean)
      const lead = eligible.find((u) => typeof u.observable_behavior === 'string' && u.observable_behavior.trim())
      const moments = decision.opportunities
      entry.levelClaim = buildClaim({
        claimType: 'CAPABILITY_LEVEL',
        capabilityId: capId,
        text: lead ? lead.observable_behavior.trim() : `Observed in ${moments} separate ${moments === 1 ? 'moment' : 'moments'} of ${title}.`,
        evidenceIds: decision.unitIds,
        status: decision.status === 'SUFFICIENT' ? 'SUPPORTED' : 'PROVISIONAL',
      })
      drafts.push(entry.levelClaim)
      for (const u of eligible.filter((x) => x.observable_behavior).slice(0, MAX_EVIDENCE_PER_CAPABILITY)) {
        const claim = buildClaim({
          claimType: 'OBSERVED_BEHAVIOR',
          capabilityId: capId,
          text: u.observable_behavior.trim(),
          evidenceIds: [u.evidence_id],
          status: u.evidence_status === 'SUFFICIENT' ? 'SUPPORTED' : 'PROVISIONAL',
          quote: verifiedQuote(u, turns),
        })
        drafts.push(claim)
        entry.observations.push({ claim, unit: u })
      }
      if (GROWTH_BANDS.has(decision.level.band)) {
        entry.development = buildClaim({
          claimType: 'DEVELOPMENT_NEED',
          capabilityId: capId,
          text: `${cap.name} is an area to build on: the evidence in ${title} placed it at ${decision.level.label}.`,
          evidenceIds: decision.unitIds,
          status: decision.status === 'SUFFICIENT' ? 'SUPPORTED' : 'PROVISIONAL',
        })
        drafts.push(entry.development)
      }
    } else {
      entry.levelClaim = buildClaim({ claimType: 'INSUFFICIENT', capabilityId: capId, text: absenceText(decision, title), status: 'INSUFFICIENT' })
      drafts.push(entry.levelClaim)
    }
    perCapability.push(entry)
  }
  const { accepted } = validateClaims(drafts, index, { turns })
  const ok = new Set(accepted.map((c) => c.claim_id))

  // 2. Capability cards (Summary). An unverifiable level claim is shown as
  // "could not be verified", never as a level.
  const capabilities = perCapability.map(({ cap, decision, admissible, levelClaim }) => {
    const shown = admissible && ok.has(levelClaim.claim_id)
    // The rubric description of the DECIDED level (median of the evidence),
    // never of whichever unit happens to sort first.
    const decidedRubric = shown ? Math.round(Number(decision.level.rubricMedian)) : null
    const anchor = shown && Number.isFinite(decidedRubric) ? cap.anchors?.[decidedRubric] : null
    return {
      id: cap.id,
      name: cap.name,
      displayLabel: cap.displayLabel || null,
      definition: cap.description || null,
      layer: cap.layer,
      status: shown ? decision.status : (decision?.status === 'HUMAN_REVIEW_REQUIRED' ? 'HUMAN_REVIEW_REQUIRED' : 'INSUFFICIENT_EVIDENCE'),
      statusReasons: shown ? decision.reasons : (admissible ? ['CLAIM_NOT_VERIFIED'] : decision?.reasons || ['NO_EVIDENCE']),
      level: shown ? { band: decision.level.band, label: decision.level.label } : null,
      levelDescriptor: anchor?.criteria || null,
      summary: shown
        ? { claimId: levelClaim.claim_id, text: levelClaim.text, status: levelClaim.status, evidenceIds: levelClaim.evidence_ids }
        : { claimId: null, text: admissible ? 'The evidence for this could not be verified, so no level is shown.' : levelClaim.text, status: 'INSUFFICIENT', evidenceIds: [] },
    }
  })

  // 3. Evidence (claim → context → action/quote → anchor → sufficiency → provenance).
  const evidence = []
  for (const { cap, decision, observations } of perCapability) {
    for (const { claim, unit } of observations) {
      if (!ok.has(claim.claim_id)) continue
      const anchor = Number.isFinite(unit.rubric_level) ? cap.anchors?.[Math.round(unit.rubric_level)] : null
      evidence.push({
        id: unit.evidence_id,
        kind: 'FORMAL',
        claimId: claim.claim_id,
        claim: claim.text,
        claimStatus: claim.status,
        capability: { id: cap.id, name: cap.name },
        assessmentTitle: header.scenarioTitle || title,
        candidateAction: { quote: claim.quote, turn: Number.isInteger(unit.source_turn) ? unit.source_turn : null, artifactId: unit.source_artifact_id || null },
        observedBehavior: claim.text,
        rubricAnchor: anchor?.criteria ? { criteria: anchor.criteria } : null,
        evidenceStatus: unit.evidence_status,
        sufficiency: { status: decision.status, reasons: decision.reasons, unitCount: decision.unitIds.length, opportunities: decision.opportunities },
        provenance: provenanceOf(unit),
      })
    }
  }

  // 4. Development plan: at most three evidence-backed priorities. Missions,
  // practice time and reassessment windows arrive with Development V2 /
  // reassessment (Phases 8–9); until then they are explicitly not available.
  const priorities = perCapability
    .filter((e) => e.development && ok.has(e.development.claim_id) && ok.has(e.levelClaim.claim_id))
    .sort((a, b) => BAND_ORDER[a.decision.level.band] - BAND_ORDER[b.decision.level.band] || a.cap.name.localeCompare(b.cap.name))
    .slice(0, MAX_PRIORITIES)
    .map(({ cap, decision, development }) => {
      // The target is at least the first "demonstrated" rubric level, so the
      // next step never describes a still-weak behaviour.
      const next = Math.max(3, Math.min(5, Math.floor(Number(decision.level.rubricMedian) || 0) + 1))
      return {
        capabilityId: cap.id,
        name: cap.name,
        claimId: development.claim_id,
        claim: development.text,
        evidenceIds: development.evidence_ids,
        currentLevel: { band: decision.level.band, label: decision.level.label },
        behaviorToImprove: cap.anchors?.[next]?.criteria || null,
        whyItMatters: cap.description || null,
        recommendedMission: null,
        practiceTime: null,
        reassessmentWindow: null,
        availability: { missions: 'NOT_YET_AVAILABLE', reassessment: 'NOT_YET_AVAILABLE' },
      }
    })

  // 4b. Bounded observations (P2.7): a judged, verified unit whose capability
  // sits below the sufficiency floor. Shown as "one observed moment", never a
  // level, never a deficit. Quote required so the learner sees their own words.
  const boundedObservations = []
  for (const { cap, decision, admissible } of perCapability) {
    if (admissible) continue
    const candidates = ownUnits.filter((u) => u.capability_id === cap.id && u.evidence_status === 'PROVISIONAL' && Number.isInteger(u.rubric_level) && u.observable_behavior)
    for (const u of candidates.slice(0, 1)) {
      const quote = verifiedQuote(u, turns)
      if (!quote) continue
      const anchor = cap.anchors?.[Math.round(u.rubric_level)]
      const next = Math.max(3, Math.min(5, u.rubric_level + 1))
      boundedObservations.push({
        id: u.evidence_id,
        capability: { id: cap.id, name: cap.name },
        observedBehavior: u.observable_behavior.trim(),
        quote,
        source: { turn: Number.isInteger(u.source_turn) ? u.source_turn : null, artifactId: u.source_artifact_id || null, opportunityId: u.provenance_json?.opportunityId || null },
        rubricAnchor: anchor?.criteria ? { criteria: anchor.criteria } : null,
        nextBehavior: cap.anchors?.[next]?.criteria || null,
        limitation: `One moment was observed in ${title}. That is not enough to describe ${cap.name} as a whole; sufficiency reasons: ${(decision?.reasons || ['NO_EVIDENCE']).join(', ')}.`,
        provenance: provenanceOf(u),
      })
    }
  }

  const full = disclosure === 'FULL'

  // 4c. Moments that mattered (P5.5): at most three verified observed units,
  // each with the learner's own verbatim words. Described capabilities first
  // (one per capability, then more), then bounded observations. A paraphrase
  // without a verified quote is never a moment.
  const oppIndex = new Map((opportunities || []).filter((o) => o && o.sessionId === sessionId).map((o) => [o.opportunityId, o]))
  const contextFor = (u) => {
    const oppId = u.provenance_json?.opportunityId || null
    return opportunityContext(oppId ? oppIndex.get(oppId) : null)
      || `${header.scenarioTitle || title}${Number.isInteger(u.source_turn) ? `, exchange ${u.source_turn}` : ''}`
  }
  const momentFrom = (cap, u, quote, { evidenceStatus, basis, next }) => ({
    id: u.evidence_id,
    basis,
    capability: { id: cap.id, name: cap.name, displayLabel: cap.displayLabel || null },
    observedBehavior: u.observable_behavior.trim(),
    quote,
    context: contextFor(u),
    source: { turn: Number.isInteger(u.source_turn) ? u.source_turn : null, artifactId: u.source_artifact_id || null, opportunityId: u.provenance_json?.opportunityId || null },
    rubricAnchor: Number.isFinite(u.rubric_level) && cap.anchors?.[Math.round(u.rubric_level)]?.criteria ? { criteria: cap.anchors[Math.round(u.rubric_level)].criteria } : null,
    nextBehavior: next,
    evidenceStatus,
    provenance: provenanceOf(u),
  })
  const described = perCapability.filter((e) => e.admissible && ok.has(e.levelClaim.claim_id))
  const rounds = []
  for (const e of described) {
    const verified = e.observations.filter(({ claim }) => ok.has(claim.claim_id) && claim.quote)
    verified.forEach(({ claim, unit }, i) => {
      const next = Math.max(3, Math.min(5, Math.floor(Number(e.decision.level.rubricMedian) || 0) + 1))
      rounds[i] ||= []
      rounds[i].push(momentFrom(e.cap, unit, claim.quote, { evidenceStatus: unit.evidence_status, basis: 'DESCRIBED', next: e.cap.anchors?.[next]?.criteria || null }))
    })
  }
  const moments = rounds.flat()
  for (const o of boundedObservations) {
    if (moments.length >= MAX_MOMENTS) break
    const cap = capabilityInfo(o.capability.id)
    const u = ownUnits.find((x) => x.evidence_id === o.id)
    if (cap && u) moments.push(momentFrom(cap, u, o.quote, { evidenceStatus: u.evidence_status, basis: 'BOUNDED', next: o.nextBehavior }))
  }
  moments.splice(MAX_MOMENTS)

  // A short statement bounded to this assessment: one observed behaviour and,
  // where the evidence supports one, one next behaviour. Null when nothing
  // verified supports it — never a generic sentence.
  const lead = moments[0] || null
  const nextPractice = priorities[0]?.behaviorToImprove || lead?.nextBehavior || null
  const plainStatement = lead
    ? `In this assessment you were observed doing this: ${sentence(lead.observedBehavior)}${nextPractice ? ` One thing to practise next: ${sentence(nextPractice)}` : ''}`
    : null

  const shownClaimIds = new Set([
    ...capabilities.map((c) => c.summary.claimId).filter(Boolean),
    ...(full ? evidence.map((e) => e.claimId) : []),
    ...(full ? priorities.map((p) => p.claimId) : []),
  ])
  const claims = accepted.filter((c) => shownClaimIds.has(c.claim_id) || (c.status === 'INSUFFICIENT'))
    .map((c) => ({ ...c, quote: full ? c.quote : null }))

  return {
    builderVersion: REPORT_V3_BUILDER_VERSION,
    sessionId,
    disclosure,
    header: {
      candidateName: header.candidateName || null,
      assessment: { definitionId: definition?.id || null, title, formId },
      scenarioTitle: header.scenarioTitle || null,
      sponsor: header.sponsorName ? { name: header.sponsorName } : null,
      scope: header.scope === 'SPONSORED' ? 'SPONSORED' : 'PERSONAL',
      completedAt: header.completedAt || null,
      verification: {
        identityAssurance: header.verification?.identityAssurance || 'NOT_RECORDED',
        credentialId: full ? header.verification?.credentialId || null : null,
      },
    },
    summary: {
      capabilities,
      describedCount: capabilities.filter((c) => c.level).length,
      insufficientCount: capabilities.filter((c) => !c.level).length,
    },
    plainStatement,
    displayLabels: capabilityIds.map(capabilityInfo).filter(Boolean).map((c) => ({ id: c.id, name: c.name, displayLabel: c.displayLabel || null })),
    evidence: full ? evidence : [],
    boundedObservations: full ? boundedObservations : [],
    // Moments carry verbatim quotes, so a summary disclosure never has them.
    moments: full ? moments : [],
    development: full ? { priorities, maxPriorities: MAX_PRIORITIES } : null,
    methodology: {
      builderVersion: REPORT_V3_BUILDER_VERSION,
      sufficiencyRulesVersion: SUFFICIENCY_RULES_VERSION,
      levelLabelsStatus: LEVEL_LABELS_STATUS,
      catalogVersion: CATALOG_VERSION,
      assessmentDefinitionId: definition?.id || null,
      formId,
    },
    claims,
  }
}

// Stable hash of the content a version stores (key order independent).
export function reportContentHash(report) {
  const canon = (v) => (Array.isArray(v) ? v.map(canon)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v)
  return createHash('sha256').update(JSON.stringify(canon(report))).digest('hex')
}
