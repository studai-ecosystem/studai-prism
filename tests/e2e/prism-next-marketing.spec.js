// tests/e2e/prism-next-marketing.spec.js — marketing reference simulation,
// verified FAIL CLOSED (Prism Campus Phase 2, K29). The scenario, artifacts
// and dialogue come only from the server's session payload; reports and
// practice missions never show fabricated scores, levels or readiness.
import { test, expect } from '@playwright/test'
import { storeSyntheticInsufficientViews } from '../fixtures/issuedLegacyViews.mjs'

const CONSENT_SCOPES = ['data_processing', 'ai_disclosure', 'ai_scoring_oversight', 'proctoring', 'face_analysis', 'own_work']
const FABRICATED = /\d+\s*%|±|Score:|Rubric Level|Standard Error|Readiness (Level|Score)|Mobility Readiness|Level \d Achieved/i

async function browserApi(page, path, { method = 'GET', token, body } = {}) {
  return page.evaluate(async ({ path, method, token, body }) => {
    const r = await fetch(path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return { status: r.status, body: await r.json().catch(() => null) }
  }, { path, method, token, body })
}

async function consentedSession(page) {
  await page.goto('/')
  const email = `mkt-${Date.now()}-${Math.random().toString(16).slice(2)}@test.local`
  const reg = await browserApi(page, '/api/auth/register', {
    method: 'POST',
    body: { name: 'Synthetic Marketing Candidate', email, college: 'Synthetic College', year: 'Final Year', password: 'candidate-pass-1!', ageConfirmed: true },
  })
  expect(reg.status).toBe(201)
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('prism_token', token)
    localStorage.setItem('prism_user', JSON.stringify(user))
  }, { token: reg.body.token, user: reg.body.user })
  const ent = await browserApi(page, '/api/payment/dev-session', { method: 'POST', token: reg.body.token })
  expect(ent.status).toBe(200)
  const consent = await browserApi(page, '/api/assessment/consent', {
    method: 'POST', token: reg.body.token,
    body: { sessionId: ent.body.sessionId, scopes: CONSENT_SCOPES, consentVersion: 'mkt-e2e' },
  })
  expect(consent.status).toBe(200)
  return { token: reg.body.token, sessionId: ent.body.sessionId }
}

test.describe('Marketing reference simulation — fail closed', () => {
  test('1. Occupational graph API serves the marketing blueprint and its neighbourhood', async ({ request }) => {
    const res = await request.get('/api/job-families/STUDAI-JF-MKT-L1')
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.blueprint.job_family_id).toBe('STUDAI-JF-MKT-L1')
    expect(data.blueprint.capabilities.length).toBeGreaterThanOrEqual(4)
    const neigh = await (await request.get('/api/job-families/STUDAI-JF-MKT-L1/neighborhood')).json()
    expect(neigh.edges.length).toBeGreaterThanOrEqual(3)
  })

  test('2. The workspace renders the scenario and artifacts the server returned', async ({ page }) => {
    const { sessionId } = await consentedSession(page)
    const startResponse = page.waitForResponse((r) => r.url().endsWith('/api/assessment/start'))
    await page.goto(`/workspace/${sessionId}?assessment=prism-sim-mkt-l1`)
    const started = await (await startResponse).json()
    await expect(page.locator('h1')).toHaveText(started.scenario.title)
    const tabs = page.getByRole('tab')
    await expect(tabs).toHaveCount(started.interactiveArtifacts.length)
    for (const m of started.messages || []) await expect(page.getByText(m.content, { exact: false }).first()).toBeVisible()

    // A sent answer appears once, with only the server's replies after it.
    await page.getByLabel('Your answer').fill('I would compare paid channels by contribution margin before moving budget.')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText('I would compare paid channels by contribution margin before moving budget.')).toBeVisible({ timeout: 15000 })
    await expect(page.getByLabel('Your answer')).toHaveValue('')
  })

  test('3. An unknown assessment id is refused, never substituted', async ({ page }) => {
    const { sessionId } = await consentedSession(page)
    await page.goto(`/workspace/${sessionId}?assessment=no-such-assessment`)
    await expect(page.getByRole('heading', { name: 'This assessment could not be loaded' })).toBeVisible()
  })

  test('4. Reports for a session without sufficient evidence show no scores, strengths or readiness', async ({ page }) => {
    const { token, sessionId } = await consentedSession(page)
    const start = await browserApi(page, '/api/assessment/start', { method: 'POST', token, body: { sessionId, scenarioId: 'prism-sim-mkt-l1' } })
    expect(start.status).toBe(200)
    // Saving a work artifact records strict evidence (unjudged → insufficient).
    const saved = await browserApi(page, `/api/assessment/artifacts/${sessionId}`, {
      method: 'POST', token, body: { artifactId: 'ART-BUDGET-03', updates: { note: 'synthetic' }, notes: 'Synthetic plan' },
    })
    expect(saved.status).toBe(200)

    // Presentation-only SYNTHETIC issued snapshot; this is not a completed run.
    await storeSyntheticInsufficientViews(sessionId)
    await page.goto(`/report/${sessionId}/v2`)
    await expect(page.getByRole('heading', { name: 'Not enough evidence yet to describe your capabilities' })).toBeVisible()
    expect(await page.locator('main').innerText()).not.toMatch(FABRICATED)

    await page.goto(`/report/${sessionId}/employee`)
    await expect(page.getByRole('heading', { name: 'Workplace view' })).toBeVisible()
    expect(await page.locator('main').innerText()).not.toMatch(FABRICATED)
  })

  test('5. A practice mission reports only the checks that ran', async ({ page }) => {
    await page.goto('/missions/MIS-MKT-EXP-01')
    await expect(page.locator('h1')).toContainText('Creative Fatigue vs Channel Saturation A/B Test')
    await page.getByLabel('Your hypothesis or plan').fill('If we lead with the texture demonstration, then click-through will rise, because customers doubt the formula.')
    await page.getByRole('button', { name: 'Submit practice' }).click()
    await expect(page.getByText('Full practice feedback is not available yet', { exact: true })).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('Present')).toBeVisible()
    const text = await page.locator('main').innerText()
    expect(text).toMatch(/never changes your formal assessment results/)
    expect(text).not.toMatch(FABRICATED)
  })
})
