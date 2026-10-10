// PROD-READY Phase 8 — the guardian consent page (/guardian-consent/:token).
// Server-dark: a 404 shows "not available"; with a pending request the
// guardian sees the DRAFT text and agrees or declines; a verified consent can
// be withdrawn. Synthetic data only.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { renderApp } from '../../test/utils.jsx'
import GuardianConsentPage from './GuardianConsentPage.jsx'
import { GUARDIAN_PAGE_COPY, GUARDIAN_PAGE_COPY_STATUS } from '../../lib/copy/guardianConsent.js'

const copy = {
  status: 'DRAFT', version: 'guardian-consent-u18-v0-draft', title: 'Consent (draft)', intro: 'Synthetic intro.', whatPrismIs: 'Synthetic scope.',
  whatIsCollected: 'Synthetic data note.', whoSees: 'Synthetic visibility.', withdraw: 'Synthetic withdrawal.', deletion: 'Synthetic deletion.',
  grant: 'I agree', decline: 'I do not agree', draftNotice: 'Draft text pending legal review. Not in use.',
}
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function serve(state) {
  const calls = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init = {}) => {
    const path = new URL(String(url?.url || url), 'http://test.local').pathname
    const method = init.method || 'GET'
    calls.push(`${method} ${path}`)
    if (!state.on) return json(404, { error: 'Not found' })
    if (method === 'GET') return json(200, { consent: { status: state.status }, copy, learnerName: 'Synthetic Learner' })
    if (path.endsWith('/withdraw')) { state.status = 'WITHDRAWN'; return json(200, { consent: { status: state.status } }) }
    state.status = JSON.parse(init.body).decision === 'GRANT' ? 'VERIFIED' : 'DECLINED'
    return json(200, { consent: { status: state.status } })
  })
  return calls
}
const page = () => renderApp(<Routes><Route path="/guardian-consent/:token" element={<GuardianConsentPage />} /></Routes>, { route: '/guardian-consent/syn-token' })

afterEach(() => vi.restoreAllMocks())

describe('GuardianConsentPage', () => {
  it('copy is marked DRAFT', () => {
    expect(GUARDIAN_PAGE_COPY_STATUS).toBe('DRAFT')
  })

  it('dark (404): the link is not available and nothing can be submitted', async () => {
    const calls = serve({ on: false })
    page()
    expect(await screen.findByText(GUARDIAN_PAGE_COPY.invalid)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'I agree' })).toBeNull()
    expect(calls.every((c) => c.startsWith('GET'))).toBe(true)
  })

  it('pending → agree → withdraw', async () => {
    const state = { on: true, status: 'PENDING' }
    const calls = serve(state)
    page()
    expect(await screen.findByText(copy.draftNotice)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: copy.title })).toBeInTheDocument()
    expect(screen.getByText('Learner: Synthetic Learner')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'I agree' }))
    expect(await screen.findByText(GUARDIAN_PAGE_COPY.verified)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: GUARDIAN_PAGE_COPY.withdraw }))
    expect(await screen.findByText(GUARDIAN_PAGE_COPY.withdrawn)).toBeInTheDocument()
    expect(calls).toContain('POST /api/guardian-consent/syn-token')
    expect(calls).toContain('POST /api/guardian-consent/syn-token/withdraw')
  })

  it('pending → decline', async () => {
    serve({ on: true, status: 'PENDING' })
    page()
    await userEvent.click(await screen.findByRole('button', { name: 'I do not agree' }))
    await waitFor(() => expect(screen.getByText(GUARDIAN_PAGE_COPY.declined)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: GUARDIAN_PAGE_COPY.withdraw })).toBeNull()
  })
})
