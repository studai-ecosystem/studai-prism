// Prism Campus C12.06 — accessibility sweep of every campus administration
// route and the student campus workspace (spec §42, §48.5, §52): an h1, no
// serious/critical axe violations (WCAG 2.0–2.2 A/AA rules), no horizontal
// overflow, a skip link that moves focus to main, and keyboard focus that
// always lands on a visible element. Campus harness (flags on in the test
// process only, K2), throwaway campus store, synthetic users only.
import { test, expect } from '@playwright/test'
import { CAMPUS_BASE_URL, api, signInSynthetic, expectNoSeriousAxe, expectNoHorizontalOverflow, linksTabbable } from './campusHelpers.js'
import { seedOrganization, seedCohortInvite } from '../fixtures/campusSeed.mjs'

const DB = process.env.PRISM_E2E_DATABASE_URL
const ADMIN_ROUTES = [
  'overview', 'setup', 'students', 'cohorts', 'cohorts/import', 'programs', 'assessments', 'assessments/assign',
  'development', 'reassessments', 'analytics', 'reports', 'members', 'integrations', 'billing', 'settings',
]
const STUDENT_ROUTES = ['home', 'assignments', 'development', 'growth']

async function keyboardCheck(page) {
  const skip = page.getByRole('link', { name: /skip to (main )?content/i })
  if (linksTabbable(page)) {
    await page.keyboard.press('Tab')
    await expect(skip.first(), 'every campus page has a skip link as the first tab stop').toBeFocused()
  } else {
    // WebKit keeps links out of the Tab order (Safari default): the skip link
    // must still exist and work from the keyboard once focused.
    await skip.first().focus()
    await expect(skip.first(), 'every campus page has a skip link').toBeFocused()
  }
  await page.keyboard.press('Enter')
  await expect.poll(() => page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)).toMatch(/main/i)
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Tab')
    const visible = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return true
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden'
    })
    expect(visible, 'keyboard focus stays on a visible element').toBe(true)
  }
}

test.describe('@critical @campus @a11y Accessibility sweep — every campus route', () => {
  test.skip(!DB, 'The sweep needs the throwaway campus store (PRISM_E2E_DATABASE_URL); CI and the gate runner provide it')

  test('campus administration and student campus routes: h1, axe, overflow, keyboard', async ({ page, browser }) => {
    test.setTimeout(300_000)
    const admin = await signInSynthetic(page, CAMPUS_BASE_URL, 'a11y-owner')
    const org = await seedOrganization({ databaseUrl: DB, ownerUserId: admin.user.id })
    const o = (p) => `/api/v1/organizations/${org.organizationId}${p}`
    const cohort = await api(page, o('/cohorts'), { method: 'POST', token: admin.token, body: { name: `A11y cohort ${Date.now()}` } })
    expect(cohort.status).toBe(201)

    for (const route of ADMIN_ROUTES) {
      await page.goto(`${CAMPUS_BASE_URL}/campus/${org.organizationId}/${route}`)
      await expect(page.getByRole('heading', { level: 1 }).first(), route).toBeVisible()
      await expectNoSeriousAxe(page)
      await expectNoHorizontalOverflow(page)
      await keyboardCheck(page)
    }

    const studentContext = await browser.newContext()
    const studentPage = await studentContext.newPage()
    try {
      const student = await signInSynthetic(studentPage, CAMPUS_BASE_URL, 'a11y-student')
      const { token } = await seedCohortInvite({ databaseUrl: DB, organizationId: org.organizationId, cohortId: cohort.body.data.id, email: student.email, invitedBy: admin.user.id })
      expect((await api(studentPage, `/api/v1/org-invites/${token}/accept`, { method: 'POST', token: student.token, body: { acknowledged: true } })).status).toBe(200)
      for (const route of STUDENT_ROUTES) {
        await studentPage.goto(`${CAMPUS_BASE_URL}/app/campus/${org.organizationId}/${route}`)
        await expect(studentPage.getByRole('heading', { level: 1 }).first(), route).toBeVisible()
        await expectNoSeriousAxe(studentPage)
        await expectNoHorizontalOverflow(studentPage)
        await keyboardCheck(studentPage)
      }
      // The rater page states what it needs when no rater token is present.
      await studentPage.goto(`${CAMPUS_BASE_URL}/rater/evidence`)
      await expect(studentPage.getByRole('heading', { level: 1, name: 'Rate evidence' })).toBeVisible()
      await expectNoSeriousAxe(studentPage)
    } finally {
      await studentContext.close()
    }
  })
})
