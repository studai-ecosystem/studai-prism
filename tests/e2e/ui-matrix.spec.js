// Phase L: every route family at seven widths with no horizontal overflow, axe
// (WCAG 2.0 to 2.2 A and AA, serious and critical) at the widest and the
// narrowest, a 320 px reflow check, larger-text reflow, reduced motion, touch
// targets, a keyboard walkthrough of the personal app and a dialog focus trap.
// Runs on the flags-on audit server with synthetic users only.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { CAMPUS_BASE_URL, signInSynthetic, linksTabbable } from './campusHelpers.js'

const WIDTHS = [1440, 1280, 1024, 768, 430, 390, 360]
const HEIGHT = (w) => (w >= 1024 ? 900 : 844)
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

const PUBLIC = [
  '/', '/login', '/register', '/invite/synthetic-token', '/privacy', '/terms', '/refund-policy', '/security', '/contact',
  '/research/science', '/research/validity', '/research/ai-evaluation', '/research/blog',
]
const APP = [
  '/app/home', '/app/assessments', '/app/capabilities', '/app/evidence', '/app/development', '/app/growth',
  '/app/explore', '/app/sharing', '/app/settings',
]

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

async function axeProblems(page) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  return results.violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
}

async function visit(page, route) {
  await page.goto(`${CAMPUS_BASE_URL}${route}`)
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
  await expect(page.getByRole('heading', { level: 1 }).first(), `${route} has an h1`).toBeVisible()
}

async function sweep(page, route) {
  const problems = []
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: HEIGHT(w) })
    await visit(page, route)
    const o = await overflow(page)
    if (o > 1) problems.push(`overflow ${o}px at ${w}`)
    if (w === 1440 || w === 390) problems.push(...(await axeProblems(page)).map((p) => `${p} @${w}`))
  }
  await page.setViewportSize({ width: 320, height: 640 })
  await visit(page, route)
  const o320 = await overflow(page)
  if (o320 > 1) problems.push(`reflow: overflow ${o320}px at 320`)
  return problems
}

test.describe('@ui-matrix width matrix, axe and reflow', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium', 'The matrix sets its own viewports; one desktop browser is enough') })

  test('public routes', async ({ page }) => {
    test.setTimeout(600_000)
    const failures = {}
    for (const route of PUBLIC) {
      const p = await sweep(page, route)
      if (p.length) failures[route] = p
    }
    expect(failures).toEqual({})
  })

  test('personal app routes', async ({ page }) => {
    test.setTimeout(600_000)
    await signInSynthetic(page, CAMPUS_BASE_URL, 'matrix')
    const failures = {}
    for (const route of APP) {
      const p = await sweep(page, route)
      if (p.length) failures[route] = p
    }
    expect(failures).toEqual({})
  })

  test('larger text keeps every personal app route inside the screen at 390', async ({ page }) => {
    test.setTimeout(300_000)
    await signInSynthetic(page, CAMPUS_BASE_URL, 'matrix-text')
    await page.setViewportSize({ width: 390, height: 844 })
    const failures = {}
    for (const route of APP) {
      await visit(page, route)
      await page.evaluate(() => document.documentElement.classList.add('prism-large-text'))
      const o = await overflow(page)
      if (o > 1) failures[route] = `overflow ${o}px`
    }
    expect(failures).toEqual({})
  })
})

test.describe('@ui-matrix reduced motion, touch targets, keyboard', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium', 'The matrix sets its own viewports; one desktop browser is enough') })

  test('with reduced motion requested nothing keeps animating by itself', async ({ browser }) => {
    test.setTimeout(300_000)
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } })
    const page = await context.newPage()
    try {
      await signInSynthetic(page, CAMPUS_BASE_URL, 'matrix-motion')
      const running = {}
      for (const route of [...PUBLIC, ...APP]) {
        await page.goto(`${CAMPUS_BASE_URL}${route}`)
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
        await page.waitForTimeout(400)
        const names = await page.evaluate(() => document.getAnimations()
          .filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity && a.effect?.getComputedTiming().duration > 1)
          .map((a) => a.animationName || a.constructor.name))
        if (names.length) running[route] = names
      }
      expect(running).toEqual({})
    } finally {
      await context.close()
    }
  })

  test('controls are at least 24 by 24 CSS px at 390 (WCAG 2.2 target size)', async ({ page }) => {
    test.setTimeout(300_000)
    await signInSynthetic(page, CAMPUS_BASE_URL, 'matrix-target')
    await page.setViewportSize({ width: 390, height: 844 })
    const small = {}
    for (const route of [...PUBLIC, ...APP]) {
      await visit(page, route)
      const found = await page.evaluate(() => [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=switch]')]
        .filter((el) => {
          const r = el.getBoundingClientRect(); const s = getComputedStyle(el)
          if (r.width === 0 || r.height === 0 || s.visibility === 'hidden' || s.display === 'none') return false
          if (el.closest('p, li, span.prose') && el.tagName === 'A' && getComputedStyle(el).display === 'inline') return false
          if (el.classList.contains('sr-only') || el.closest('.sr-only')) return false
          if (el.tagName === 'A' && /^skip to/i.test((el.textContent || '').trim())) return false
          return r.width < 24 || r.height < 24
        })
        .slice(0, 4)
        .map((el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)}" ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`))
      if (found.length) small[route] = found
    }
    expect(small).toEqual({})
  })

  test('keyboard only: a skip link first, visible focus everywhere, and the settings dialog traps focus', async ({ page }) => {
    test.setTimeout(300_000)
    await signInSynthetic(page, CAMPUS_BASE_URL, 'matrix-keys')
    await page.setViewportSize({ width: 1280, height: 800 })
    for (const route of APP) {
      await visit(page, route)
      const skip = page.getByRole('link', { name: /skip to (main )?content/i }).first()
      if (linksTabbable(page)) {
        await page.keyboard.press('Tab')
        await expect(skip, `${route}: skip link is the first tab stop`).toBeFocused()
      } else {
        await skip.focus()
      }
      for (let i = 0; i < 12; i += 1) {
        await page.keyboard.press('Tab')
        const ok = await page.evaluate(() => {
          const el = document.activeElement
          if (!el || el === document.body) return true
          const r = el.getBoundingClientRect(); const s = getComputedStyle(el)
          const ring = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 || s.boxShadow !== 'none'
          return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && ring
        })
        expect(ok, `${route}: focus is visible after ${i + 1} tabs`).toBe(true)
      }
    }

    await visit(page, '/app/settings')
    const opener = page.getByRole('button', { name: 'Delete my assessment data' })
    await opener.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), 'focus stays inside the dialog').toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(opener, 'focus returns to the control that opened the dialog').toBeFocused()
  })
})