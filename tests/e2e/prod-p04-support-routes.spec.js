// PROD-READY Phase 4 — V3 support routes in a real browser (synthetic data
// only). With the support flag ON (runner mode p04-support: the 4174 campus
// audit server gets PRISM_V3_SUPPORT_ROUTES and draft content, throwaway
// PostgreSQL): a learner asks for an adjustment on the briefing page BEFORE
// the start, the start links it (an undecided request lapses and the API
// refuses changes after the start with honest copy), a real universal run
// publishes Report V3, the learner requests the one free human review and
// records a Level 1 identity self-declaration from the report page, and
// Settings lists both requests. Staff decisions run through the admin console
// and are covered by server/test/v3SupportRoutes.test.js.
// With the flag OFF (every other runner mode): the routes 404 and the UI
// shows the previous entry points.
// Run: node scripts/run-experience-baseline-tests.mjs p04-support
import { test, expect } from '@playwright/test'
import { CAMPUS_BASE_URL, LEGACY_BASE_URL, api, signInSynthetic, expectNoSeriousAxe, expectNoHorizontalOverflow } from './campusHelpers.js'

const SUPPORT_ON = process.env.PRISM_AUDIT_SUPPORT_ROUTES === 'true'
const DRAFT_FORM = 'draft-core-teamready-a'
const CONSENT = { scopes: ['data_processing', 'ai_disclosure', 'ai_scoring_oversight', 'proctoring', 'face_analysis', 'own_work'], consentVersion: 'synthetic-p04-consent' }
const MESSAGE = 'Is 24 the confirmed number or only the sign-ups? Two of the tasks still have no owner, so I will assign them before we plan.'
let seq = 0
const key = (label) => `p04-${label}-${Date.now()}-${(seq += 1)}`

async function mintPersonalCards(page, token, count) {
  for (let i = 0; i < count; i += 1) {
    const minted = await api(page, '/api/payment/dev-session', { method: 'POST', token, body: {} })
    expect(minted.status, JSON.stringify(minted.body)).toBe(200)
  }
  const list = await api(page, '/api/v1/me/assessments', { token })
  expect(list.status, JSON.stringify(list.body)).toBe(200)
  const cards = list.body.data.active.filter((c) => c.definitionId === DRAFT_FORM && c.status === 'NOT_STARTED')
  expect(cards.length, 'each dev entitlement is offered the DRAFT universal form').toBeGreaterThanOrEqual(count)
  return cards
}

test.describe('support routes OFF (default harness)', () => {
  test.skip(SUPPORT_ON, 'The flag-on journey below covers this server.')

  test('PROD-P04-OFF: the support routes 404 and the briefing keeps the contact link @p04', async ({ page }) => {
    const learner = await signInSynthetic(page, CAMPUS_BASE_URL, 'p04-off')
    for (const path of ['/api/v1/me/support-requests', '/api/v1/assessment-sessions/sess-p04-off-0001/human-review', '/api/v1/assessment-sessions/sess-p04-off-0001/identity-check']) {
      const r = await api(page, path, { token: learner.token })
      expect(r.status, path).toBe(404)
      expect(r.body.error.code).toBe('NOT_FOUND')
    }
    const me = await api(page, '/api/v1/me', { token: learner.token })
    expect(me.body.data.flags.PRISM_V3_SUPPORT_ROUTES).toBe(false)
    test.skip(!process.env.PRISM_E2E_DATABASE_URL, 'The briefing UI check needs the throwaway campus store.')
    const minted = await api(page, '/api/payment/dev-session', { method: 'POST', token: learner.token, body: {} })
    expect(minted.status).toBe(200)
    const list = await api(page, '/api/v1/me/assessments', { token: learner.token })
    const card = list.body.data.active.find((c) => c.status === 'NOT_STARTED')
    await page.goto(`${CAMPUS_BASE_URL}/app/assessments/${card.id}/briefing`)
    await expect(page.getByRole('link', { name: 'Contact us about an adjustment' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('adjustment-panel')).toHaveCount(0)
  })
})

test.describe('support routes ON (runner mode p04-support)', () => {
  test.skip(!SUPPORT_ON || process.env.PRISM_AUDIT_DRAFT_CONTENT !== 'true' || !process.env.PRISM_E2E_DATABASE_URL,
    'Needs node scripts/run-experience-baseline-tests.mjs p04-support (support flag + draft content + throwaway PostgreSQL on the 4174 audit server).')

  test('PROD-P04: adjustment before the start, free human review and identity check for a real V3 run @p04', async ({ page }) => {
    test.setTimeout(300_000)
    const learner = await signInSynthetic(page, CAMPUS_BASE_URL, 'p04-support')
    const token = learner.token
    const [adjust, runCard] = await mintPersonalCards(page, token, 2)

    // ── Adjustment request on the briefing page, before the start ──────────
    await page.goto(`${CAMPUS_BASE_URL}/app/assessments/${adjust.id}/briefing`)
    const panel = page.getByTestId('adjustment-panel')
    await expect(panel).toBeVisible({ timeout: 30_000 })
    await expect(panel).toContainText('Adjustments never change how your answers are judged.')
    await expect(page.getByRole('link', { name: 'Contact us about an adjustment' })).toHaveCount(0)
    await panel.getByLabel('What do you need?').fill('SYNTHETIC: I need a text-only mode without the camera check.')
    await panel.getByRole('button', { name: 'Send request' }).click()
    await expect(panel.getByText('Your request was sent. A person will review it before your assessment.')).toBeVisible()
    await expect(page.getByTestId('adjustment-status')).toContainText('Waiting for a decision')
    await expectNoSeriousAxe(page)
    await expectNoHorizontalOverflow(page)

    const accPath = `/api/v1/assessment-assignments/${adjust.id}/accommodation`
    const noKey = await api(page, accPath, { method: 'POST', token, body: { needs: 'SYNTHETIC: another request text.' } })
    expect(noKey.status).toBe(428)
    const strict = await api(page, accPath, { method: 'POST', token, body: { needs: 'SYNTHETIC: another request text.', diagnosis: 'x' }, headers: { 'Idempotency-Key': key('strict') } })
    expect(strict.status).toBe(422)
    const pending = await api(page, accPath, { token })
    expect(pending.body.data.request.status).toBe('REQUESTED')

    // Starting before a decision: the request lapses; afterwards it is refused.
    const startedA = await api(page, `/api/v1/assessment-assignments/${adjust.id}/start`, { method: 'POST', token, body: { consent: CONSENT }, headers: { 'Idempotency-Key': key('start-a') } })
    expect(startedA.status, JSON.stringify(startedA.body)).toBe(201)
    const lapsed = await api(page, accPath, { token })
    expect(lapsed.body.data.request.status).toBe('LAPSED')
    expect(lapsed.body.data.request.linkedToSession).toBe(true)
    const late = await api(page, accPath, { method: 'POST', token, body: { needs: 'SYNTHETIC: a request after the start.' }, headers: { 'Idempotency-Key': key('late') } })
    expect(late.status).toBe(409)
    expect(late.body.error.code).toBe('ASSESSMENT_ALREADY_STARTED')
    expect(late.body.error.message).toMatch(/arranged before an assessment starts/)

    // ── A real universal run publishes Report V3 ────────────────────────────
    const started = await api(page, `/api/v1/assessment-assignments/${runCard.id}/start`, { method: 'POST', token, body: { consent: CONSENT }, headers: { 'Idempotency-Key': key('start-b') } })
    expect(started.status, JSON.stringify(started.body)).toBe(201)
    const sid = started.body.data.sessionId
    expect((await api(page, `/api/v1/assessment-sessions/${sid}/begin`, { method: 'POST', token, body: {}, headers: { 'Idempotency-Key': key('begin') } })).status).toBe(200)
    const sent = await api(page, `/api/v1/assessment-sessions/${sid}/messages`, { method: 'POST', token, body: { clientEventId: `p04-msg-${Date.now()}`, text: MESSAGE } })
    expect([200, 201]).toContain(sent.status)
    const finished = await api(page, `/api/v1/assessment-sessions/${sid}/finish`, { method: 'POST', token, body: { early: true } })
    expect([200, 202]).toContain(finished.status)
    let report = null
    for (let i = 0; i < 60 && !(report && report.status === 200); i += 1) {
      report = await api(page, `/api/v1/assessment-sessions/${sid}/report`, { token })
      if (report.status !== 200) await page.waitForTimeout(1500)
    }
    expect(report.status, JSON.stringify(report.body)).toBe(200)

    // The frozen legacy review route stays closed for this V3 session (K104).
    const legacyDispute = await api(page, '/api/assessment/dispute', { method: 'POST', token, body: { sessionId: sid, reason: 'SYNTHETIC: legacy route check.' } })
    expect(legacyDispute.status).toBe(404)

    // ── The free human review from the report page ─────────────────────────
    await page.goto(`${CAMPUS_BASE_URL}/app/reports/${sid}`)
    const reviewCard = page.getByTestId('human-review-card')
    await expect(reviewCard).toBeVisible({ timeout: 30_000 })
    await expect(reviewCard).toContainText('This is a target, not a guarantee.')
    await reviewCard.getByLabel('What should the reviewer look at?').fill('SYNTHETIC: the second moment was read differently from what I meant.')
    await reviewCard.getByRole('button', { name: 'Request the review' }).click()
    await expect(page.getByTestId('human-review-open')).toContainText('A person is reviewing this report.')
    const reviewPath = `/api/v1/assessment-sessions/${sid}/human-review`
    const status = await api(page, reviewPath, { token })
    expect(status.body.data.request.state).toBe('OPEN')
    const again = await api(page, reviewPath, { method: 'POST', token, body: { reason: 'SYNTHETIC: asking again while it is open.' }, headers: { 'Idempotency-Key': key('review-again') } })
    expect(again.status, 'idempotent while open').toBe(200)
    expect(again.body.data.request.id).toBe(status.body.data.request.id)

    // ── Identity check: Level 1 self-declaration, Level 3 not offered ──────
    const idCard = page.getByTestId('identity-check-card')
    await expect(page.getByTestId('identity-level')).toContainText('Level 1')
    await expect(idCard).toContainText('A document-based check is not available.')
    const l3 = await api(page, `/api/v1/assessment-sessions/${sid}/identity-check`, { method: 'POST', token, body: { level: 'L3', confirm: true }, headers: { 'Idempotency-Key': key('l3') } })
    expect(l3.status).toBe(409)
    expect(l3.body.error.code).toBe('IDENTITY_LEVEL_NOT_AVAILABLE')
    await idCard.getByLabel('I confirm that I took this assessment myself.').check()
    await idCard.getByRole('button', { name: 'Confirm my identity' }).click()
    await expect(idCard.getByText(/You confirmed your identity on/)).toBeVisible()
    await expectNoSeriousAxe(page)
    await expectNoHorizontalOverflow(page)

    // ── Settings lists both requests ───────────────────────────────────────
    await page.goto(`${CAMPUS_BASE_URL}/app/settings`)
    const support = page.getByTestId('support-settings')
    await expect(support).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('support-reviews')).toContainText('In review')
    await expect(page.getByTestId('support-adjustments')).toContainText('Not applied')
    await expectNoSeriousAxe(page)

    // The flags-off legacy server knows none of these routes.
    const legacyLearner = await signInSynthetic(page, LEGACY_BASE_URL, 'p04-legacy')
    const off = await api(page, '/api/v1/me/support-requests', { token: legacyLearner.token })
    expect(off.status).toBe(404)
  })
})
