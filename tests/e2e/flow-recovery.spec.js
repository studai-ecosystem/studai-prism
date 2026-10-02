import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { CAMPUS_BASE_URL, signInSynthetic, expectNoSeriousAxe, expectNoHorizontalOverflow } from './campusHelpers.js'
import { AGE_DECLARATION_TEXT } from '../../server/lib/sharedConstants.js'

const SESSION = 'sess-recovery-ui-0001'

test('RECOVERY-UI pending report can be rechecked without scoring and retains support (report API fixtures)', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signInSynthetic(page, CAMPUS_BASE_URL, 'report-recovery')
  let reads = 0
  await page.route(`**/api/v1/assessment-sessions/${SESSION}/report`, (route) => {
    expect(route.request().method()).toBe('GET')
    reads += 1
    return route.fulfill({ status: 409, json: { error: {
      code: reads === 1 ? 'REPORT_NOT_READY' : 'REPORT_UNDER_REVIEW',
      message: 'Synthetic report recovery state', requestId: `req-report-ui-${reads}`,
    } } })
  })
  await page.goto(`${CAMPUS_BASE_URL}/app/reports/${SESSION}`)
  await expect(page.getByText('Your report is not ready yet', { exact: true })).toBeVisible()
  await expect(page.getByText('Reference: req-report-ui-1')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Contact support' })).toHaveAttribute('href', '/contact')
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toHaveCount(0)
  await expect(page.getByTestId('report-capability')).toHaveCount(0)
  await expect(page.getByTestId('capability-map')).toHaveCount(0)
  await page.getByRole('button', { name: 'Check again' }).click()
  await expect(page.getByText('This report is under review', { exact: true })).toBeVisible()
  await expect(page.getByText('Reference: req-report-ui-2')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await expectNoSeriousAxe(page)
  await page.screenshot({ path: join('audit-results', 'ui', 'flow-recovery', `${testInfo.project.name}-report-390.png`) })
})

test('RECOVERY-UI a failed scoring retry is visible with reference and support (session API fixtures)', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signInSynthetic(page, CAMPUS_BASE_URL, 'scoring-recovery')
  const now = new Date().toISOString()
  await page.route(`**/api/v1/assessment-sessions/${SESSION}`, (route) => route.fulfill({ json: { data: {
    sessionId: SESSION, status: 'SCORING_FAILED', scope: 'PERSONAL', sponsorName: null,
    assessment: { definitionId: 'prism-workplace-core', title: 'Synthetic UI assessment' },
    scenario: { title: 'Synthetic recovery scenario', context: null, yourRole: null, participants: [] },
    jobFamilyId: null, capabilities: [], artifacts: [], messages: [],
    progress: { exchanges: 3, requiredExchanges: 3 }, integrityPolicy: 'STANDARD',
    device: { requiresLargeScreen: false, allowSmallScreen: true },
    timing: { serverTime: now, startedAt: now, deadlineAt: now, remainingMs: 0 }, reportPath: null,
  } } }))
  await page.route(`**/api/v1/assessment-sessions/${SESSION}/finish`, (route) => route.fulfill({
    status: 503, json: { error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Synthetic retry service unavailable', requestId: 'req-scoring-ui' } },
  }))
  await page.goto(`${CAMPUS_BASE_URL}/app/assessment/${SESSION}`)
  await expect(page.getByText('Review did not finish', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('Synthetic retry service unavailable', { exact: true })).toBeVisible()
  await expect(page.getByText('Reference: req-scoring-ui')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Contact support' })).toHaveAttribute('href', '/contact')
  await expect(page.getByRole('link', { name: 'Back to assessments' })).toHaveAttribute('href', '/app/assessments')
  await expect(page.getByLabel('Your answer')).toHaveCount(0)
  await expectNoHorizontalOverflow(page)
  await expectNoSeriousAxe(page)
  await page.screenshot({ path: join('audit-results', 'ui', 'flow-recovery', `${testInfo.project.name}-scoring-390.png`) })
})

test('RECOVERY-UI Profile uses the existing authenticated declaration endpoint (older-account display fixture)', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const student = await signInSynthetic(page, CAMPUS_BASE_URL, 'age-entry')
  let confirmed = false
  await page.route('**/api/v1/me', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    body.data.user.ageConfirmed = confirmed
    await route.fulfill({ response, json: body })
  })
  await page.route('**/api/auth/confirm-age', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    expect(response.status()).toBe(200)
    confirmed = body.ok === true && body.user.ageConfirmed === true
    await route.fulfill({ response, json: body })
  })
  await page.goto(`${CAMPUS_BASE_URL}/app/settings#profile`)
  const record = page.getByRole('button', { name: 'Record declaration' })
  await expect(record).toBeVisible()
  await expect(record).toBeDisabled()
  await page.getByLabel(AGE_DECLARATION_TEXT).check()
  const request = page.waitForRequest((r) => r.url().endsWith('/api/auth/confirm-age') && r.method() === 'POST')
  await record.click()
  expect((await request).postDataJSON()).toEqual({ ageConfirmed: true })
  await expect(page.getByText('Age declaration recorded.', { exact: true })).toBeVisible()
  await expect(record).toHaveCount(0)
  await expectNoHorizontalOverflow(page)
  await expectNoSeriousAxe(page)
  await page.screenshot({ path: join('audit-results', 'ui', 'flow-recovery', `${testInfo.project.name}-profile-390.png`) })
  expect(Boolean(student.user.id)).toBe(true)
})
