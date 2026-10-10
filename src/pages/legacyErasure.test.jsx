// PROD-READY Phase 1S (N1): the legacy result page's "Delete my data" sends the
// signed-in owner's token and reports what the server actually did. It used
// to ignore the response and always claim the data was deleted.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { jsonResponse, signIn } from '../test/utils.jsx'
import ScoreReport from './ScoreReport.jsx'

const SESSION_ID = 'synthetic-erasure-session'
const report = {
  sessionId: SESSION_ID,
  issuedAt: '2023-02-04T11:22:33.000Z',
  method: 'Synthetic original method v1.2',
  scores: { overall: 60, communication: 60, criticalThinking: 60, problemSolving: 60, collaboration: 60, aiDigitalFluency: 60 },
  feedback: { summary: 'Synthetic summary.' },
  highlights: [],
  growthAreas: [],
}

function renderWith(eraseResponse) {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    if (String(url) === '/api/ecosystem/aligned-jobs') return jsonResponse(200, { jobs: [] })
    if (String(url) === `/api/assessment/data/${SESSION_ID}`) return eraseResponse()
    throw new Error(`Unexpected synthetic request ${url}`)
  })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(
    <MemoryRouter initialEntries={[{ pathname: '/score', search: `?session=${SESSION_ID}`, state: { report } }]}>
      <ScoreReport />
    </MemoryRouter>,
  )
  return fetchSpy
}

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('legacy result page erasure', () => {
  it('sends the owner token and confirms only a deletion the server confirmed', async () => {
    signIn(undefined, 'synthetic-owner-token')
    const fetchSpy = renderWith(() => jsonResponse(200, { ok: true, removed: true }))
    await userEvent.click(screen.getByRole('button', { name: /Delete my data/ }))
    expect(await screen.findByText('Your data has been permanently deleted.')).toBeInTheDocument()
    const call = fetchSpy.mock.calls.find(([url]) => url === `/api/assessment/data/${SESSION_ID}`)
    expect(call[1].method).toBe('DELETE')
    expect(call[1].headers.Authorization).toBe('Bearer synthetic-owner-token')
  })

  it('never claims success when the server refuses (signed out or another account)', async () => {
    const fetchSpy = renderWith(() => jsonResponse(404, { error: 'Not found', code: 'NOT_FOUND' }))
    await userEvent.click(screen.getByRole('button', { name: /Delete my data/ }))
    expect(await screen.findByText(/Nothing was deleted/)).toBeInTheDocument()
    expect(screen.queryByText('Your data has been permanently deleted.')).not.toBeInTheDocument()
    const call = fetchSpy.mock.calls.find(([url]) => url === `/api/assessment/data/${SESSION_ID}`)
    expect(call[1].headers.Authorization).toBeUndefined()
  })

  it('reports an unconfirmed outcome on a server error', async () => {
    signIn(undefined, 'synthetic-owner-token')
    renderWith(() => jsonResponse(500, { error: 'Failed to erase data' }))
    await userEvent.click(screen.getByRole('button', { name: /Delete my data/ }))
    expect(await screen.findByText('We could not confirm that your data was deleted. Please try again.')).toBeInTheDocument()
    expect(screen.queryByText('Your data has been permanently deleted.')).not.toBeInTheDocument()
  })
})
