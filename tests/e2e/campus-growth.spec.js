// Prism Campus C9.07 — reassessment + growth journeys (spec §17, §25): a
// campus admin schedules a reassessment of an earlier sponsored assessment
// through the UI and is told the forms are not yet approved as comparable;
// the rostered student sees the reassessment on their growth timeline and an
// honest "no change yet" state — no delta appears anywhere while the form
// pair is PENDING. Campus harness (flags on in the test process only, K2),
// throwaway campus store, synthetic users only.
import { test, expect } from '@playwright/test'
import { CAMPUS_BASE_URL, api, signInSynthetic, expectNoSeriousAxe, expectNoHorizontalOverflow } from './campusHelpers.js'
import { seedOrganization, seedCohortInvite } from '../fixtures/campusSeed.mjs'

const DB = process.env.PRISM_E2E_DATABASE_URL

test.describe('@critical @campus Growth V2 — reassessments and comparable-only growth', () => {
  test.skip(!DB, 'Growth journeys need the throwaway campus store (PRISM_E2E_DATABASE_URL); CI and the gate runner provide it')

  test('schedule a reassessment (forms not yet approved) → student timeline, no delta anywhere', async ({ page, browser }) => {
    test.setTimeout(180_000)
    const admin = await signInSynthetic(page, CAMPUS_BASE_URL, 'growth-owner')
    const org = await seedOrganization({ databaseUrl: DB, ownerUserId: admin.user.id })
    const o = (p) => `/api/v1/organizations/${org.organizationId}${p}`
    const cohort = await api(page, o('/cohorts'), { method: 'POST', token: admin.token, body: { name: `Growth cohort ${Date.now()}` } })
    expect(cohort.status).toBe(201)
    const cohortId = cohort.body.data.id

    const studentContext = await browser.newContext({ viewport: page.viewportSize() })
    const studentPage = await studentContext.newPage()
    const student = await signInSynthetic(studentPage, CAMPUS_BASE_URL, 'growth-student')
    const { token } = await seedCohortInvite({ databaseUrl: DB, organizationId: org.organizationId, cohortId, email: student.email, invitedBy: admin.user.id })
    expect((await api(studentPage, `/api/v1/org-invites/${token}/accept`, { method: 'POST', token: student.token, body: { acknowledged: true } })).status).toBe(200)

    const catalog = await api(page, o('/assessment-catalog'), { token: admin.token })
    const definition = catalog.body.data.items[0]
    const now = Date.now()
    const baseline = await api(page, o('/assignments'), { method: 'POST', token: admin.token, body: { definitionId: definition.id, cohortIds: [cohortId], windowStart: new Date(now - 60_000).toISOString(), windowEnd: new Date(now + 3 * 86_400_000).toISOString() } })
    expect(baseline.status).toBe(201)

    // Admin schedules the reassessment through the UI.
    const base = `${CAMPUS_BASE_URL}/campus/${org.organizationId}`
    await page.goto(`${base}/reassessments`)
    await expect(page.getByRole('heading', { level: 1, name: 'Reassessments' })).toBeVisible()
    await expect(page.getByText('No reassessments yet')).toBeVisible()
    await expectNoSeriousAxe(page)
    await page.getByRole('button', { name: 'Schedule reassessment' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Schedule a reassessment' })
    await dialog.getByRole('button', { name: 'Schedule reassessment' }).click()
    await expect(dialog.getByText('Give the reassessment a name.')).toBeVisible()
    await expectNoSeriousAxe(page)
    await dialog.getByRole('textbox', { name: /^Name/ }).fill('Growth check')
    await dialog.getByLabel(/Baseline assessment/).selectOption(baseline.body.data.id)
    await dialog.getByRole('button', { name: 'Schedule reassessment' }).click()
    await expect(dialog).toBeHidden()
    const table = page.getByRole('table', { name: 'Reassessments' })
    await expect(table.getByText('Not yet approved')).toBeVisible()
    await expect(table.getByText('Scheduled')).toBeVisible()
    await expectNoSeriousAxe(page)
    await expectNoHorizontalOverflow(page)
    await table.getByRole('button', { name: 'Growth check' }).click()
    const detail = page.getByRole('dialog', { name: 'Growth check' })
    await expect(detail.getByText(/no growth change will be shown until a psychometric review approves the forms/)).toBeVisible()
    await expect(detail.getByText('No capability change can be shown yet.')).toBeVisible()
    await expectNoSeriousAxe(page)
    await detail.getByRole('button', { name: /close/i }).first().click()

    // The student sees the reassessment on the timeline and no change.
    await studentPage.goto(`${CAMPUS_BASE_URL}/app/campus/${org.organizationId}/growth`)
    await expect(studentPage.getByRole('heading', { level: 1, name: 'Growth' })).toBeVisible()
    await expect(studentPage.getByText('Growth appears after a comparable reassessment')).toBeVisible()
    await expect(studentPage.getByTestId('growth-timeline').getByText('Growth check')).toBeVisible()
    await expect(studentPage.getByTestId('growth-change')).toHaveCount(0)
    expect(await studentPage.locator('main').innerText()).not.toMatch(/\d+\s*%|score|points|±/i)
    await expectNoSeriousAxe(studentPage)
    await expectNoHorizontalOverflow(studentPage)
    const g = await api(studentPage, '/api/v1/me/growth', { token: student.token, headers: { 'X-Prism-Workspace': (await api(studentPage, '/api/v1/me', { token: student.token })).body.data.workspaces.find((w) => w.type === 'CAMPUS_STUDENT').id } })
    expect(g.status).toBe(200)
    expect(g.body.data.changes).toEqual([])
    expect(g.body.data.reassessments.map((r) => r.name)).toEqual(['Growth check'])
    await studentPage.goto(`${CAMPUS_BASE_URL}/app/growth`)
    await expect(studentPage.getByTestId('growth-timeline')).toHaveCount(0)
    await studentContext.close()

    // Cancelling needs a confirmation and releases the window.
    await table.getByRole('button', { name: 'Growth check' }).click()
    await detail.getByRole('button', { name: 'Cancel reassessment' }).click()
    const confirm = page.getByRole('dialog', { name: 'Cancel this reassessment?' })
    await confirm.getByRole('button', { name: 'Cancel reassessment' }).click()
    await expect(table.getByText('Cancelled')).toBeVisible()
    const log = await api(page, o('/audit'), { token: admin.token })
    expect(log.body.data.items.map((e) => e.action)).toEqual(expect.arrayContaining(['reassessment.created', 'reassessment.cancelled']))
    const outcomes = await api(page, o('/analytics/growth'), { token: admin.token })
    expect(outcomes.status).toBe(200)
    expect(outcomes.body.data.items[0].capabilities).toEqual([])
  })
})
