import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { onlineManager } from '@tanstack/react-query'
import { setTelemetrySender } from '../lib/telemetry.js'

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
