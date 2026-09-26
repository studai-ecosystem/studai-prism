import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { setTelemetrySender } from '../lib/telemetry.js'

// Product telemetry is fire-and-forget; unit tests assert it explicitly.
setTelemetrySender(() => {})

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
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
