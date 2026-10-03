// P6 real-browser practice journey (T39-T42) on the isolated campus audit
// server (4174: campus + development flags on, DRAFT content via
// PRISM_AUDIT_DRAFT_CONTENT, throwaway PostgreSQL, deterministic test
// provider). A synthetic learner chooses a goal, opens M09 ("Make the
// handover usable"), reads the first view, makes a first attempt (board edit
// + handover message with one owner missing), gets focused feedback, asks
// for the scaffold and the examples, retries, sees the criterion comparison,
// starts a fresh uncoached challenge (the transfer setting) and finds the
// practice records in History, apart from formal ones. No formal run exists
// for this learner, so the formal side is asserted absent and untouched.
// Screenshots: audit-results/ui/p6/<step>-<width>.png (chromium only).
// Run: node scripts/run-experience-baseline-tests.mjs p6
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { CAMPUS_BASE_URL, api, signInSynthetic, expectNoSeriousAxe, expectNoHorizontalOverflow } from './campusHelpers.js'
import { MISSION_FIXTURES } from '../../server/test/fixtures/p6Missions.js'

const M09 = 'MIS-CORE-USABLE-HANDOVER-01'
const FX = MISSION_FIXTURES[M09]
const WIDTHS = [1440, 390]
const SHOTS = join('audit-results', 'ui', 'p6')
const ROW_LABEL = { slides: 'Prepare the demo slides', room: 'Book the demo room', projector: 'Test the projector', visitors: 'Confirm the visitor list' }

test.skip(process.env.PRISM_AUDIT_DRAFT_CONTENT !== 'true' || !process.env.PRISM_E2E_DATABASE_URL,
  'Needs the p6 runner mode: node scripts/run-experience-baseline-tests.mjs p6 (draft content + throwaway PostgreSQL for the 4174 audit server).')

async function shoot(page, testInfo, name) {
  if (testInfo.project.name !== 'chromium') return
  mkdirSync(SHOTS, { recursive: true })
  const original = page.viewportSize()
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 })
    await page.waitForTimeout(250)
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: join(SHOTS, `${name}-${width}.png`), fullPage: true })
    await expectNoSeriousAxe(page)
  }
  await page.setViewportSize(original)
}

const noClaims = async (page) => expect(await page.locator('main').innerText()).not.toMatch(/\d\s*%|level\s*\d|\bscore\b|percentile|verified skills|certif|time limit|proctor/i)

async function fillBoard(page, work) {
  for (const row of work.BOARD.rows) {
    if (row.owner != null) await page.getByLabel(`Owner for ${ROW_LABEL[row.id]}`).fill(row.owner)
    if (row.done_when != null) await page.getByLabel(`Done when for ${ROW_LABEL[row.id]}`).fill(row.done_when)
  }
  await page.getByLabel('Handover to Lea and Tom', { exact: true }).fill(work.HANDOVER.text)
  await expect(page.getByText('All changes saved')).toBeVisible({ timeout: 15_000 })
}

async function submit(page) {
  await page.getByRole('button', { name: 'Submit for feedback' }).click()
  await page.getByRole('dialog', { name: 'Submit this attempt?' }).getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByTestId('feedback-focus')).toBeVisible({ timeout: 30_000 })
}

test.describe('@p6 practice journey: choose goal → M09 first view → attempt → feedback → scaffold → retry → comparison → fresh challenge → history', () => {
  test('the whole journey in one real browser session', async ({ page }, testInfo) => {
    test.setTimeout(300_000)
    const me = await signInSynthetic(page, CAMPUS_BASE_URL, 'p6-journey')

    // 1. Choose a goal: the catalogue lists missions by family with the P6.1 card facts; filter to Execution.
    await page.goto(`${CAMPUS_BASE_URL}/app/development`)
    await expect(page.getByRole('heading', { level: 1, name: 'Development' })).toBeVisible()
    await expect(page.getByText(/No practice mission matches your current priorities yet/)).toBeVisible()
    await expect(page.getByTestId('draft-note')).toBeVisible()
    const filter = page.getByLabel('Choose a different goal')
    await expect(filter).toBeVisible()
    await filter.selectOption({ label: 'Execution & Ownership' })
    await expect(page.getByTestId('family-group')).toHaveCount(1)
    const m09Card = page.getByRole('article').filter({ hasText: 'Make the handover usable' })
    await expect(m09Card.getByTestId('card-target')).toContainText('Execution & Ownership')
    await expect(m09Card.getByTestId('card-situation')).toContainText('Lea and Tom')
    await expect(m09Card.getByTestId('card-facts')).toContainText('About 15 minutes, untimed')
    await expect(m09Card.getByTestId('card-facts')).toContainText('Text, English')
    await expect(m09Card.getByTestId('draft-label')).toHaveText('Draft content')
    await noClaims(page)
    await shoot(page, testInfo, '01-catalogue-goal')

    // 2. M09 first view: target, scene, what to do, duration (untimed), allowance; checks folded; no examples yet.
    await m09Card.getByRole('link', { name: /^Open mission/ }).click()
    await expect(page).toHaveURL(new RegExp(`/app/development/missions/${M09}$`))
    await expect(page.getByRole('heading', { level: 1, name: 'Make the handover usable' })).toBeVisible()
    await expect(page.getByTestId('first-view-facts')).toContainText('Focus: Execution & Ownership')
    await expect(page.getByTestId('first-view-facts')).toContainText('About 15 minutes, untimed')
    await expect(page.getByTestId('first-view-allowance')).toHaveText('No limit on attempts here')
    await expect(page.getByTestId('scene-setting')).toContainText('Lea and Tom')
    await expect(page.getByText('What to do')).toBeVisible()
    await expect(page.getByText('What will be checked')).toBeVisible()
    await expect(page.getByTestId('what-is-checked')).not.toHaveAttribute('open', '')
    await expect(page.getByTestId('examples-action')).toHaveCount(0)
    await noClaims(page)
    await shoot(page, testInfo, '02-first-view')

    // 3. First attempt: board edit + handover message, one owner left empty → feedback leads with one observation and the missing owner as the next change.
    await page.getByRole('button', { name: 'Start mission' }).click()
    await expect(page.getByLabel('Handover to Lea and Tom', { exact: true })).toBeEnabled()
    await expect(page.getByLabel(`Owner for ${ROW_LABEL.slides}`)).toHaveValue('')
    await fillBoard(page, FX.missingOwner)
    await shoot(page, testInfo, '03-attempt')
    await submit(page)
    const focus = page.getByTestId('feedback-focus')
    await expect(focus.getByTestId('focus-observed')).toContainText('One thing you did')
    await expect(focus.getByTestId('focus-observed')).toContainText(/Source: /)
    await expect(focus.getByTestId('focus-next')).toContainText('One thing to change next')
    await expect(focus.getByTestId('focus-next')).toContainText('Every task has an owner')
    await expect(page.getByTestId('all-checks')).not.toHaveAttribute('open', '')
    await expect(page.getByTestId('mission-criterion')).toHaveCount(4)
    await expect(page.getByTestId('mission-next-steps')).toBeVisible()
    await expect(page.getByLabel('Handover to Lea and Tom', { exact: true })).toBeDisabled()
    await noClaims(page)
    await shoot(page, testInfo, '04-feedback')

    // 4. Scaffold on request (after submission): the M09 hint question and the examples drawer.
    await page.getByTestId('examples-action').click()
    const drawer = page.getByTestId('examples-drawer')
    await expect(drawer.getByTestId('example-item')).toHaveCount(2)
    await expect(drawer).toContainText('What not to do')
    await expect(drawer).toContainText('not counted as your own')
    await shoot(page, testInfo, '05-examples')
    await page.getByRole('dialog', { name: 'Tips and examples' }).getByRole('button', { name: 'Close panel' }).click()

    // 5. Retry: a NEW attempt; the scaffold hint is available in it; complete the board; comparison names what is newly shown.
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByLabel('Handover to Lea and Tom', { exact: true })).toBeEnabled()
    await expect(page.getByLabel('Handover to Lea and Tom', { exact: true })).toHaveValue('')
    await page.getByRole('button', { name: /^Hints/ }).click()
    const hints = page.getByRole('dialog', { name: 'Hints' })
    await hints.getByRole('button', { name: 'Show a hint' }).click()
    await expect(hints.getByText('Could another person tell what they own from this handover?')).toBeVisible()
    await hints.getByRole('button', { name: 'Close panel' }).click()
    await fillBoard(page, FX.valid)
    await submit(page)
    const cmp = page.getByTestId('feedback-comparison')
    await expect(cmp).toContainText('Compared with your earlier attempt')
    await expect(cmp).toContainText('Shown now, not before')
    await expect(cmp).toContainText('Every task has an owner')
    await expect(cmp).toContainText('does not measure growth')
    expect(await cmp.innerText()).not.toMatch(/\d\s*%|improv/i)
    await noClaims(page)
    await shoot(page, testInfo, '06-retry-comparison')

    // 6. Fresh challenge from the completed guided attempt: uncoached, the unfamiliar (transfer) setting, no hints or examples.
    await page.getByRole('button', { name: 'Try a fresh challenge for this capability' }).click()
    await expect(page).toHaveURL(/\?attempt=/)
    await expect(page.getByTestId('uncoached-note')).toContainText('hints are off for this attempt')
    await expect(page.getByTestId('transfer-note')).toContainText('A different setting for the same behaviours.')
    await expect(page.getByTestId('scene-setting')).toContainText('client')
    await expect(page.getByTestId('scene-setting')).not.toContainText('demonstration')
    await expect(page.getByLabel('Owner for Send the call summary to the client')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Hints/ })).toHaveCount(0)
    await expect(page.getByTestId('examples-action')).toHaveCount(0)
    await noClaims(page)
    await shoot(page, testInfo, '07-fresh-challenge')

    // 7. History: practice records sit apart from formal ones; the finished attempts open read-only; no formal record exists or was created.
    await page.goto(`${CAMPUS_BASE_URL}/app/assessments?tab=history`)
    await page.getByRole('tab', { name: 'History' }).click()
    const practice = page.getByRole('region', { name: 'Practice' })
    await expect(practice.getByTestId('history-item')).toHaveCount(3)
    await expect(practice.getByRole('link', { name: /^Open\s*:\s*Make the handover usable$/ }).first()).toBeVisible()
    await expect(practice.getByTestId('history-fresh-challenge').first()).toBeVisible()
    await expect(page.getByRole('region', { name: 'Formal assessment' })).toHaveCount(0)
    await noClaims(page)
    await shoot(page, testInfo, '08-history')
    await practice.getByRole('link', { name: /^Open\s*:\s*Make the handover usable$/ }).first().click()
    await expect(page.getByTestId('feedback-focus')).toBeVisible()
    await expect(page.getByLabel('Handover to Lea and Tom', { exact: true })).toBeDisabled()

    // Formal side untouched: no capability was assessed, every evidence item is practice.
    const caps = await api(page, '/api/v1/me/capabilities', { token: me.token })
    expect(caps.status).toBe(200)
    expect(caps.body.data.assessedCount).toBe(0)
    const evidence = await api(page, '/api/v1/me/evidence', { token: me.token })
    expect(evidence.status).toBe(200)
    expect(evidence.body.data.items.filter((i) => i.kind !== 'PRACTICE')).toEqual([])
    expect(evidence.body.data.items.filter((i) => i.kind === 'PRACTICE').length).toBeGreaterThan(0)
    const history = await api(page, '/api/v1/me/history', { token: me.token })
    expect(history.body.data.items.every((i) => i.mode === 'PRACTICE')).toBe(true)
    const done = history.body.data.items.filter((i) => i.status === 'COMPLETED')
    expect(done.length).toBe(2)
    for (const i of done) expect(i.permittedAction.kind).toBe('VIEW')
    expect(history.body.data.items.some((i) => i.practice?.assistanceMode === 'UNCOACHED' && i.practice?.variant === 'TRANSFER')).toBe(true)
  })
})
