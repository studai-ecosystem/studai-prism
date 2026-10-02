import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { LEGACY_BASE_URL, signInSynthetic, expectNoSeriousAxe, expectNoHorizontalOverflow } from './campusHelpers.js'

// Presentation fixtures mirror legacyReport.test.jsx, not historical ownership,
// storage recovery, authorization or scientific acceptance. Accounts use the
// disposable audit server; report responses and navigation-state blobs are synthetic.
const SESSION_ID = 'synthetic-legacy-report'
const REPORT_PATH = `/api/assessment/report/${SESSION_ID}`
const WIDTHS = [1440, 390]

function storedReport(overrides = {}) {
  return {
    sessionId: SESSION_ID,
    issuedAt: '2023-02-04T11:22:33.000Z',
    completedAt: '2023-02-04T10:52:33.000Z',
    validUntil: '2024-02-04T11:22:33.000Z',
    validityMonths: 12,
    method: 'Synthetic original method v1.2',
    scores: { overall: 63.5, communication: 72.25, criticalThinking: 0, problemSolving: 64, collaboration: 56, aiDigitalFluency: 81 },
    scenario: { title: 'Synthetic original scenario', domain: 'Synthetic domain' },
    feedback: { summary: 'Synthetic stored summary — kept exactly.', communication: 'Synthetic stored feedback — kept exactly.' },
    evidence: { communication: 'Synthetic stored observation — kept exactly.' },
    highlights: ['Synthetic stored strength — kept exactly.'],
    growthAreas: ['Synthetic stored development point — kept exactly.'],
    interviewQuestions: ['Synthetic stored interview prompt — kept exactly?'],
    ...overrides,
  }
}

async function prepare(page, label, response) {
  await signInSynthetic(page, LEGACY_BASE_URL, `p1-legacy-${label}`)
  await page.route('**/api/ecosystem/aligned-jobs', (route) => route.fulfill({ json: { jobs: [] } }))
  const reads = []
  await page.route(`**${REPORT_PATH}`, (route) => {
    reads.push(route.request().method())
    expect(route.request().method()).toBe('GET')
    return response(route)
  })
  return reads
}

async function captureAndCheck(page, testInfo, label, width) {
  await page.screenshot({
    path: join('audit-results', 'ui', 'p1', `${testInfo.project.name}-legacy-${label}-${width}.png`),
    fullPage: true,
  })
  await expectNoHorizontalOverflow(page)
  await expectNoSeriousAxe(page)
}

async function noComposite(page) {
  await expect(page.getByText('Overall Prism Score', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Original score breakdown' })).toHaveCount(0)
  await expect(page.getByText('No overall score is recorded in this report.', { exact: false })).toHaveCount(2)
}

async function assertOriginal(page, report = storedReport()) {
  await expect(page.getByText('Original report · Legacy method', { exact: true })).toBeVisible()
  await expect(page.getByText(report.method, { exact: true })).toBeVisible()
  await expect(page.getByText(`Prism Verified · Issued ${report.issuedAt}`, { exact: true })).toBeVisible()
  await expect(page.getByText(report.completedAt, { exact: true })).toBeVisible()
  await expect(page.getByText(`Valid until ${report.validUntil} · ${SESSION_ID}`, { exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Communication', exact: true }).getByText('72.25', { exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Critical Thinking', exact: true }).getByText('0', { exact: true })).toBeVisible()
  await expect(page.getByText('63.5', { exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Original score breakdown' }).getByText('63.5%', { exact: true })).toBeVisible()
  for (const text of [report.evidence.communication, report.feedback.summary, ...report.highlights, ...report.growthAreas]) {
    await expect(page.getByText(text, { exact: true })).toBeVisible()
  }
  for (const [index, question] of report.interviewQuestions.entries()) {
    await expect(page.getByText(question, { exact: false })).toHaveText(`Q${index + 1}${question}`)
  }
  await expect(page.getByText('Synthetic original scenario · Synthetic domain', { exact: true })).toBeVisible()
  await expect(page.getByText(report.feedback.communication, { exact: true })).toHaveCount(0)
}

async function missingNarratives(page) {
  for (const text of ['Summary not recorded in this report.', 'Strengths not recorded in this report.', 'Growth areas not recorded in this report.', 'Interview questions not recorded in this report.']) {
    await expect(page.getByText(text, { exact: true })).toBeVisible()
  }
  await expect(page.getByText('Narrative not recorded in this report.', { exact: true })).toHaveCount(5)
  await expect(page.getByText(/When Avatar|signature critical thinking|Credit others' ideas|Tell me about a time|Product Manager at a growing EdTech/)).toHaveCount(0)
}

const REPORT_CASES = [
  {
    label: 'original-exact',
    report: storedReport(),
    assert: assertOriginal,
  },
  {
    label: 'missing-assessment-expiry-dates',
    report: storedReport({ completedAt: undefined, validUntil: undefined }),
    assert: async (page) => {
      await expect(page.getByText('Assessment date not recorded', { exact: true })).toBeVisible()
      await expect(page.getByText('Validity end date not recorded', { exact: false })).toBeVisible()
      await expect(page.getByText('Prism Verified · Issued 2023-02-04T11:22:33.000Z', { exact: true })).toBeVisible()
    },
  },
  {
    label: 'missing-all-dates-method',
    report: storedReport({ issuedAt: null, completedAt: null, validUntil: null, validityMonths: null, method: null }),
    assert: async (page) => {
      for (const text of ['Issue date not recorded', 'Assessment date not recorded', 'Validity end date not recorded', 'Method details not recorded', 'Validity period not recorded in this report.']) {
        await expect(page.getByText(text, { exact: false })).toBeVisible()
      }
      await expect(page.getByText(/Prism Verified · Issued|Valid until/)).toHaveCount(0)
    },
  },
  {
    label: 'stored-method-no-issued-composite',
    report: storedReport({
      method: { version: 'Synthetic-method.v0', rubric: 'Synthetic-rubric.v0', sufficiencyRules: 'Synthetic-rules.v0' },
      reportPolicy: 'profile-first-v1',
      scoring: { language: 'en', status: 'Synthetic original scoring status' },
      // All five dimensions are present: their existence must not cause the
      // browser to calculate/substitute an absent issued overall field.
      scores: { communication: 29.75, criticalThinking: 0, problemSolving: 64, collaboration: 56, aiDigitalFluency: 81 },
    }),
    assert: async (page) => {
      await expect(page.getByText('Original report · Stored method', { exact: true })).toBeVisible()
      for (const text of ['Synthetic-method.v0', 'Synthetic-rubric.v0', 'Synthetic-rules.v0', 'profile-first-v1', 'en', 'Synthetic original scoring status']) {
        await expect(page.getByText(text, { exact: true })).toBeVisible()
      }
      await expect(page.getByRole('group', { name: 'Communication', exact: true }).getByText('29.75', { exact: true })).toBeVisible()
      await noComposite(page)
    },
  },
  {
    label: 'missing-narratives-scenario',
    report: storedReport({ feedback: {}, evidence: {}, highlights: [], growthAreas: [], scenario: null, interviewQuestions: null }),
    assert: async (page) => {
      await missingNarratives(page)
      await expect(page.getByText('Scenario not recorded in this report.', { exact: true })).toBeVisible()
    },
  },
  {
    label: 'stored-feedback-no-separate-evidence',
    report: storedReport({ evidence: {} }),
    assert: async (page) => {
      await expect(page.getByText('Synthetic stored feedback — kept exactly.', { exact: true })).toBeVisible()
      await expect(page.getByText('Synthetic stored observation — kept exactly.', { exact: true })).toHaveCount(0)
    },
  },
  {
    label: 'blank-narratives',
    report: storedReport({ evidence: { communication: '  ' }, feedback: { summary: '  ', communication: '  ' }, highlights: null, growthAreas: ['  '], interviewQuestions: [] }),
    assert: missingNarratives,
  },
  ...[undefined, null, {}].map((scores, index) => ({
    label: ['omitted-scores', 'null-scores', 'empty-scores'][index],
    report: storedReport({ scores }),
    assert: async (page) => {
      await expect(page.getByText('Score not recorded', { exact: true })).toHaveCount(5)
      await expect(page.getByText('Synthetic stored summary — kept exactly.', { exact: true })).toBeVisible()
      await expect(page.getByText('0', { exact: true })).toHaveCount(0)
      await noComposite(page)
    },
  })),
  {
    label: 'partial-stored-composite',
    report: storedReport({ scores: { overall: 63.5, communication: null, criticalThinking: 0 }, insufficientEvidence: ['communication'] }),
    assert: async (page) => {
      const communication = page.getByRole('group', { name: 'Communication', exact: true })
      await expect(communication.getByText('Insufficient evidence', { exact: true })).toBeVisible()
      await expect(communication.getByText('Synthetic stored observation — kept exactly.', { exact: true })).toBeVisible()
      const calculation = page.getByRole('group', { name: 'Original score breakdown' })
      await expect(calculation.getByText('Not recorded', { exact: true })).toHaveCount(8)
      await expect(calculation.getByText('0', { exact: true })).toHaveCount(1)
      await expect(calculation.getByText('63.5%', { exact: true })).toBeVisible()
    },
  },
  {
    label: 'nonfinite-fixture-json-null-scores',
    // JSON cannot carry non-finite numerics; the network fixture serializes
    // these to null. Direct JS non-finite guards remain covered by unit tests.
    report: storedReport({ scores: { overall: NaN, communication: Infinity, criticalThinking: undefined, problemSolving: -Infinity } }),
    assert: async (page) => {
      await expect(page.getByText('Score not recorded', { exact: true })).toHaveCount(5)
      await expect(page.getByText(/NaN|Infinity/)).toHaveCount(0)
      await noComposite(page)
    },
  },
]

for (const fixture of REPORT_CASES) {
  test(`P1.4/T05 legacy ${fixture.label} (synthetic report API fixture; presentation only)`, async ({ page }, testInfo) => {
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    const reads = await prepare(page, fixture.label, (route) => route.fulfill({ json: fixture.report }))
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`${LEGACY_BASE_URL}/score?session=${SESSION_ID}`)
      await fixture.assert(page, fixture.report)
      await captureAndCheck(page, testInfo, fixture.label, width)
    }
    expect(reads).toEqual(['GET', 'GET'])
    expect(pageErrors).toEqual([])
  })
}

test('P1.4/T05 legacy refresh reads the original GET blob again (synthetic report API fixture)', async ({ page }) => {
  const reads = await prepare(page, 'refresh', (route) => route.fulfill({ json: storedReport() }))
  await page.goto(`${LEGACY_BASE_URL}/score?session=${SESSION_ID}`)
  await assertOriginal(page)
  await page.reload()
  await assertOriginal(page)
  expect(reads).toEqual(['GET', 'GET'])
})

for (const missingReference of [false, true]) {
  const label = missingReference ? 'missing-reference' : 'stored-reference'
  test(`P1.4/T05 legacy ${label} (synthetic navigation-state fixture; no report API read)`, async ({ page }, testInfo) => {
    const report = storedReport(missingReference ? { sessionId: null } : {})
    const reads = await prepare(page, label, (route) => route.fulfill({ json: report }))
    await page.addInitScript(({ report }) => {
      if (window.location.pathname === '/score') {
        window.history.replaceState({ usr: { report }, key: 'synthetic-legacy-state', idx: 0 }, '', window.location.href)
      }
    }, { report })
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`${LEGACY_BASE_URL}/score`)
      if (missingReference) {
        await expect(page.getByText('Verification ID not recorded', { exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeDisabled()
        await expect(page.getByRole('link', { name: /Verify this/ })).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Copy link', exact: true })).toHaveCount(0)
      } else {
        await expect(page.getByText(SESSION_ID, { exact: true })).toBeVisible()
      }
      await expect(page.getByText(/PSRM-DEMO|\/verify\/null|\/verify\/undefined/)).toHaveCount(0)
      await captureAndCheck(page, testInfo, label, width)
    }
    expect(reads).toEqual([])
  })
}

const ERROR_CASES = [
  ...[401, 403, 404].map((status) => ({
    label: `http-${status}`, title: 'Report unavailable',
    respond: (route) => route.fulfill({ status, json: { error: 'Synthetic private backend detail' } }),
  })),
  { label: 'http-500', title: 'Unable to load report', respond: (route) => route.fulfill({ status: 500, json: { error: 'Synthetic private backend detail' } }) },
  { label: 'network-failure', title: 'Unable to load report', respond: (route) => route.abort('failed') },
  { label: 'null-response', title: 'Unable to load report', respond: (route) => route.fulfill({ json: null }) },
  { label: 'array-response', title: 'Unable to load report', respond: (route) => route.fulfill({ json: [] }) },
  { label: 'invalid-json', title: 'Unable to load report', respond: (route) => route.fulfill({ contentType: 'application/json', body: 'synthetic-not-json' }) },
]

for (const fixture of ERROR_CASES) {
  test(`P1.4 legacy ${fixture.label} exposes error and read-only retry (synthetic report API fixture)`, async ({ page }, testInfo) => {
    let failing = true
    const reads = await prepare(page, fixture.label, (route) => failing ? fixture.respond(route) : route.fulfill({ json: storedReport() }))
    for (const width of WIDTHS) {
      failing = true
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`${LEGACY_BASE_URL}/score?session=${SESSION_ID}`)
      await expect(page.getByRole('alert').filter({ hasText: /\S/ }).getByRole('heading', { name: fixture.title, exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Back to history', exact: true })).toBeVisible()
      await expect(page.getByText(/private backend detail|Score not found|expired|complete an assessment first|Insufficient evidence/)).toHaveCount(0)
      await expect(page.getByText('Overall Prism Score', { exact: true })).toHaveCount(0)
      await captureAndCheck(page, testInfo, fixture.label, width)
      failing = false
      await page.getByRole('button', { name: 'Try again', exact: true }).click()
      await assertOriginal(page)
      await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveCount(0)
      await expectNoHorizontalOverflow(page)
    }
    expect(reads).toEqual(['GET', 'GET', 'GET', 'GET'])
  })
}

test('P1.4 legacy no selected report has an honest history action (no report API fixture read)', async ({ page }, testInfo) => {
  const reads = await prepare(page, 'not-selected', (route) => route.fulfill({ json: storedReport() }))
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`${LEGACY_BASE_URL}/score`)
    await expect(page.getByRole('heading', { name: 'Report not selected', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Back to history', exact: true })).toBeVisible()
    await expect(page.getByText(/deleted|complete an assessment first|expired|Overall Prism Score/)).toHaveCount(0)
    await captureAndCheck(page, testInfo, 'not-selected', width)
  }
  expect(reads).toEqual([])
})
