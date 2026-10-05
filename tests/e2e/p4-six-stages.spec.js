// P4 real-browser six-stage coverage proof (Layer B in the browser): NO API
// fixtures for the session, the ledger or the report. A synthetic learner on
// the isolated campus audit server (4174, throwaway PostgreSQL, deterministic
// audit model provider, DRAFT content enabled for that process only by the
// runner's p4 mode) runs the DRAFT universal form CORE-TEAMREADY-A:
//   - the six stage labels appear in authored order as stages are answered;
//   - the stage-3 world change shows a "What changed" notice and the learner's
//     earlier board edit survives it;
//   - the stage-4 recommendation is visibly labelled AI-generated;
//   - finishing early at stage 5 (stages 1-4 answered, stage 5 presented) produces a report with
//     a counts-only coverage note and no unit or claim for unpresented stages;
//   - T19: an unknown requested scenario id on the dev path is 422
//     SCENARIO_NOT_FOUND with no substitution.
// Screenshots (1440 and 390) of the change notice and the AI label go to
// audit-results/ui/p4/. Run: node scripts/run-experience-baseline-tests.mjs p4
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { CAMPUS_BASE_URL, api, signInSynthetic, expectNoSeriousAxe, expectNoHorizontalOverflow } from './campusHelpers.js'

const DRAFT_FORM = 'draft-core-teamready-a'
const SHOTS = join('audit-results', 'ui', 'p4')
const CONSENT = { scopes: ['data_processing', 'ai_disclosure', 'ai_scoring_oversight', 'proctoring', 'face_analysis', 'own_work'], consentVersion: 'synthetic-p4-consent' }
const STAGE_LABELS = ['Understand', 'Choose and coordinate', 'Respond to changed constraints', 'Check a recommendation', 'Resolve handover ambiguity', 'Finish usable work']
const BOARD_TASK = 'Prepare participant materials'
const DUE = 'Day 2 morning'
// Synthetic learner words in presentation order of the REQUIRED opportunities
// (never real learner data). Stage 1 (1), stage 2 (4), stage 3 (1), stage 4 (1).
const ANSWERS = [
  'Is 24 the confirmed number or only the sign-ups? And can we print the handouts on the morning if needed?',
  'One session for all 24 reaches everyone at once; two smaller sessions support people better but double the setup. With two days I would run one session and keep materials minimal.',
  'Board: Sam keeps the venue setup Day 1 morning, Priya takes the materials for Day 2, I confirm the list today. Order: list, room, materials.',
  'Plan: Sam sets up the room Day 1 morning, I confirm the list today, Priya prepares the materials Day 2. Sam, I need the seat count from you first.',
  'I hear that the room matters most and I agree it comes first. I still think a one-page agenda is worth it; can we do that instead of a full pack?',
  'Sam is out Day 1 afternoon, so room setup moves to Day 1 morning and I take the materials myself. Priya, can you cover the list if I run short?',
  'No. The brief says 24 participants, not 40, and the venue only has one screen, so I would not rely on a projector. I am unsure the screen works with a laptop; Sam can check.',
]
// Opportunities of stages 5 and 6 (never presented or never answered here):
// no unit and no claim may reference them.
const UNPRESENTED = ['OPP-COLLAB-HANDOVER-DISAGREEMENT', 'OPP-COMM-AMBIGUITY-CLARIFY', 'OPP-ADAPT-FEEDBACK', 'OPP-EXEC-BOARD-FINAL', 'OPP-COMM-HANDOVER-AUDIENCE']

test.skip(process.env.PRISM_AUDIT_DRAFT_CONTENT !== 'true' || !process.env.PRISM_E2E_DATABASE_URL,
  'Needs the p4 runner mode: node scripts/run-experience-baseline-tests.mjs p4 (draft content + throwaway PostgreSQL for the 4174 audit server).')

async function contractOf(page, token, sid) {
  const r = await api(page, `/api/v1/assessment-sessions/${sid}`, { token })
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data
}
async function continueOnSmall(page) {
  const go = page.getByRole('button', { name: 'Continue on this device' })
  if (await go.isVisible().catch(() => false)) await go.click({ timeout: 10_000 })
}
async function choosePane(page, name) {
  const radio = page.getByRole('radio', { name })
  if (!(await radio.count())) return
  if (await radio.isChecked({ timeout: 10_000 })) return
  await page.locator('label').filter({ has: radio }).click({ timeout: 10_000 })
  await expect(radio).toBeChecked()
}
const stripText = async (page) => page.getByTestId('stage-strip').locator('li').allTextContents()
const currentStage = (strip) => strip.findIndex((t) => t.endsWith('(now)'))

// Send one answer and wait until the authored participants have replied.
async function answer(page, text) {
  await continueOnSmall(page)
  await choosePane(page, 'Conversation')
  const log = page.getByRole('log', { name: 'Assessment conversation' })
  const before = await log.locator('[data-role="participant"]').count()
  const box = page.getByLabel('Your answer')
  await box.fill(text)
  await box.press('Enter')
  await expect(log.locator('[data-role="candidate"]').filter({ hasText: text.slice(0, 40) })).toBeVisible()
  await expect.poll(() => log.locator('[data-role="participant"]').count(), { timeout: 20_000 }).toBeGreaterThan(before)
}

async function shoot(page, testInfo, name, { prepare } = {}) {
  if (testInfo.project.name !== 'chromium') return
  mkdirSync(SHOTS, { recursive: true })
  const original = page.viewportSize()
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 })
    await page.waitForTimeout(300)
    if (prepare) await prepare(width)
    await page.waitForTimeout(150)
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: join(SHOTS, `${name}-${width}.png`) })
    await expectNoSeriousAxe(page)
  }
  await page.setViewportSize(original)
  await page.waitForTimeout(300)
  if (prepare) await prepare(original.width)
}

test('P4 six stages in the browser: ordered stage strip, stage-3 change notice keeps board edits, stage-4 AI label, early finish → coverage note, T19 unknown scenario fails closed', async ({ page }, testInfo) => {
  test.setTimeout(300_000)
  const learner = await signInSynthetic(page, CAMPUS_BASE_URL, `p4-stages-${testInfo.project.name}`)
  const token = learner.token

  // ── T19: unknown requested scenario id on the dev path → 422, no substitution ──
  const t19 = await api(page, '/api/payment/dev-session', { method: 'POST', token, body: {} })
  expect(t19.status, JSON.stringify(t19.body)).toBe(200)
  const t19Consent = await api(page, '/api/assessment/consent', { method: 'POST', token, body: { sessionId: t19.body.sessionId, ...CONSENT } })
  expect(t19Consent.status, JSON.stringify(t19Consent.body)).toBe(200)
  const unknown = await api(page, '/api/assessment/start', { method: 'POST', token, body: { sessionId: t19.body.sessionId, scenarioId: 'prism-sim-does-not-exist', candidateName: 'Synthetic' } })
  expect(unknown.status, JSON.stringify(unknown.body)).toBe(422)
  expect(unknown.body.code).toBe('SCENARIO_NOT_FOUND')
  expect(unknown.body.messages, 'no substituted scenario is served').toBeUndefined()
  // T21: the formal session contract never carries a calibration payload.
  const calib = await api(page, '/api/assessment/calibrate', { method: 'POST', token, body: { sessionId: t19.body.sessionId, answer: 'Synthetic calibration answer with a decision made under incomplete information and a reflection.' } })
  expect(calib.status).toBe(200)
  expect(calib.body.purpose).toBe('CALIBRATION')
  expect(calib.body.label).toBe('Difficulty calibration (not part of your assessment context)')

  // ── The universal DRAFT form through the real v1 API ─────────────────────
  const minted = await api(page, '/api/payment/dev-session', { method: 'POST', token, body: {} })
  expect(minted.status).toBe(200)
  const list = await api(page, '/api/v1/me/assessments', { token })
  const card = list.body.data.active.find((c) => c.definitionId === DRAFT_FORM && c.status === 'NOT_STARTED')
  expect(card, 'the dev entitlement is offered the DRAFT universal form').toBeTruthy()
  const started = await api(page, `/api/v1/assessment-assignments/${card.id}/start`, { method: 'POST', token, body: { consent: CONSENT }, headers: { 'Idempotency-Key': `p4-start-${Date.now()}` } })
  expect(started.status, JSON.stringify(started.body)).toBe(201)
  const sid = started.body.data.sessionId
  const allocated = await contractOf(page, token, sid)
  expect(allocated.purpose).toBe('FORMAL')
  expect(JSON.stringify(allocated)).not.toMatch(/calibrat|"tier"/i)
  expect(allocated.coverage, 'no coverage counts while the run is open').toBeUndefined()
  expect(allocated.stages.map((s) => s.label)).toEqual(STAGE_LABELS)

  await page.goto(`${CAMPUS_BASE_URL}/app/assessment/${sid}`)
  await page.getByRole('dialog', { name: allocated.scenario.title }).getByRole('button', { name: 'Begin timed assessment' }).click()
  await expect(page.getByRole('timer')).toBeVisible()
  await continueOnSmall(page)

  // ── Stage strip: six labels in order, stage 1 current ────────────────────
  let strip = await stripText(page)
  expect(strip.map((t) => t.replace(/ \((now|done)\)$/, ''))).toEqual(STAGE_LABELS)
  expect(currentStage(strip)).toBe(0)
  expect(strip.filter((t) => /\(done\)$/.test(t))).toHaveLength(0)
  // The strip names tasks only: no score, level or coverage words.
  expect(strip.join(' ')).not.toMatch(/score|level|coverage|%/i)

  // Stage 1 answered → stage 2 current, stage 1 done.
  await answer(page, ANSWERS[0])
  strip = await stripText(page)
  expect(currentStage(strip)).toBe(1)
  expect(strip[0]).toMatch(/\(done\)$/)

  await answer(page, ANSWERS[1])
  // ── Stage 2: one keyboard-reachable board edit, then the text answers ────
  await continueOnSmall(page)
  await choosePane(page, /^Workspace/)
  const due = page.getByLabel(`Due for ${BOARD_TASK}`)
  await due.fill(DUE)
  // A real save: the status leaves SAVED on the edit and returns after the flush.
  await expect(page.locator('[data-save-state="DIRTY"], [data-save-state="SAVING"]')).toBeVisible({ timeout: 5_000 })
  await expect(page.locator('[data-save-state="SAVED"]')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('[data-row="R2"] [data-field="due"]')).toHaveAttribute('data-origin', 'LEARNER')
  expect((await contractOf(page, token, sid)).artifacts[0].data['R2.due'], 'the edit is on the server before the next answer').toBe(DUE)
  await page.getByLabel('Owner for Prepare participant materials').selectOption('Priya')
  await page.getByLabel('Owner for Confirm the participant list and needs').selectOption('You')
  await expect(page.locator('[data-save-state="SAVED"]')).toBeVisible({ timeout: 15_000 })
  await choosePane(page, 'Conversation')
  await expect(page.getByRole('log', { name: 'Assessment conversation' })).toContainText('I have seen the board change.')
  for (const text of ANSWERS.slice(3, 5)) await answer(page, text)
  strip = await stripText(page)
  expect(currentStage(strip)).toBe(2)
  expect(strip.slice(0, 2).every((t) => /\(done\)$/.test(t))).toBe(true)

  // ── Stage 3: the world changed; the learner is told; the board edit remains ──
  const log = page.getByRole('log', { name: 'Assessment conversation' })
  await continueOnSmall(page)
  await choosePane(page, 'Conversation')
  const change = log.locator('[data-role="participant"][data-actor-kind="SYSTEM"]').filter({ hasText: 'What changed' })
  await expect(change).toBeVisible()
  await expect(change).toContainText('Sam is unavailable for the afternoon of Day 1')
  await expect(change).toContainText('Your board is unchanged')
  await shoot(page, testInfo, 'stage3-what-changed', { prepare: async (w) => { await continueOnSmall(page); if (w < 1024) await choosePane(page, 'Conversation'); await change.scrollIntoViewIfNeeded() } })
  await continueOnSmall(page)
  await choosePane(page, /^Workspace/)
  await expect(page.getByLabel(`Due for ${BOARD_TASK}`)).toHaveValue(DUE)
  await expect(page.locator('[data-row="R2"] [data-field="due"]')).toHaveAttribute('data-origin', 'LEARNER')
  expect((await contractOf(page, token, sid)).artifacts[0].data['R2.due']).toBe(DUE)
  await answer(page, ANSWERS[5])
  strip = await stripText(page)
  expect(currentStage(strip)).toBe(3)

  // ── Stage 4: the recommendation is visibly AI-generated ──────────────────
  const ai = log.locator('[data-role="participant"][data-ai-generated="true"]')
  await expect(ai).toBeVisible()
  await expect(ai.getByTestId('ai-generated-label')).toHaveText('AI-generated')
  await expect(ai).toContainText('AI-generated recommendation (not checked by a person)')
  await expect(ai).toContainText('Planning assistant, AI-generated recommendation')
  await shoot(page, testInfo, 'stage4-ai-label', { prepare: async (w) => { await continueOnSmall(page); if (w < 1024) await choosePane(page, 'Conversation'); await ai.scrollIntoViewIfNeeded() } })
  await answer(page, ANSWERS[6])
  strip = await stripText(page)
  expect(currentStage(strip)).toBe(4)
  expect(strip.slice(0, 4).every((t) => /\(done\)$/.test(t))).toBe(true)
  expect(strip[5]).toBe(STAGE_LABELS[5])

  // ── Finish early with stage 5 presented and stages 5-6 unanswered ────────
  await page.getByRole('button', { name: 'Finish assessment' }).click()
  const exit = page.getByRole('dialog', { name: /Finish/ })
  await exit.getByRole('button', { name: /^Finish( anyway)?$/ }).click()
  await expect(page).toHaveURL(new RegExp(`/app/reports/${sid}`), { timeout: 60_000 })

  // Processing view: counts-only coverage, honest, no capability hint.
  await page.goto(`${CAMPUS_BASE_URL}/app/assessment/${sid}`)
  const coverage = page.getByTestId('review-coverage')
  await expect(coverage).toBeVisible()
  await expect(coverage).toContainText('Review coverage: 8 of 11 planned moments were presented.')
  await expect(coverage).toContainText('planned moments were not reached before you finished')
  expect(await coverage.textContent()).not.toMatch(/capabilit|level|score|%/i)
  const done = await contractOf(page, token, sid)
  expect(done.status).toBe('COMPLETED')
  expect(done.coverage).toMatchObject({ planned: 11, presented: 8, answered: 7, notPresented: 3, stagesPlanned: 6, stagesPresented: 5, reviewRequired: false })
  expect(done.coverage.reasons.REVIEW_REQUIRED).toBe(0)

  // Report: coverage note shown; nothing references an unpresented stage.
  await page.getByRole('link', { name: 'Open your report' }).click()
  await expect(page.getByTestId('report-header')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('report-coverage')).toContainText('Review coverage: 8 of 11 planned moments were presented.')
  const report = await api(page, `/api/v1/assessment-sessions/${sid}/report`, { token })
  expect(report.status, JSON.stringify(report.body)).toBe(200)
  const r = report.body.data.report
  expect(r.coverage).toMatchObject({ planned: 11, presented: 8, answered: 7, withheld: 0 })
  const serialised = JSON.stringify(r)
  for (const id of UNPRESENTED) expect(serialised, `${id} was never answered: no unit, no claim`).not.toContain(id)
  for (const o of [...(r.boundedObservations || []), ...(r.moments || [])]) {
    expect([...ANSWERS, DUE, 'Priya', 'You'].some((own) => own.includes(o.quote)), 'every quote is the learner\'s own words').toBe(true)
  }
  // Only Reasoning had three independent answered groups (stages 1, 2, 4);
  // every other family had one and stays an honest insufficient state.
  const described = r.summary.capabilities.filter((cap) => cap.level).map((cap) => cap.id)
  expect(described.every((id) => /REASONING$/.test(id)), `described: ${described.join(', ')}`).toBe(true)
  expect(r.summary.insufficientCount).toBeGreaterThanOrEqual(4)
})
