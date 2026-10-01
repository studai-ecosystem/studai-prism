// Prism Campus C7.13 — Journey C (spec §43): a campus admin sets up a cohort,
// imports students from CSV (one bad row is shown before anything is sent),
// creates a program, assigns an approved assessment and monitors completion.
// A student who accepts an invitation into the cohort afterwards is added to
// the open assessment automatically. Campus harness server (flags on in the
// test process only, K2), throwaway campus store, synthetic users only.
import { test, expect } from '@playwright/test'
import { CAMPUS_BASE_URL, api, signInSynthetic, syntheticEmail, expectNoSeriousAxe, expectNoHorizontalOverflow } from './campusHelpers.js'
import { seedOrganization, seedCohortInvite } from '../fixtures/campusSeed.mjs'

const DB = process.env.PRISM_E2E_DATABASE_URL

test.describe('@critical @campus Journey C — campus admin sets up and assigns', () => {
  test.skip(!DB, 'Journey C needs the throwaway campus store (PRISM_E2E_DATABASE_URL); CI and the gate runner provide it')

  test('cohort → CSV import with a bad row → program → assign → completion; late joiner is rostered', async ({ page, browser }) => {
    test.setTimeout(180_000)
    const admin = await signInSynthetic(page, CAMPUS_BASE_URL, 'journey-c-owner')
    const org = await seedOrganization({ databaseUrl: DB, ownerUserId: admin.user.id })
    const base = `${CAMPUS_BASE_URL}/campus/${org.organizationId}`
    const cohortName = `Journey C cohort ${Date.now()}`

    await page.goto(`${base}/overview`)
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
    await expect(page.getByText('Finish setting up')).toBeVisible()
    await expectNoSeriousAxe(page)

    // Sections of later phases are honest pages (no redirect loop).
    await page.goto(`${base}/analytics`)
    await expect(page.getByRole('heading', { level: 1, name: 'Analytics' })).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/campus/${org.organizationId}/analytics$`))
    await page.goto(`${base}/no-such-section`)
    await expect(page).toHaveURL(new RegExp(`/campus/${org.organizationId}/overview$`))

    // 1. Cohort.
    await page.goto(`${base}/cohorts`)
    await expect(page.getByRole('heading', { level: 1, name: 'Cohorts' })).toBeVisible()
    await page.getByRole('button', { name: 'Create cohort' }).first().click()
    const cohortDialog = page.getByRole('dialog', { name: 'Create a cohort' })
    await expectNoSeriousAxe(page)
    await cohortDialog.getByRole('textbox', { name: /^Name/ }).fill(cohortName)
    await cohortDialog.getByRole('button', { name: 'Create cohort' }).click()
    await expect(page.getByRole('link', { name: cohortName })).toBeVisible()
    const cohorts = await api(page, `/api/v1/organizations/${org.organizationId}/cohorts`, { token: admin.token })
    const cohortId = cohorts.body.data.items.find((c) => c.name === cohortName).id

    // 2. CSV import: the bad row is visible before anything is sent.
    await page.goto(`${base}/cohorts/import`)
    await expect(page.getByRole('heading', { level: 1, name: 'Import students' })).toBeVisible()
    const csv = [
      'email,name,cohort',
      `${syntheticEmail('c-one')},Synthetic One,${cohortName}`,
      `${syntheticEmail('c-two')},Synthetic Two,${cohortName}`,
      `not-an-email,Broken Row,${cohortName}`,
    ].join('\n')
    await page.getByLabel('CSV file').setInputFiles({ name: 'students.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
    await page.getByRole('button', { name: 'Check file' }).click()
    await expect(page.getByRole('heading', { name: 'Check the rows before sending' })).toBeVisible()
    await expect(page.getByText('Email is not valid')).toBeVisible()
    await expect(page.getByText(/1 row has a problem and will be skipped/)).toBeVisible()
    await expectNoSeriousAxe(page)
    await page.getByRole('button', { name: 'Invite 2 students' }).click()
    await expect(page.getByRole('heading', { name: 'Import complete' })).toBeVisible()
    await expect(page.getByRole('table', { name: 'Rows in the file' }).getByText('Invited')).toHaveCount(2)

    // 3. Program with the cohort.
    await page.goto(`${base}/programs`)
    await page.getByRole('button', { name: 'Create program' }).first().click()
    const programDialog = page.getByRole('dialog', { name: 'Create a program' })
    await programDialog.getByRole('textbox', { name: /^Name/ }).fill('Journey C placement season')
    await programDialog.getByLabel(cohortName).check()
    await programDialog.getByRole('button', { name: 'Create program' }).click()
    await expect(page.getByRole('link', { name: 'Journey C placement season' })).toBeVisible()

    // 4. Assign an approved assessment to the cohort.
    await page.goto(`${base}/assessments/assign`)
    await expect(page.getByRole('heading', { level: 1, name: 'Assign an assessment' })).toBeVisible()
    await page.getByRole('radio').first().check()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByLabel(cohortName).check()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByText('What students will be told')).toBeVisible()
    await expect(page.getByText(/not shared automatically/)).toBeVisible()
    await expectNoSeriousAxe(page)
    await page.getByRole('button', { name: 'Assign and notify students' }).click()
    await expect(page).toHaveURL(/\/assessments\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { name: 'Completion' })).toBeVisible()
    const assignmentUrl = page.url()

    // 5. A student accepts an invitation into the cohort → rostered automatically.
    const studentContext = await browser.newContext()
    const studentPage = await studentContext.newPage()
    const student = await signInSynthetic(studentPage, CAMPUS_BASE_URL, 'journey-c-student')
    const { token } = await seedCohortInvite({ databaseUrl: DB, organizationId: org.organizationId, cohortId, email: student.email, invitedBy: admin.user.id })
    await studentPage.goto(`${CAMPUS_BASE_URL}/app/campus-invite/${token}`)
    await studentPage.getByLabel(`I have read what ${org.organizationName} can and cannot see`).check()
    await studentPage.getByRole('button', { name: 'Accept and join' }).click()
    await expect(studentPage).toHaveURL(new RegExp(`/app/campus/${org.organizationId}/home$`))
    const mine = await api(studentPage, '/api/v1/me/notifications', { token: student.token })
    expect(mine.status).toBe(200)
    await studentContext.close()

    // 6. Monitor completion: the late joiner appears as not started.
    await page.goto(assignmentUrl)
    const table = page.getByRole('table', { name: /Students assigned/ })
    await expect(table.getByRole('link', { name: 'Synthetic Campus User' })).toBeVisible()
    await expect(table.getByText('Not started')).toBeVisible()
    await expectNoSeriousAxe(page)
    await expectNoHorizontalOverflow(page)

    // The students directory shows the enrolled student and the two invitations.
    await page.goto(`${base}/students`)
    await expect(page.getByRole('table', { name: 'Students' }).getByRole('button', { name: 'Resend invite' })).toHaveCount(2)
    await expectNoSeriousAxe(page)
    await expectNoHorizontalOverflow(page)

    // The organization activity log records what the admin did.
    const log = await api(page, `/api/v1/organizations/${org.organizationId}/audit`, { token: admin.token })
    const actions = log.body.data.items.map((e) => e.action)
    for (const a of ['cohort.created', 'import.committed', 'program.created', 'assignment.launched']) expect(actions).toContain(a)
  })
})
