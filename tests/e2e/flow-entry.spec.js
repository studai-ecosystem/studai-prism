import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { CAMPUS_BASE_URL, LEGACY_BASE_URL, signInSynthetic, expectNoSeriousAxe, expectNoHorizontalOverflow } from './campusHelpers.js'

const WIDTHS = [1440, 1280, 1024, 768, 430, 390, 360]

function completed(id, completedAt, to) {
  return {
    id, definitionId: 'prism-workplace-core', title: `Synthetic ${id}`, description: null,
    scope: 'PERSONAL', sponsor: null, durationMinutes: 35, integrityMode: 'STANDARD',
    opensAt: null, dueAt: null, status: 'COMPLETED', tab: 'COMPLETED', sessionId: id,
    startedAt: null, completedAt, underReview: false, acknowledgementRequired: false,
    acknowledged: false, cta: { kind: 'VIEW_REPORT', to },
  }
}

test('FLOW-ENTRY signed-out aliases preserve their login destinations', async ({ page }) => {
  for (const path of ['/dashboard', '/profile', '/app/settings#profile']) {
    await page.goto(`${LEGACY_BASE_URL}${path}`)
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
    const url = new URL(page.url())
    expect(url.pathname).toBe('/login')
    expect(url.searchParams.get('next')).toBe(path)
  }
})

test('FLOW-ENTRY returning login opens the launcher rather than checkout when the shell is dark', async ({ page }) => {
  const user = await signInSynthetic(page, LEGACY_BASE_URL, 'flow-login')
  await page.evaluate(() => localStorage.clear())
  await page.goto(`${LEGACY_BASE_URL}/login`)
  await page.getByLabel(/^Email/).fill(user.email)
  await page.getByLabel(/^Password/).fill('candidate-pass-1!')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(`${LEGACY_BASE_URL}/app`)
  await expect(page.getByRole('heading', { name: 'Prism Assessment' })).toBeVisible()
})

test('FLOW-ENTRY dark aliases stay in Prism with an accessible recovery path at every width', async ({ page }) => {
  await signInSynthetic(page, LEGACY_BASE_URL, 'flow-dark')
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`${LEGACY_BASE_URL}/dashboard`)
    await expect(page).toHaveURL(`${LEGACY_BASE_URL}/app/home`)
    await expect(page.getByRole('heading', { level: 1, name: 'The student portal is not available yet' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open assessment launcher' })).toHaveAttribute('href', '/app')
    await expectNoHorizontalOverflow(page)
    if (width === 1440 || width === 390) await expectNoSeriousAxe(page)
    if (width === 1440 || width === 390) await page.screenshot({ path: join('audit-results', 'ui', 'flow-repair', `dark-${width}.png`), fullPage: true })
  }
  await page.goto(`${LEGACY_BASE_URL}/profile`)
  await expect(page).toHaveURL(`${LEGACY_BASE_URL}/app/settings#profile`)
  await expect(page.getByRole('link', { name: 'Contact support' })).toHaveAttribute('href', '/contact')
})

test('FLOW-ENTRY enabled aliases and recent report links are usable at every width (home/history API fixtures)', async ({ page }) => {
  await signInSynthetic(page, CAMPUS_BASE_URL, 'flow-history')
  await page.route('**/api/v1/me/home', (route) => route.fulfill({
    json: { data: {
      user: { name: 'Synthetic Student' },
      workspace: { id: 'personal', type: 'PERSONAL', name: 'Personal', organizationName: null },
      primaryAction: { kind: 'REPORT_READY', assignmentId: 'latest', title: 'Synthetic latest', scope: 'PERSONAL', dueAt: null, to: '/app/reports/latest' },
      capabilitySnapshot: [], assessedCount: 2, focus: [], sponsor: null, levelLabelsStatus: 'PROVISIONAL',
    } },
  }))
  await page.route('**/api/v1/me/assessments', (route) => route.fulfill({
    json: { data: { active: [], upcoming: [], completed: [
      completed('older', '2026-09-01T10:00:00.000Z', '/score?session=older'),
      completed('latest', '2026-10-01T10:00:00.000Z', '/app/reports/latest'),
    ] } },
  }))
  await page.route('**/api/v1/me/history**', (route) => route.fulfill({
    json: { data: { items: [
      { id: 'FORMAL_SESSION:latest', sourceType: 'FORMAL_SESSION', sourceId: 'latest', mode: 'FORMAL', title: 'Synthetic latest', startedAt: null, completedAt: '2026-10-01T10:00:00.000Z', issuedAt: '2026-10-01T10:00:00.000Z', scope: 'PERSONAL', sponsorOrganizationId: null, status: 'COMPLETED', reportFormat: 'V3', permittedAction: { kind: 'VIEW_REPORT', to: '/app/reports/latest' }, recoveryState: 'NONE' },
      { id: 'LEGACY_REPORT:older', sourceType: 'LEGACY_REPORT', sourceId: 'older', mode: 'FORMAL', title: 'Synthetic older', startedAt: null, completedAt: '2026-09-01T10:00:00.000Z', issuedAt: '2026-09-01T10:00:00.000Z', scope: 'PERSONAL', sponsorOrganizationId: null, status: 'LEGACY', reportFormat: 'LEGACY_V2', permittedAction: { kind: 'VIEW_REPORT', to: '/score?session=older' }, recoveryState: 'NONE' },
    ], nextCursor: null } },
  }))
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`${CAMPUS_BASE_URL}/dashboard`)
    await expect(page).toHaveURL(`${CAMPUS_BASE_URL}/app/home`)
    const history = page.getByRole('region', { name: 'Recent activity' })
    await expect(history.getByRole('link', { name: /^View report\s*:\s*Synthetic latest$/ })).toHaveAttribute('href', '/app/reports/latest')
    await expect(history.getByRole('link', { name: /^Original report\s*:\s*Synthetic older$/ })).toHaveAttribute('href', '/score?session=older')
    await expect(history.getByRole('link', { name: 'View all history' })).toHaveAttribute('href', /\/app\/assessments\?tab=history/)
    await expectNoHorizontalOverflow(page)
    if (width === 1440 || width === 390) await expectNoSeriousAxe(page)
    if (width === 1440 || width === 390) await page.screenshot({ path: join('audit-results', 'ui', 'flow-repair', `history-${width}.png`), fullPage: true })
  }
  await page.goto(`${CAMPUS_BASE_URL}/profile`)
  await expect(page).toHaveURL(`${CAMPUS_BASE_URL}/app/settings#profile`)
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  await expect(page.locator('#profile')).toBeVisible()
})
