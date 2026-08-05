// Phase 5 — commercial readiness invariants (charter §22/§23/§25/§18).
//
// HONESTY LAWS under test:
//   • unknown costs are UNKNOWN, never zero (§23);
//   • margins refuse to compute from unknown or cross-currency inputs (§23);
//   • provisional prices exist ONLY in the internal pricing package —
//     never in client code, public copy, or the invite plan schema (§22/HA-015);
//   • §25 documents exist and carry their draft/pending labels;
//   • the erasure cascade covers the new cost-telemetry table (lockstep).

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { estimateCost, rateFor } from '../services/ai/costTracker.js'
import { COST_CATEGORIES, UNKNOWN, known, sumKnown, computeMargin, fxRate } from '../lib/margin.js'
import { sanitizePlan } from '../lib/invites.js'
import { TELEMETRY_CASCADE } from '../lib/privacyPlanner.js'
import { PERMISSIONS, ROLES } from '../lib/adminRbac.js'

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = join(SERVER_ROOT, '..')

// ── §23: UNKNOWN is never zero ───────────────────────────────────────────────

test('§23: a model without a configured rate produces null cost, not zero', () => {
  assert.equal(rateFor('some.unpriced-model-v9'), null)
  assert.equal(estimateCost('some.unpriced-model-v9', { inputTokens: 1000, outputTokens: 500 }), null)
})

test('§23: sums over any unknown component are partial, never silently zero', () => {
  assert.deepEqual(sumKnown([], 'USD'), UNKNOWN)
  assert.deepEqual(sumKnown([null], 'USD'), UNKNOWN)
  const partial = sumKnown([0.5, null, 0.25], 'USD')
  assert.equal(partial.status, 'partial')
  assert.equal(partial.amount, 0.75)
  const clean = sumKnown([0.5, 0.25], 'USD')
  assert.equal(clean.status, 'known')
  assert.equal(clean.amount, 0.75)
})

test('§23: margin is UNKNOWN without full inputs and an explicit FX rate', () => {
  const env = {} // no MARGIN_FX_INR_PER_USD
  // Unknown revenue → unknown margin.
  assert.equal(computeMargin({ revenueInr: UNKNOWN, costUsd: known(1, 'USD'), env }).status, 'unknown')
  // Partial cost → unknown margin (never computed from partial knowledge).
  assert.equal(computeMargin({
    revenueInr: known(499, 'INR'),
    costUsd: { status: 'partial', amount: 0.3, currency: 'USD' },
    env,
  }).status, 'unknown')
  // Fully known both sides but NO FX rate → still unknown (no fabricated conversion).
  const noFx = computeMargin({ revenueInr: known(499, 'INR'), costUsd: known(0.34, 'USD'), env })
  assert.equal(noFx.status, 'unknown')
  assert.match(noFx.reason, /FX/)
  // With an explicit operator-configured rate it computes and says what it is.
  const withFx = computeMargin({
    revenueInr: known(499, 'INR'), costUsd: known(0.34, 'USD'),
    env: { MARGIN_FX_INR_PER_USD: '84' },
  })
  assert.equal(withFx.status, 'known')
  assert.equal(withFx.amount, +(499 - 0.34 * 84).toFixed(2))
  assert.match(withFx.note, /KNOWN costs only/)
})

test('§23: fx rate refuses junk configuration', () => {
  assert.equal(fxRate({}), null)
  assert.equal(fxRate({ MARGIN_FX_INR_PER_USD: '0' }), null)
  assert.equal(fxRate({ MARGIN_FX_INR_PER_USD: 'abc' }), null)
  assert.equal(fxRate({ MARGIN_FX_INR_PER_USD: '-5' }), null)
  assert.equal(fxRate({ MARGIN_FX_INR_PER_USD: '84.5' }), 84.5)
})

test('§23: every charter cost category exists in the registry, uninstrumented ones included', () => {
  const keys = COST_CATEGORIES.map((c) => c.key)
  for (const required of ['conversation_model', 'judge_panel', 'micro_rater', 'stt', 'tts',
    'infrastructure', 'payment_gateway_fee', 'email_pdf', 'human_review', 'support', 'refunds']) {
    assert.ok(keys.includes(required), `missing §23 category ${required}`)
  }
  // Not-instrumented categories must be present so dashboards SHOW them as unknown.
  assert.ok(COST_CATEGORIES.some((c) => !c.instrumented),
    'uninstrumented categories must remain visible, not omitted')
})

test('§23: cost telemetry joins the erasure cascade (lockstep list)', () => {
  assert.ok(TELEMETRY_CASCADE.some(([table, col]) => table === 'ai_usage_events' && col === 'session_id'),
    'ai_usage_events must be erased with the session')
})

test('§23: margin plane is permission-gated and mounted', async () => {
  assert.ok(PERMISSIONS['margin:read'], 'margin:read permission must exist')
  assert.ok(ROLES.finance_admin.permissions.includes('margin:read'), 'finance role reads margin')
  const source = await readFile(join(SERVER_ROOT, 'routes', 'admin', 'margin.js'), 'utf-8')
  for (const route of ['/summary', '/cohorts', '/export']) {
    assert.ok(source.includes(`'${route}'`) || source.includes(`'${route}.csv'`), `route ${route} present`)
  }
  assert.ok(!source.includes('requirePermission(') === false, 'permission middleware used')
  const index = await readFile(join(SERVER_ROOT, 'routes', 'admin', 'index.js'), 'utf-8')
  assert.ok(index.includes(`router.use('/margin', marginRouter)`), 'margin router mounted')
})

test('§23: no profitability language on the margin surfaces', async () => {
  const files = [
    join(SERVER_ROOT, 'lib', 'margin.js'),
    join(SERVER_ROOT, 'routes', 'admin', 'margin.js'),
    join(REPO_ROOT, 'src', 'pages', 'admin', 'AdminMargin.jsx'),
  ]
  for (const file of files) {
    const content = (await readFile(file, 'utf-8')).toLowerCase()
    assert.ok(!/\bprofitable\b|\bprofitability (proven|achieved|demonstrated)\b/.test(content),
      `${file} must not claim profitability`)
  }
})

// ── §22: cohort plan metadata is price-free and validated ────────────────────

test('§22: sanitizePlan validates and defaults the review allowance to 5%', () => {
  assert.equal(sanitizePlan(null), null)
  const plan = sanitizePlan({ cohortPlanned: 100, term: '2026-27 odd' })
  assert.equal(plan.cohortPlanned, 100)
  assert.equal(plan.reviewAllowancePct, 5) // charter indicative default
  assert.equal(plan.term, '2026-27 odd')
  assert.throws(() => sanitizePlan({ cohortPlanned: 0 }), /INVALID_PLAN|integer/)
  assert.throws(() => sanitizePlan({ reviewAllowancePct: 101 }), /between 0 and 100/)
  assert.throws(() => sanitizePlan('not-an-object'), /object/)
})

test('§22: the plan schema structurally rejects price fields (HA-015)', () => {
  for (const priceKey of ['price', 'pricePerAssessment', 'setupFee', 'amount', 'inr', 'rate']) {
    assert.throws(() => sanitizePlan({ [priceKey]: 400 }), /not a recognised plan field/,
      `plan.${priceKey} must be rejected — prices never enter the database`)
  }
})

test('§22: indicative prices exist ONLY in the internal pricing package, never in client code', async () => {
  // The charter's indicative figures must not leak to any public surface.
  const banned = /75,?000|1,?50,?000|₹\s?349|₹\s?399/
  async function scanDir(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) { await scanDir(path); continue }
      if (!/\.(jsx?|json|html|css)$/.test(entry.name)) continue
      const content = await readFile(path, 'utf-8')
      assert.ok(!banned.test(content), `${path} leaks provisional B2B pricing`)
    }
  }
  await scanDir(join(REPO_ROOT, 'src'))
  // Server-side candidate copy too.
  const mailer = await readFile(join(SERVER_ROOT, 'lib', 'mailer.js'), 'utf-8')
  assert.ok(!banned.test(mailer))
})

test('§22: ₹499 B2C stays voluntary-individual; invites stay free for candidates', async () => {
  const payment = await readFile(join(SERVER_ROOT, 'routes', 'payment.js'), 'utf-8')
  assert.match(payment, /PRICE_PAISE\s*=\s*49900/, 'B2C price constant intact')
  const invites = await readFile(join(SERVER_ROOT, 'lib', 'invites.js'), 'utf-8')
  assert.match(invites, /mode:\s*'invite',\s*amount:\s*0/, 'invite entitlements are ₹0 to the candidate')
})

// ── §25: documentation set present with honest labels ────────────────────────

const DOCS = join(REPO_ROOT, 'docs')
const REQUIRED_DOCS = [
  ['PILOT_INTENDED_USE_v1.md', /DRAFT/],
  ['CONSTRUCT_DEFINITIONS_v1.md', /PROVISIONAL/],
  ['INTERPRETATION_GUIDE_v1.md', /DRAFT/],
  ['CLAIMS_EVIDENCE_REGISTER_v1.md', /PENDING/],
  ['PROHIBITED_USES_POLICY_v1.md', /DRAFT/],
  ['ALTERNATE_ADMINISTRATION_GUIDE_v1.md', /DRAFT/],
  ['AGE_GATING_POLICY_v1.md', /HA-006/],
  ['IDENTITY_ASSURANCE_SPEC_v1.md', /HA-007/],
  ['BUYER_ACCESS_SPEC_v1.md', /candidate-authorized/i],
  ['APPEALS_SUPERSESSION_POLICY_v1.md', /not a\s+guaranteed legal SLA/],
  ['ECOSYSTEM_SEPARATION_POLICY_v1.md', /DRAFT/],
  ['DOCUMENTATION_INDEX_v1.md', /§25/],
  ['commercial/PILOT_PRICING_PACKAGE_v1.md', /PROVISIONAL — NOT APPROVED, NOT PUBLISHED/],
  ['commercial/QUOTE_PROPOSAL_TEMPLATE_v1.md', /HA-015/],
  ['commercial/PILOT_TERMS_DRAFT_v1.md', /pending legal review/i],
  ['commercial/DESIGN_PARTNER_PROGRAMME_v1.md', /human-gated/],
  ['commercial/CONTRIBUTION_MARGIN_METHODOLOGY_v1.md', /UNKNOWN is never zero/],
  ['commercial/PILOT_TECHNICAL_REPORT_TEMPLATE_v1.md', /never estimates/],
]

test('§25: every required document exists and carries its status label', async () => {
  for (const [file, label] of REQUIRED_DOCS) {
    const content = await readFile(join(DOCS, file), 'utf-8')
    assert.match(content, label, `${file} must carry its draft/status label`)
  }
})

test('§25: the documentation index maps every charter item to a real file', async () => {
  const index = await readFile(join(DOCS, 'DOCUMENTATION_INDEX_v1.md'), 'utf-8')
  const links = [...index.matchAll(/\]\(\.\/([^)]+\.md)\)/g)].map((m) => m[1])
  assert.ok(links.length >= 20, 'index links the full documentation set')
  for (const rel of links) {
    await readFile(join(DOCS, rel), 'utf-8').catch(() => {
      assert.fail(`DOCUMENTATION_INDEX links a missing file: ${rel}`)
    })
  }
})

// ── §18: separation policy names the required rules ──────────────────────────

test('§18: separation policy covers every charter requirement', async () => {
  const policy = (await readFile(join(DOCS, 'ECOSYSTEM_SEPARATION_POLICY_v1.md'), 'utf-8')).replace(/\s+/g, ' ')
  for (const required of [
    'access-restricted', 'may not train', 'anchor-probe wording',
    'guaranteed Prism-score improvement', 'external advisory',
    'item_bank_accessed', 'prompt_content_accessed',
  ]) {
    assert.ok(policy.includes(required), `separation policy must state: ${required}`)
  }
})

test('§18: no Prism report surface cross-sells StudAI training products', async () => {
  // Report + verify + mailer must not recommend Loop/Career as a remedy.
  const surfaces = [
    join(REPO_ROOT, 'src', 'pages', 'ScoreReport.jsx'),
    join(REPO_ROOT, 'src', 'pages', 'Verify.jsx'),
    join(SERVER_ROOT, 'lib', 'mailer.js'),
  ]
  for (const file of surfaces) {
    const content = await readFile(file, 'utf-8')
    assert.ok(!/StudAI (Loop|Career)/i.test(content),
      `${file} must not bundle StudAI learning products as a remedy (§18)`)
  }
})
