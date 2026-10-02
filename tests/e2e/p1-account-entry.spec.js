import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { CAMPUS_BASE_URL, LEGACY_BASE_URL, api, signInSynthetic, expectNoSeriousAxe, expectNoHorizontalOverflow } from './campusHelpers.js'

test('P1/T01 bare registration opens the supported launcher, not checkout', async ({ page }, testInfo) => {
  await page.goto(`${LEGACY_BASE_URL}/register`)
  await page.getByLabel('Full Name').fill('Synthetic P1 learner')
  await page.getByLabel('Email').fill(`p1-${testInfo.project.name}-${Date.now()}@test.local`)
  await page.getByLabel('College').fill('Synthetic College')
  await page.getByLabel('Year of Study').selectOption('4th Year')
  await page.getByLabel('Password').fill('synthetic-p1-password')
  await page.locator('input[type=checkbox]').check()
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page).toHaveURL(`${LEGACY_BASE_URL}/app`)
  await expect(page.getByRole('heading', { name: 'Prism Assessment' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Start an assessment/ })).toBeEnabled()
})

test('P1/T02 malformed sign-in destinations show a safe recovery without exposing the input', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${LEGACY_BASE_URL}/login?next=%2Fapp%2Fcampus-invite%2F%25`)
  await expect(page.getByText('This sign-in destination is unavailable', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await expectNoSeriousAxe(page)
  await page.screenshot({ path: join('audit-results', 'ui', 'p1', `${testInfo.project.name}-invalid-next-390.png`) })
})

test('P1/T08 a second account cannot see the previous draft or stale player controls (session API fixture)', async ({ page }) => {
  const first = await signInSynthetic(page, CAMPUS_BASE_URL, 'p1-account-a')
  const second = await api(page, '/api/auth/register', { method: 'POST', body: {
    name: 'Synthetic other account', email: `p1-other-${Date.now()}@test.local`, college: 'Synthetic College', year: '4th Year',
    password: 'synthetic-p1-password', ageConfirmed: true,
  } })
  expect(second.status).toBe(201)
  const sessionId = 'synthetic-p1-private-session'
  const now = new Date().toISOString()
  await page.route(`**/api/v1/assessment-sessions/${sessionId}`, (route) => {
    if (route.request().headers().authorization !== `Bearer ${first.token}`) return route.fulfill({
      status: 404, json: { error: { code: 'NOT_FOUND', message: 'Not found', requestId: 'synthetic-denied' } },
    })
    return route.fulfill({ json: { data: {
      sessionId, status: 'IN_PROGRESS', scope: 'PERSONAL', sponsorName: null,
      assessment: { definitionId: 'prism-workplace-core', title: 'Synthetic private UI fixture' },
      scenario: { title: 'Synthetic private UI fixture', context: null, yourRole: null, participants: [] },
      jobFamilyId: null, capabilities: [], artifacts: [], messages: [], integrityPolicy: 'STANDARD',
      progress: { exchanges: 0, requiredExchanges: 3 }, device: { requiresLargeScreen: false, allowSmallScreen: true },
      timing: { serverTime: now, startedAt: now, deadlineAt: new Date(Date.now() + 35 * 60000).toISOString(), remainingMs: 35 * 60000 },
      reportPath: null,
    } } })
  })
  await page.goto(`${CAMPUS_BASE_URL}/app/assessment/${sessionId}`)
  await page.getByLabel('Your answer').fill('Synthetic previous-account private draft')
  await expect.poll(() => page.evaluate((id) => sessionStorage.getItem(`prism.draft.${id}`), sessionId)).toBe('Synthetic previous-account private draft')
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('prism_token', token)
    localStorage.setItem('prism_user', JSON.stringify({ name: user.name, email: user.email, college: user.college, year: user.year }))
    window.dispatchEvent(new Event('prism-session-change'))
  }, second.body)
  await expect(page.getByRole('link', { name: 'Back to assessments', exact: true })).toBeVisible()
  await expect(page.getByLabel('Your answer')).toHaveCount(0)
  await expect(page.getByText('Synthetic previous-account private draft', { exact: true })).toHaveCount(0)
  expect(await page.evaluate((id) => sessionStorage.getItem(`prism.draft.${id}`), sessionId)).toBeNull()
  expect(await page.evaluate((id) => sessionStorage.getItem(`prism.pending.${id}`), sessionId)).toBeNull()
})
