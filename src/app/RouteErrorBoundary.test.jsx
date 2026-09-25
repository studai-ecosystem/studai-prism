import { describe, it, expect, vi, afterEach } from 'vitest'
import { Suspense } from 'react'
import { render, screen } from '@testing-library/react'
import { RouteErrorBoundary, lazyWithRetry, isChunkLoadError } from './RouteErrorBoundary.jsx'

const originalLocation = window.location
afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
})

function mockReload() {
  const reload = vi.fn()
  Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, reload } })
  return reload
}

describe('RouteErrorBoundary + lazyWithRetry', () => {
  it('classifies chunk-load errors', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /assets/x.js'))).toBe(true)
    expect(isChunkLoadError(new Error('boom'))).toBe(false)
  })

  it('a failing lazy page renders the recoverable error state instead of a blank screen', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Broken = lazyWithRetry(() => Promise.reject(new Error('render failure')))
    render(<RouteErrorBoundary><Suspense fallback={<p>loading</p>}><Broken /></Suspense></RouteErrorBoundary>)
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on this page')
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument()
    spy.mockRestore()
  })

  it('the error clears when the route (resetKey) changes', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    function Bomb() { throw new Error('page failure') }
    const { rerender } = render(<RouteErrorBoundary resetKey="/a"><Bomb /></RouteErrorBoundary>)
    expect(screen.getByText('Something went wrong on this page')).toBeInTheDocument()
    rerender(<RouteErrorBoundary resetKey="/b"><p>next page</p></RouteErrorBoundary>)
    expect(screen.getByText('next page')).toBeInTheDocument()
    spy.mockRestore()
  })

  it('a chunk-load failure reloads once, then shows the reload state on a repeat failure', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const reload = mockReload()
    const chunkError = () => Promise.reject(new TypeError('Failed to fetch dynamically imported module: /assets/a.js'))
    const First = lazyWithRetry(chunkError)
    const { unmount } = render(<RouteErrorBoundary><Suspense fallback={<p>loading</p>}><First /></Suspense></RouteErrorBoundary>)
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    unmount()
    const Second = lazyWithRetry(chunkError)
    render(<RouteErrorBoundary><Suspense fallback={<p>loading</p>}><Second /></Suspense></RouteErrorBoundary>)
    expect(await screen.findByRole('alert')).toHaveTextContent('This page needs to reload')
    expect(reload).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })
})
