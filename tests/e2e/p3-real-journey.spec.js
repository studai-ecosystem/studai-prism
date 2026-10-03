// P3 real-browser canonical journey (Layer B in the browser): NO API route
// fixtures for the session or the report. A synthetic learner registers on
// the isolated campus audit server (4174, throwaway PostgreSQL, the audit
// model provider only), obtains a non-production dev entitlement through the
// real API, and the server pins the DRAFT universal form (PRISM_DRAFT_CONTENT
// is enabled for the audit server process only, by the runner's p3 mode).
// Intro -> Not yet (Escape) -> Begin -> real message -> keyboard-only board
// edit -> reload (same run, same deadline) -> Finish -> the real in-process
// EVALUATE_RUN worker -> published Report V3.
// Run: node scripts/run-experience-baseline-tests.mjs p3
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { CAMPUS_BASE_URL, api, signInSynthetic, keyboardFocus, expectNoSeriousAxe, expectNoHorizontalOverflow } from './campusHelpers.js'

const DRAFT_FORM = 'draft-core-teamready-a'
const WIDTHS = [1440, 1024, 768, 390, 360]
const SHOTS = join('audit-results', 'ui', 'p3')
const CONSENT = { scopes: ['data_processing', 'ai_disclosure', 'ai_scoring_oversight', 'proctoring', 'face_analysis', 'own_work'], consentVersion: 'synthetic-p3-consent' }
// Synthetic learner words (never real learner data).
const MESSAGE = 'Is 24 the confirmed number or only the sign-ups? And can we print the handouts on the morning if needed?'
const DUE = 'Day 2 morning'
const BOARD_TASK = 'Prepare participant materials'

test.skip(process.env.PRISM_AUDIT_DRAFT_CONTENT !== 'true' || !process.env.PRISM_E2E_DATABASE_URL,
  'Needs the p3 runner mode: node scripts/run-experience-baseline-tests.mjs p3 (draft content + throwaway PostgreSQL for the 4174 audit server).')

async function contractOf(page, token, sid) {
  const r = await api(page, `/api/v1/assessment-sessions/${sid}`, { token })
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data
}

async function shoot(page, testInfo, name, { axeAt = [1440, 390], prepare } = {}) {
  if (testInfo.project.name !== 'chromium') return
  mkdirSync(SHOTS, { recursive: true })
  const original = page.viewportSize()
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width < 768 ? 800 : 900 })
    // Let the media-query driven layout settle before acting on it.
    await page.waitForTimeout(300)
    if (prepare) await prepare(width)
    await page.waitForTimeout(150)
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: join(SHOTS, `${name}-${width}.png`) })
    if (axeAt.includes(width)) await expectNoSeriousAxe(page)
  }
  await page.setViewportSize(original)
  await page.waitForTimeout(300)
  if (prepare) await prepare(original.width)
}

// The large-screen notice is a real state at narrow widths; continue past it.
async function continueOnSmall(page) {
  const go = page.getByRole('button', { name: 'Continue on this device' })
  if (await go.isVisible().catch(() => false)) await go.click({ timeout: 10_000 })
}

// The pane switch is a visually styled radio group: its label receives the
// pointer (the input is visually hidden), exactly as for a real user.
async function choosePane(page, name) {
  const radio = page.getByRole('radio', { name })
  if (!(await radio.count())) return
  if (await radio.isChecked({ timeout: 10_000 })) return
  await page.locator('label').filter({ has: radio }).click({ timeout: 10_000 })
  await expect(radio).toBeChecked()
}

async function boardDueField(page) {
  await continueOnSmall(page)
  await choosePane(page, /^Workspace/)
  return page.getByLabel(`Due for ${BOARD_TASK}`)
}

test('P3 canonical journey: intro, begin once, message, keyboard board edit, reload resumes, finish, real report', async ({ page }, testInfo) => {
  test.setTimeout(240_000)
  const learner = await signInSynthetic(page, CAMPUS_BASE_URL, `p3-journey-${testInfo.project.name}`)
  const token = learner.token

  // A non-production dev entitlement through the real payment API; the server
  // (not the request) pins the DRAFT universal form for it.
  const minted = await api(page, '/api/payment/dev-session', { method: 'POST', token, body: {} })
  expect(minted.status, JSON.stringify(minted.body)).toBe(200)
  const list = await api(page, '/api/v1/me/assessments', { token })
  expect(list.status).toBe(200)
  const card = list.body.data.active.find((c) => c.definitionId === DRAFT_FORM && c.status === 'NOT_STARTED')
  expect(card, 'the dev entitlement is offered the DRAFT universal form').toBeTruthy()
  const started = await api(page, `/api/v1/assessment-assignments/${card.id}/start`, { method: 'POST', token, body: { consent: CONSENT }, headers: { 'Idempotency-Key': `p3-start-${Date.now()}` } })
  expect(started.status, JSON.stringify(started.body)).toBe(201)
  const sid = started.body.data.sessionId
  const pinned = await contractOf(page, token, sid)
  expect(pinned.status).toBe('ALLOCATED')
  expect(pinned.timing.begun).toBe(false)
  expect(pinned.timing.policyDurationMs).toBe(25 * 60000)

  // ── Intro: pinned facts and the real timing policy; Not yet never begins ──
  await page.goto(`${CAMPUS_BASE_URL}/app/assessment/${sid}`)
  const dialog = page.getByRole('dialog', { name: pinned.scenario.title })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('scenario-intro')).toContainText(pinned.scenario.context.slice(0, 60))
  await expect(dialog).toContainText(pinned.scenario.yourRole)
  for (const p of pinned.scenario.participants) await expect(dialog).toContainText(p.name)
  await expect(dialog).toContainText('You have 25 minutes to answer once you begin')
  await expect(dialog).toContainText('proposed and under review')
  await expect(dialog).toContainText('by typing')
  await expect(page.getByRole('timer')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Begin timed assessment' })).toBeFocused()
  await shoot(page, testInfo, 'intro')
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/app\/assessments(\?|$)/)
  expect((await contractOf(page, token, sid)).timing.begun, 'Escape / Not yet never starts the clock').toBe(false)

  // ── Begin once ────────────────────────────────────────────────────────────
  await page.goto(`${CAMPUS_BASE_URL}/app/assessment/${sid}`)
  await page.getByRole('dialog', { name: pinned.scenario.title }).getByRole('button', { name: 'Begin timed assessment' }).click()
  await expect(page.getByRole('timer')).toBeVisible()
  const begun = await contractOf(page, token, sid)
  expect(begun.timing.begun).toBe(true)
  const deadline = begun.timing.deadlineAt
  expect(Date.parse(deadline) - Date.parse(begun.timing.startedAt)).toBe(25 * 60000)

  // ── A real message to the authored participants ──────────────────────────
  await continueOnSmall(page)
  const answer = page.getByLabel('Your answer')
  await answer.fill(MESSAGE)
  await answer.press('Enter')
  const log = page.getByRole('log', { name: 'Assessment conversation' })
  await expect(log.locator('[data-role="candidate"]').filter({ hasText: MESSAGE })).toBeVisible()
  await expect(answer).toHaveValue('')

  // ── Keyboard-only plan board edit ────────────────────────────────────────
  const due = await boardDueField(page)
  await expect(due).toBeVisible()
  // Keyboard only: from the work-material tab, Tab to the field, then type.
  await page.getByRole('tab').first().focus()
  await keyboardFocus(page, due, 40)
  await expect(due).toBeFocused()
  await page.keyboard.type(DUE)
  await expect(due).toHaveValue(DUE)
  await expect(page.locator('[data-save-state="SAVED"]')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator(`[data-row="R2"] [data-field="due"]`)).toHaveAttribute('data-origin', 'LEARNER')
  await expect(page.locator(`[data-row="R1"] [data-field="owner"]`)).toHaveAttribute('data-origin', 'PROVIDED')
  await shoot(page, testInfo, 'active', { prepare: async (width) => { await continueOnSmall(page); if (width < 1024) await choosePane(page, 'Conversation') } })

  // ── Reload: same run, same deadline, saved work intact ───────────────────
  await page.reload()
  await expect(page.getByRole('timer')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const resumed = await contractOf(page, token, sid)
  expect(resumed.sessionId).toBe(sid)
  expect(resumed.timing.deadlineAt, 'refresh never restarts the clock').toBe(deadline)
  await continueOnSmall(page)
  await expect(page.getByRole('log', { name: 'Assessment conversation' }).locator('[data-role="candidate"]').filter({ hasText: MESSAGE })).toBeVisible()
  await expect(await boardDueField(page)).toHaveValue(DUE)
  expect(resumed.artifacts[0].data['R2.due']).toBe(DUE)

  // ── Finish -> real evaluation worker -> published report ─────────────────
  await page.getByRole('button', { name: 'Finish assessment' }).click()
  const exit = page.getByRole('dialog', { name: /Finish/ })
  await exit.getByRole('button', { name: /^Finish( anyway)?$/ }).click()
  await expect(page).toHaveURL(new RegExp(`/app/reports/${sid}`), { timeout: 60_000 })
  // The processing/complete state the player shows for this run afterwards.
  await page.goto(`${CAMPUS_BASE_URL}/app/assessment/${sid}`)
  await expect(page.getByTestId('submission-progress')).toBeVisible()
  await expect(page.getByTestId('submission-progress')).toContainText('Answers submitted')
  await page.getByRole('link', { name: 'Open your report' }).click()
  await expect(page.getByTestId('report-header')).toBeVisible({ timeout: 30_000 })
  const report = await api(page, `/api/v1/assessment-sessions/${sid}/report`, { token })
  expect(report.status, JSON.stringify(report.body)).toBe(200)
  const shown = [...(report.body.data.report.boundedObservations || []), ...(report.body.data.report.moments || [])]
  for (const o of shown) expect([MESSAGE, DUE].some((own) => own.includes(o.quote)), 'every quote is the learner\'s own words').toBe(true)
  const r = report.body.data.report
  if (r.disclosure === 'FULL' && (r.moments || []).length) {
    // A source-verified moment: the learner's own words with their source.
    await expect(page.getByTestId('report-moment').first()).toContainText(r.moments[0].quote)
  } else if (r.summary.describedCount === 0) {
    // The honest limited-evidence state, never a zero or a fabricated band.
    await expect(page.getByTestId('report-none-described')).toBeVisible()
  } else {
    await expect(page.getByTestId('report-plain-statement')).toBeVisible()
  }
  for (const cap of report.body.data.report.summary.capabilities) expect(cap.level, 'a small DRAFT slice never claims a band').toBeNull()
  await shoot(page, testInfo, 'report')
})
