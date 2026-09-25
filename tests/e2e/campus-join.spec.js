// Prism Campus C3.16 — Journey B (partial, spec §43): an EXISTING direct
// customer accepts a campus invitation, switches into the sponsored campus
// workspace, sees the privacy disclosure, and the institution still cannot
// reach their personal session. Runs against the campus harness server with
// a throwaway campus store (PRISM_E2E_DATABASE_URL); synthetic users only.
import { test, expect } from '@playwright/test'
import { CAMPUS_BASE_URL, api, signInSynthetic, syntheticEmail, expectNoSeriousAxe } from './campusHelpers.js'
import { seedCampusFixture } from '../fixtures/campusSeed.mjs'

const DB = process.env.PRISM_E2E_DATABASE_URL

test.describe('@critical @campus Journey B — join a college without exposing personal data', () => {
  test.skip(!DB, 'Journey B needs the throwaway campus store (PRISM_E2E_DATABASE_URL); CI and the gate runner provide it')

  test('existing user accepts, switches workspace, sees the disclosure; the college cannot read the personal session', async ({ page, browser }) => {
    // The college owner (a separate synthetic account).
    const adminContext = await browser.newContext()
    const adminPage = await adminContext.newPage()
    const admin = await signInSynthetic(adminPage, CAMPUS_BASE_URL, 'campus-owner')

    // An existing direct customer with a personal (legacy) session.
    const student = await signInSynthetic(page, CAMPUS_BASE_URL, 'campus-student')
    const personal = await api(page, '/api/payment/dev-session', { method: 'POST', token: student.token })
    expect(personal.status).toBe(200)

    const fixture = await seedCampusFixture({ databaseUrl: DB, ownerUserId: admin.user.id, studentEmail: student.email })

    await page.goto(`${CAMPUS_BASE_URL}/app/campus-invite/${fixture.token}`)
    await expect(page.getByRole('heading', { name: `Join ${fixture.organizationName} on Prism` })).toBeVisible()
    await expect(page.getByText('Assessments you bought yourself, and their reports')).toBeVisible()
    await expect(page.getByText(/no new account is created/)).toBeVisible()
    await expectNoSeriousAxe(page)

    const accept = page.getByRole('button', { name: 'Accept and join' })
    await expect(accept).toBeDisabled()
    await page.getByLabel(`I have read what ${fixture.organizationName} can and cannot see`).check()
    await accept.click()

    await expect(page).toHaveURL(new RegExp(`/app/campus/${fixture.organizationId}/home$`))
    await expect(page.getByText(`Sponsored by ${fixture.organizationName}`)).toBeVisible()
    await page.getByRole('button', { name: 'What can they see?' }).click()
    await expect(page.getByRole('heading', { name: `${fixture.organizationName} cannot see, unless you share it` })).toBeVisible()
    // Only sponsored sections exist in the campus workspace.
    const nav = page.getByRole('navigation', { name: 'Primary' })
    await expect(nav.getByRole('link', { name: 'Capabilities' })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Sharing' })).toHaveCount(0)
    await expectNoSeriousAxe(page)

    // One identity, two workspaces.
    const me = await api(page, '/api/v1/me', { token: student.token })
    expect(me.body.data.user.id).toBe(student.user.id)
    expect(me.body.data.workspaces.map((w) => w.type)).toEqual(['PERSONAL', 'CAMPUS_STUDENT'])

    // Switching back to personal lands on the personal home.
    await page.getByRole('button', { name: /Workspace/ }).click()
    await page.getByRole('option', { name: /Personal/ }).click()
    await expect(page).toHaveURL(/\/app\/home$/)
    await expect(page.getByText(`Sponsored by ${fixture.organizationName}`)).toHaveCount(0)

    // The college owner cannot read the student's personal session.
    const denied = await api(adminPage, `/api/v1/organizations/${fixture.organizationId}/sessions/${personal.body.sessionId}`, { token: admin.token })
    expect(denied.status).toBe(404)
    const orgView = await api(adminPage, `/api/v1/organizations/${fixture.organizationId}`, { token: admin.token })
    expect(orgView.status).toBe(200)
    expect(orgView.body.data.permissions).not.toContain('personal_result.read')
    await adminContext.close()
  })
})
