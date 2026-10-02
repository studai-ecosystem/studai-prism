import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { CAMPUS_BASE_URL, signInSynthetic, expectNoSeriousAxe, expectNoHorizontalOverflow } from './campusHelpers.js'

const WIDTHS = [1440, 1280, 1024, 768, 430, 390, 360]
const SESSION = 'sess-ui-frame-0001'
const ENDPOINT = `**/api/v1/assessment-sessions/${SESSION}`
const messages = Array.from({ length: 80 }, (_, i) => ({
  speaker: 'Synthetic colleague', role: 'Colleague', isUser: false,
  content: `Synthetic conversation turn ${i + 1}. This is a UI scroll fixture, not a governed assessment or recorded evidence.`,
}))
const material = {
  artifactId: 'SYN-TICKETS', type: 'CUSTOMER_TICKET_LOG', title: 'Synthetic work material',
  version: 0, notes: '',
  data: { tickets: Array.from({ length: 60 }, (_, i) => ({
    id: `SYN-${i}`, rating: 3, comment: `Synthetic work material row ${i + 1}. This fixture exists only to exercise independent scrolling.`,
  })) },
}

async function fixturePlayer(page, { materials = false, width = 1440, height = 844, expired = false } = {}) {
  await page.setViewportSize({ width, height })
  await signInSynthetic(page, CAMPUS_BASE_URL, 'player-ui')
  const startedAt = Date.now()
  const deadlineAt = expired ? startedAt : startedAt + 35 * 60000
  let serverElapsed = 0
  await page.route(ENDPOINT, (route) => {
    const now = Date.now() + serverElapsed
    return route.fulfill({ json: { data: {
      sessionId: SESSION, status: 'IN_PROGRESS', scope: 'PERSONAL', sponsorName: null,
      assessment: { definitionId: 'prism-workplace-core', title: 'Synthetic UI assessment' },
      scenario: { title: 'Synthetic UI scenario', context: 'Synthetic briefing supplied by a test fixture.', yourRole: 'Synthetic participant', participants: [{ name: 'Synthetic colleague', role: 'Colleague' }] },
      jobFamilyId: null, capabilities: [], artifacts: materials ? [material] : [], messages,
      progress: { exchanges: 0, requiredExchanges: 3 }, integrityPolicy: 'STANDARD',
      device: { requiresLargeScreen: materials, allowSmallScreen: true },
      timing: { serverTime: new Date(now).toISOString(), startedAt: new Date(startedAt).toISOString(), deadlineAt: new Date(deadlineAt).toISOString(), remainingMs: Math.max(0, deadlineAt - now) },
      reportPath: null,
    } } })
  })
  await page.goto(`${CAMPUS_BASE_URL}/app/assessment/${SESSION}`)
  if (materials && width < 768) await page.getByRole('button', { name: 'Continue on this device' }).click()
  await expect(page.getByLabel('Your answer')).toBeVisible()
  return { advanceServer: (ms) => { serverElapsed += ms } }
}

async function readTimerSeconds(page) {
  const [, minutes, seconds] = (await page.getByRole('timer').textContent()).match(/(\d+):(\d+)/)
  return Number(minutes) * 60 + Number(seconds)
}

async function expectFixedFrame(page) {
  await expectNoHorizontalOverflow(page)
  const height = page.viewportSize().height
  const frame = await page.locator('.theme-assessment').boundingBox()
  expect(Math.abs(frame.height - height)).toBeLessThanOrEqual(1)
  const dimensions = await page.evaluate(() => ({
    height: window.innerHeight, documentHeight: document.documentElement.scrollHeight,
    bodyHeight: document.body.scrollHeight, scroll: document.scrollingElement.scrollTop,
  }))
  expect(dimensions.documentHeight).toBeLessThanOrEqual(dimensions.height + 1)
  expect(dimensions.bodyHeight).toBeLessThanOrEqual(dimensions.height + 1)
  expect(dimensions.scroll).toBe(0)
  for (const locator of [page.locator('.theme-assessment > header'), page.locator('form').filter({ has: page.getByLabel('Your answer') })]) {
    const box = await locator.boundingBox()
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(height + 1)
  }
}

async function scrollRegion(page, locator) {
  await locator.evaluate((el) => { el.scrollTop = 0 })
  expect(await locator.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
  await locator.hover()
  await page.mouse.wheel(0, 450)
  await expect.poll(() => locator.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
}

for (const width of WIDTHS) {
  for (const materials of [false, true]) {
    const mode = materials ? 'materials' : 'conversation'
    test(`PLAYER-UI ${mode} at ${width}px: fixed frame and independent scroll (API fixture)`, async ({ page }, testInfo) => {
      await fixturePlayer(page, { materials, width })
      await expectFixedFrame(page)
      const feed = page.getByRole('log', { name: 'Assessment conversation' })
      const headerBefore = await page.locator('.theme-assessment > header').boundingBox()
      await scrollRegion(page, feed)
      expect((await page.locator('.theme-assessment > header').boundingBox()).y).toBe(headerBefore.y)
      await expectFixedFrame(page)
      if (!materials) {
        await expect(page.locator('[data-layout="conversation"]')).toBeVisible()
        await expect(page.getByRole('region', { name: 'Work materials', exact: true })).toHaveCount(0)
        expect((await page.getByRole('region', { name: 'Conversation', exact: true }).boundingBox()).width).toBeLessThanOrEqual(896)
      } else if (width >= 1024) {
        await expect(page.locator('[data-layout="split"]')).toBeVisible()
        const panel = page.getByRole('tabpanel')
        const feedScroll = await feed.evaluate((el) => el.scrollTop)
        await scrollRegion(page, panel)
        expect(await feed.evaluate((el) => el.scrollTop)).toBe(feedScroll)
        const panelScroll = await panel.evaluate((el) => el.scrollTop)
        await scrollRegion(page, feed)
        expect(await panel.evaluate((el) => el.scrollTop)).toBe(panelScroll)
      } else {
        await expect(page.locator('[data-layout="switchable"]')).toBeVisible()
        const answer = page.getByLabel('Your answer')
        await answer.fill('Synthetic draft retained across panes')
        await answer.evaluate((el) => { el.dataset.fixtureComposer = 'same-node' })
        await page.locator('fieldset label').filter({ hasText: /^Workspace$/ }).click()
        await expect(answer).toHaveValue('Synthetic draft retained across panes')
        await expect(answer).toHaveAttribute('data-fixture-composer', 'same-node')
        await scrollRegion(page, page.getByRole('tabpanel'))
      }
      await expectFixedFrame(page)
      await expectNoSeriousAxe(page)
      if (width === 1440 || width === 390) {
        await page.screenshot({ path: join('audit-results', 'ui', 'flow-player', `${testInfo.project.name}-${mode}-${width}.png`) })
      }
    })
  }
}

test('PLAYER-UI compact viewport keeps the composer reachable and briefing does not reset the timer (API fixture)', async ({ page }) => {
  await fixturePlayer(page, { width: 390, height: 480 })
  await expectFixedFrame(page)
  const before = await readTimerSeconds(page)
  await page.getByRole('button', { name: 'Briefing', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Briefing', exact: true })).toBeVisible()
  await expectFixedFrame(page)
  await page.getByRole('button', { name: 'Hide briefing' }).click()
  expect(await readTimerSeconds(page)).toBeLessThanOrEqual(before)
  const answer = page.getByLabel('Your answer')
  await page.getByRole('log', { name: 'Assessment conversation' }).focus()
  await page.keyboard.press('Tab')
  await expect(answer).toBeFocused()
  await answer.fill('Synthetic keyboard draft')
  await expect(answer).toHaveValue('Synthetic keyboard draft')
  const finish = page.getByRole('button', { name: 'Finish assessment' })
  await finish.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Finish before the end?' })
  await expect(dialog).toBeVisible()
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(finish).toBeFocused()
})

test('PLAYER-UI an accepted message and refreshed snapshot do not restart the countdown (API fixture)', async ({ page }) => {
  await page.clock.install()
  const fixture = await fixturePlayer(page)
  await page.route(`${ENDPOINT}/messages`, (route) => route.fulfill({ json: { data: {
    messages: [{ speaker: 'Synthetic colleague', role: 'Colleague', content: 'Synthetic accepted response.' }],
    exchanges: 1, replayed: false,
  } } }))
  const initial = await readTimerSeconds(page)
  await page.clock.fastForward(60000)
  const beforeSend = await readTimerSeconds(page)
  expect(beforeSend).toBeLessThanOrEqual(initial - 59)
  await page.getByLabel('Your answer').fill('Synthetic clock regression response')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Synthetic accepted response.', { exact: true })).toBeVisible()
  const afterSend = await readTimerSeconds(page)
  expect(afterSend).toBeLessThanOrEqual(beforeSend)
  expect(afterSend).toBeGreaterThanOrEqual(beforeSend - 5)
  fixture.advanceServer(60000)
  await page.reload()
  await expect(page.getByLabel('Your answer')).toBeVisible()
  expect(await readTimerSeconds(page)).toBeLessThanOrEqual(afterSend)
})
