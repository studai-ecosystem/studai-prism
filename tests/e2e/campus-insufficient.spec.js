// Prism Campus C2.16 — Journey D (spec §43) in the browser: a real session
// with incomplete evidence renders an honest insufficient-evidence report —
// no scores, percentages, precision, strengths or role matches — and the
// legacy surfaces rebuilt in Phase 2 fail closed. Synthetic users only.
import { test, expect } from '@playwright/test'
import { LEGACY_BASE_URL, api, signInSynthetic, expectNoSeriousAxe, expectNoHorizontalOverflow } from './campusHelpers.js'

const CONSENT_SCOPES = ['data_processing', 'ai_disclosure', 'ai_scoring_oversight', 'proctoring', 'face_analysis', 'own_work']
const FABRICATED = /\d+\s*%|±|Score:|Rubric Level|Standard Error|Confidence Interval|Readiness (Level|Score)|Mobility Readiness|Level \d Achieved/i

async function startedSession(page) {
  const { token } = await signInSynthetic(page, LEGACY_BASE_URL, 'insufficient')
  const ent = await api(page, '/api/payment/dev-session', { method: 'POST', token })
  expect(ent.status).toBe(200)
  const sessionId = ent.body.sessionId
  const consent = await api(page, '/api/assessment/consent', {
    method: 'POST', token, body: { sessionId, scopes: CONSENT_SCOPES, consentVersion: 'campus-e2e' },
  })
  expect(consent.status).toBe(200)
  const start = await api(page, '/api/assessment/start', { method: 'POST', token, body: { sessionId } })
  expect(start.status).toBe(200)
  const turn = await api(page, '/api/assessment/message', { method: 'POST', token, body: { sessionId, text: 'I would first check which channel changed and why.' } })
  expect(turn.status).toBe(200)
  return { token, sessionId }
}

test.describe('@critical campus Journey D — insufficient evidence fails closed', () => {
  test('report V2 for an incomplete session shows insufficient evidence and no numbers', async ({ page }) => {
    const { token, sessionId } = await startedSession(page)
    const apiReport = await api(page, `/api/assessment/report/${sessionId}/v2`, { token })
    expect(apiReport.status).toBe(200)
    expect(apiReport.body.status).toBe('INSUFFICIENT_EVIDENCE')
    expect(apiReport.body.section9_strengthsAndGrowth.strengths).toEqual([])
    expect(apiReport.body.section7_careerExploration.roles).toEqual([])

    await page.goto(`${LEGACY_BASE_URL}/report/${sessionId}/v2`)
    await expect(page.getByRole('heading', { name: 'Not enough evidence yet to describe your capabilities' })).toBeVisible()
    await expect(page.getByText('No strengths or development areas are described until there is enough evidence for them.')).toBeVisible()
    const text = await page.locator('main').innerText()
    expect(text).not.toMatch(FABRICATED)
    expect(text).not.toMatch(/PRISM NEXT|Prism Next/i)
    await expectNoSeriousAxe(page)
    await page.setViewportSize({ width: 360, height: 800 })
    await expectNoHorizontalOverflow(page)

    await page.goto(`${LEGACY_BASE_URL}/report/${sessionId}/employee`)
    await expect(page.getByRole('heading', { name: 'Workplace view' })).toBeVisible()
    expect(await page.locator('main').innerText()).not.toMatch(FABRICATED)
  })

  test('an unknown report is "not found", never a sample report', async ({ page }) => {
    await page.goto(`${LEGACY_BASE_URL}/report/unknown-session-e2e/v2`)
    await expect(page.getByRole('heading', { name: 'Report not found' })).toBeVisible()
    expect(await page.locator('body').innerText()).not.toMatch(/Lumina|Analytical Growth Strategist/)
  })

  test('the workspace for an unstartable session shows an error, not a scripted scenario', async ({ page }) => {
    await signInSynthetic(page, LEGACY_BASE_URL, 'workspace')
    await page.goto(`${LEGACY_BASE_URL}/workspace/unknown-session-e2e`)
    await expect(page.getByRole('heading', { name: 'A step is missing before you can start' })).toBeVisible()
    const text = await page.locator('body').innerText()
    expect(text).not.toMatch(/Lumina|Elena|Marcus/)
    await expectNoSeriousAxe(page)
  })

  test('explore starts blank and shows nothing until the candidate answers', async ({ page }) => {
    await page.goto(`${LEGACY_BASE_URL}/explore`)
    await expect(page.getByRole('heading', { name: 'Explore roles' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show roles' })).toBeDisabled()
    await expect(page.getByTestId('role-card')).toHaveCount(0)
    await page.getByLabel('Investigative').selectOption('1')
    await page.getByRole('button', { name: 'Show roles' }).click()
    await expect(page.getByText(/Roles to explore/)).toBeVisible()
    expect(await page.locator('main').innerText()).not.toMatch(FABRICATED)
    await expectNoSeriousAxe(page)
  })
})
