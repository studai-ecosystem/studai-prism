// Prism Campus C10.07 — analytics and reports journey (spec §20, §27, §28):
// an owner opens Analytics (small groups hidden with the §27.2 sentence,
// table equivalents, completion funnel), exports aggregate CSV, generates an
// executive report and sets the privacy threshold; the overview shows the
// capability overview and the new counts. Campus harness (flags on in the
// test process only, K2), throwaway campus store, synthetic users only.
import { test, expect } from '@playwright/test'
import { CAMPUS_BASE_URL, api, signInSynthetic, expectNoSeriousAxe, expectNoHorizontalOverflow } from './campusHelpers.js'
import { seedOrganization, seedCohortInvite } from '../fixtures/campusSeed.mjs'

const DB = process.env.PRISM_E2E_DATABASE_URL
const SENTENCE = 'Data hidden because this segment is too small for aggregate reporting.'

test.describe('@critical @campus Analytics — aggregate, suppressed, audited', () => {
  test.skip(!DB, 'Analytics journeys need the throwaway campus store (PRISM_E2E_DATABASE_URL); CI and the gate runner provide it')

  test('analytics views → CSV export → executive report → privacy threshold → overview', async ({ page, browser }) => {
    test.setTimeout(180_000)
    const admin = await signInSynthetic(page, CAMPUS_BASE_URL, 'analytics-owner')
    const org = await seedOrganization({ databaseUrl: DB, ownerUserId: admin.user.id })
    const o = (p) => `/api/v1/organizations/${org.organizationId}${p}`
    const cohort = await api(page, o('/cohorts'), { method: 'POST', token: admin.token, body: { name: `Analytics cohort ${Date.now()}` } })
    const cohortId = cohort.body.data.id
    const studentContext = await browser.newContext()
    const studentPage = await studentContext.newPage()
    const student = await signInSynthetic(studentPage, CAMPUS_BASE_URL, 'analytics-student')
    const { token } = await seedCohortInvite({ databaseUrl: DB, organizationId: org.organizationId, cohortId, email: student.email, invitedBy: admin.user.id })
    expect((await api(studentPage, `/api/v1/org-invites/${token}/accept`, { method: 'POST', token: student.token, body: { acknowledged: true } })).status).toBe(200)
    // Students cannot read analytics.
    expect((await api(studentPage, o('/analytics/capabilities'), { token: student.token })).status).toBe(404)
    await studentContext.close()
    const catalog = await api(page, o('/assessment-catalog'), { token: admin.token })
    const now = Date.now()
    expect((await api(page, o('/assignments'), { method: 'POST', token: admin.token, body: { definitionId: catalog.body.data.items[0].id, cohortIds: [cohortId], windowStart: new Date(now - 60_000).toISOString(), windowEnd: new Date(now + 86_400_000).toISOString() } })).status).toBe(201)

    const base = `${CAMPUS_BASE_URL}/campus/${org.organizationId}`
    await page.goto(`${base}/analytics`)
    await expect(page.getByRole('heading', { level: 1, name: 'Analytics' })).toBeVisible()
    await expect(page.getByText(SENTENCE)).toBeVisible()
    await expect(page.getByText(/assessed students?\./)).toHaveCount(0)
    await expectNoSeriousAxe(page)
    await expectNoHorizontalOverflow(page)

    await page.getByRole('tab', { name: 'Completion' }).click()
    const funnel = page.getByRole('table', { name: 'Assessment completion funnel' })
    await expect(funnel.getByRole('row', { name: /Assigned 1 of 1/ })).toBeVisible()
    await expect(funnel.getByRole('row', { name: /Completed 0 of 1/ })).toBeVisible()
    await expectNoSeriousAxe(page)
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export CSV' }).click()
    expect((await download).suggestedFilename()).toBe('prism-analytics-completion.csv')

    await page.getByRole('tab', { name: 'Comparison' }).click()
    await expect(page.getByText(SENTENCE).first()).toBeVisible()
    await expectNoSeriousAxe(page)

    // Executive report, generated on request.
    await page.goto(`${base}/reports`)
    await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible()
    await page.getByRole('button', { name: 'Generate report' }).click()
    const report = page.getByTestId('campus-report')
    await expect(report.getByRole('heading', { name: 'Executive cohort report' })).toBeFocused()
    await expect(report.getByRole('heading', { name: 'Recommended next actions' })).toBeVisible()
    await expect(report.getByText(/1 assigned assessment is not completed yet/)).toBeVisible()
    expect(await report.innerText()).not.toMatch(/\d\s*%|leaderboard|average score/i)
    await expectNoSeriousAxe(page)
    await expectNoHorizontalOverflow(page)

    // Privacy threshold (owners).
    await page.goto(`${base}/settings`)
    await page.getByRole('tab', { name: 'Analytics privacy' }).click()
    const input = page.getByLabel('Minimum students per group')
    await input.fill('4')
    await expect(page.getByText('Enter a whole number from 5 to 1000.')).toBeVisible()
    await input.fill('12')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Privacy threshold saved.')).toBeVisible()
    await expectNoSeriousAxe(page)

    // Overview: capability overview (hidden while small) and the new counts.
    await page.goto(`${base}/overview`)
    await expect(page.getByRole('heading', { name: 'Capability overview' })).toBeVisible()
    await expect(page.getByText(SENTENCE).first()).toBeVisible()
    await expect(page.getByText('Development missions active')).toBeVisible()
    await expect(page.getByText('Reassessments due')).toBeVisible()
    await expectNoSeriousAxe(page)

    const log = await api(page, o('/audit'), { token: admin.token })
    expect(log.body.data.items.map((e) => e.action)).toEqual(expect.arrayContaining(['report.exported', 'analytics.settings.updated']))
    const settings = await api(page, o('/settings/analytics'), { token: admin.token })
    expect(settings.body.data.minAggregateGroupSize).toBe(12)
  })
})
