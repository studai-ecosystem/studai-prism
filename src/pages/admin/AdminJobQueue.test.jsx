// PROD-READY Phase 5 — the admin job-queue panel on /admin/system. The API is
// mocked at adminFetch. Proves: nothing renders while the server flag is off
// (404); counts and dead letters are listed; retry/cancel need jobs:manage and
// a written reason, and post exactly that reason; the filter reloads.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const perms = new Set(['system:read', 'jobs:manage'])
vi.mock('../../lib/adminApi.js', () => ({
  adminFetch: vi.fn(),
  adminHasPermission: (k) => perms.has(k),
}))
const { adminFetch } = await import('../../lib/adminApi.js')
const { default: AdminJobQueue } = await import('./AdminJobQueue.jsx')

const DEAD = {
  id: '7d0d1f0e-1111-4c8e-9a52-0d3c1e2b3a4f', kind: 'campus.invite_email', status: 'DEAD', payload: { inviteId: 'x' }, subject: null,
  attempts: 6, maxAttempts: 6, lastError: 'EAUTH: login failed', updatedAt: '2026-10-10T09:00:00.000Z',
}
const LIST = { counts: { DEAD: 1, FAILED: 0, PENDING: 3, RUNNING: 0, SUCCEEDED: 12, CANCELLED: 0 }, jobs: [DEAD], note: 'Dead letters (DEAD) need an operator.' }

beforeEach(() => {
  adminFetch.mockReset()
  perms.add('jobs:manage')
})

describe('AdminJobQueue', () => {
  it('renders nothing while the worker flag is off (the API answers 404)', async () => {
    adminFetch.mockRejectedValue(Object.assign(new Error('Not found'), { status: 404 }))
    const { container } = render(<AdminJobQueue />)
    await waitFor(() => expect(adminFetch).toHaveBeenCalledWith('/api/admin/job-queue?status=DEAD'))
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('lists counts and dead letters, and retries with a written reason', async () => {
    adminFetch.mockImplementation(async (path, opts) => (opts?.method === 'POST' ? { job: { ...DEAD, status: 'PENDING' } } : LIST))
    render(<AdminJobQueue />)
    expect(await screen.findByText('campus.invite_email')).toBeInTheDocument()
    expect(screen.getByText('EAUTH: login failed')).toBeInTheDocument()
    expect(screen.getByTestId('job-count-PENDING')).toHaveTextContent('3')
    expect(screen.getByTestId('job-count-DEAD')).toHaveTextContent('1')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    const confirm = screen.getByRole('button', { name: 'Confirm retry' })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'SMTP credentials rotated' } })
    expect(confirm).not.toBeDisabled()
    fireEvent.click(confirm)
    await waitFor(() => expect(adminFetch).toHaveBeenCalledWith(`/api/admin/job-queue/${DEAD.id}/retry`, { method: 'POST', body: { reason: 'SMTP credentials rotated' } }))
    expect(await screen.findByText('Job queued again.')).toBeInTheDocument()
  })

  it('cancel posts the reason; without jobs:manage there are no actions', async () => {
    adminFetch.mockImplementation(async (path, opts) => (opts?.method === 'POST' ? { job: { ...DEAD, status: 'CANCELLED' } } : LIST))
    const { unmount } = render(<AdminJobQueue />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Invite withdrawn by the college' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm cancel' }))
    await waitFor(() => expect(adminFetch).toHaveBeenCalledWith(`/api/admin/job-queue/${DEAD.id}/cancel`, { method: 'POST', body: { reason: 'Invite withdrawn by the college' } }))
    unmount()
    perms.delete('jobs:manage')
    adminFetch.mockResolvedValue(LIST)
    render(<AdminJobQueue />)
    expect(await screen.findByText('campus.invite_email')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })

  it('the status filter reloads the list', async () => {
    adminFetch.mockResolvedValue({ ...LIST, jobs: [] })
    render(<AdminJobQueue />)
    expect(await screen.findByText('No dead letters.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'PENDING' } })
    await waitFor(() => expect(adminFetch).toHaveBeenCalledWith('/api/admin/job-queue?status=PENDING'))
    expect(await screen.findByText('No jobs in this state.')).toBeInTheDocument()
  })
})
