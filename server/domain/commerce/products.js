// P8.4 — the bounded offer as reviewed CONFIGURATION, not approved prices.
// The only amount here is the one already live in the product (routes/payment.js
// PRICE_PAISE = 49900, INR 499). It is carried as a TEST HYPOTHESIS pending
// finance/owner approval; nothing in this file authorises a live price, a
// subscription or a professional-pack quota. The professional preparation
// pack stays UNAVAILABLE until the owner supplies its allowance.
export const PRODUCT_POLICY_VERSION = 'offer-policy.v0.1-proposed'

// Mirrors routes/payment.js PRICE_PAISE (commercial.test.js pins that constant).
export const SPRINT_PRICE_PAISE = 49900
export const PRICE_CURRENCY = 'INR'

const freeze = (o) => Object.freeze(Array.isArray(o) ? o.map(freeze) : (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, freeze(v)])) : o))

export const PRODUCTS = freeze({
  FREE_FIRST_EXPERIENCE: {
    code: 'FREE_FIRST_EXPERIENCE',
    version: '0.1',
    title: 'Free first experience',
    status: 'PROPOSED_FREE_ENTRY',
    purchasable: false,
    price: null,
    currency: null,
    windowDays: null,
    included: { practiceScenes: 1, observations: 1, retries: 1, formalAssessments: 0, missions: 0 },
    limits: ['One short practice scene; not a formal assessment.', 'One observation; no capability map, no report, no credential.'],
    policy: { recovery: 'none', review: 'none', refund: 'not applicable', status: 'PROPOSED' },
  },
  PERSONAL_DEVELOPMENT_SPRINT: {
    code: 'PERSONAL_DEVELOPMENT_SPRINT',
    version: '0.1',
    title: 'Personal development sprint',
    status: 'TEST_HYPOTHESIS_PENDING_APPROVAL',
    purchasable: true,
    price: SPRINT_PRICE_PAISE,
    currency: PRICE_CURRENCY,
    windowDays: 30,
    included: { formalAssessments: 1, missionsSelectable: 4, attemptsPerMission: 2, freshChallenges: 1, practiceScenes: 0 },
    limits: [
      'Four missions chosen from the reviewed library; the whole library is not included.',
      'Formal reassessment is not included until comparable forms are approved.',
      'Results from draft content are provisional.',
    ],
    policy: { recovery: 'technical failure releases the attempt', review: 'request a human review of a published report', refund: 'pending approval', status: 'PROPOSED' },
  },
  PROFESSIONAL_PREPARATION_PACK: {
    code: 'PROFESSIONAL_PREPARATION_PACK',
    version: '0.1',
    title: 'Professional preparation pack',
    status: 'UNAVAILABLE_PENDING_OWNER_QUOTA',
    purchasable: false,
    price: null,
    currency: null,
    windowDays: null,
    included: null,
    limits: ['Not yet available: the allowance must be defined by the owner before sale.'],
    policy: { recovery: null, review: null, refund: null, status: 'PROPOSED' },
  },
})

export const PRODUCT_CODES = Object.freeze(Object.keys(PRODUCTS))
export const FUNDING_SOURCES = Object.freeze(['PAID', 'SPONSORED', 'DEV', 'INVITE'])

export function productFor(code) {
  return PRODUCTS[code] || null
}

// Configured purchasability only (the product row says it MAY be sold).
export function isPurchasable(code) {
  const p = productFor(code)
  return Boolean(p && p.purchasable && typeof p.price === 'number' && p.price > 0)
}

// Mission states that count as reviewed content for a sold bundle.
export const REVIEWED_MISSION_STATES = Object.freeze(['PUBLISHED', 'APPROVED_FOR_PILOT', 'APPROVED_FOR_INTENDED_USE'])
export const REVIEWED_FORM_STATES = Object.freeze(['APPROVED_FOR_PILOT', 'APPROVED_FOR_INTENDED_USE'])
export const PRICE_APPROVAL_FLAG = 'PRISM_OFFER_PRICE_APPROVED'
export const TAX_PENDING_LABEL = 'Tax: as configured by finance \u2014 not yet approved'

// P8.6 — a bundle is purchasable only when everything it promises exists in
// reviewed form AND finance has approved the price. Each failed gate is a
// named blocker the checkout shows instead of taking payment for a package
// whose only next step would be "not yet available".
//   missions: [{ status }]            the mission library (latest versions)
//   formStates: ['DRAFT', ...]        states of the universal forms the formal baseline uses
//   priceApproved: boolean            PRISM_OFFER_PRICE_APPROVED === 'true'
export function offerAvailability(code, { missions = [], formStates = [], priceApproved = process.env[PRICE_APPROVAL_FLAG] === 'true' } = {}) {
  const p = productFor(code)
  if (!p) return null
  if (!p.purchasable) {
    return { purchasable: false, priceStatus: 'NOT_FOR_SALE', blockers: [{ code: 'NOT_FOR_SALE', message: p.limits?.[0] || 'Not for sale.' }], reviewedMissions: null, requiredMissions: null, formReviewed: null }
  }
  const required = p.included?.missionsSelectable ?? 0
  const reviewed = missions.filter((m) => REVIEWED_MISSION_STATES.includes(m?.status)).length
  const formReviewed = p.included?.formalAssessments ? formStates.some((s) => REVIEWED_FORM_STATES.includes(s)) : true
  const blockers = []
  if (!priceApproved) blockers.push({ code: 'PRICE_NOT_APPROVED', message: 'The price is a test hypothesis pending finance approval.' })
  if (reviewed < required) blockers.push({ code: 'CONTENT_NOT_REVIEWED', message: `Only ${reviewed} of the ${required} included missions have reviewed content; the rest are draft.` })
  if (!formReviewed) blockers.push({ code: 'FORM_NOT_REVIEWED', message: 'The formal assessment form is not yet approved for use.' })
  return { purchasable: blockers.length === 0, priceStatus: priceApproved ? 'APPROVED' : 'PROPOSED', blockers, reviewedMissions: reviewed, requiredMissions: required, formReviewed }
}

// The public shape the checkout and the landing offer table read. Tax
// treatment is finance-configured (PRISM_TAX_TREATMENT); null means
// "to be confirmed" — never a baked-in rate. `availability` carries the
// honest reasons a configured product still cannot be bought.
export function offerView(code, { taxTreatment = process.env.PRISM_TAX_TREATMENT || null, availability = null } = {}) {
  const p = productFor(code)
  if (!p) return null
  const avail = availability || offerAvailability(code)
  const tax = p.purchasable && typeof taxTreatment === 'string' && taxTreatment.trim() ? taxTreatment.trim().slice(0, 200) : null
  return {
    code: p.code,
    version: p.version,
    title: p.title,
    status: p.status,
    purchasable: isPurchasable(p.code) && Boolean(avail?.purchasable),
    priceStatus: avail?.priceStatus || 'NOT_FOR_SALE',
    availability: avail,
    amount: p.price,
    currency: p.currency,
    taxTreatment: tax,
    taxLabel: p.purchasable ? (tax || TAX_PENDING_LABEL) : null,
    testMode: true,
    windowDays: p.windowDays,
    included: p.included,
    limits: p.limits,
    policy: p.policy,
    policyVersion: PRODUCT_POLICY_VERSION,
  }
}
