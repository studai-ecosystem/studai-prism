// Phase K: settings gathers the account in one place; the admin console asks
// in-app (never with a browser box) and labels status with text and a marker;
// legal and research pages are documents with an index, metadata and visible
// study status.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { screen, within, render as rtlRender } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { renderApp, mockFetch, meBody, signIn, jsonResponse } from './test/utils.jsx'
import { studentRoutes, card } from './test/studentFixtures.js'
import { AGE_DECLARATION_TEXT } from '../server/lib/sharedConstants.js'
import SettingsPage from './features/settings/pages/SettingsPage.jsx'
import { PrivacyPolicy, TermsOfService } from './pages/legal/LegalPages.jsx'
import ValidityStudy from './pages/research/ValidityStudy.jsx'
import ScienceBehindPrism from './pages/research/ScienceBehindPrism.jsx'
import { askText, askConfirm, Pill, DataTable } from './pages/admin/ui.jsx'
import AppRouter from './app/AppRouter.jsx'

const PERSONAL_WS = { id: 'personal', type: 'PERSONAL', name: 'Personal', organizationId: null, organizationName: null, visibilityPolicy: 'OWNER_ONLY' }
const CAMPUS_WS = { id: 'ws-cs', type: 'CAMPUS_STUDENT', name: 'Synthetic University', organizationId: 'org-1', organizationName: 'Synthetic University', visibilityPolicy: 'OWNER_AND_SPONSOR', permissions: [] }

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear() })

function renderSettings(extra = {}, { ageConfirmed, meHandler } = {}) {
  signIn({ name: 'Synthetic Student', email: 'synthetic@test.local', college: 'Synthetic College', year: '3rd Year' })
  const me = meBody({ flags: { PRISM_APP_SHELL_V3: true }, workspaces: [PERSONAL_WS, CAMPUS_WS] })
  if (typeof ageConfirmed === 'boolean') me.data.user.ageConfirmed = ageConfirmed
  const spy = mockFetch({
    ...studentRoutes({ '/api/payment/licence': { pendingSessionId: null }, ...extra }),
    '/api/v1/me': meHandler || me,
  })
  renderApp(<Routes><Route path="/app/settings" element={<SettingsPage />} /></Routes>, { route: '/app/settings' })
  return spy
}

describe('Settings', () => {
  it('an older account records the existing adult declaration only after affirmative confirmation', async () => {
    let confirmed = false
    const me = () => {
      const body = meBody({ flags: { PRISM_APP_SHELL_V3: true }, workspaces: [PERSONAL_WS, CAMPUS_WS] })
      body.data.user.ageConfirmed = confirmed
      return jsonResponse(200, body)
    }
    const spy = renderSettings({
      '/api/auth/confirm-age': () => {
        confirmed = true
        return jsonResponse(200, { ok: true, user: { ageConfirmed: true } })
      },
    }, { meHandler: me })
    const button = await screen.findByRole('button', { name: 'Record declaration' })
    expect(button).toBeDisabled()
    expect(spy.mock.calls.some(([url]) => String(url).endsWith('/confirm-age'))).toBe(false)
    await userEvent.click(screen.getByLabelText(AGE_DECLARATION_TEXT))
    await userEvent.click(button)
    expect(await screen.findByText('Age declaration recorded.')).toBeInTheDocument()
    const call = spy.mock.calls.find(([url]) => String(url).endsWith('/confirm-age'))
    expect(call[1].method).toBe('POST')
    expect(JSON.parse(call[1].body)).toEqual({ ageConfirmed: true })
    expect(screen.queryByRole('button', { name: 'Record declaration' })).not.toBeInTheDocument()
  })

  it('unknown declaration status is not silently treated as confirmed or as an unconfirmed account', async () => {
    const spy = renderSettings()
    expect(await screen.findByText('Age declaration status is unavailable')).toBeInTheDocument()
    expect(screen.queryByLabelText(AGE_DECLARATION_TEXT)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check declaration status' })).toBeInTheDocument()
    expect(spy.mock.calls.some(([url]) => String(url).endsWith('/confirm-age'))).toBe(false)
  })

  it('a declaration failure remains an error and never shows success', async () => {
    renderSettings({
      '/api/auth/confirm-age': () => jsonResponse(422, { error: 'Synthetic declaration failure' }),
    }, { ageConfirmed: false })
    await userEvent.click(await screen.findByLabelText(AGE_DECLARATION_TEXT))
    await userEvent.click(screen.getByRole('button', { name: 'Record declaration' }))
    expect(await screen.findByText('Synthetic declaration failure')).toBeInTheDocument()
    expect(screen.queryByText('Age declaration recorded.')).not.toBeInTheDocument()
  })

  it('a success-shaped response without an actual confirmed declaration is rejected', async () => {
    renderSettings({
      '/api/auth/confirm-age': { ok: true, user: { ageConfirmed: false } },
    }, { ageConfirmed: false })
    await userEvent.click(await screen.findByLabelText(AGE_DECLARATION_TEXT))
    await userEvent.click(screen.getByRole('button', { name: 'Record declaration' }))
    expect(await within(document.getElementById('profile')).findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('Age declaration recorded.')).not.toBeInTheDocument()
  })

  it('account recovery uses the governed assignment resume path, not legacy briefing', async () => {
    renderSettings({
      '/api/payment/licence': { pendingSessionId: 'sess-resume-ui' },
      '/api/v1/me/assessments': { data: {
        active: [card({ status: 'IN_PROGRESS', sessionId: 'sess-resume-ui', cta: { kind: 'RESUME', to: '/app/assessment/sess-resume-ui' } })],
        completed: [], upcoming: [],
      } },
    }, { ageConfirmed: true })
    const resume = await screen.findByRole('link', { name: 'Resume', exact: true })
    expect(resume).toHaveAttribute('href', '/app/assessment/sess-resume-ui')
    expect(screen.queryByRole('link', { name: 'Resume', exact: true })).not.toHaveAttribute('href', '/briefing')
  })

  it('an unmatched account session opens assessments without guessing a scenario or session route', async () => {
    renderSettings({ '/api/payment/licence': { pendingSessionId: 'sess-unmatched-ui' } }, { ageConfirmed: true })
    expect(await screen.findByRole('link', { name: 'Open assessments' })).toHaveAttribute('href', '/app/assessments')
    expect(screen.queryByRole('link', { name: 'Resume', exact: true })).not.toBeInTheDocument()
  })

  it('a malformed licence response is an explicit error, not an apparently empty account status', async () => {
    renderSettings({ '/api/payment/licence': {} }, { ageConfirmed: true })
    expect(await screen.findByText('Assessment status could not be checked')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry assessment status' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Resume', exact: true })).not.toBeInTheDocument()
  })

  it('has one section for each part of the account, each reachable from the index', async () => {
    renderSettings()
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Settings sections' })
    const names = ['Profile', 'Account', 'Workspaces', 'Privacy', 'Sharing', 'Assessment preferences', 'Accessibility', 'Security']
    for (const name of names) {
      expect(within(nav).getByRole('link', { name })).toHaveAttribute('href', `#${name === 'Assessment preferences' ? 'assessment' : name.toLowerCase()}`)
      expect(document.getElementById(name === 'Assessment preferences' ? 'assessment' : name.toLowerCase())).not.toBeNull()
    }
  })

  it('shows the profile and the account email without internal fields', async () => {
    renderSettings()
    expect(await screen.findByText('Synthetic College')).toBeInTheDocument()
    expect(screen.getByText('synthetic@test.local')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/token|userId|candidateId|password hash/i)
  })

  it('lists the workspaces with who can see each, and marks the current one', async () => {
    renderSettings()
    const section = (await screen.findByRole('heading', { name: 'Workspaces' })).closest('section')
    expect(within(section).getByText('Private to you')).toBeInTheDocument()
    expect(await within(section).findByText('Visible to Synthetic University')).toBeInTheDocument()
    expect(within(section).getByText('Current')).toBeInTheDocument()
    expect(within(section).getByRole('button', { name: 'Switch to Synthetic University' })).toBeInTheDocument()
  })

  it('states how adjustments are arranged and that they never change how answers are judged', async () => {
    renderSettings()
    const section = (await screen.findByRole('heading', { name: 'Assessment preferences' })).closest('section')
    expect(within(section).getByText(/adjustments never change how your answers are judged/)).toBeInTheDocument()
  })

  it('changing a password checks that the two new passwords match before it asks the server', async () => {
    const spy = renderSettings()
    await screen.findByRole('heading', { name: 'Security' })
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
    await userEvent.type(screen.getByLabelText(/Current password/), 'old-password-1')
    await userEvent.type(screen.getByLabelText(/^New password/), 'new-password-1')
    await userEvent.type(screen.getByLabelText(/Confirm new password/), 'different-1')
    await userEvent.click(screen.getByRole('button', { name: 'Update password' }))
    expect(await screen.findByText('The new passwords do not match.')).toBeInTheDocument()
    expect(spy.mock.calls.some(([u]) => String(u).includes('/change-password'))).toBe(false)
  })

  it('erasing data needs the word DELETE typed, and nothing is sent until it is', async () => {
    const spy = renderSettings()
    await userEvent.click(await screen.findByRole('button', { name: 'Delete my assessment data' }))
    const dialog = await screen.findByRole('dialog')
    const erase = within(dialog).getByRole('button', { name: 'Erase everything' })
    expect(erase).toBeDisabled()
    await userEvent.type(within(dialog).getByLabelText('Type DELETE to confirm'), 'DELETE')
    expect(erase).toBeEnabled()
    expect(spy.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
  })
})

describe('The old profile address', () => {
  it('lands on the profile section of settings', async () => {
    signIn()
    mockFetch({
      ...studentRoutes({ '/api/payment/licence': { pendingSessionId: null } }),
      '/api/v1/me': meBody({ flags: { PRISM_APP_SHELL_V3: true } }),
    })
    renderApp(<AppRouter />, { route: '/profile' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' }, { timeout: 8000 })).toBeInTheDocument()
  }, 20_000)
})

describe('Admin building blocks', () => {
  it('asks in the page instead of a browser box, and returns what was typed', async () => {
    const native = vi.spyOn(window, 'prompt')
    const answer = askText('Reason for this change (audited):')
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Reason for this change (audited):'), 'Duplicate account')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continue' }))
    await expect(answer).resolves.toBe('Duplicate account')
    expect(native).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('cancelling returns null so an audited action does not run', async () => {
    const answer = askText('Note (internal):')
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await expect(answer).resolves.toBeNull()
  })

  it('Escape cancels a confirmation, and a destructive one is worded as such', async () => {
    const native = vi.spyOn(window, 'confirm')
    const answer = askConfirm('Execute the approved erasure? This cannot be undone.')
    const dialog = await screen.findByRole('dialog', { name: 'Please confirm' })
    expect(within(dialog).getByText(/cannot be undone/)).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await expect(answer).resolves.toBe(false)
    expect(native).not.toHaveBeenCalled()
  })

  it('a status label carries text and a marker, never colour alone', () => {
    rtlRender(<Pill tone="danger">revoked</Pill>)
    const pill = screen.getByText('revoked').closest('span')
    expect(pill.textContent).toMatch(/^.revoked$/)
    expect(pill.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })

  it('a table can be named for screen readers and has column scopes', () => {
    rtlRender(<DataTable caption="Candidates" columns={[{ key: 'a', label: 'Name' }]} rows={[{ a: 'x' }]} rowKey={(r) => r.a} />)
    expect(screen.getByRole('table', { name: 'Candidates' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('scope', 'col')
  })
})

describe('Documents', () => {
  const doc = (el) => rtlRender(<MemoryRouter>{el}</MemoryRouter>)

  it('a legal page has an index that links to each heading, and an effective date', () => {
    mockFetch({ '/api/': () => jsonResponse(404, {}) })
    doc(<PrivacyPolicy />)
    const nav = screen.getByRole('navigation', { name: 'On this page' })
    const links = within(nav).getAllByRole('link')
    expect(links.length).toBeGreaterThanOrEqual(5)
    for (const a of links) expect(document.getElementById(a.getAttribute('href').slice(1))).not.toBeNull()
    expect(screen.getAllByText(/Effective 30 July 2026/).length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'What we collect' })).toBeInTheDocument()
  })

  it('the terms keep their wording', () => {
    mockFetch({ '/api/': () => jsonResponse(404, {}) })
    doc(<TermsOfService />)
    expect(screen.getByText(/Courts at Chennai, Tamil Nadu have exclusive jurisdiction/)).toBeInTheDocument()
  })
})

describe('Research pages', () => {
  const page = (el) => rtlRender(<MemoryRouter>{el}</MemoryRouter>)

  it('scoring methodology lists every preregistered study as pending until the registry says otherwise', async () => {
    mockFetch({ '/api/evidence/adversarial': () => jsonResponse(404, {}) })
    page(<ValidityStudy />)
    const studies = (await screen.findByRole('heading', { name: 'Study status' })).nextElementSibling
    expect(studies).not.toBeNull()
    expect(screen.getAllByText('Preregistered, not yet run')).toHaveLength(4)
    expect(screen.getByRole('table', { name: /Dimensions, the signal the AI panel looks for/ })).toBeInTheDocument()
  })

  it('does not tell anyone a score means they are ready for a role', async () => {
    mockFetch({ '/api/evidence/adversarial': () => jsonResponse(404, {}) })
    page(<ValidityStudy />)
    await screen.findByRole('heading', { name: 'Reading a dimension score' })
    expect(document.body.textContent).not.toMatch(/ready for most roles|stands out in competitive hiring/i)
    expect(screen.getByText(/reading guide, not a prediction/)).toBeInTheDocument()
  })

  it('the science page names what is still pending and carries no invented quotation', () => {
    page(<ScienceBehindPrism />)
    expect(screen.getByRole('heading', { name: 'What is still pending' })).toBeInTheDocument()
    expect(screen.getAllByText(/In progress/).length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toMatch(/Research Team|best predictor of job performance/)
  })
})