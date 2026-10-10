import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { onlineManager } from '@tanstack/react-query'
import { setTelemetrySender } from '../lib/telemetry.js'

// PROD-READY Phase 6 (test infrastructure, P69): user-event's default
// `delay: 0` awaits a real setTimeout after every keystroke and pointer
// action. A test that types a sentence therefore yields to the event loop
// dozens of times, and on a loaded machine each yield can take many
// milliseconds, which pushed long form flows (preparation, preview, missions)
// past the 5 s test limit only under load. `delay: null` dispatches exactly
// the same events (keydown/keypress/input/keyup, pointer sequence) and React
// still re-renders after each one inside act(); only the idle macrotask
// between events is skipped. Options a test passes still win.
vi.mock('@testing-library/user-event', async (importOriginal) => {
  const actual = await importOriginal()
  const ue = actual.default
  const fast = (options) => ({ delay: null, ...options })
  const api = {
    ...ue,
    setup: (options) => ue.setup(fast(options)),
    clear: (element) => ue.setup(fast()).clear(element),
    click: (element, options) => ue.click(element, fast(options)),
    dblClick: (element, options) => ue.dblClick(element, fast(options)),
    tripleClick: (element, options) => ue.tripleClick(element, fast(options)),
    hover: (element, options) => ue.hover(element, fast(options)),
    unhover: (element, options) => ue.unhover(element, fast(options)),
    type: (element, text, options) => ue.type(element, text, fast(options)),
    keyboard: (text, options) => ue.keyboard(text, fast(options)),
    pointer: (input, options) => ue.pointer(input, fast(options)),
    paste: (data, options) => ue.paste(data, fast(options)),
    copy: (options) => ue.copy(fast(options)),
    cut: (options) => ue.cut(fast(options)),
    selectOptions: (select, values, options) => ue.selectOptions(select, values, fast(options)),
    deselectOptions: (select, values, options) => ue.deselectOptions(select, values, fast(options)),
    upload: (element, files, options) => ue.upload(element, files, fast(options)),
    tab: (options) => ue.tab(fast(options)),
  }
  return { ...actual, default: api, userEvent: api }
})

// Product telemetry is fire-and-forget; unit tests assert it explicitly.
setTelemetrySender(() => {})

// React Query pauses fetches while onlineManager is offline and leaves
// isPending true (FlagRoute then shows "Loading" until the test times out).
// The offline-banner test and any leaked `offline` event share this singleton
// inside a worker, so every test starts and ends online.
function forceOnline() {
  if (typeof navigator !== 'undefined') {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
  }
  onlineManager.setOnline(true)
}

beforeEach(forceOnline)

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  forceOnline()
})

window.scrollTo = () => {}

if (!window.IntersectionObserver) {
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  }
}

// jsdom has no layout engine; charts and dialogs only need the interface.
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = window.ResizeObserver
}

if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })
}
