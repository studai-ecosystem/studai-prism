import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { useRouteFocus } from './AppShell.jsx'

function Probe({ pathname, withHeading = true }) {
  useRouteFocus(pathname)
  return withHeading ? <h1 id="page-title" tabIndex={-1}>Title</h1> : null
}

afterEach(() => vi.restoreAllMocks())

// PROD-READY P110: route focus moves to the page heading without scrolling, so
// a heading that renders late cannot pull back a page the person has scrolled.
describe('useRouteFocus', () => {
  it('focuses the new page heading on navigation without scrolling the page', async () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    const { rerender } = render(<Probe pathname="/app/one" />)
    rerender(<Probe pathname="/app/two" />)
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    expect(focus).toHaveBeenCalled()
    for (const [options] of focus.mock.calls) expect(options).toEqual({ preventScroll: true })
    expect(document.activeElement?.id).toBe('page-title')
  })
})
