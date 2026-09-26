// C5.07–C5.11 — Assessment Workspace V3 player, artifact store and data-driven
// work materials. Proves: the transcript only grows with server turns; a
// failed send keeps the answer and retries with the SAME client event id;
// versioned artifact writes with server-wins conflicts and a recoverable
// draft; early finish is explicit; mobile tabs + large-screen notice; the V3
// consent wording is identical to the legacy briefing; no scenario vocabulary
// in the generic work-material components.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { renderApp, mockFetch, meBody, signIn, jsonResponse } from '../../test/utils.jsx'
import { createArtifactStore } from './state/artifactStore.js'
import AssessmentPlayerPage from './pages/AssessmentPlayerPage.jsx'
import AnalyticsDashboard from '../../components/artifacts/AnalyticsDashboard.jsx'
import { humanizeKey } from '../../components/artifacts/format.js'
import { ASSESSMENT_CONSENT_ITEMS, CONSENT_VERSION } from '../../lib/copy/assessmentConsent.js'

function contract(overrides = {}) {
  return {
    sessionId: 'sess-v3-0001', status: 'IN_PROGRESS', scope: 'PERSONAL', sponsorName: null,
    assessment: { definitionId: 'prism-workplace-core', title: 'Prism Workplace Simulation' },
    scenario: { title: 'Synthetic Scenario', context: 'Synthetic context.', yourRole: 'Analyst', participants: [{ name: 'Synthetic Colleague', role: 'Manager' }] },
    jobFamilyId: null, capabilities: [],
    artifacts: [],
    messages: [{ speaker: 'Synthetic Colleague', role: 'Manager', content: 'Welcome to the synthetic scenario.', isUser: false }],
    progress: { exchanges: 0, requiredExchanges: 3 },
    integrityPolicy: 'STANDARD',
    device: { requiresLargeScreen: false, allowSmallScreen: true },
    timing: { serverTime: '2026-10-01T10:00:00.000Z', startedAt: '2026-10-01T09:59:00.000Z', deadlineAt: '2026-10-01T10:34:00.000Z', remainingMs: 2040000 },
    reportPath: null,
    ...overrides,
  }
}
const budgetArtifact = { artifactId: 'SYN-ART', type: 'BUDGET_MODELER', title: 'Synthetic budget', data: { totalBudget: 100, allocations: { alphaSpend: 40, betaSpend: 30 } }, version: 0 }

const setWide = (wide) => {
  window.matchMedia = (q) => ({ matches: wide, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })
}
const original = window.matchMedia
afterEach(() => { window.matchMedia = original })

function renderPlayer(routes, { route = '/app/assessment/sess-v3-0001' } = {}) {
  signIn()
  const spy = mockFetch({ ...routes, '/api/v1/me': meBody({ flags: { PRISM_APP_SHELL_V3: true, PRISM_ASSESSMENT_WORKSPACE_V3: true } }) })
  const out = renderApp(<Routes><Route path="/app/assessment/:sessionId" element={<AssessmentPlayerPage />} /></Routes>, { route })
  return { ...out, spy }
}
const bodyOf = (spy, suffix) => spy.mock.calls.filter(([u]) => String(u).endsWith(suffix)).map(([, init]) => JSON.parse(init.body))

describe('artifact store (§39.3)', () => {
  it('saves with If-Match, keeps edits made during a save, and recovers the draft on a conflict', async () => {
    const calls = []
    let behaviour = 'ok'
    const store = createArtifactStore({
      save: async (id, args) => {
        calls.push(args)
        if (behaviour === 'conflict') throw Object.assign(new Error('changed'), { status: 409, details: { version: 5, artifact: { data: { total: 7 } } } })
        if (behaviour === 'network') throw Object.assign(new Error('offline'), { code: 'NETWORK_ERROR', status: 0 })
        return { version: args.ifMatch + 1, data: { total: args.updates.total } }
      },
    })
    store.load([{ artifactId: 'A', type: 'X', title: 'A', data: { total: 1 }, version: 0 }])
    store.edit('A', { total: 2 })
    expect(store.getSnapshot().items[0].status).toBe('DIRTY')
    const saving = store.flush('A')
    store.edit('A', { total: 3 })
    await saving
    expect(calls[0].ifMatch).toBe(0)
    expect(store.getSnapshot().items[0].status).toBe('DIRTY')
    await store.flush('A')
    expect(calls[1].ifMatch).toBe(1)
    expect(store.getSnapshot().items[0].server.version).toBe(2)
    expect(store.getSnapshot().items[0].status).toBe('SAVED')

    behaviour = 'network'
    store.edit('A', { total: 4 })
    await store.flush('A')
    const idFirst = calls[2].clientEventId
    expect(store.getSnapshot().items[0].status).toBe('ERROR')
    await store.flush('A')
    expect(calls[3].clientEventId).toBe(idFirst, 'a retry of the same change reuses its event id')

    behaviour = 'conflict'
    await store.flush('A')
    const conflicted = store.getSnapshot().items[0]
    expect(conflicted.status).toBe('CONFLICT')
    expect(conflicted.local).toEqual({ total: 7 }, 'server wins on screen')
    expect(conflicted.recovered.pending).toEqual({ total: 4 }, 'the draft is kept')
    store.resolveConflict('A', 'REAPPLY')
    expect(store.getSnapshot().items[0].status).toBe('DIRTY')
    expect(store.getSnapshot().items[0].local).toEqual({ total: 4 })
    expect(store.getSnapshot().items[0].server.version).toBe(5)
    behaviour = 'ok'
    await store.flush('A')
    expect(calls.at(-1).ifMatch).toBe(5)
    expect(store.hasUnsaved()).toBe(false)
  })

  it('keeps the reasoning with the version: loaded on resume, recovered on a conflict, reset by "keep the saved version"', async () => {
    let conflict = false
    const sent = []
    const store = createArtifactStore({
      save: async (_id, args) => {
        sent.push(args)
        if (conflict) throw Object.assign(new Error('changed'), { status: 409, details: { version: 3, artifact: { data: { total: 1 }, notes: 'Saved elsewhere' } } })
        return { version: args.ifMatch + 1, data: { total: 1 }, notes: args.notes ?? 'unchanged' }
      },
    })
    store.load([{ artifactId: 'A', type: 'X', title: 'A', data: { total: 1 }, version: 2, notes: 'Reasoning from before the refresh' }])
    expect(store.getSnapshot().items[0].notes).toBe('Reasoning from before the refresh')
    store.edit('A', { total: 1 })
    await store.flush('A')
    expect(sent[0].notes).toBeUndefined()
    store.setNotes('A', 'New reasoning')
    await store.flush('A')
    expect(sent[1].notes).toBe('New reasoning')
    expect(store.getSnapshot().items[0].server.notes).toBe('New reasoning')

    conflict = true
    store.setNotes('A', 'Draft reasoning')
    await store.flush('A')
    const c = store.getSnapshot().items[0]
    expect(c.status).toBe('CONFLICT')
    expect(c.recovered.notes).toBe('Draft reasoning')
    expect(c.notes).toBe('Saved elsewhere')
    store.resolveConflict('A', 'KEEP_SERVER')
    const kept = store.getSnapshot().items[0]
    expect(kept.status).toBe('SAVED')
    expect(kept.notes).toBe('Saved elsewhere')
    expect(store.hasUnsaved()).toBe(false)

    // Edits made while the conflict is open join the recoverable draft.
    store.setNotes('A', 'Another draft')
    await store.flush('A')
    store.edit('A', { total: 9 })
    store.setNotes('A', 'Typed during the conflict')
    const open = store.getSnapshot().items[0]
    expect(open.status).toBe('CONFLICT')
    expect(open.recovered.pending).toEqual({ total: 9 })
    expect(open.recovered.notes).toBe('Typed during the conflict')
  })
})

describe('Assessment Workspace V3 player (§12)', () => {
  beforeEach(() => setWide(true))

  it('renders the server contract and appends only the turns the server returned', async () => {
    const { spy } = renderPlayer({
      '/api/v1/assessment-sessions/sess-v3-0001/messages': (u) => jsonResponse(201, { data: { messages: [{ speaker: 'Synthetic Colleague', role: 'Manager', content: 'Thanks. What next?' }], exchanges: 1, replayed: false } }),
      '/api/v1/assessment-sessions/sess-v3-0001': { data: contract() },
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Synthetic Scenario' })).toBeInTheDocument()
    expect(screen.getByText('Welcome to the synthetic scenario.')).toBeInTheDocument()
    expect(screen.getByText('Personal assessment')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Your answer'), 'My first answer')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText('Thanks. What next?')).toBeInTheDocument()
    const [body] = bodyOf(spy, '/messages')
    expect(body.text).toBe('My first answer')
    expect(body.clientEventId).toMatch(/^evt-/)
    expect(screen.getByLabelText('Your answer')).toHaveValue('')
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Your answer')))
    expect(screen.getByRole('timer')).toHaveTextContent(/Time remaining: \d+:\d{2} left/)
  })

  it('a failed send keeps the answer, invents nothing, and retries with the same event id', async () => {
    let fail = true
    const { spy } = renderPlayer({
      '/api/v1/assessment-sessions/sess-v3-0001/messages': () => (fail
        ? jsonResponse(503, { error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Your answer was not sent.', requestId: 'r' } })
        : jsonResponse(201, { data: { messages: [{ speaker: 'Synthetic Colleague', role: 'Manager', content: 'Got it.' }], exchanges: 1, replayed: false } })),
      '/api/v1/assessment-sessions/sess-v3-0001': { data: contract() },
    })
    await userEvent.type(await screen.findByLabelText('Your answer'), 'Keep this answer')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText(/Not sent\./, {}, { timeout: 4000 })).toBeInTheDocument()
    const feed = screen.getByTestId('conversation')
    expect(within(feed).getByText('Keep this answer')).toBeInTheDocument()
    expect(feed.querySelectorAll('[data-role="participant"]')).toHaveLength(1)
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Got it.')).toBeInTheDocument()
    const ids = bodyOf(spy, '/messages').map((b) => b.clientEventId)
    expect(new Set(ids).size).toBe(1)
  })

  it('a dropped connection shows the reconnect banner, then resends the same answer by itself', async () => {
    let down = true
    let sent = false
    const { spy } = renderPlayer({
      '/api/v1/assessment-sessions/sess-v3-0001/messages': () => {
        sent = true
        if (down) throw new TypeError('Failed to fetch')
        return jsonResponse(201, { data: { messages: [{ speaker: 'Synthetic Colleague', role: 'Manager', content: 'Back online reply.' }], exchanges: 1, replayed: false } })
      },
      '/api/v1/assessment-sessions/sess-v3-0001': () => {
        if (down && sent) throw new TypeError('Failed to fetch')
        return jsonResponse(200, { data: contract() })
      },
    })
    await userEvent.type(await screen.findByLabelText('Your answer'), 'Answer while offline')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByTestId('reconnect-banner', {}, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.getByTestId('conversation').querySelectorAll('[data-role="participant"]')).toHaveLength(1)
    down = false
    expect(await screen.findByText('Back online reply.', {}, { timeout: 8000 })).toBeInTheDocument()
    expect(screen.queryByTestId('reconnect-banner')).not.toBeInTheDocument()
    const ids = bodyOf(spy, '/messages').map((b) => b.clientEventId)
    expect(ids.length).toBeGreaterThanOrEqual(2)
    expect(new Set(ids).size).toBe(1)
  }, 15000)

  it('an answer the server refuses (not retryable) goes back into the box to edit — never a dead end', async () => {
    renderPlayer({
      '/api/v1/assessment-sessions/sess-v3-0001/messages': () => jsonResponse(422, { error: { code: 'VALIDATION_FAILED', message: 'x', requestId: 'r' } }),
      '/api/v1/assessment-sessions/sess-v3-0001': { data: contract() },
    })
    await userEvent.type(await screen.findByLabelText('Your answer'), 'Refused answer')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText(/Edit your answer and send it again/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Edit answer' }))
    expect(screen.getByLabelText('Your answer')).toHaveValue('Refused answer')
    expect(screen.getByLabelText('Your answer')).not.toHaveAttribute('readonly')
  })

  it('finishing early is explicit and sends early:true', async () => {
    const { spy } = renderPlayer({
      '/api/v1/assessment-sessions/sess-v3-0001/finish': () => jsonResponse(200, { data: { state: 'COMPLETE' } }),
      '/api/v1/assessment-sessions/sess-v3-0001': { data: contract({ progress: { exchanges: 1, requiredExchanges: 3 } }) },
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Finish assessment' }))
    const dialog = await screen.findByRole('dialog', { name: 'Finish before the end?' })
    expect(within(dialog).getByText(/You have answered 1 of the 3 parts/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Finish anyway' }))
    await waitFor(() => expect(bodyOf(spy, '/finish')).toEqual([{ early: true }]))
  })

  it('a completed session shows the report link, not the composer', async () => {
    renderPlayer({ '/api/v1/assessment-sessions/sess-v3-0001': { data: contract({ status: 'COMPLETED', reportPath: '/score?session=sess-v3-0001' }) } })
    expect(await screen.findByText('Assessment complete')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open your report' })).toHaveAttribute('href', '/score?session=sess-v3-0001')
    expect(screen.queryByLabelText('Your answer')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Briefing' }), 'no briefing toggle without a briefing panel').not.toBeInTheDocument()
    expect(screen.queryByText('All work saved')).not.toBeInTheDocument()
  })

  it('an unknown session is not available; an unknown scenario is never substituted', async () => {
    const a = renderPlayer({ '/api/v1/assessment-sessions/sess-v3-0001': () => jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'Not found', requestId: 'r' } }) })
    expect(await screen.findByText('This assessment is not available')).toBeInTheDocument()
    a.unmount()
    renderPlayer({ '/api/v1/assessment-sessions/sess-v3-0001': () => jsonResponse(422, { error: { code: 'SCENARIO_NOT_FOUND', message: 'x', requestId: 'r' } }) })
    expect(await screen.findByText(/Nothing has been substituted/)).toBeInTheDocument()
  })

  it('work materials autosave through the versioned endpoint', async () => {
    const { spy } = renderPlayer({
      '/api/v1/assessment-sessions/sess-v3-0001/artifacts/SYN-ART': () => jsonResponse(200, { data: { artifactId: 'SYN-ART', version: 1, data: { totalBudget: 100, allocations: { alphaSpend: 40, betaSpend: 30 } }, replayed: false } }),
      '/api/v1/assessment-sessions/sess-v3-0001': { data: contract({ artifacts: [budgetArtifact], device: { requiresLargeScreen: true, allowSmallScreen: true } }) },
    })
    await userEvent.type(await screen.findByLabelText('Your reasoning'), 'Synthetic reasoning')
    await userEvent.click(screen.getByRole('button', { name: 'Save plan' }))
    await waitFor(() => expect(spy.mock.calls.some(([u, init]) => String(u).endsWith('/artifacts/SYN-ART') && init.method === 'PATCH' && init.headers['If-Match'] === '0')).toBe(true))
    expect(await screen.findByText('All work saved')).toBeInTheDocument()
  })

  it('small screens: a notice for work-heavy assessments, then Conversation / Workspace tabs', async () => {
    setWide(false)
    renderPlayer({ '/api/v1/assessment-sessions/sess-v3-0001': { data: contract({ artifacts: [budgetArtifact], device: { requiresLargeScreen: true, allowSmallScreen: true } }) } })
    expect(await screen.findByText('This assessment works best on a larger screen')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Continue on this device' }))
    expect(screen.getByRole('radio', { name: 'Conversation' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: 'Workspace' }))
    expect(await screen.findByLabelText('Your reasoning')).toBeInTheDocument()
  })
})

describe('consent and work-material content', () => {
  it('V3 consent wording and scopes are identical to the legacy briefing', () => {
    const legacy = readFileSync(resolve(process.cwd(), 'src/pages/Briefing.jsx'), 'utf-8')
    for (const item of ASSESSMENT_CONSENT_ITEMS) {
      const label = item.label.replace('\u2019', '\\u2019')
      expect(legacy.includes(`scope: '${item.scope}'`)).toBe(true)
      expect(legacy.includes(label) || legacy.includes(item.label)).toBe(true)
    }
    const legacyScopes = [...legacy.matchAll(/\{ scope: '([a-z_]+)'/g)].map((m) => m[1])
    expect(ASSESSMENT_CONSENT_ITEMS.map((i) => i.scope)).toEqual(legacyScopes)
    expect(typeof CONSENT_VERSION).toBe('string')
  })

  it('work materials label themselves from the data (no scenario vocabulary)', () => {
    expect(humanizeKey('blendedCac')).toBe('Blended CAC')
    expect(humanizeKey('searchSpend')).toBe('Search spend')
    expect(humanizeKey('ctr')).toBe('CTR')
    rtlRender(<AnalyticsDashboard title="Synthetic table" data={{ totalWidgets: 12, channels: [{ name: 'Row A', units: 3, rate: 1.5 }] }} />)
    expect(screen.getByText('Total widgets')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Units' })).toBeInTheDocument()
    const src = ['AnalyticsDashboard.jsx', 'BudgetModeler.jsx', 'CustomerTicketLog.jsx', 'ArtifactRenderer.jsx']
      .map((f) => readFileSync(resolve(process.cwd(), 'src/components/artifacts', f), 'utf-8')).join('\n')
    expect(src).not.toMatch(/Lumina|Meta ads|ROAS|CAC|Blended|TikTok|metaSpend|retentionSpend/)
  })
})
