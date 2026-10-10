// PROD-READY Phase 8 — campus P3 UX follow-ups at 360 / 768 / 1280:
// analytics filters collapse behind a disclosure below lg (data on the first
// screen) and stay visible from lg up; each analytics view has its own h2;
// shared tables stack as labelled rows below md so the interventions table
// never scrolls sideways at 360; the mission player offers a "Go to your
// work" jump link below lg (hidden at 1280) that reaches the Start button.
// No horizontal page scroll and axe 0 serious/critical at every width.
// Campus harness (flags on in the test process only, K2), throwaway campus
// store, synthetic users only.
import { test, expect } from '@playwright/test'
import { CAMPUS_BASE_URL, api, signInSynthetic, expectNoSeriousAxe, expectNoHorizontalOverflow } from './campusHelpers.js'
import { seedOrganization } from '../fixtures/campusSeed.mjs'

const DB = process.env.PRISM_E2E_DATABASE_URL
const WIDTHS = [360, 768, 1280]
const LG = 1024
const MISSION_ID = 'MIS-MKT-EXP-01'
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

// The element fits its own box: nothing inside scrolls sideways.
const scrollsSideways = (locator) => locator.evaluate((el) => el.scrollWidth - el.clientWidth > 1)

test.describe('@campus @a11y PROD P08 UX polish — analytics, tables, mission jump link', () => {
  test.skip(!DB, 'Campus analytics and interventions need the throwaway campus store (PRISM_E2E_DATABASE_URL); CI and the gate runner provide it')

  for (const width of WIDTHS) {
    test(`width ${width}: analytics filters, view headings, stacked tables and the mission jump link`, async ({ page, browser }) => {
      test.setTimeout(180_000)
      await page.setViewportSize({ width, height: width >= LG ? 900 : 800 })
      const admin = await signInSynthetic(page, CAMPUS_BASE_URL, `p08-ux-owner-${width}`)
      const org = await seedOrganization({ databaseUrl: DB, ownerUserId: admin.user.id })
      const o = (p) => `/api/v1/organizations/${org.organizationId}${p}`
      const cohort = await api(page, o('/cohorts'), { method: 'POST', token: admin.token, body: { name: `UX cohort ${width} ${Date.now()}` } })
      expect(cohort.status).toBe(201)
      const intervention = await api(page, o('/interventions'), {
        method: 'POST',
        token: admin.token,
        body: { name: 'Experimentation sprint with a long descriptive name', targetCapabilityId: 'CAP-MKT-EXPERIMENTATION', cohortId: cohort.body.data.id, startsOn: day(0), endsOn: day(30), missionIds: [MISSION_ID] },
      })
      expect(intervention.status, JSON.stringify(intervention.body)).toBe(201)
      const base = `${CAMPUS_BASE_URL}/campus/${org.organizationId}`

      // ── Analytics: filter disclosure below lg, always-visible filters at lg+.
      await page.goto(`${base}/analytics`)
      await expect(page.getByRole('heading', { level: 1, name: 'Analytics' })).toBeVisible()
      const filters = page.getByRole('form', { name: 'Filters' })
      const toggle = page.getByRole('button', { name: /^Filters/ })
      await expect(page.getByRole('tabpanel').getByRole('heading', { level: 2, name: 'Capability levels' })).toBeVisible()
      if (width < LG) {
        await expect(toggle).toBeVisible()
        await expect(toggle).toHaveAttribute('aria-expanded', 'false')
        await expect(filters).toBeHidden()
        // The data starts on the first screen.
        await expect(page.getByRole('tab', { name: 'Capabilities' })).toBeInViewport()
        await expectNoSeriousAxe(page)
        await expectNoHorizontalOverflow(page)
        await toggle.click()
        await expect(toggle).toHaveAttribute('aria-expanded', 'true')
        await expect(filters).toBeVisible()
        await expect(filters.getByLabel('Cohort')).toBeVisible()
        await toggle.click()
        await expect(filters).toBeHidden()
      } else {
        await expect(toggle).toBeHidden()
        await expect(filters).toBeVisible()
        await expect(filters.getByLabel('Cohort')).toBeVisible()
      }
      await expectNoSeriousAxe(page)
      await expectNoHorizontalOverflow(page)

      // Interventions view: its own h2; the table never pushes the page sideways.
      await page.getByRole('tab', { name: 'Interventions' }).click()
      const panel = page.getByRole('tabpanel')
      await expect(panel.getByRole('heading', { level: 2, name: 'Intervention outcomes' })).toBeVisible()
      const practice = panel.getByRole('table', { name: 'Practice interventions' })
      await expect(practice.getByText('Experimentation sprint with a long descriptive name')).toBeVisible()
      if (width < 768) expect(await scrollsSideways(page.getByRole('region', { name: 'Practice interventions' }))).toBe(false)
      await expectNoSeriousAxe(page)
      await expectNoHorizontalOverflow(page)

      // ── Campus development: the interventions table stacks below md.
      await page.goto(`${base}/development`)
      await expect(page.getByRole('heading', { level: 1, name: 'Development' })).toBeVisible()
      const table = page.getByRole('table', { name: 'Interventions' })
      await expect(table.getByText('0 of 0 finished all missions')).toBeVisible()
      const region = page.getByRole('region', { name: 'Interventions' })
      if (width < 768) {
        expect(await scrollsSideways(region), 'the interventions table does not scroll sideways at small widths').toBe(false)
        // Each value carries its column header as a visible label.
        const progress = table.locator('td[data-label="Progress"]').first()
        const label = await progress.evaluate((el) => getComputedStyle(el, '::before').content)
        expect(label).toContain('Progress')
        await expect(table.getByRole('columnheader', { name: 'Progress' })).toBeAttached()
      } else {
        await expect(table.getByRole('columnheader', { name: 'Progress' })).toBeVisible()
      }
      await expectNoSeriousAxe(page)
      await expectNoHorizontalOverflow(page)

      // ── Mission player: "Go to your work" below lg, hidden at lg+.
      const studentContext = await browser.newContext({ viewport: { width, height: width >= LG ? 900 : 800 } })
      const studentPage = await studentContext.newPage()
      try {
        await signInSynthetic(studentPage, CAMPUS_BASE_URL, `p08-ux-learner-${width}`)
        await studentPage.goto(`${CAMPUS_BASE_URL}/app/development`)
        await expect(studentPage.getByRole('heading', { level: 1, name: 'Development' })).toBeVisible()
        await expectNoSeriousAxe(studentPage)
        await expectNoHorizontalOverflow(studentPage)
        await studentPage.goto(`${CAMPUS_BASE_URL}/app/development/missions/${MISSION_ID}`)
        await expect(studentPage.getByRole('heading', { level: 1 })).toBeVisible()
        const jump = studentPage.getByRole('link', { name: 'Go to your work' })
        const start = studentPage.getByRole('button', { name: 'Start mission' })
        await expect(start).toBeVisible()
        if (width < LG) {
          await expect(jump).toBeVisible()
          await expect(jump).toBeInViewport()
          await jump.click()
          await expect(studentPage.getByRole('heading', { level: 2, name: 'Your work' })).toBeFocused()
          await expect(start).toBeInViewport()
        } else {
          await expect(jump).toBeHidden()
        }
        await expectNoSeriousAxe(studentPage)
        await expectNoHorizontalOverflow(studentPage)
      } finally {
        await studentContext.close()
      }
    })
  }
})
