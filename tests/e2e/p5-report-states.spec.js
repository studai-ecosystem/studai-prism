// P5.9 report UX state matrix in a real browser (T29-T38, T47, T48, T56).
// READY is the real integrated report: a synthetic learner on the isolated
// campus audit server (4174, throwaway PostgreSQL) obtains a dev entitlement,
// runs the pinned DRAFT universal form through the real API, finishes, the
// in-process evaluation worker publishes Report V3 and the browser shows it.
// Every other state is an API fixture (labelled SYNTHETIC) so the page's
// honest states are inspected without inventing findings in the database.
// Screenshots: audit-results/ui/p5/<state>-<width>.png (chromium only).
// Run: node scripts/run-experience-baseline-tests.mjs p5
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { CAMPUS_BASE_URL, LEGACY_BASE_URL, api, signInSynthetic, expectNoSeriousAxe, expectNoHorizontalOverflow } from './campusHelpers.js'

const DRAFT_FORM = 'draft-core-teamready-a'
const WIDTHS = [1440, 390]
const SHOTS = join('audit-results', 'ui', 'p5')
const SID = 'sess-p5-state-00001'
const CONSENT = { scopes: ['data_processing', 'ai_disclosure', 'ai_scoring_oversight', 'proctoring', 'face_analysis', 'own_work'], consentVersion: 'synthetic-p5-consent' }
// Synthetic learner words (never real learner data).
const MESSAGE = 'Is 24 the confirmed number or only the sign-ups? Two of the tasks still have no owner, so I will assign them before we plan.'

test.skip(process.env.PRISM_AUDIT_DRAFT_CONTENT !== 'true' || !process.env.PRISM_E2E_DATABASE_URL,
  'Needs the p5 runner mode: node scripts/run-experience-baseline-tests.mjs p5 (draft content + throwaway PostgreSQL for the 4174 audit server).')

async function shoot(page, testInfo, name) {
  if (testInfo.project.name !== 'chromium') return
  mkdirSync(SHOTS, { recursive: true })
  const original = page.viewportSize()
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 })
    await page.waitForTimeout(250)
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: join(SHOTS, `${name}-${width}.png`), fullPage: true })
    await expectNoSeriousAxe(page)
  }
  await page.setViewportSize(original)
}

const noPercent = async (page) => expect(await page.evaluate(() => /\d\s*%/.test(document.body.innerText))).toBe(false)

// ── Fixture report (SYNTHETIC; mirrors src/features/reports/reports.test.jsx) ──
const PROVENANCE = { evidenceId: 'e1', source: 'CONVERSATION', turn: 1, artifactId: null, rubricVersion: 'rubric.v1', reviewedBy: 'AI', legacy: false }
const moment = (over = {}) => ({
  id: 'e1', basis: 'DESCRIBED', capability: { id: 'CAP-L1-REASONING', name: 'Reasoning & Decision Quality', displayLabel: 'Making decisions' },
  observedBehavior: 'SYNTHETIC: checked the source of the complaints.', quote: 'check which customers raised the issue',
  context: 'Priya (Coordinating colleague): Before we plan, what do you want to check or ask?',
  source: { turn: 1, artifactId: null, opportunityId: 'OPP-1' }, rubricAnchor: { criteria: 'Identifies the problem source.' },
  nextBehavior: 'Weighs two options before deciding.', evidenceStatus: 'PROVISIONAL', provenance: PROVENANCE, ...over,
})
const CAPS = [
  ['CAP-L1-REASONING', 'Reasoning & Decision Quality', 'Making decisions'],
  ['CAP-L1-COMMUNICATION', 'Communication & Structure', 'Getting your point across'],
  ['CAP-L1-COLLABORATION', 'Collaboration & Navigation', 'Working with people'],
  ['CAP-L1-ADAPTABILITY', 'Adaptability & Learning', 'Responding to change'],
  ['CAP-L1-EXECUTION', 'Execution & Ownership', 'Making things happen'],
]
const insufficientCap = ([id, name, displayLabel]) => ({ id, name, displayLabel, definition: null, layer: 'PRIMARY', status: 'INSUFFICIENT_EVIDENCE', statusReasons: ['BELOW_MINIMUM_EVIDENCE_UNITS'], level: null, levelDescriptor: null, summary: { claimId: null, text: 'There was not enough evidence in SYNTHETIC assessment to describe this.', status: 'INSUFFICIENT', evidenceIds: [] } })
const describedCap = ([id, name, displayLabel]) => ({ id, name, displayLabel, definition: 'SYNTHETIC definition.', layer: 'PRIMARY', status: 'PROVISIONAL', statusReasons: ['RULES_NOT_APPROVED'], level: { band: 'EARLY', label: 'Early evidence' }, levelDescriptor: 'Describes a first step.', summary: { claimId: 'claim-a', text: 'SYNTHETIC: you checked which customers raised the issue first.', status: 'PROVISIONAL', evidenceIds: ['e1', 'e2', 'e3'] } })

function report({ disclosure = 'FULL', described = 1 } = {}) {
  const full = disclosure === 'FULL'
  const capabilities = CAPS.map((c, i) => (i < described ? describedCap(c) : insufficientCap(c)))
  return {
    builderVersion: 'student-report.v3.1', sessionId: SID, disclosure,
    header: { candidateName: 'Synthetic Student', assessment: { definitionId: 'prism-workplace-core', title: 'SYNTHETIC assessment', formId: 'synthetic-form:1' }, scenarioTitle: 'SYNTHETIC scenario', sponsor: null, scope: 'PERSONAL', completedAt: '2026-10-02T10:00:00.000Z', verification: { identityAssurance: 'L1', credentialId: null } },
    summary: { capabilities, describedCount: described, insufficientCount: CAPS.length - described },
    plainStatement: described ? 'In this assessment you were observed doing this: SYNTHETIC: checked the source of the complaints. One thing to practise next: Weighs two options before deciding.' : null,
    displayLabels: CAPS.map(([id, name, displayLabel]) => ({ id, name, displayLabel })),
    moments: full && described ? [moment(), moment({ id: 'e2', observedBehavior: 'SYNTHETIC: compared the figures before choosing.', quote: 'compare the numbers before deciding', context: 'SYNTHETIC scenario, exchange 2', source: { turn: 2, artifactId: null, opportunityId: null }, provenance: { ...PROVENANCE, evidenceId: 'e2', turn: 2 } })] : [],
    evidence: full && described ? [{ id: 'e1', kind: 'FORMAL', claimId: 'claim-e1', claim: 'SYNTHETIC: checked the source of the complaints.', claimStatus: 'PROVISIONAL', capability: { id: 'CAP-L1-REASONING', name: 'Reasoning & Decision Quality' }, assessmentTitle: 'SYNTHETIC scenario', candidateAction: { quote: 'check which customers raised the issue', turn: 1, artifactId: null }, observedBehavior: 'SYNTHETIC: checked the source of the complaints.', rubricAnchor: { criteria: 'Identifies the problem source.' }, evidenceStatus: 'PROVISIONAL', sufficiency: { status: 'PROVISIONAL', reasons: [], unitCount: 3, opportunities: 3 }, provenance: PROVENANCE }] : [],
    boundedObservations: [],
    development: full ? { priorities: described ? [{ capabilityId: 'CAP-L1-REASONING', name: 'Reasoning & Decision Quality', claimId: 'claim-d', claim: 'SYNTHETIC: an area to build on.', evidenceIds: ['e1', 'e2', 'e3'], currentLevel: { band: 'EARLY', label: 'Early evidence' }, behaviorToImprove: 'Weighs two options before deciding.', whyItMatters: 'Decisions hold up better.', recommendedMission: null, practiceTime: null, reassessmentWindow: null, availability: { missions: 'NOT_YET_AVAILABLE', reassessment: 'NOT_YET_AVAILABLE' } }] : [], maxPriorities: 3 } : null,
    methodology: { builderVersion: 'student-report.v3.1', sufficiencyRulesVersion: 'sufficiency-rules.v1-provisional', levelLabelsStatus: 'PROVISIONAL', catalogVersion: 'assessment-catalog.v1', assessmentDefinitionId: 'prism-workplace-core', formId: 'synthetic-form:1' },
    claims: [],
  }
}
const owner = (over = {}) => ({ data: { report: report(over.report), version: { number: 1, createdAt: '2026-10-02T10:05:00.000Z', reason: 'INITIAL', priorVersion: null }, audience: 'OWNER', privacy: { visibility: 'OWNER_ONLY', activeShares: [], canShare: true }, review: { openRequests: 0, pending: false }, recommendations: [], ...over.data } })

async function fixtureReport(page, label, body, status = 200) {
  await signInSynthetic(page, CAMPUS_BASE_URL, `p5-${label}`)
  await page.route(`**/api/v1/assessment-sessions/${SID}/report`, (route) => {
    expect(route.request().method(), 'the browser never publishes or mutates a report').toBe('GET')
    return route.fulfill({ status, json: body })
  })
  await page.route(`**/api/v1/assessment-sessions/${SID}/report/versions`, (route) => route.fulfill({ json: { data: { sessionId: SID, versions: [{ version: 1, builderVersion: 'student-report.v3.1', createdAt: '2026-10-02T10:05:00.000Z', issuedAt: '2026-10-02T10:05:00.000Z', reason: 'INITIAL', priorVersion: null }], reviews: [] } } }))
  await page.goto(`${CAMPUS_BASE_URL}/app/reports/${SID}`)
}

// ── READY: the real integrated report ────────────────────────────────────────
test('P5.9 READY: a real integrated run publishes a source-backed snapshot; the capability detail is bound to it', async ({ page }, testInfo) => {
  test.setTimeout(240_000)
  const learner = await signInSynthetic(page, CAMPUS_BASE_URL, `p5-ready-${testInfo.project.name}`)
  const token = learner.token
  const minted = await api(page, '/api/payment/dev-session', { method: 'POST', token, body: {} })
  expect(minted.status, JSON.stringify(minted.body)).toBe(200)
  const list = await api(page, '/api/v1/me/assessments', { token })
  const card = list.body.data.active.find((c) => c.definitionId === DRAFT_FORM && c.status === 'NOT_STARTED')
  expect(card, 'the dev entitlement is offered the DRAFT universal form').toBeTruthy()
  const started = await api(page, `/api/v1/assessment-assignments/${card.id}/start`, { method: 'POST', token, body: { consent: CONSENT }, headers: { 'Idempotency-Key': `p5-start-${Date.now()}` } })
  expect(started.status, JSON.stringify(started.body)).toBe(201)
  const sid = started.body.data.sessionId
  const begun = await api(page, `/api/v1/assessment-sessions/${sid}/begin`, { method: 'POST', token, body: {}, headers: { 'Idempotency-Key': `p5-begin-${Date.now()}` } })
  expect(begun.status, JSON.stringify(begun.body)).toBe(200)
  const sent = await api(page, `/api/v1/assessment-sessions/${sid}/messages`, { method: 'POST', token, body: { clientEventId: `p5-msg-${Date.now()}`, text: MESSAGE } })
  expect([200, 201]).toContain(sent.status)
  const finished = await api(page, `/api/v1/assessment-sessions/${sid}/finish`, { method: 'POST', token, body: { early: true } })
  expect([200, 202]).toContain(finished.status)

  // The real in-process worker publishes; wait for the published version
  // through the API (never by seeding), then open the page.
  let r = null
  for (let i = 0; i < 60 && !(r && r.status === 200); i += 1) {
    r = await api(page, `/api/v1/assessment-sessions/${sid}/report`, { token })
    if (r.status !== 200) {
      expect(r.body?.error?.code, JSON.stringify(r.body)).toMatch(/^REPORT_NOT_READY$/)
      await page.waitForTimeout(1500)
    }
  }
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  await page.goto(`${CAMPUS_BASE_URL}/app/reports/${sid}`)
  await expect(page.getByTestId('report-header')).toBeVisible({ timeout: 30_000 })
  const data = r.body.data
  expect(data.version.number).toBe(1)
  expect(data.version.reason).toBe('INITIAL')
  expect(data.review.pending).toBe(false)
  expect(Array.isArray(data.recommendations)).toBe(true)
  for (const o of [...(data.report.boundedObservations || []), ...(data.report.moments || [])]) expect(MESSAGE.includes(o.quote), 'every quote is the learner\'s own words').toBe(true)
  for (const cap of data.report.summary.capabilities) expect(cap.level, 'a small DRAFT slice never claims a band').toBeNull()
  expect(JSON.stringify(data.report)).not.toMatch(/MIS-MKT|"mission":/)
  if ((data.report.moments || []).length) {
    await expect(page.getByTestId('report-moment').first()).toContainText(data.report.moments[0].quote)
  } else {
    await expect(page.getByTestId('report-none-described')).toBeVisible()
  }
  // One state for "nothing on the map": no per-row "Not enough evidence" chip.
  await expect(page.getByTestId('capability-map-row').filter({ hasText: 'Not enough evidence' })).toHaveCount(0)
  await noPercent(page)
  await shoot(page, testInfo, 'ready')

  // A second read serves the same version — GET publishes nothing.
  const again = await api(page, `/api/v1/assessment-sessions/${sid}/report`, { token })
  expect(again.body.data.version.number).toBe(1)
  expect(again.body.data.version.createdAt).toBe(data.version.createdAt)

  // Capability detail bound to this snapshot.
  const capId = data.report.summary.capabilities[0].id
  await page.goto(`${CAMPUS_BASE_URL}/app/capabilities/${capId}`)
  const detail = page.getByTestId('capability-detail')
  await expect(detail).toBeVisible()
  const d = await api(page, `/api/v1/me/capabilities/${capId}`, { token })
  expect(d.status).toBe(200)
  expect(d.body.data.latestSnapshot.sessionId).toBe(sid)
  expect(d.body.data.latestSnapshot.version).toBe(1)
  expect(['BOUNDED_ONLY', 'INSUFFICIENT', 'UNDER_REVIEW']).toContain(d.body.data.state)
  await expect(detail.getByTestId('capability-single-state')).toBeVisible()
  await expect(detail.getByText('Insufficient evidence', { exact: true })).toHaveCount(0)
  await expect(detail.getByText('Not enough evidence', { exact: true })).toHaveCount(0)
  await expect(detail.getByRole('button', { name: 'Ask for a review' })).toBeVisible()
  await noPercent(page)
  await shoot(page, testInfo, 'capability-detail')
})

// ── Fixture states (SYNTHETIC API responses) ────────────────────────────────
test('P5.9 partly described: a band on one row, the others neutral; moments, next practice and no percentage', async ({ page }, testInfo) => {
  await fixtureReport(page, 'partly', owner())
  await expect(page.getByTestId('report-plain-statement')).toContainText('SYNTHETIC: checked the source')
  const rows = page.getByTestId('capability-map-row')
  await expect(rows).toHaveCount(5)
  await expect(rows.nth(0)).toHaveAttribute('data-band', 'EARLY')
  await expect(rows.nth(0)).toContainText('Early evidence')
  await expect(rows.nth(1)).toHaveAttribute('data-band', 'NONE')
  await expect(rows.nth(1)).toContainText('Not yet measured')
  await expect(page.getByTestId('report-moment')).toHaveCount(2)
  await expect(page.getByTestId('report-next-practice')).toContainText('Weighs two options before deciding.')
  await expect(page.getByTestId('report-none-described')).toHaveCount(0)
  await noPercent(page)
  await shoot(page, testInfo, 'partly-described')
})

test('P5.9/T38 wholly insufficient: one neutral state, no per-row duplicate badge, no red, no percentage', async ({ page }, testInfo) => {
  await fixtureReport(page, 'insufficient', owner({ report: { described: 0 } }))
  await expect(page.getByTestId('report-none-described')).toBeVisible()
  const rows = page.getByTestId('capability-map-row')
  await expect(rows).toHaveCount(5)
  for (let i = 0; i < 5; i += 1) {
    await expect(rows.nth(i)).toHaveAttribute('data-band', 'NONE')
    await expect(rows.nth(i)).toContainText('Not yet measured')
  }
  await expect(page.getByText('Not enough evidence', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Not enough evidence yet', { exact: true })).toHaveCount(1)
  expect(await page.locator('.bg-prism-blocked, .text-prism-blocked').count()).toBe(0)
  await expect(page.getByTestId('report-moment')).toHaveCount(0)
  await noPercent(page)
  await shoot(page, testInfo, 'insufficient')
})

for (const [label, code, title] of [
  ['technical-incomplete', 'REPORT_PROCESSING_FAILED', 'The review did not finish'],
  ['processing', 'REPORT_NOT_READY', 'Your report is not ready yet'],
  ['under-review', 'REPORT_UNDER_REVIEW', 'This report is under review'],
]) {
  test(`P5.9/T31 ${label}: a named state with recheck and support, never a learner deficit`, async ({ page }, testInfo) => {
    await fixtureReport(page, label, { error: { code, message: 'SYNTHETIC state', requestId: `req-p5-${label}` } }, 409)
    await expect(page.getByText(title, { exact: true })).toBeVisible()
    await expect(page.getByText(`Reference: req-p5-${label}`)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Check again' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Contact support' })).toHaveAttribute('href', '/contact')
    await expect(page.getByTestId('capability-map')).toHaveCount(0)
    await expect(page.getByText(/insufficient|not enough evidence/i)).toHaveCount(0)
    await noPercent(page)
    await shoot(page, testInfo, label)
  })
}

test('P5.9/T36 corrected version: version 2 names the version it replaces and says why; a pending review is a chip', async ({ page }, testInfo) => {
  const body = owner({ data: { version: { number: 2, createdAt: '2026-10-03T10:00:00.000Z', reason: 'REVIEW_CORRECTION', priorVersion: 1 }, review: { openRequests: 1, pending: true } } })
  body.data.report.review = { withheldEvidenceIds: ['e3'] }
  await fixtureReport(page, 'corrected', body)
  await expect(page.getByTestId('report-corrected-badge')).toHaveText('Corrected after a review')
  await expect(page.getByText('Corrected version 2, replacing version 1')).toBeVisible()
  await expect(page.getByTestId('report-corrected')).toContainText('earlier version is kept unchanged')
  await expect(page.getByTestId('report-review-pending')).toBeVisible()
  await expect(page.getByTestId('report-header')).toContainText('Report version 2')
  await noPercent(page)
  await shoot(page, testInfo, 'corrected-version')
})

test('P5.9 legacy (/score): the original report renders from its stored blob with stored dates only', async ({ page }, testInfo) => {
  const legacySid = 'synthetic-p5-legacy'
  await signInSynthetic(page, LEGACY_BASE_URL, 'p5-legacy')
  await page.route('**/api/ecosystem/aligned-jobs', (route) => route.fulfill({ json: { jobs: [] } }))
  await page.route(`**/api/assessment/report/${legacySid}`, (route) => route.fulfill({ json: {
    sessionId: legacySid, issuedAt: '2023-02-04T11:22:33.000Z', completedAt: '2023-02-04T10:52:33.000Z', validUntil: '2024-02-04T11:22:33.000Z', validityMonths: 12,
    method: 'Synthetic original method v1.2', scores: { overall: 63.5, communication: 72.25, criticalThinking: 0, problemSolving: 64, collaboration: 56, aiDigitalFluency: 81 },
    scenario: { title: 'Synthetic original scenario', domain: 'Synthetic domain' }, feedback: { summary: 'Synthetic stored summary.' }, evidence: {}, highlights: [], growthAreas: [], interviewQuestions: [],
  } }))
  await page.goto(`${LEGACY_BASE_URL}/score?session=${legacySid}`)
  await expect(page.getByText('Original report · Legacy method', { exact: true })).toBeVisible()
  await expect(page.getByText('Prism Verified · Issued 2023-02-04T11:22:33.000Z', { exact: true })).toBeVisible()
  await expect(page.getByText('Synthetic stored summary.', { exact: true })).toBeVisible()
  await expect(page.getByTestId('capability-map')).toHaveCount(0)
  await shoot(page, testInfo, 'legacy')
})

test('P5.9/T47 summary share vs full share: quotes only where the owner chose to share them', async ({ page }, testInfo) => {
  const summaryToken = 'synthetic-p5-summary-token-0001-abcdefghij'
  const fullToken = 'synthetic-p5-full-token-00001-abcdefghij'
  await page.route(`**/api/v1/shared/${summaryToken}`, (route) => route.fulfill({ json: { data: { report: report({ disclosure: 'SUMMARY' }), version: { number: 1, createdAt: '2026-10-02T10:05:00.000Z' }, audience: 'SHARE_LINK', share: { expiresAt: '2026-12-01T00:00:00.000Z', disclosureLevel: 'SUMMARY' } } } }))
  await page.route(`**/api/v1/shared/${fullToken}`, (route) => route.fulfill({ json: { data: { report: report({ disclosure: 'FULL' }), version: { number: 1, createdAt: '2026-10-02T10:05:00.000Z' }, audience: 'SHARE_LINK', share: { expiresAt: '2026-12-01T00:00:00.000Z', disclosureLevel: 'FULL' } } } }))
  await page.goto(`${CAMPUS_BASE_URL}/shared/${summaryToken}`)
  await expect(page.getByTestId('report-header')).toContainText('Summary only')
  await expect(page.getByText('They chose to share a summary only.')).toBeVisible()
  await expect(page.getByTestId('report-moment')).toHaveCount(0)
  await expect(page.getByText('check which customers raised the issue')).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Evidence' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toHaveCount(0)
  await noPercent(page)
  await shoot(page, testInfo, 'summary-share')
  await page.goto(`${CAMPUS_BASE_URL}/shared/${fullToken}`)
  await expect(page.getByText('They chose to share the full report.')).toBeVisible()
  await expect(page.getByTestId('report-moment')).toHaveCount(2)
  await expect(page.getByTestId('report-moment').first()).toContainText('check which customers raised the issue')
  await expect(page.getByText('An interpretation review is pending')).toHaveCount(0)
  await expect(page.getByTestId('practice-recommendation')).toHaveCount(0)
  await noPercent(page)
  await shoot(page, testInfo, 'full-share')
})

test('P5.9/T48 expired share and access denied: hosted access stops, nothing about the report leaks', async ({ page }, testInfo) => {
  const expired = 'synthetic-p5-expired-token-001-abcdefghij'
  await page.route(`**/api/v1/shared/${expired}`, (route) => route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'This link is not valid or has expired.', requestId: 'req-p5-expired' } } }))
  await page.goto(`${CAMPUS_BASE_URL}/shared/${expired}`)
  await expect(page.getByText('This link is not valid or has expired')).toBeVisible()
  await expect(page.getByTestId('report-header')).toHaveCount(0)
  await shoot(page, testInfo, 'expired-share')
  await fixtureReport(page, 'denied', { error: { code: 'NOT_FOUND', message: 'Not found', requestId: 'req-p5-denied' } }, 404)
  await expect(page.getByText('This page is not available')).toBeVisible()
  await expect(page.getByTestId('report-header')).toHaveCount(0)
  await expect(page.getByTestId('capability-map')).toHaveCount(0)
  await expect(page.getByText(/SYNTHETIC/)).toHaveCount(0)
  await shoot(page, testInfo, 'access-denied')
})
