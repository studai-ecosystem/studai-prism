import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { onlineManager } from '@tanstack/react-query'
import { EmptyState, ErrorState, PartialDataNotice, UnauthorizedState, ExpiredEntitlementState, OfflineReconnectBanner, LoadingState } from './index.js'

const inRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('state components', () => {
  it('EmptyState shows title, description and action', () => {
    render(<EmptyState title="No assessments yet" description="Start one." action={<button type="button">Start</button>} />)
    expect(screen.getByRole('heading', { name: 'No assessments yet' })).toBeInTheDocument()
    expect(screen.getByText('Start one.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()
  })
  it('ErrorState is an alert with request reference and retry', async () => {
    const onRetry = vi.fn()
    render(<ErrorState requestId="req-123" onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Reference: req-123')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })
  it('PartialDataNotice names what is missing', () => {
    render(<PartialDataNotice missing={['Communication evidence']} />)
    expect(screen.getByText('Communication evidence')).toBeInTheDocument()
  })
  it('UnauthorizedState does not reveal whether the resource exists', () => {
    inRouter(<UnauthorizedState />)
    expect(screen.getByText(/may not exist, or your current workspace does not have access/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to home' })).toHaveAttribute('href', '/app')
  })
  it('ExpiredEntitlementState never shows a price', () => {
    const { container } = render(<ExpiredEntitlementState />)
    expect(screen.getByRole('heading', { name: 'This access has ended' })).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/₹|INR|\$\d/)
  })
  it('LoadingState is the shared skeleton', () => {
    render(<LoadingState label="Loading page" />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading page')
  })
  it('OfflineReconnectBanner appears offline, disappears online and drives the query onlineManager', () => {
    const setOnline = vi.spyOn(onlineManager, 'setOnline')
    render(<OfflineReconnectBanner />)
    expect(screen.queryByText(/Connection interrupted/)).not.toBeInTheDocument()
    act(() => { window.dispatchEvent(new Event('offline')) })
    expect(screen.getByRole('status')).toHaveTextContent('Connection interrupted. Your latest saved work is safe. Reconnecting…')
    expect(setOnline).toHaveBeenLastCalledWith(false)
    act(() => { window.dispatchEvent(new Event('online')) })
    expect(screen.queryByText(/Connection interrupted/)).not.toBeInTheDocument()
    expect(setOnline).toHaveBeenLastCalledWith(true)
  })
})
