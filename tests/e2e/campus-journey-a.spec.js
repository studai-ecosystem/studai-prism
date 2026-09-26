// Prism Campus C6.08 — Journey A (direct user → Report V3) and Journey D
// (insufficient evidence) on the campus harness server (flags on in-process
// only, K2; mocked AI). Synthetic users only. Proves: the finished player
// links to Report V3; every conclusion the API returns cites evidence or is
// marked insufficient; an early finish produces an honest insufficient
// report with no invented level; a summary share link shows the summary only.
import { test, expect } from '@playwright/test'
import { CAMPUS_BASE_URL, api, signInSynthetic, expectNoSeriousAxe } from './campusHelpers.js'
import { ASSESSMENT_CONSENT_ITEMS } from '../../src/lib/copy/assessmentConsent.js'
import { seedSponsoredAssignment } from '../fixtures/campusSeed.mjs'

const DB = process.env.PRISM_E2E_DATABASE_URL

async function startPersonalV3(page, label) {
  const student = await signInSynthetic(page, CAMPUS_BASE_URL, label)
  const dev = await api(page, '/api/payment/dev-session', { method: 'POST', token: student.token })
  expect(dev.status).toBe(200)
  await page.goto(`${CAMPUS_BASE_URL}/app/assessments`)
  await page.getByTestId('assignment-card').first().getByRole('link', { name: /Open briefing/ }).click()
  await page.getByRole('link', { name: 'Continue to system check' }).click()
  for (const item of ASSESSMENT_CONSENT_ITEMS) await page.getByLabel(item.label).check()
  await page.getByRole('button', { name: 'Begin assessment' }).click()
  await expect(page).toHaveURL(new RegExp(`/app/assessment/${dev.body.sessionId}$`))
  return { student, sessionId: dev.body.sessionId }
}

async function answer(page, text) {
  const participants = page.getByTestId('conversation').locator('[data-role="participant"]')
  const before = await participants.count()
  await page.getByLabel('Your answer').fill(text)
  await page.getByRole('button', { name: 'Send' }).click()
  await expect.poll(() => participants.count(), { timeout: 30_000 }).toBeGreaterThan(before)
}

async function finishAndOpenReport(page, { early }) {
  await page.getByRole('button', { name: 'Finish assessment' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: early ? 'Finish anyway' : /^Finish/ }).click()
  // The player moves to the report as soon as it is ready.
  await expect(page).toHaveURL(/\/app\/reports\//, { timeout: 120_000 })
  await expect(page.getByRole('heading', { level: 1, name: 'Your report' })).toBeVisible()
  await expect(page.getByTestId('report-header')).toBeVisible({ timeout: 30_000 })
}

function assertEveryClaimCitesEvidence(report) {
  for (const c of report.summary.capabilities) {
    if (c.level) expect(c.summary.evidenceIds.length, `${c.id} level cites evidence`).toBeGreaterThan(0)
    else expect(c.summary.status).toBe('INSUFFICIENT')
  }
  for (const e of report.evidence) expect(e.provenance.evidenceId).toBe(e.id)
  expect(report.development?.priorities.length || 0).toBeLessThanOrEqual(3)
  expect(JSON.stringify(report)).not.toMatch(/composite|overall|percentile|rubricMedian/i)
}

test.describe('@critical @campus Journey A — direct user to Report V3', () => {
  test('register → personal entitlement → start → complete → Report V3 → development; share a summary link', async ({ page, browser }) => {
    test.setTimeout(240_000)
    const { student, sessionId } = await startPersonalV3(page, 'journey-a')
    await answer(page, 'Synthetic answer one: I would first find out which customers are affected and why.')
    await answer(page, 'Synthetic answer two: I would compare the options and their risks before deciding.')
    await answer(page, 'Synthetic answer three: I would agree the plan with the team and check the result next week.')
    const contract = (await api(page, `/api/v1/assessment-sessions/${sessionId}`, { token: student.token })).body.data
    await finishAndOpenReport(page, { early: contract.progress.exchanges < contract.progress.requiredExchanges })

    const res = await api(page, `/api/v1/assessment-sessions/${sessionId}/report`, { token: student.token })
    expect(res.status).toBe(200)
    assertEveryClaimCitesEvidence(res.body.data.report)
    await expect(page.getByTestId('report-capability').first()).toBeVisible()
    await expectNoSeriousAxe(page)

    await page.getByRole('tab', { name: 'Development' }).click()
    await expect(page.getByText(/Recommended practice missions are not available here yet|No development priority is based on this assessment yet/).first()).toBeVisible()
    await expectNoSeriousAxe(page)
    await page.getByRole('tab', { name: 'Methodology' }).click()
    await expect(page.getByText(/There is no single overall score/)).toBeVisible()

    // Share a summary link; open it without signing in.
    await page.getByRole('button', { name: 'Share' }).click()
    const dialog = page.getByRole('dialog', { name: 'Share this report' })
    await expectNoSeriousAxe(page)
    await dialog.getByRole('button', { name: 'Create share' }).click()
    const linkBox = dialog.getByLabel('Private link', { exact: true })
    await expect(linkBox).toBeVisible()
    const link = await linkBox.inputValue()
    expect(link).toMatch(/\/shared\/[A-Za-z0-9_-]{20,}$/)
    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByTestId('active-share')).toHaveCount(1)

    const anon = await browser.newContext()
    const viewer = await anon.newPage()
    await viewer.goto(link.replace(/^https?:\/\/[^/]+/, CAMPUS_BASE_URL))
    await expect(viewer.getByRole('heading', { level: 1, name: 'Shared Prism report' })).toBeVisible()
    await expect(viewer.getByText('Summary only', { exact: true })).toBeVisible()
    await expect(viewer.getByRole('tab', { name: 'Evidence' })).toHaveCount(0)
    await expectNoSeriousAxe(viewer)

    // Revoke: the link stops working.
    await page.getByRole('button', { name: 'Revoke private link' }).click()
    await page.getByRole('dialog', { name: 'Revoke this share?' }).getByRole('button', { name: 'Revoke' }).click()
    await expect(page.getByTestId('active-share')).toHaveCount(0)
    await viewer.reload()
    await expect(viewer.getByText('This link is not valid or has expired')).toBeVisible()
    await anon.close()
  })
})

test.describe('@critical @campus sponsored Report V3 — student and sponsor', () => {
  test.skip(!DB, 'needs the throwaway campus store (PRISM_E2E_DATABASE_URL); CI and the gate runner provide it')

  test('a sponsored report opens in the campus workspace; the sponsor reads it (audited); personal reports stay private', async ({ page, browser }) => {
    test.setTimeout(240_000)
    const adminContext = await browser.newContext()
    const adminPage = await adminContext.newPage()
    const admin = await signInSynthetic(adminPage, CAMPUS_BASE_URL, 'report-owner')
    const student = await signInSynthetic(page, CAMPUS_BASE_URL, 'report-sponsored')
    expect((await api(page, '/api/v1/me/assessments', { token: student.token })).status).toBe(200)
    const fx = await seedSponsoredAssignment({ databaseUrl: DB, ownerUserId: admin.user.id, studentUserId: student.user.id, seat: true })
    const base = `${CAMPUS_BASE_URL}/app/campus/${fx.organizationId}/assignments/${fx.assignmentId}`
    await page.goto(`${base}/briefing`)
    await page.getByLabel(`I understand what ${fx.organizationName} can and cannot see`).check()
    await page.getByRole('button', { name: 'Confirm' }).click()
    await expect(page.getByText('You confirmed you have read this.')).toBeVisible()
    await page.goto(`${base}/system-check`)
    for (const item of ASSESSMENT_CONSENT_ITEMS) await page.getByLabel(item.label).check()
    await page.getByRole('button', { name: 'Begin assessment' }).click()
    await expect(page).toHaveURL(/\/app\/assessment\/[0-9a-f-]{36}\?ws=/)
    const sessionId = new URL(page.url()).pathname.split('/').pop()
    await answer(page, 'Synthetic sponsored answer.')
    await page.getByRole('button', { name: 'Finish assessment' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Finish anyway' }).click()
    await expect(page).toHaveURL(new RegExp(`/app/campus/${fx.organizationId}/reports/${sessionId}$`), { timeout: 120_000 })
    await expect(page.getByTestId('report-header')).toContainText(`Sponsored by ${fx.organizationName}`)
    await expect(page.getByTestId('report-visibility')).toContainText(`${fx.organizationName} can see this sponsored report`)
    await expectNoSeriousAxe(page)

    // The sponsor reads it through the organization route; the read is audited server-side.
    const sponsorView = await api(adminPage, `/api/v1/organizations/${fx.organizationId}/sessions/${sessionId}/report`, { token: admin.token })
    expect(sponsorView.status).toBe(200)
    expect(sponsorView.body.data.audience).toBe('SPONSOR')
    expect(sponsorView.body.data.report.header.sponsor.name).toBe(fx.organizationName)
    // A personal session of the same student is invisible to the sponsor.
    const dev = await api(page, '/api/payment/dev-session', { method: 'POST', token: student.token })
    expect((await api(adminPage, `/api/v1/organizations/${fx.organizationId}/sessions/${dev.body.sessionId}/report`, { token: admin.token })).status).toBe(404)
    await adminContext.close()
  })
})

test.describe('@critical @campus Journey D — insufficient evidence', () => {
  test('an early finish produces an honest report: no invented level, insufficient evidence stated', async ({ page }) => {
    test.setTimeout(240_000)
    const { student, sessionId } = await startPersonalV3(page, 'journey-d')
    await answer(page, 'Synthetic short answer.')
    await finishAndOpenReport(page, { early: true })
    const res = await api(page, `/api/v1/assessment-sessions/${sessionId}/report`, { token: student.token })
    expect(res.status).toBe(200)
    const report = res.body.data.report
    assertEveryClaimCitesEvidence(report)
    expect(report.summary.describedCount).toBe(0)
    await expect(page.getByText('Not enough evidence yet')).toBeVisible()
    for (const card of await page.getByTestId('report-capability').all()) {
      await expect(card.getByText('What we observed')).toHaveCount(0)
    }
    await expect(page.locator('body')).not.toContainText('%')
    await expectNoSeriousAxe(page)
  })
})
