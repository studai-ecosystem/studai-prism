import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import {
  CAMPUS_BASE_URL,
  expectNoHorizontalOverflow,
  expectNoSeriousAxe,
  linksTabbable,
  signInSynthetic,
} from './campusHelpers.js'

const OUTPUT = join(process.cwd(), 'audit-results', 'ui', 'p9')
const WIDTHS = [1440, 1280, 1024, 768, 430, 390, 360, 320]

async function stablePage(page, path) {
  await page.goto(`${CAMPUS_BASE_URL}${path}`)
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  await expectNoHorizontalOverflow(page)
}

test.describe('@p9 visual, reflow and automated accessibility matrix', () => {
  test.beforeAll(() => mkdirSync(OUTPUT, { recursive: true }))

  test('Home at all required widths; history and Capability Map/list anchors at desktop and narrow', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'The width sweep is browser-independent; cross-browser anchors run below.')
    test.setTimeout(360_000)
    await signInSynthetic(page, CAMPUS_BASE_URL, 'p9-widths')
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width >= 768 ? 900 : 760 })
      await stablePage(page, '/app/home')
      await expectNoSeriousAxe(page)
      await page.screenshot({ path: join(OUTPUT, `home-${width}.png`), fullPage: true })
    }
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: width >= 768 ? 900 : 760 })
      await stablePage(page, '/app/assessments')
      await page.screenshot({ path: join(OUTPUT, `history-${width}.png`), fullPage: true })
      await stablePage(page, '/app/capabilities')
      await expectNoSeriousAxe(page)
      await page.screenshot({ path: join(OUTPUT, `capability-map-list-${width}.png`), fullPage: true })
    }
  })

  test('each configured browser exposes the Personal/Campus disclosure and a keyboard-reachable main region', async ({ page }, testInfo) => {
    await signInSynthetic(page, CAMPUS_BASE_URL, `p9-${testInfo.project.name}`)
    await page.setViewportSize({ width: testInfo.project.name === 'mobile-chromium' ? 390 : 1280, height: 844 })
    await stablePage(page, '/app/home')
    await expect(page.getByRole('button', { name: /Workspace Personal Private to you/i })).toBeVisible()
    await expect(page.getByText('Only you can see this workspace.')).toBeVisible()
    await expectNoSeriousAxe(page)
    const skip = page.getByRole('link', { name: /skip to (main )?content/i }).first()
    if (linksTabbable(page)) {
      await page.keyboard.press('Tab')
      await expect(skip).toBeFocused()
      await page.keyboard.press('Enter')
    } else {
      await skip.focus()
      await page.keyboard.press('Enter')
    }
    await expect(page.locator('main')).toBeFocused()
    await page.screenshot({ path: join(OUTPUT, `workspace-disclosure-${testInfo.project.name}.png`), fullPage: true })
  })
})
