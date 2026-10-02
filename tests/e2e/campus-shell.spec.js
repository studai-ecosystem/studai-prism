// Prism Campus C1.17 — application shell at 360/768/1024/1440, keyboard
// navigation, axe, and the flags-off legacy /app regression.
import { test, expect } from '@playwright/test'
import { CAMPUS_BASE_URL, LEGACY_BASE_URL, signInSynthetic, expectNoSeriousAxe, expectNoHorizontalOverflow, linksTabbable } from './campusHelpers.js'

const WIDTHS = [360, 768, 1024, 1440]

for (const width of WIDTHS) {
  test(`CAMPUS-SHELL-01 @critical @campus shell at ${width}px: no overflow, navigation reachable`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await signInSynthetic(page, CAMPUS_BASE_URL, `shell-${width}`)
    await page.goto(`${CAMPUS_BASE_URL}/app`)
    await expect(page).toHaveURL(/\/app\/home$/)
    await expect(page.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening), Synthetic$/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Take your first Prism assessment' })).toBeVisible()
    await expectNoHorizontalOverflow(page)

    // Which navigation is shown follows the browser's own `md` media query:
    // WebKit with classic (non-overlay) scrollbars measures the page without
    // the scrollbar, so at 768px a long page is below `md` (quick nav) and a
    // short page, with no scrollbar, is at `md` (side nav). Each step uses the
    // navigation the browser is actually showing.
    const isDesktop = () => page.evaluate(() => window.matchMedia('(min-width: 768px)').matches)
    if (!(await isDesktop())) {
      const quick = page.getByRole('navigation', { name: 'Quick navigation' })
      await expect(quick).toBeVisible()
      await quick.getByRole('link', { name: 'Assess' }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Assessments' })).toBeVisible()
      if (await isDesktop()) {
        await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Capabilities' }).click()
      } else {
        await quick.getByRole('link', { name: 'Capabilities' }).click()
        // Everything not in the quick bar opens from More.
        await page.getByRole('button', { name: 'More' }).click()
        const drawer = page.getByRole('dialog', { name: 'More' })
        await expect(drawer).toBeVisible()
        await expect(drawer.getByRole('link', { name: 'Explore' })).toBeVisible()
        await page.keyboard.press('Escape')
      }
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
  await expect(page.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening), Synthetic$/ })).toBeVisible()
  const skip = page.getByRole('link', { name: 'Skip to main content' })
  // WebKit keeps links out of the Tab order (Safari default, see keyboardFocus):
  // there the skip link is focused directly and the into-main Tab step, whose
  // targets on this page are links, is left to the other browsers.
  const tabsLinks = linksTabbable(page)
  if (tabsLinks) await page.keyboard.press('Tab')
  else await skip.focus()
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main')).toBeFocused()
  if (tabsLinks) {
    await page.keyboard.press('Tab')
    const focusedInMain = await page.evaluate(() => document.getElementById('main').contains(document.activeElement))
    expect(focusedInMain).toBe(true)
  }

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
  await expect(page).toHaveURL(`${LEGACY_BASE_URL}/app/home`)
  await expect(page.getByRole('heading', { name: 'The student portal is not available yet' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open assessment launcher' })).toHaveAttribute('href', '/app')
  await expect(page.getByRole('link', { name: 'Contact support' })).toHaveAttribute('href', '/contact')
})

test('CAMPUS-SHELL-05 @critical @campus legacy links alias to V3 and ?legacy=1 keeps the legacy page reachable (no loop)', async ({ page }) => {
  await signInSynthetic(page, CAMPUS_BASE_URL, 'shell-legacy-link')
  // Phase 8 replaced the missions placeholder with the real player (K86):
  // an unknown mission is an honest not-available state, never a mock.
  await page.goto(`${CAMPUS_BASE_URL}/missions/synthetic-mission`)
  await expect(page).toHaveURL(/\/app\/development\/missions\/synthetic-mission$/)
  await expect(page.getByText('Mission not available')).toBeVisible()
  await page.goto(`${CAMPUS_BASE_URL}/missions/synthetic-mission?legacy=1`)
  await expect(page).toHaveURL(/\/missions\/synthetic-mission\?legacy=1$/)
  await page.waitForTimeout(300)
  await expect(page).toHaveURL(/\/missions\/synthetic-mission\?legacy=1$/)
})
