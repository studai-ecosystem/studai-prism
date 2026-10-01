// Prism Campus C8.11 — Development V2 journeys (spec §16, §26, §43): a
// personal user opens a governed practice mission, works in the artifact
// workspace (autosaved), submits and gets criterion feedback, then retries;
// a campus admin builds a cohort intervention and a rostered student sees the
// mission only in the campus workspace, completes it, and the institution
// sees a completion count (never the work). Campus harness (flags on in the
// test process only, K2), throwaway campus store, synthetic users only.
import { test, expect } from '@playwright/test'
import { CAMPUS_BASE_URL, api, signInSynthetic, expectNoSeriousAxe, expectNoHorizontalOverflow } from './campusHelpers.js'
import { seedOrganization, seedCohortInvite } from '../fixtures/campusSeed.mjs'

const DB = process.env.PRISM_E2E_DATABASE_URL
const MISSION = 'Design a clean A/B test for a new ad message'
const HYPOTHESIS = 'If we lead with the Clean Ingredients message then the conversion rate will rise because shoppers trust natural claims.'

async function doMission(page, missionUrlPattern) {
  await expect(page).toHaveURL(missionUrlPattern)
  await expect(page.getByRole('heading', { level: 1, name: MISSION })).toBeVisible()
  await expect(page.getByText('What will be checked')).toBeVisible()
  await page.getByRole('button', { name: /^Start (mission|a new attempt)$/ }).click()
  const hypothesis = page.getByLabel('Hypothesis', { exact: true })
  // Untouched starting work demonstrates nothing: the budget starts empty.
  await expect(page.getByLabel(/^Spend .* for Control/)).toHaveValue('')
  await hypothesis.fill(HYPOTHESIS)
  await page.getByLabel(/^Spend .* for Control/).fill('50000')
  await page.getByLabel(/^Spend .* for Test/).fill('50000')
  await expect(page.getByText('All changes saved')).toBeVisible({ timeout: 15_000 })
  await expectNoSeriousAxe(page)
  await expectNoHorizontalOverflow(page)

  await page.getByRole('button', { name: /^Hints/ }).click()
  const hints = page.getByRole('dialog', { name: 'Hints' })
  await hints.getByRole('button', { name: 'Show a hint' }).click()
  await expect(hints.getByText(/A hypothesis frame that works/)).toBeVisible()
  await hints.getByRole('button', { name: 'Close panel' }).click()

  await page.getByRole('button', { name: 'Submit for feedback' }).click()
  const confirm = page.getByRole('dialog', { name: 'Submit this attempt?' })
  await confirm.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByTestId('mission-summary')).toHaveText('Mission completed — 2 of 4 target behaviours demonstrated.')
  await expect(page.getByTestId('mission-criterion')).toHaveCount(4)
  await expect(page.getByTestId('mission-feedback').getByText('Shown', { exact: true })).toHaveCount(2)
  await expect(page.getByTestId('mission-feedback').getByText('Not shown yet', { exact: true })).toHaveCount(2)
  await expect(hypothesis).toBeDisabled()
  expect(await page.locator('main').innerText()).not.toMatch(/level\s*\d|score|points|\d+\s*%|badge/i)
  await expectNoSeriousAxe(page)
  await expectNoHorizontalOverflow(page)
}

test.describe('@critical @campus Development V2 — practice missions and interventions', () => {
  test.skip(!DB, 'Development journeys need the throwaway campus store (PRISM_E2E_DATABASE_URL); CI and the gate runner provide it')

  test('personal: plan → mission → autosave → hint → submit → criterion feedback → retry', async ({ page }) => {
    test.setTimeout(120_000)
    const me = await signInSynthetic(page, CAMPUS_BASE_URL, 'dev-personal')
    await page.goto(`${CAMPUS_BASE_URL}/app/development`)
    await expect(page.getByRole('heading', { level: 1, name: 'Development' })).toBeVisible()
    await expect(page.getByText(/No practice mission matches your current priorities yet/)).toBeVisible()
    await expectNoSeriousAxe(page)
    await expectNoHorizontalOverflow(page)
    await page.getByRole('link', { name: new RegExp(`^Open mission.*${MISSION.replace('/', '\\/')}`) }).click()
    await doMission(page, /\/app\/development\/missions\/MIS-MKT-EXP-01$/)

    // Retry starts a fresh attempt; the earlier one is listed.
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByLabel('Hypothesis', { exact: true })).toBeEnabled()
    await expect(page.getByLabel('Hypothesis', { exact: true })).toHaveValue('')
    await expect(page.getByText(/Mission completed — 2 of 4 target behaviours demonstrated\./).first()).toBeVisible()

    // Practice units are labelled practice and never become formal evidence.
    const evidence = await api(page, '/api/v1/me/evidence', { token: me.token })
    expect(evidence.status).toBe(200)
    const items = evidence.body.data.items
    expect(items.filter((i) => i.kind === 'PRACTICE').length).toBeGreaterThan(0)
    expect(items.filter((i) => i.kind !== 'PRACTICE')).toEqual([])
    const caps = await api(page, '/api/v1/me/capabilities', { token: me.token })
    expect(caps.status).toBe(200)
    expect(caps.body.data.assessedCount).toBe(0)
    await page.goto(`${CAMPUS_BASE_URL}/app/development`)
    await expect(page.getByRole('heading', { name: 'Your practice attempts' })).toBeVisible()
  })

  test('campus: intervention builder → rostered student completes in campus workspace → completion count', async ({ page, browser }) => {
    test.setTimeout(180_000)
    const admin = await signInSynthetic(page, CAMPUS_BASE_URL, 'dev-owner')
    const org = await seedOrganization({ databaseUrl: DB, ownerUserId: admin.user.id })
    const cohortName = `Dev cohort ${Date.now()}`
    const created = await api(page, `/api/v1/organizations/${org.organizationId}/cohorts`, { method: 'POST', token: admin.token, body: { name: cohortName } })
    expect(created.status).toBe(201)
    const cohortId = created.body.data.id

    const studentContext = await browser.newContext({ viewport: page.viewportSize() })
    const studentPage = await studentContext.newPage()
    const student = await signInSynthetic(studentPage, CAMPUS_BASE_URL, 'dev-student')
    const { token } = await seedCohortInvite({ databaseUrl: DB, organizationId: org.organizationId, cohortId, email: student.email, invitedBy: admin.user.id })
    const accepted = await api(studentPage, `/api/v1/org-invites/${token}/accept`, { method: 'POST', token: student.token, body: { acknowledged: true } })
    expect(accepted.status).toBe(200)

    // Before any intervention the campus workspace has no missions.
    await studentPage.goto(`${CAMPUS_BASE_URL}/app/campus/${org.organizationId}/development`)
    await expect(studentPage.getByText('Your institution has not assigned any practice missions here yet.')).toBeVisible()

    // Admin builds the intervention through the UI.
    const base = `${CAMPUS_BASE_URL}/campus/${org.organizationId}`
    await page.goto(`${base}/development`)
    await expect(page.getByRole('heading', { level: 1, name: 'Development' })).toBeVisible()
    await expect(page.getByText('No interventions yet')).toBeVisible()
    await page.getByRole('button', { name: 'Create intervention' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Create an intervention' })
    await dialog.getByRole('button', { name: 'Create intervention' }).click()
    await expect(dialog.getByText('Give the intervention a name.')).toBeVisible()
    await expect(dialog.getByText('Choose at least one mission.')).toBeVisible()
    await expectNoSeriousAxe(page)
    await dialog.getByRole('textbox', { name: /^Name/ }).fill('Experimentation sprint')
    await dialog.getByLabel(/Target capability/).selectOption('CAP-MKT-EXPERIMENTATION')
    await dialog.getByLabel(/^Cohort/).selectOption(cohortId)
    await dialog.getByLabel(MISSION).check()
    await dialog.getByRole('button', { name: 'Create intervention' }).click()
    await expect(dialog).toBeHidden()
    const table = page.getByRole('table', { name: 'Interventions' })
    await expect(table.getByText('0 of 1 finished all missions')).toBeVisible()
    await expectNoSeriousAxe(page)
    await expectNoHorizontalOverflow(page)

    // The rostered student sees it in the campus workspace, with the intervention named.
    await studentPage.goto(`${CAMPUS_BASE_URL}/app/campus/${org.organizationId}/development`)
    await studentPage.getByRole('link', { name: new RegExp(`^Open mission.*${MISSION.replace('/', '\\/')}`) }).first().click()
    await expect(studentPage.getByText(/Part of Experimentation sprint/)).toBeVisible()
    await expect(studentPage.getByText(/sees only whether you started and finished each assigned mission/)).toBeVisible()
    await doMission(studentPage, new RegExp(`/app/campus/${org.organizationId}/development/missions/MIS-MKT-EXP-01$`))
    await studentContext.close()

    // The institution sees a completion count only.
    await page.reload()
    await expect(page.getByRole('table', { name: 'Interventions' }).getByText('1 of 1 finished all missions')).toBeVisible()
    await page.getByRole('button', { name: 'Experimentation sprint' }).click()
    const detail = page.getByRole('dialog', { name: 'Experimentation sprint' })
    await expect(detail.getByText(`${MISSION}: 1 of 1 finished`)).toBeVisible()
    expect(await detail.innerText()).not.toContain(HYPOTHESIS)
    const log = await api(page, `/api/v1/organizations/${org.organizationId}/audit`, { token: admin.token })
    expect(log.body.data.items.map((e) => e.action)).toContain('intervention.assigned')
  })
})
