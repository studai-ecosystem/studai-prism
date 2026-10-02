// P9.2 metric definitions v1 — stored BEFORE any pilot result is analysed.
//
// Every definition states its numerator, denominator and exclusions in prose
// and is frozen. The compute functions below are pure: arrays in, a result
// envelope out. They never redefine a denominator; a caller that wants a
// different population must write and version a new definition.
//
// Synthetic exclusion (applied by every compute): rows flagged is_synthetic /
// isSynthetic, preview attempts marked synthetic, and DEV-funded grants are
// removed from both numerator and denominator and reported under `excluded`.
import { canonicalEventName } from './events.js'

export const METRIC_DEFINITIONS_VERSION = 'v1'

const def = (o) => Object.freeze(o)

export const METRIC_DEFINITIONS = Object.freeze({
  saved_action_reliability: def({
    id: 'saved_action_reliability', version: METRIC_DEFINITIONS_VERSION, view: 'OPERATIONAL',
    numerator: 'Acknowledged candidate actions whose payload is recoverable from the durable store (row present with the acknowledged payload hash).',
    denominator: 'Candidate actions for which the server returned an acknowledgement (ACCEPTED, APPLIED or FAILED state).',
    exclusions: ['synthetic sessions', 'DEV-funded runs', 'actions never acknowledged (client-side only)'],
    notes: 'A FAILED action is still acknowledged and recoverable; this metric measures durability, not evaluation success.',
  }),
  required_opportunity_delivery: def({
    id: 'required_opportunity_delivery', version: METRIC_DEFINITIONS_VERSION, view: 'MEASUREMENT',
    numerator: 'Required, eligible opportunities with a recorded presentation (PRESENTED, ACTION_RECEIVED, EVALUATION_PENDING or EVALUATED).',
    denominator: 'Required, eligible opportunities scheduled for the run.',
    exclusions: ['synthetic runs', 'optional opportunities', 'opportunities made ineligible by an approved accommodation'],
    notes: 'Interrupted runs (early finish, timer expiry) are reported separately and are not removed from the denominator.',
  }),
  technical_empty_report_rate: def({
    id: 'technical_empty_report_rate', version: METRIC_DEFINITIONS_VERSION, view: 'OPERATIONAL',
    numerator: 'Submitted eligible runs with no usable output because of a technical fault (evaluation job FAILED with TECHNICAL_FAILURE, missing publication).',
    denominator: 'Submitted eligible runs (a FINISH action was accepted).',
    exclusions: ['synthetic runs', 'runs not yet submitted'],
    notes: 'Genuinely limited evidence (INSUFFICIENT_EVIDENCE units with a reason) is NOT a technical empty report and is reported separately.',
  }),
  evidence_yield: def({
    id: 'evidence_yield', version: METRIC_DEFINITIONS_VERSION, view: 'MEASUREMENT',
    numerator: 'Applicable capability decisions that meet the governed sufficiency rule for their method.',
    denominator: 'Applicable capability decisions (an opportunity was delivered and a decision was attempted).',
    exclusions: ['synthetic runs', 'decisions on undelivered opportunities'],
    notes: 'Segmented by method. This is a yield of the instrument, never a learner competence score. Thresholds are fixed by the governed rule and cannot be tuned here.',
  }),
  comprehension: def({
    id: 'comprehension', version: METRIC_DEFINITIONS_VERSION, view: 'CUSTOMER',
    numerator: 'Tested users who correctly explained one bounded finding AND one next behaviour from their own report without coaching.',
    denominator: 'Users who completed the comprehension task.',
    exclusions: ['synthetic accounts', 'sessions where the facilitator coached before the answer', 'researcher or staff accounts'],
    notes: 'Recorded by a researcher under RESEARCH_PROTOCOLS.md; never inferred from clicks.',
  }),
  voluntary_practice_activation: def({
    id: 'voluntary_practice_activation', version: METRIC_DEFINITIONS_VERSION, view: 'CUSTOMER',
    numerator: 'Distinct actors who started a practice mission voluntarily after viewing a relevant AVAILABLE recommendation.',
    denominator: 'Distinct actors who viewed a relevant AVAILABLE recommendation under a VOLUNTARY channel.',
    exclusions: ['synthetic accounts', 'COMPULSORY channel (assignment, faculty requirement)', 'UNAVAILABLE recommendations', 'UNKNOWN channel'],
    notes: 'Compulsory starts are counted separately and never merged into the voluntary rate.',
  }),
  seven_day_return: def({
    id: 'seven_day_return', version: METRIC_DEFINITIONS_VERSION, view: 'CUSTOMER',
    numerator: 'Cohort actors with at least one voluntary return visit between 1 and 7 days after their first qualifying session.',
    denominator: 'Actors whose first qualifying session is at least 7 days old at the analysis time (mature cohort).',
    exclusions: ['synthetic accounts', 'immature cohort (first session younger than 7 days)'],
    notes: 'Returns following a reminder or an incentive are counted but reported separately so they can be subtracted.',
  }),
  paid_conversion: def({
    id: 'paid_conversion', version: METRIC_DEFINITIONS_VERSION, view: 'CUSTOMER',
    numerator: 'Distinct actors with a provider-verified, non-refunded purchase.',
    denominator: 'Distinct actors who viewed an eligible package offer.',
    exclusions: ['synthetic accounts', 'DEV and INVITE funding', 'refunded purchases (reported separately)'],
    notes: 'Compulsory (sponsored) and voluntary channels are computed separately and never summed into one rate.',
  }),
  transfer: def({
    id: 'transfer', version: METRIC_DEFINITIONS_VERSION, view: 'CUSTOMER',
    numerator: 'Independently rated performance on an unfamiliar task under the Study D/E protocol.',
    denominator: 'Participants completing the protocol.',
    exclusions: ['any dashboard or product-event heuristic'],
    manualOnly: true,
    notes: 'Not computable from product events. Produced only by the human-validation programme (VALIDATION_PLAN.md).',
  }),
})

export const METRIC_IDS = Object.freeze(Object.keys(METRIC_DEFINITIONS))

// --- synthetic exclusion -------------------------------------------------
export function isSyntheticRow(row) {
  if (!row || typeof row !== 'object') return false
  if (row.isSynthetic === true || row.is_synthetic === true) return true
  if (row.props?.isSynthetic === true) return true
  if (row.preview?.isSynthetic === true || row.preview?.synthetic === true) return true
  const funding = row.fundingSource || row.funding_source || row.props?.fundingSource
  if (funding === 'DEV') return true
  if (row.grant?.fundingSource === 'DEV') return true
  return false
}

function partition(rows) {
  const kept = []
  let synthetic = 0
  for (const r of rows || []) {
    if (isSyntheticRow(r)) synthetic += 1
    else kept.push(r)
  }
  return { kept, synthetic }
}

const ratio = (n, d) => (d > 0 ? Number((n / d).toFixed(4)) : null)

function envelope(id, { numerator, denominator, excluded = {}, segments = null, separate = null }) {
  return {
    metric: id,
    definitionVersion: METRIC_DEFINITIONS_VERSION,
    numerator,
    denominator,
    value: ratio(numerator, denominator),
    excluded,
    ...(segments ? { segments } : {}),
    ...(separate ? { separate } : {}),
  }
}

// --- computations ----------------------------------------------------------
// Row shape: { acknowledged: boolean, recoverable: boolean }
export function savedActionReliability(actions) {
  const { kept, synthetic } = partition(actions)
  const ack = kept.filter((a) => a.acknowledged === true || ['ACCEPTED', 'APPLIED', 'FAILED'].includes(a.state))
  const recoverable = ack.filter((a) => a.recoverable !== false && (a.payloadHash || a.payload_hash || a.recoverable === true))
  return envelope('saved_action_reliability', {
    numerator: recoverable.length, denominator: ack.length,
    excluded: { synthetic, unacknowledged: kept.length - ack.length },
  })
}

const DELIVERED_STATES = new Set(['PRESENTED', 'ACTION_RECEIVED', 'EVALUATION_PENDING', 'EVALUATED'])
// Row shape: { required, eligible, state, interrupted }
export function requiredOpportunityDelivery(opportunities) {
  const { kept, synthetic } = partition(opportunities)
  const scheduled = kept.filter((o) => o.required !== false && o.eligible !== false)
  const delivered = scheduled.filter((o) => DELIVERED_STATES.has(o.state))
  const interrupted = scheduled.filter((o) => o.interrupted === true && !DELIVERED_STATES.has(o.state)).length
  return envelope('required_opportunity_delivery', {
    numerator: delivered.length, denominator: scheduled.length,
    excluded: { synthetic, optional: kept.filter((o) => o.required === false).length, ineligible: kept.filter((o) => o.eligible === false).length },
    separate: { interrupted },
  })
}

// Row shape: { submitted, eligible, technicalFailure, limitedEvidence }
export function technicalEmptyReportRate(runs) {
  const { kept, synthetic } = partition(runs)
  const submitted = kept.filter((r) => r.submitted === true && r.eligible !== false)
  const technical = submitted.filter((r) => r.technicalFailure === true || r.resultState === 'TECHNICAL_FAILURE')
  const limited = submitted.filter((r) => r.limitedEvidence === true && !(r.technicalFailure === true || r.resultState === 'TECHNICAL_FAILURE')).length
  return envelope('technical_empty_report_rate', {
    numerator: technical.length, denominator: submitted.length,
    excluded: { synthetic, notSubmitted: kept.length - submitted.length },
    separate: { genuinelyLimitedEvidence: limited },
  })
}

// Row shape: { applicable, meetsGovernedRule, method }
export function evidenceYield(decisions) {
  const { kept, synthetic } = partition(decisions)
  const applicable = kept.filter((d) => d.applicable !== false)
  const met = applicable.filter((d) => d.meetsGovernedRule === true)
  const segments = {}
  for (const d of applicable) {
    const m = d.method || 'UNSPECIFIED'
    segments[m] ||= { numerator: 0, denominator: 0, value: null }
    segments[m].denominator += 1
    if (d.meetsGovernedRule === true) segments[m].numerator += 1
  }
  for (const s of Object.values(segments)) s.value = ratio(s.numerator, s.denominator)
  return envelope('evidence_yield', {
    numerator: met.length, denominator: applicable.length,
    excluded: { synthetic, notApplicable: kept.length - applicable.length }, segments,
  })
}

// Row shape: { tested, explainedFinding, explainedNextBehaviour, coached }
export function comprehension(sessions) {
  const { kept, synthetic } = partition(sessions)
  const tested = kept.filter((s) => s.tested !== false && s.coached !== true)
  const correct = tested.filter((s) => s.explainedFinding === true && s.explainedNextBehaviour === true)
  return envelope('comprehension', {
    numerator: correct.length, denominator: tested.length,
    excluded: { synthetic, coached: kept.filter((s) => s.coached === true).length },
  })
}

const actorOf = (e) => e.actorHash || e.actor_hash || null
const nameOf = (e) => canonicalEventName(e.event) || e.event
const propsOf = (e) => e.props || {}

// Events: practice_recommended {channel, availability}, practice_started {channel}
export function voluntaryPracticeActivation(events) {
  const { kept, synthetic } = partition(events)
  const viewers = new Set()
  let compulsory = 0
  let unavailable = 0
  let unknown = 0
  for (const e of kept) {
    if (nameOf(e) !== 'practice_recommended') continue
    const p = propsOf(e)
    if (p.availability === 'UNAVAILABLE') { unavailable += 1; continue }
    if (p.channel === 'COMPULSORY') { compulsory += 1; continue }
    if (p.channel !== 'VOLUNTARY') { unknown += 1; continue }
    if (actorOf(e)) viewers.add(actorOf(e))
  }
  const starters = new Set()
  let compulsoryStarts = 0
  for (const e of kept) {
    if (nameOf(e) !== 'practice_started') continue
    const p = propsOf(e)
    if (p.channel === 'COMPULSORY') { compulsoryStarts += 1; continue }
    const a = actorOf(e)
    if (a && viewers.has(a)) starters.add(a)
  }
  return envelope('voluntary_practice_activation', {
    numerator: starters.size, denominator: viewers.size,
    excluded: { synthetic, compulsoryRecommendations: compulsory, unavailable, unknownChannel: unknown },
    separate: { compulsoryStarts },
  })
}

const DAY_MS = 86400000
// Row shape: { actorHash, firstAt, returns: [{ at, reminded, incentivised }] }
export function sevenDayReturn(users, { asOf } = {}) {
  const now = asOf ? new Date(asOf).getTime() : Date.now()
  const { kept, synthetic } = partition(users)
  const mature = kept.filter((u) => u.firstAt && now - new Date(u.firstAt).getTime() >= 7 * DAY_MS)
  let returned = 0
  let afterReminder = 0
  let afterIncentive = 0
  for (const u of mature) {
    const first = new Date(u.firstAt).getTime()
    const hits = (u.returns || []).filter((r) => {
      const t = new Date(r.at).getTime()
      return t - first >= DAY_MS && t - first <= 7 * DAY_MS
    })
    if (!hits.length) continue
    returned += 1
    if (hits.every((r) => r.reminded === true)) afterReminder += 1
    if (hits.every((r) => r.incentivised === true)) afterIncentive += 1
  }
  return envelope('seven_day_return', {
    numerator: returned, denominator: mature.length,
    excluded: { synthetic, immature: kept.length - mature.length },
    separate: { onlyAfterReminder: afterReminder, onlyAfterIncentive: afterIncentive },
  })
}

// Events: package_viewed {channel}, purchase_verified {channel, fundingSource, refunded}
export function paidConversion(events) {
  const { kept, synthetic } = partition(events)
  const byChannel = { VOLUNTARY: { viewers: new Set(), buyers: new Set(), refunded: 0 }, COMPULSORY: { viewers: new Set(), buyers: new Set(), refunded: 0 } }
  let nonPaidFunding = 0
  let unknownChannel = 0
  const chan = (p) => (p.channel === 'COMPULSORY' ? 'COMPULSORY' : p.channel === 'VOLUNTARY' ? 'VOLUNTARY' : null)
  for (const e of kept) {
    const n = nameOf(e)
    const p = propsOf(e)
    const c = chan(p)
    if (n === 'package_viewed') {
      if (!c) { unknownChannel += 1; continue }
      if (actorOf(e)) byChannel[c].viewers.add(actorOf(e))
    } else if (n === 'purchase_verified') {
      if (p.fundingSource && p.fundingSource !== 'PAID') { nonPaidFunding += 1; continue }
      if (!c) { unknownChannel += 1; continue }
      if (p.refunded === true) { byChannel[c].refunded += 1; continue }
      if (actorOf(e)) byChannel[c].buyers.add(actorOf(e))
    }
  }
  const segments = {}
  for (const [c, v] of Object.entries(byChannel)) {
    segments[c] = { numerator: v.buyers.size, denominator: v.viewers.size, value: ratio(v.buyers.size, v.viewers.size), refunded: v.refunded }
  }
  const vol = segments.VOLUNTARY
  return envelope('paid_conversion', {
    numerator: vol.numerator, denominator: vol.denominator,
    excluded: { synthetic, nonPaidFunding, unknownChannel },
    segments,
    separate: { refunded: segments.VOLUNTARY.refunded + segments.COMPULSORY.refunded },
  })
}

export function transfer() {
  return { metric: 'transfer', definitionVersion: METRIC_DEFINITIONS_VERSION, status: 'MANUAL_ONLY', value: null, numerator: null, denominator: null, excluded: {} }
}

export const METRIC_COMPUTE = Object.freeze({
  saved_action_reliability: savedActionReliability,
  required_opportunity_delivery: requiredOpportunityDelivery,
  technical_empty_report_rate: technicalEmptyReportRate,
  evidence_yield: evidenceYield,
  comprehension,
  voluntary_practice_activation: voluntaryPracticeActivation,
  seven_day_return: sevenDayReturn,
  paid_conversion: paidConversion,
  transfer,
})
