// P7 real-browser private preparation journey (CH-34, CH-35, CH-36; T07,
// T43, T44, T45, T46, T47, T56) on the isolated campus audit server (4174:
// campus + development + growth flags on, PRISM_PREPARATION_V1 via
// PRISM_AUDIT_PREPARATION, DRAFT content via PRISM_AUDIT_DRAFT_CONTENT,
// throwaway PostgreSQL, deterministic audit AI provider). A synthetic learner
// with NO formal baseline opens Prepare, walks the wizard (an email in the
// counterpart field is redacted), confirms the sanitized summary after
// removing one assumption, rehearses untimed (opening → bounded pushback →
// a requested sample sentence shown apart → revised line), renames the
// preparation, finishes to a card labelled AI assistance with a
// learner-quoted observation, edits the card, edits the application
// suggestion and opts into the in-app reminder, records a SELF_REPORT
// check-in, then finds the records grouped apart in History and Growth with
// the not-comparable formal explanation and no deltas. The formal side is
// asserted empty and untouched; a campus-scoped read is refused.
// Screenshots: audit-results/ui/p7/<step>-<width>.png (chromium only).
// Run: node scripts/run-experience-baseline-tests.mjs p7
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { CAMPUS_BASE_URL, api, signInSynthetic, keyboardFocus, expectNoSeriousAxe, expectNoHorizontalOverflow } from './campusHelpers.js'

const WIDTHS = [1440, 390]
const SHOTS = join('audit-results', 'ui', 'p7')
const OPENING = 'I need to move the demo date by a week because the review step cannot be skipped.'
const PUSHBACK_REPLY = 'If we keep the current date we ship without the review, and I would own the risk of a defect reaching the client.'
const REVISED = 'So my proposal is one more week, and I will own the revised plan and check in with you on Thursday.'
const COUNTERPART_LINE = 'I hear you. Before I agree, what would change if we kept the current date, and who owns the next step?'
const SAMPLE_LINE = 'Could we agree who owns the next step and when we will check in?'

test.skip(process.env.PRISM_AUDIT_PREPARATION !== 'true' || !process.env.PRISM_E2E_DATABASE_URL,
  'Needs the p7 runner mode: node scripts/run-experience-baseline-tests.mjs p7 (preparation flag + throwaway PostgreSQL for the 4174 audit server).')

async function shoot(page, testInfo, name) {
  if (testInfo.project.name !== 'chromium') return
  mkdirSync(SHOTS, { recursive: true })
  const original = page.viewportSize()
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(250)
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: join(SHOTS, `${name}-${width}.png`), fullPage: true })
    await expectNoSeriousAxe(page)
  }
  await page.setViewportSize(original)
}

// No formal-result vocabulary, no numbers that read as measurement, no
// countdown and no trend/arrow language anywhere on a preparation screen.
const noClaims = async (page) => expect(await page.locator('main').innerText()).not.toMatch(/\d\s*%|level\s*\d|\bscore\b|percentile|verified skills|certif|time limit|proctor|\d+:\d\d|↑|↓|trend/i)

test.describe('@p7 preparation journey: wizard → confirm → rehearse → card → application → check-in → history → growth', () => {
  test('the whole journey in one real browser session', async ({ page }, testInfo) => {
    test.setTimeout(300_000)
    const me = await signInSynthetic(page, CAMPUS_BASE_URL, 'p7-journey')

    // 1. Prepare is reachable from the nav and private by default; nothing exists yet.
    await page.goto(`${CAMPUS_BASE_URL}/app/home`)
    const navPrepare = page.getByRole('navigation').getByRole('link', { name: 'Prepare' }).first()
    await expect(navPrepare).toBeVisible()
    await navPrepare.click()
    await expect(page).toHaveURL(/\/app\/prepare$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Prepare' })).toBeVisible()
    await expect(page.getByText('Personal preparation · Private to you').first()).toBeVisible()
    await expect(page.getByText(/never changes a formal result or appears in a campus report/)).toBeVisible()
    await expect(page.getByText(/No limit on preparations/)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'No preparations yet' })).toBeVisible()
    await noClaims(page)
    await shoot(page, testInfo, '01-prepare-empty')

    // 2. Wizard: six bounded situations, one field per step, omit-names guidance; review shows the sanitized text.
    await page.getByRole('button', { name: 'Prepare for a situation' }).click()
    const wizard = page.getByTestId('preparation-wizard')
    await expect(wizard).toHaveAttribute('data-step', 'situation')
    await expect(wizard.getByText(/Leave out names/)).toBeVisible()
    await expect(wizard.getByRole('radio')).toHaveCount(6)
    for (const label of ['Explain a recommendation', 'Clarify a brief', 'Disagree with a colleague', 'Negotiate a deadline', 'Give an update', 'Make a handover']) {
      await expect(wizard.getByRole('radio', { name: label })).toBeVisible()
    }
    await shoot(page, testInfo, '02-wizard-situation')
    await wizard.getByRole('radio', { name: 'Negotiate a deadline' }).check()
    await wizard.getByRole('button', { name: 'Next' }).click()
    await expect(wizard).toHaveAttribute('data-step', 'audience')
    await page.getByLabel('Counterpart (role, not name)').fill('The project lead who owns the demo date, reach them at lead@example.com')
    await wizard.getByRole('button', { name: 'Next' }).click()
    await page.getByLabel('Desired outcome').fill('Agree a one-week later demo date without dropping the review step.')
    await wizard.getByRole('button', { name: 'Next' }).click()
    await page.getByLabel('Constraints').fill('The vendor starts on Monday and the client has already been told a date.')
    await wizard.getByRole('button', { name: 'Next' }).click()
    await expect(wizard).toHaveAttribute('data-step', 'target')
    await expect(wizard.getByRole('radio')).toHaveCount(5)
    await wizard.getByRole('radio', { name: 'Name a constraint clearly' }).check()
    await wizard.getByRole('button', { name: 'Review' }).click()
    const review = page.getByTestId('preparation-review')
    await expect(review).toBeVisible({ timeout: 20_000 })
    await expect(review.getByText(/We removed emails, phone numbers or links/)).toBeVisible()
    await expect(page.getByLabel('Counterpart')).toHaveValue(/\[email removed\]/)
    await expect(page.getByLabel('Counterpart')).not.toHaveValue(/@/)
    await expect(review.getByTestId('preparation-summary')).toContainText('You are preparing to negotiate a deadline with')
    await expect(review.getByTestId('preparation-summary')).not.toContainText('@')
    await expect(review.getByText('Mode: private preparation')).toBeVisible()
    await expect(review.getByText('Scope: personal')).toBeVisible()
    const assumptions = review.getByTestId('preparation-assumptions')
    await expect(assumptions.getByRole('textbox')).toHaveCount(6)
    await expect(assumptions.getByText(/nothing here is a judgement about you/)).toBeVisible()
    await noClaims(page)
    await shoot(page, testInfo, '03-wizard-review')
    // The learner removes the hostile/not-hostile assumption they do not want and confirms.
    await assumptions.getByRole('button', { name: 'Remove assumption 5' }).click()
    await expect(assumptions.getByRole('textbox')).toHaveCount(5)
    await wizard.getByRole('button', { name: 'Confirm and start rehearsal' }).click()

    // 3. Rehearsal: private, untimed, explicit allowance; opening → bounded pushback → sample sentence apart → revised line.
    await expect(page).toHaveURL(/\/app\/prepare\/[0-9a-f-]{36}$/)
    const attemptId = page.url().split('/').pop()
    const rehearsal = page.getByTestId('rehearsal')
    await expect(rehearsal).toBeVisible()
    await expect(rehearsal.getByText('Not a formal assessment')).toBeVisible()
    await expect(rehearsal.getByText('Untimed')).toBeVisible()
    await expect(rehearsal.getByTestId('rehearsal-summary')).toContainText('negotiate a deadline')
    await rehearsal.getByTestId('rehearsal-assumptions').locator('summary').click()
    await expect(rehearsal.getByTestId('rehearsal-assumptions').getByRole('listitem')).toHaveCount(5)
    await expect(rehearsal.getByTestId('rehearsal-assumptions')).not.toContainText('not hostile')
    const limits = rehearsal.getByTestId('rehearsal-limits')
    await expect(limits).toContainText('Your lines: 0 of 40')
    await expect(limits).toContainText('AI suggestions: 0 of 5')
    const log = page.getByRole('log')
    // Opening, sent with the keyboard (T56): Tab reaches the composer, Enter sends.
    const answer = page.getByLabel('Your answer')
    await keyboardFocus(page, answer, 160)
    await page.keyboard.type(OPENING)
    await page.keyboard.press('Enter')
    await expect(log.locator('[data-role="participant"]')).toHaveCount(1, { timeout: 20_000 })
    await expect(log.locator('[data-role="participant"]').first()).toContainText(COUNTERPART_LINE)
    await expect(log.locator('[data-role="participant"]').first()).toHaveAttribute('data-ai-generated', 'true')
    await expect(log.locator('[data-role="candidate"]').first()).toContainText(OPENING)
    await expect(limits).toContainText('Your lines: 1 of 40')
    // Respond to the pushback.
    await answer.fill(PUSHBACK_REPLY)
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(log.locator('[data-role="participant"]')).toHaveCount(2, { timeout: 20_000 })
    // A sample sentence is assistance: shown apart, never in the conversation as the learner.
    const assistance = rehearsal.getByTestId('rehearsal-assistance')
    await expect(assistance.getByText('AI suggestion — not your line')).toBeVisible()
    await assistance.getByRole('button', { name: 'Ask for a sample sentence' }).click()
    const suggestion = assistance.getByTestId('assist-suggestion')
    await expect(suggestion).toHaveCount(1, { timeout: 20_000 })
    await expect(suggestion).toHaveAttribute('data-authorship', 'ASSISTANT')
    await expect(suggestion).toContainText(SAMPLE_LINE)
    await expect(log).not.toContainText(SAMPLE_LINE)
    await expect(log.locator('[data-role="candidate"]')).toHaveCount(2)
    await expect(limits).toContainText('AI suggestions: 1 of 5')
    // Revise the plan in the learner's own words.
    await answer.fill(REVISED)
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(log.locator('[data-role="candidate"]')).toHaveCount(3, { timeout: 20_000 })
    await expect(limits).toContainText('Your lines: 3 of 40')
    await noClaims(page)
    await shoot(page, testInfo, '04-rehearsal')

    // Rename; pause and resume keep everything.
    await page.getByRole('button', { name: 'Rename' }).click()
    await page.getByLabel('Name this preparation').fill('Demo date with the lead')
    await page.getByRole('button', { name: 'Save name' }).click()
    await expect(page.getByTestId('preparation-name')).toHaveText('Demo date with the lead')
    await page.getByRole('link', { name: 'Pause and come back later' }).click()
    await expect(page).toHaveURL(/\/app\/prepare$/)
    const listItem = page.getByTestId('preparation-item')
    await expect(listItem).toHaveCount(1)
    await expect(listItem).toContainText('Demo date with the lead')
    await expect(listItem).toContainText('In progress')
    await listItem.getByRole('link', { name: /^Continue/ }).click()
    await expect(page.getByTestId('rehearsal')).toBeVisible()
    await expect(log.locator('[data-role="candidate"]')).toHaveCount(3)

    // 4. Finish: a card labelled AI assistance; observations quote only the learner's own line.
    await page.getByRole('button', { name: 'Finish and get my card' }).click()
    const card = page.getByTestId('action-card')
    await expect(card).toBeVisible({ timeout: 30_000 })
    await expect(card.getByText('AI assistance', { exact: true })).toBeVisible()
    await expect(card.getByText('Not a formal assessment')).toBeVisible()
    await expect(card.getByText(/saving a plan is not a measure/)).toBeVisible()
    await expect(card.getByText('Plan', { exact: true })).toBeVisible()
    await expect(card.getByText('Opening', { exact: true })).toBeVisible()
    await expect(card.getByText('Questions to ask')).toBeVisible()
    await expect(card.getByText('One boundary or escalation option')).toBeVisible()
    await expect(card.getByText('Self-check')).toBeVisible()
    const observations = card.getByTestId('observations')
    await expect(observations.getByText('Prism observed in your rehearsal')).toBeVisible()
    await expect(observations.getByText(/agreeing or not is not the measure/)).toBeVisible()
    const observation = observations.getByTestId('observation')
    await expect(observation).toHaveCount(1)
    await expect(observation).toHaveAttribute('data-authorship', 'LEARNER')
    await expect(observation).toContainText('Clarified a constraint')
    await expect(observation).toContainText(`You wrote: “${OPENING}”`)
    await expect(observations).not.toContainText(COUNTERPART_LINE)
    await expect(observations).not.toContainText(SAMPLE_LINE)
    await noClaims(page)
    await shoot(page, testInfo, '05-action-card')
    // Edit the card: still assistance, now edited by the learner.
    await card.getByRole('button', { name: 'Edit card' }).click()
    await page.getByLabel('Opening').fill('Here is the constraint I am working with, and one option that keeps the review.')
    await page.getByRole('button', { name: 'Save card' }).click()
    await expect(card.getByText('Here is the constraint I am working with, and one option that keeps the review.')).toBeVisible()
    await expect(card.getByText('You adjusted this card. It is still assistance you edited, not an observation.')).toBeVisible()

    // 5. Application card: suggested from the practice target; edit it and opt into the in-app reminder.
    const application = card.getByTestId('application-card')
    await expect(application).toBeVisible()
    await expect(application.getByText('Suggested from your practice target')).toBeVisible()
    await expect(application.getByTestId('application-text')).toContainText('state your main constraint in one sentence')
    await expect(application.getByText(/Nothing is emailed or sent anywhere/)).toBeVisible()
    await application.getByRole('button', { name: 'Edit' }).click()
    await page.getByLabel('One thing to try').fill('Open with the review constraint, then ask who owns the revised date.')
    await application.getByRole('button', { name: 'Save' }).click()
    await expect(application.getByTestId('application-text')).toHaveText('Open with the review constraint, then ask who owns the revised date.')
    await expect(application.getByText('Your wording')).toBeVisible()
    // The reminder is a controlled checkbox: it flips once the server has saved the opt-in.
    await application.getByRole('checkbox', { name: 'Remind me in Prism to record how it went' }).click()
    await expect(application.getByRole('checkbox', { name: 'Remind me in Prism to record how it went' })).toBeChecked({ timeout: 15_000 })
    await shoot(page, testInfo, '06-application-card')
    // The reminder is in-app only: it shows on the Prepare list and nowhere else.
    await page.goto(`${CAMPUS_BASE_URL}/app/prepare`)
    await expect(page.getByTestId('reminder-due')).toContainText(/record how the real conversation went/)
    await page.getByTestId('preparation-item').getByRole('link', { name: /^Open/ }).click()
    await expect(page.getByTestId('action-card')).toBeVisible()

    // 6. Check-in: clearly SELF_REPORT, cannot change a formal result.
    await page.getByRole('button', { name: 'Record how it went' }).click()
    const form = page.getByTestId('checkin-form')
    await expect(form.getByText('Self-reported')).toBeVisible()
    await expect(form.getByText(/cannot change a formal result/)).toBeVisible()
    await page.getByLabel('Did you try it? What did you do?').fill('I opened with the review constraint before proposing a date.')
    await page.getByLabel('What happened?').fill('We agreed a date one week later and the lead owns telling the client.')
    await page.getByLabel('What do you want to try next? (optional)').fill('Ask who owns the next step earlier in the conversation.')
    await page.getByRole('button', { name: 'Save check-in' }).click()
    await expect(page.getByTestId('checkin-saved')).toContainText('saved as self-reported', { timeout: 20_000 })
    await noClaims(page)
    await shoot(page, testInfo, '07-checkin-saved')

    // 7. History groups the preparation and the note apart; no formal group exists.
    await page.goto(`${CAMPUS_BASE_URL}/app/assessments?tab=history`)
    await page.getByRole('tab', { name: 'History' }).click()
    const prepGroup = page.getByRole('region', { name: 'Private preparation' })
    await expect(prepGroup.getByTestId('history-item')).toHaveCount(1)
    await expect(prepGroup).toContainText('Demo date with the lead')
    await expect(prepGroup.getByTestId('history-item')).toHaveAttribute('data-mode', 'PREPARATION')
    await expect(prepGroup).toContainText('Personal · Private to you')
    await expect(prepGroup).not.toContainText('Personal assessment')
    await expect(prepGroup).toContainText('Finished')
    const noteGroup = page.getByRole('region', { name: 'Your own note (self-reported)' })
    await expect(noteGroup.getByTestId('history-item')).toHaveCount(1)
    await expect(noteGroup.getByTestId('history-item')).toHaveAttribute('data-mode', 'SELF_REPORT')
    await expect(noteGroup).toContainText('Personal · Private to you')
    await expect(noteGroup).not.toContainText('Personal assessment')
    await expect(noteGroup).not.toContainText('Completed')
    await expect(page.getByRole('region', { name: 'Formal assessment' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Practice' })).toHaveCount(0)
    await noClaims(page)
    await shoot(page, testInfo, '08-history')
    await prepGroup.getByRole('link', { name: /Demo date with the lead/ }).click()
    await expect(page).toHaveURL(new RegExp(`/app/prepare/${attemptId}$`))
    await expect(page.getByTestId('action-card')).toBeVisible()

    // 8. Growth: Formal history explains that nothing is compared; Practice history and Application reflections sit apart; no arrows or deltas.
    await page.goto(`${CAMPUS_BASE_URL}/app/growth`)
    await expect(page.getByRole('heading', { level: 1, name: 'Growth' })).toBeVisible()
    const formal = page.getByTestId('growth-formal-history')
    await expect(formal).toBeVisible()
    await expect(formal.getByText('No published formal result yet.')).toBeVisible()
    await expect(formal.getByText(/A later result is added; it never updates an earlier one/)).toBeVisible()
    await expect(formal.getByText(/approved as comparable/)).toBeVisible()
    await expect(formal.getByTestId('formal-snapshot')).toHaveCount(0)
    await expect(page.getByTestId('growth-change')).toHaveCount(0)
    const practice = page.getByTestId('growth-practice-history')
    await expect(practice.getByRole('listitem')).toHaveCount(1)
    await expect(practice.getByRole('listitem').first()).toHaveAttribute('data-mode', 'PREPARATION')
    await expect(practice).toContainText('Demo date with the lead')
    await expect(practice).toContainText(/never part of a comparison/)
    const reflections = page.getByTestId('growth-self-report')
    await expect(reflections.getByRole('heading', { name: 'Application reflections' })).toBeVisible()
    await expect(reflections.getByTestId('self-report-item')).toHaveCount(1)
    await expect(reflections.getByTestId('self-report-item')).toContainText('I opened with the review constraint before proposing a date.')
    await expect(reflections.getByTestId('self-report-item')).toContainText('after a private preparation')
    await expect(reflections.getByText(/cannot change a formal result/)).toBeVisible()
    await expect(page.locator('main svg[data-chart], main [data-direction], main [data-delta]')).toHaveCount(0)
    await noClaims(page)
    await shoot(page, testInfo, '09-growth-groups')

    // 9. The formal side is untouched and nothing entered the evidence normalizer (T44/T45).
    const caps = await api(page, '/api/v1/me/capabilities', { token: me.token })
    expect(caps.status).toBe(200)
    expect(caps.body.data.assessedCount).toBe(0)
    const evidence = await api(page, '/api/v1/me/evidence', { token: me.token })
    expect(evidence.status).toBe(200)
    expect(evidence.body.data.items).toEqual([])
    const history = await api(page, '/api/v1/me/history', { token: me.token })
    expect(history.status).toBe(200)
    expect(history.body.data.items.map((i) => i.mode).sort()).toEqual(['PREPARATION', 'SELF_REPORT'])
    expect(history.body.data.items.every((i) => i.scope === 'PERSONAL')).toBe(true)
    const attempt = await api(page, `/api/v1/preparation/${attemptId}`, { token: me.token })
    expect(attempt.status).toBe(200)
    expect(attempt.body.data.mode).toBe('PREPARATION')
    expect(attempt.body.data.scope).toBe('PERSONAL')
    expect(attempt.body.data.turns.filter((t) => t.authorship === 'LEARNER').map((t) => t.text)).toEqual([OPENING, PUSHBACK_REPLY, REVISED])
    expect(attempt.body.data.turns.filter((t) => t.actor === 'AI_ASSISTANT').every((t) => t.authorship === 'ASSISTANT')).toBe(true)
    const checkins = await api(page, '/api/v1/checkins', { token: me.token })
    expect(checkins.body.data.items.map((c) => c.mode)).toEqual(['SELF_REPORT'])

    // 10. Cross-scope (T07/T43/T47): a campus workspace header never reaches personal preparation rows, by id or by list.
    const foreign = '11111111-1111-4111-8111-111111111111'
    for (const path of ['/api/v1/preparation', `/api/v1/preparation/${attemptId}`, '/api/v1/checkins']) {
      const r = await api(page, path, { token: me.token, headers: { 'X-Prism-Workspace': foreign } })
      expect([403, 404]).toContain(r.status)
      expect(JSON.stringify(r.body)).not.toContain(OPENING)
    }
    // Mode/scope tampering is ignored or rejected: a client cannot write FORMAL into a check-in.
    const tamper = await api(page, '/api/v1/checkins', { method: 'POST', token: me.token, body: { sourceType: 'PREPARATION', sourceId: attemptId, whatTried: 'x', outcome: 'y', mode: 'FORMAL' } })
    expect(tamper.status).toBe(422)
    expect(tamper.body?.error?.code).toBe('VALIDATION_FAILED')
  })
})
