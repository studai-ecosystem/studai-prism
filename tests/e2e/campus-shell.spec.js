// Prism Campus C1.17 — application shell at 360/768/1024/1440, keyboard
// navigation, axe, and the flags-off legacy /app regression.
import { test, expect } from '@playwright/test'
import { CAMPUS_BASE_URL, LEGACY_BASE_URL, signInSynthetic, expectNoSeriousAxe, expectNoHorizontalOverflow } from './campusHelpers.js'

const WIDTHS = [360, 768, 1024, 1440]

for (const width of WIDTHS) {
  test(`CAMPUS-SHELL-01 @critical @campus shell at ${width}px: no overflow, navigation reachable`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await signInSynthetic(page, CAMPUS_BASE_URL, `shell-${width}`)
    await page.goto(`${CAMPUS_BASE_URL}/app`)
    await expect(page).toHaveURL(/\/app\/home$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible()
    await expect(page.getByText('No assessments yet')).toBeVisible()
    await expectNoHorizontalOverflow(page)

    if (width < 768) {
      const quick = page.getByRole('navigation', { name: 'Quick navigation' })
      await expect(quick).toBeVisible()
      await quick.getByRole('link', { name: 'Assess' }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Assessments' })).toBeVisible()
      await page.getByRole('button', { name: 'More' }).click()
      const drawer = page.getByRole('dialog', { name: 'More' })
      await expect(drawer).toBeVisible()
      await drawer.getByRole('link', { name: 'My Capabilities' }).click()
      await expect(page.getByText('You do not have a formal capability profile yet.')).toBeVisible()
    } else {
      const nav = page.getByRole('navigation', { name: 'Primary' })
      await expect(nav).toBeVisible()
      await nav.getByRole('link', { name: 'Evidence' }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Evidence' })).toBeVisible()
      await expect(nav.getByRole('link', { name: 'Evidence' })).toHaveAttribute('aria-current', 'page')
    }
    await expectNoHorizontalOverflow(page)
  })
}

test('CAMPUS-SHELL-02 @critical @campus keyboard: skip link first, then into main', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await signInSynthetic(page, CAMPUS_BASE_URL, 'shell-kbd')
  await page.goto(`${CAMPUS_BASE_URL}/app/home`)
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible()
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to main content' })
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main')).toBeFocused()
  await page.keyboard.press('Tab')
  const focusedInMain = await page.evaluate(() => document.getElementById('main').contains(document.activeElement))
  expect(focusedInMain).toBe(true)

  // Account menu is keyboard operable.
  const account = page.getByRole('button', { name: 'Account menu' })
  await account.focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitem', { name: 'Settings' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(account).toBeFocused()
})

const NEW_ROUTES = [
  '/app/home', '/app/assessments', '/app/capabilities', '/app/evidence', '/app/development',
  '/app/growth', '/app/sharing', '/app/settings', '/app/assessments/synthetic-id/briefing',
  '/app/assessments/synthetic-id/system-check', '/app/reports/synthetic-session', '/app/explore',
  '/app/development/missions/synthetic-mission', '/app/assessment/synthetic-session',
]

for (const path of NEW_ROUTES) {
  test(`CAMPUS-SHELL-03 @critical @campus axe ${path} has no serious or critical violations`, async ({ page }) => {
    await signInSynthetic(page, CAMPUS_BASE_URL, 'shell-axe')
    await page.goto(`${CAMPUS_BASE_URL}${path}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expectNoSeriousAxe(page)
  })
}

test('CAMPUS-SHELL-04 @critical @campus flags off: legacy /app launcher is unchanged', async ({ page }) => {
  await signInSynthetic(page, LEGACY_BASE_URL, 'shell-legacy')
  await page.goto(`${LEGACY_BASE_URL}/app`)
  await expect(page.getByRole('heading', { name: 'Prism Assessment' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Start an assessment/ })).toBeVisible()
  await page.goto(`${LEGACY_BASE_URL}/app/home`)
  // Dark shell URLs behave exactly like any unknown legacy URL (→ landing).
  await expect(page).toHaveURL(`${LEGACY_BASE_URL}/`)
})

test('CAMPUS-SHELL-05 @critical @campus V3 placeholders keep the legacy page reachable (?legacy=1, no loop)', async ({ page }) => {
  await signInSynthetic(page, CAMPUS_BASE_URL, 'shell-legacy-link')
  await page.goto(`${CAMPUS_BASE_URL}/explore`)
  await expect(page).toHaveURL(/\/app\/explore$/)
  await page.getByRole('link', { name: 'Open the current version' }).click()
  await expect(page).toHaveURL(/\/explore\?legacy=1$/)
  await page.waitForTimeout(300)
  await expect(page).toHaveURL(/\/explore\?legacy=1$/)
})
