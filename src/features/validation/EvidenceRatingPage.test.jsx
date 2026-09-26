// C12.01 — the rater's evidence page over mocked /api/validation responses:
// token required, one blinded item (no AI level, no identity), a level or
// "cannot rate" is required, the rating is sent with the rater token, and an
// unqualified rater is told to finish training. Synthetic content only.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp, jsonResponse } from '../../test/utils.jsx'
import EvidenceRatingPage from './EvidenceRatingPage.jsx'

const item = { itemId: '55555555-5555-4555-8555-555555555555', capabilityId: 'CAP-L1-REASONING', capabilityName: 'Structured reasoning', sourceType: 'DIALOGUE_TURN', excerpt: 'I would check the refund data first, {{candidate}} said.', candidateToken: '{{candidate}}', rubricVersion: 'evidence-rubric.v1-provisional', scale: [1, 2, 3, 4, 5] }

function mock(routes) {
  const calls = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init = {}) => {
    const u = String(url)
    const method = (init.method || 'GET').toUpperCase()
    calls.push({ url: u, method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined })
    const h = routes[`${method} ${u.replace(/^https?:\/\/[^/]+/, '')}`]
    if (!h) throw new Error(`unexpected fetch ${method} ${u}`)
    return typeof h === 'function' ? h() : jsonResponse(200, h)
  })
  return calls
}

afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); localStorage.clear() })

describe('Evidence rating page', () => {
  it('asks for the rater token first', () => {
    renderApp(<EvidenceRatingPage />, { route: '/rater/evidence' })
    expect(screen.getByRole('link', { name: 'rater workbench' })).toHaveAttribute('href', '/rater')
  })

  it('shows one blinded item and saves a level with the rater token', async () => {
    sessionStorage.setItem('prismRaterToken', 'syn-token')
    let next = { item }
    const calls = mock({
      'GET /api/validation/rater/next': () => jsonResponse(200, next),
      [`POST /api/validation/rater/items/${item.itemId}`]: () => { next = { item: null }; return jsonResponse(201, { ok: true }) },
    })
    renderApp(<EvidenceRatingPage />, { route: '/rater/evidence' })
    expect(await screen.findByTestId('evidence-excerpt')).toHaveTextContent('I would check the refund data first')
    expect(screen.getByText('{{candidate}} stands for the candidate.')).toBeInTheDocument()
    expect(screen.getByTestId('evidence-excerpt').closest('section').textContent).not.toMatch(/\bAI\b|judge|agreement|other rater/i)
    await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }))
    expect(screen.getByText('Choose a level, or "cannot rate".')).toHaveAttribute('role', 'alert')
    await userEvent.click(screen.getByRole('radio', { name: /Level 3/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }))
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ level: 3 }))
    expect(calls.find((c) => c.method === 'POST').headers['x-rater-token']).toBe('syn-token')
    expect(calls.every((c) => !c.headers.Authorization), 'no user session is sent').toBe(true)
    expect(await screen.findByText('There is nothing to rate right now. Thank you.')).toBeInTheDocument()
  })

  it('"cannot rate" is a first-class answer', async () => {
    sessionStorage.setItem('prismRaterToken', 'syn-token')
    const calls = mock({
      'GET /api/validation/rater/next': { item },
      [`POST /api/validation/rater/items/${item.itemId}`]: () => jsonResponse(201, { ok: true }),
    })
    renderApp(<EvidenceRatingPage />, { route: '/rater/evidence' })
    await userEvent.click(await screen.findByRole('radio', { name: 'Cannot rate from this excerpt' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }))
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ cannotRate: true }))
  })

  it('an unqualified rater is sent back to training', async () => {
    sessionStorage.setItem('prismRaterToken', 'syn-token')
    mock({ 'GET /api/validation/rater/next': () => jsonResponse(403, { error: 'Finish rater training before rating evidence.', code: 'RATER_NOT_QUALIFIED' }) })
    renderApp(<EvidenceRatingPage />, { route: '/rater/evidence' })
    expect(await screen.findByText('Finish rater training on the workbench before rating evidence.')).toBeInTheDocument()
  })
})
