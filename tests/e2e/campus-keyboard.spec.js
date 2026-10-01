// Prism Campus C12.06 — keyboard-only walkthroughs of Journeys B, C and E
// (spec §42, §48.4, §48.5). No mouse: every control is reached with Tab
// (checking that focus actually lands on it) and operated with Enter, Space
// or typing. In WebKit, links are focused directly (Safari keeps links out of
// the Tab order by default; see `keyboardFocus`). Campus harness (flags on in
// the test process only, K2), throwaway campus store, the isolated audit AI
// mock, synthetic users only.
import { test, expect } from '@playwright/test'
import { CAMPUS_BASE_URL, api, signInSynthetic, expectNoSeriousAxe, keyboardFocus } from './campusHelpers.js'
import { ASSESSMENT_CONSENT_ITEMS } from '../../src/lib/copy/assessmentConsent.js'
import { seedOrganization, seedCohortInvite } from '../fixtures/campusSeed.mjs'

const DB = process.env.PRISM_E2E_DATABASE_URL

const tabTo = keyboardFocus
const press = async (page, locator, key = 'Enter') => { await tabTo(page, locator); await page.keyboard.press(key) }

test.describe('@critical @campus @a11y Keyboard-only journeys', () => {
  test.skip(!DB, 'Keyboard journeys need the throwaway campus store (PRISM_E2E_DATABASE_URL); CI and the gate runner provide it')

  test('Journey C and B by keyboard: cohort → program → assign; a student accepts the invitation', async ({ page, browser }) => {
    test.setTimeout(240_000)
    const admin = await signInSynthetic(page, CAMPUS_BASE_URL, 'kbd-owner')
    const org = await seedOrganization({ databaseUrl: DB, ownerUserId: admin.user.id })
    const base = `${CAMPUS_BASE_URL}/campus/${org.organizationId}`
    const cohortName = `Keyboard cohort ${Date.now()}`

    // Cohort.
    await page.goto(`${base}/cohorts`)
    await expect(page.getByRole('heading', { level: 1, name: 'Cohorts' })).toBeVisible()
    await press(page, page.getByRole('button', { name: 'Create cohort' }).first())
    const cohortDialog = page.getByRole('dialog', { name: 'Create a cohort' })
    const name = cohortDialog.getByRole('textbox', { name: /^Name/ })
    await tabTo(page, name)
    await page.keyboard.type(cohortName)
    await press(page, cohortDialog.getByRole('button', { name: 'Create cohort' }))
    await expect(page.getByRole('link', { name: cohortName })).toBeVisible()

    // Program with the cohort (checkbox with Space).
    await page.goto(`${base}/programs`)
    await press(page, page.getByRole('button', { name: 'Create program' }).first())
    const programDialog = page.getByRole('dialog', { name: 'Create a program' })
    await tabTo(page, programDialog.getByRole('textbox', { name: /^Name/ }))
    await page.keyboard.type('Keyboard placement season')
    await press(page, programDialog.getByLabel(cohortName), 'Space')
    await expect(programDialog.getByLabel(cohortName)).toBeChecked()
    await press(page, programDialog.getByRole('button', { name: 'Create program' }))
    await expect(page.getByRole('link', { name: 'Keyboard placement season' })).toBeVisible()

    // Assign an assessment through the wizard.
    await page.goto(`${base}/assessments/assign`)
    await expect(page.getByRole('heading', { level: 1, name: 'Assign an assessment' })).toBeVisible()
    await press(page, page.getByRole('radio').first(), 'Space')
    await expect(page.getByRole('radio').first()).toBeChecked()
    await press(page, page.getByRole('button', { name: 'Continue' }))
    await press(page, page.getByLabel(cohortName), 'Space')
    await press(page, page.getByRole('button', { name: 'Continue' }))
    await press(page, page.getByRole('button', { name: 'Continue' }))
    await expect(page.getByText('What students will be told')).toBeVisible()
    await press(page, page.getByRole('button', { name: 'Assign and notify students' }))
    await expect(page).toHaveURL(/\/assessments\/[0-9a-f-]{36}$/)
    await expectNoSeriousAxe(page)

    // Journey B step: a student accepts the invitation by keyboard.
    const cohorts = await api(page, `/api/v1/organizations/${org.organizationId}/cohorts`, { token: admin.token })
    const cohortId = cohorts.body.data.items.find((c) => c.name === cohortName).id
    const studentContext = await browser.newContext()
    const studentPage = await studentContext.newPage()
    try {
      const student = await signInSynthetic(studentPage, CAMPUS_BASE_URL, 'kbd-student')
      const { token } = await seedCohortInvite({ databaseUrl: DB, organizationId: org.organizationId, cohortId, email: student.email, invitedBy: admin.user.id })
      await studentPage.goto(`${CAMPUS_BASE_URL}/app/campus-invite/${token}`)
      const ack = studentPage.getByLabel(`I have read what ${org.organizationName} can and cannot see`)
      await press(studentPage, ack, 'Space')
      await expect(ack).toBeChecked()
      await press(studentPage, studentPage.getByRole('button', { name: 'Accept and join' }))
      await expect(studentPage).toHaveURL(new RegExp(`/app/campus/${org.organizationId}/home$`))
      await expectNoSeriousAxe(studentPage)
    } finally {
      await studentContext.close()
    }
  })

  test('Journey E by keyboard: consent → start → answer → connection drop → reconnect', async ({ page }) => {
    test.setTimeout(180_000)
    const student = await signInSynthetic(page, CAMPUS_BASE_URL, 'kbd-workspace')
    const dev = await api(page, '/api/payment/dev-session', { method: 'POST', token: student.token })
    expect(dev.status).toBe(200)
    await page.goto(`${CAMPUS_BASE_URL}/app/assessments`)
    await press(page, page.getByTestId('assignment-card').first().getByRole('link', { name: /Open briefing/ }))
    await press(page, page.getByRole('link', { name: 'Continue to system check' }))
    await expect(page.getByRole('heading', { level: 1, name: 'System check' })).toBeVisible()
    for (const item of ASSESSMENT_CONSENT_ITEMS) {
      await press(page, page.getByLabel(item.label), 'Space')
      await expect(page.getByLabel(item.label)).toBeChecked()
    }
    await press(page, page.getByRole('button', { name: 'Begin assessment' }))
    await expect(page).toHaveURL(new RegExp(`/app/assessment/${dev.body.sessionId}$`))

    const feed = page.getByTestId('conversation')
    const participants = feed.locator('[data-role="participant"]')
    await expect(participants.first()).toBeVisible()
    const before = await participants.count()
    await tabTo(page, page.getByLabel('Your answer'))
    await page.keyboard.type('Keyboard answer one: I would check the data first.')
    await press(page, page.getByRole('button', { name: 'Send' }))
    await expect(feed.locator('[data-role="candidate"]')).toHaveCount(1)
    await expect.poll(() => participants.count(), { timeout: 30_000 }).toBeGreaterThan(before)
    const afterFirst = await participants.count()

    await page.route('**/api/v1/assessment-sessions/**', (route) => route.abort('internetdisconnected'))
    await tabTo(page, page.getByLabel('Your answer'))
    await page.keyboard.type('Keyboard answer two: I would confirm the plan with the team.')
    await press(page, page.getByRole('button', { name: 'Send' }))
    await expect(page.getByText(/Not sent\./)).toBeVisible()
    await expect(page.getByTestId('reconnect-banner')).toBeVisible()
    expect(await participants.count()).toBe(afterFirst)
    await page.unroute('**/api/v1/assessment-sessions/**')
    await expect(page.getByTestId('reconnect-banner')).toBeHidden({ timeout: 30_000 })
    await expect.poll(() => participants.count(), { timeout: 30_000 }).toBeGreaterThan(afterFirst)
    await expectNoSeriousAxe(page)
  })
})
