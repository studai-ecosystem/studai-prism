// PROD-READY Phase 8 — the persistent "Demo data" banner. A member of a
// synthetic demo organization (organizations.is_demo, 0061) sees it on every
// screen of the app shell (student home, assessments, campus pages); a real
// account never does. Width matrix 360 / 768 / 1280 with axe 0
// serious/critical and no horizontal page scroll. Campus harness (flags on in
// the test process only, K2), throwaway campus store, synthetic users only.
import { test, expect } from '@playwright/test'
import { CAMPUS_BASE_URL, signInSynthetic, expectNoSeriousAxe, expectNoHorizontalOverflow } from './campusHelpers.js'
import { seedDemoMembership } from '../fixtures/campusSeed.mjs'

const DB = process.env.PRISM_E2E_DATABASE_URL
const WIDTHS = [360, 768, 1280]

test.describe('@campus @a11y PROD P08 demo data banner', () => {
  test.skip(!DB, 'Demo organizations need the throwaway campus store (PRISM_E2E_DATABASE_URL); CI and the gate runner provide it')

  for (const width of WIDTHS) {
    test(`width ${width}: banner on every demo screen, never for a real account`, async ({ page }) => {
      test.setTimeout(120_000)
      await page.setViewportSize({ width, height: 800 })
      const demo = await signInSynthetic(page, CAMPUS_BASE_URL, `p08-demo-${width}`)
      await seedDemoMembership({ databaseUrl: DB, userId: demo.user.id })
      for (const path of ['/app/home', '/app/assessments', '/app/settings']) {
        await page.goto(`${CAMPUS_BASE_URL}${path}`)
        const banner = page.getByRole('note', { name: 'Demo data' })
        await expect(banner, path).toBeVisible()
        await expect(banner).toContainText('synthetic')
        await expect(banner).toBeInViewport()
      }
      await expectNoSeriousAxe(page)
      await expectNoHorizontalOverflow(page)

      // A real account on the same server: no banner.
      await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
      await signInSynthetic(page, CAMPUS_BASE_URL, `p08-real-${width}`)
      await page.goto(`${CAMPUS_BASE_URL}/app/home`)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByRole('note', { name: 'Demo data' })).toHaveCount(0)
    })
  }
})
