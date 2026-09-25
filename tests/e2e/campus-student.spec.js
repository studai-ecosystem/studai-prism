// Prism Campus C4.14 — student application journeys (spec §9–§18, §43) on
// the campus harness server (flags on in-process only, K2). Synthetic users
// only. Personal journey: home → assessments → briefing → system check →
// capabilities (insufficient) → evidence (filters) → explore, at desktop and
// Pixel 7 widths with axe on every route. Sponsored journey (needs the
// throwaway campus store): home → assignment → briefing acknowledgement
// stored as a consent record.
import { test, expect, devices } from '@playwright/test'
import { CAMPUS_BASE_URL, api, signInSynthetic, expectNoSeriousAxe, expectNoHorizontalOverflow } from './campusHelpers.js'
import { seedSponsoredAssignment, listConsentRecords } from '../fixtures/campusSeed.mjs'

const DB = process.env.PRISM_E2E_DATABASE_URL

async function personalJourney(page, { mobile = false } = {}) {
  const student = await signInSynthetic(page, CAMPUS_BASE_URL, mobile ? 'student-mobile' : 'student-desktop')
  const dev = await api(page, '/api/payment/dev-session', { method: 'POST', token: student.token })
  expect(dev.status).toBe(200)
  const check = async () => {
    await expectNoSeriousAxe(page)
    if (mobile) await expectNoHorizontalOverflow(page)
  }

  // Home: the available assessment is the primary action.
  await page.goto(`${CAMPUS_BASE_URL}/app/home`)
  await expect(page.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening), Synthetic$/ })).toBeVisible()
  await expect(page.getByText('Ready to start')).toBeVisible()
  await expect(page.getByText('Only you can see this workspace.')).toBeVisible()
  await expect(page.getByTestId('capability-snapshot')).toHaveCount(5)
  await expect(page.locator('body')).not.toContainText('%')
  await check()

  // Assessments: scope is always visible.
  await page.goto(`${CAMPUS_BASE_URL}/app/assessments`)
  const card = page.getByTestId('assignment-card').first()
  await expect(card).toContainText('Personal assessment')
  await expect(card).toContainText('Not started')
  await check()

  // Briefing → system check → the legacy start step for this paid session.
  await card.getByRole('link', { name: /Open briefing/ }).click()
  await expect(page).toHaveURL(/\/app\/assessments\/pa_[0-9a-f]{32}\/briefing$/)
  await expect(page.getByRole('heading', { level: 2, name: /What it does not measure/ })).toBeVisible()
  await expect(page.getByText('Your facial expressions, voice tone or emotions')).toBeVisible()
  await expect(page.getByText(/This is a personal assessment\. Only you can see the result/)).toBeVisible()
  await check()
  await page.getByRole('link', { name: 'Continue to system check' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'System check' })).toBeVisible()
  await expect(page.getByText('Prism can be reached.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Begin assessment' })).toHaveAttribute('href', new RegExp(`session=${dev.body.sessionId}$`))
  await check()

  // Capabilities: nothing completed → honest empty state, every capability insufficient.
  await page.goto(`${CAMPUS_BASE_URL}/app/capabilities`)
  await expect(page.getByText('You do not have a formal capability profile yet.')).toBeVisible()
  await expect(page.getByTestId('capability-detail')).toHaveCount(5)
  await expect(page.getByTestId('capability-detail').first()).toContainText('Insufficient evidence')
  await check()

  // Evidence: filters in the URL are honoured (and junk is ignored).
  await page.goto(`${CAMPUS_BASE_URL}/app/evidence?kind=FORMAL&capability=%3Cscript%3E`)
  await expect(page.getByRole('heading', { name: 'No evidence recorded yet' })).toBeVisible()
  await check()

  // Explore V2: two separate panels, nothing evaluated until interests are chosen.
  await page.goto(`${CAMPUS_BASE_URL}/app/explore`)
  await expect(page.getByRole('heading', { level: 2, name: 'What you enjoy' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'What Prism observed' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show roles' })).toBeDisabled()
  await check()
  return student
}

test.describe('@critical @campus student application — personal journey', () => {
  test('desktop: home, assessments, briefing, system check, capabilities, evidence, explore', async ({ page }) => {
    await personalJourney(page)
  })
})

test.describe('@critical @campus student application — personal journey (Pixel 7)', () => {
  // Chromium project: take Pixel 7's viewport/touch/UA without switching browser.
  const { defaultBrowserType: _browser, ...pixel7 } = devices['Pixel 7']
  test.use(pixel7)
  test('mobile: the same journey without horizontal overflow', async ({ page }) => {
    await personalJourney(page, { mobile: true })
  })
})

test.describe('@critical @campus student application — sponsored briefing acknowledgement', () => {
  test.skip(!DB, 'needs the throwaway campus store (PRISM_E2E_DATABASE_URL); CI and the gate runner provide it')

  test('a sponsored assignment is due on the campus home; the disclosure acknowledgement is stored', async ({ page, browser }) => {
    const adminContext = await browser.newContext()
    const admin = await signInSynthetic(await adminContext.newPage(), CAMPUS_BASE_URL, 'campus-owner')
    const student = await signInSynthetic(page, CAMPUS_BASE_URL, 'campus-student')
    // Any assessments read seeds the frozen-bank catalog on the harness server.
    expect((await api(page, '/api/v1/me/assessments', { token: student.token })).status).toBe(200)
    const fixture = await seedSponsoredAssignment({ databaseUrl: DB, ownerUserId: admin.user.id, studentUserId: student.user.id })
    await adminContext.close()

    await page.goto(`${CAMPUS_BASE_URL}/app/campus/${fixture.organizationId}/home`)
    await expect(page.getByText('Due soon')).toBeVisible()
    await expect(page.getByText(`${fixture.organizationName} can see sponsored results here. Your personal results stay private.`).first()).toBeVisible()
    await expectNoSeriousAxe(page)

    await page.goto(`${CAMPUS_BASE_URL}/app/campus/${fixture.organizationId}/assignments`)
    const card = page.getByTestId('assignment-card')
    await expect(card).toHaveCount(1)
    await expect(card).toContainText(`Sponsored by ${fixture.organizationName}`)
    await expectNoSeriousAxe(page)

    await card.getByRole('link', { name: /Open briefing/ }).click()
    await expect(page).toHaveURL(new RegExp(`/app/campus/${fixture.organizationId}/assignments/${fixture.assignmentId}/briefing$`))
    const disclosure = page.getByTestId('sponsored-disclosure')
    await expect(disclosure).toContainText(`This assessment is sponsored by ${fixture.organizationName}.`)
    await expect(disclosure).toContainText('Your personal Prism assessments and private activity are not shared automatically.')
    await expectNoSeriousAxe(page)
    const confirm = page.getByRole('button', { name: 'Confirm' })
    await expect(confirm).toBeDisabled()
    await page.getByLabel(`I understand what ${fixture.organizationName} can and cannot see`).check()
    await confirm.click()
    await expect(page.getByText('You confirmed you have read this.')).toBeVisible()
    // No sponsorship entitlement was bought for this synthetic org: the reason is named.
    await expect(page.getByText(/has not made a place available for you yet/)).toBeVisible()

    const consents = (await listConsentRecords({ databaseUrl: DB, userId: student.user.id })).filter((c) => c.consentType === 'CAMPUS_ASSESSMENT_DISCLOSURE')
    expect(consents).toHaveLength(1)
    expect(consents[0].organizationId).toBe(fixture.organizationId)

    // The personal workspace never lists the sponsored assignment.
    const personal = await api(page, '/api/v1/me/assessments', { token: student.token })
    expect([...personal.body.data.active, ...personal.body.data.completed].some((a) => a.id === fixture.assignmentId)).toBe(false)
  })
})
