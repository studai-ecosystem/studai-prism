// P3.5-P3.9 acceptance (Layer A, deterministic fixtures): jump-to-latest,
// plan-board parity with keyboard-labelled fields and Provided/Your edit
// attribution, conflict keeps the learner's draft beside the latest server
// state, required-material recovery (T11), Briefing during ACTIVE, policy-
// aware time warnings, the post-cutoff unsent draft, intro without scenario
// data, and no coaching/hint text anywhere in the formal V3 player.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { act, fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { renderApp, mockFetch, meBody, signIn, jsonResponse } from '../../test/utils.jsx'
import AssessmentPlayerPage from './pages/AssessmentPlayerPage.jsx'
import { ConversationPane } from './components/ConversationPane.jsx'
import { ArtifactPane } from './components/ArtifactPane.jsx'
import { createArtifactStore } from './state/artifactStore.js'
import { warningsForPolicy } from './hooks/useAssessmentClock.js'
import PlanBoard from '../../components/artifacts/PlanBoard.jsx'

const SCHEMA = { fields: ['task', 'owner', 'due', 'dependency', 'status', 'rationale'], editable: ['owner', 'due', 'dependency', 'status', 'rationale'], owners: ['You', 'Priya', 'Sam', 'Unassigned'], statuses: ['PLANNED', 'IN_PROGRESS', 'BLOCKED', 'DONE'] }
const ROWS = [
  { rowId: 'R1', task: 'Synthetic setup task', owner: 'Sam', due: 'Day 1 morning', dependency: null, status: 'PLANNED', rationale: null, actorKind: 'TEMPLATE' },
  { rowId: 'R2', task: 'Synthetic materials task', owner: null, due: null, dependency: null, status: 'PLANNED', rationale: null, actorKind: 'TEMPLATE' },
]
const board = (data = { rows: ROWS }) => ({ artifactId: 'SYN-BOARD', type: 'PLAN_BOARD', title: 'Synthetic board', data, version: 0, notes: '', schema: SCHEMA })

function contract(overrides = {}) {
  return {
    sessionId: 'sess-p3-0001', status: 'IN_PROGRESS', scope: 'PERSONAL', sponsorName: null,
    assessment: { definitionId: 'draft-core-teamready-a', title: 'Synthetic assessment' },
    scenario: { title: 'Synthetic Scenario', context: 'Synthetic context.', yourRole: 'Coordinator', participants: [{ name: 'Synthetic Colleague', role: 'Peer' }] },
    jobFamilyId: null, capabilities: [], artifacts: [],
    messages: [{ speaker: 'Synthetic Colleague', role: 'Peer', content: 'Synthetic opening.', isUser: false }],
    progress: { exchanges: 0, requiredExchanges: 3 }, integrityPolicy: 'STANDARD',
    device: { requiresLargeScreen: false, allowSmallScreen: true },
    timing: { serverTime: '2026-10-01T10:00:00.000Z', startedAt: '2026-10-01T09:59:00.000Z', deadlineAt: '2026-10-01T10:24:00.000Z', remainingMs: 24 * 60000, begun: true, policyVersion: 'draft-universal-25.v0-proposed', policyDurationMs: 25 * 60000 },
    reportPath: null,
    ...overrides,
  }
}
const setWide = (wide) => { window.matchMedia = (q) => ({ matches: wide, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }) }
const original = window.matchMedia
afterEach(() => { window.matchMedia = original; vi.restoreAllMocks() })

function renderPlayer(routes) {
  setWide(true)
  signIn()
  const spy = mockFetch({ ...routes, '/api/v1/me': meBody({ flags: { PRISM_APP_SHELL_V3: true, PRISM_ASSESSMENT_WORKSPACE_V3: true } }) })
  const out = renderApp(<Routes><Route path="/app/assessment/:sessionId" element={<AssessmentPlayerPage />} /></Routes>, { route: '/app/assessment/sess-p3-0001' })
  return { ...out, spy }
}
const sessionGets = (spy) => spy.mock.calls.filter(([u, init]) => String(u).endsWith('/assessment-sessions/sess-p3-0001') && (!init || !init.method || init.method === 'GET')).length

describe('P3.6 conversation follows only when near the latest message', () => {
  const geometry = (el, { scrollHeight = 2000, clientHeight = 400 } = {}) => {
    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => scrollHeight })
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => clientHeight })
  }
  const base = [{ speaker: 'A', role: null, content: 'One', isUser: false }]

  it('rereading + a new reply shows a keyboard-reachable "jump to latest"; it never moves the reader', async () => {
    const { rerender } = rtlRender(<ConversationPane messages={base} pending={null} />)
    const log = screen.getByRole('log', { name: 'Assessment conversation' })
    geometry(log)
    log.scrollTop = 100
    fireEvent.scroll(log)
    rerender(<ConversationPane messages={[...base, { speaker: 'A', role: null, content: 'Two', isUser: false }]} pending={null} />)
    expect(log.scrollTop).toBe(100)
    const jump = await screen.findByRole('button', { name: /New reply.+jump to latest/ })
    expect(jump.closest('[aria-live="polite"]')).not.toBeNull()
    jump.focus()
    await userEvent.keyboard('{Enter}')
    expect(log.scrollTop).toBe(2000)
    expect(screen.queryByRole('button', { name: /jump to latest/ })).not.toBeInTheDocument()
  })

  it('near the bottom, a new reply auto-follows; the learner\'s own turn always returns to the latest', () => {
    const { rerender } = rtlRender(<ConversationPane messages={base} pending={null} />)
    const log = screen.getByRole('log', { name: 'Assessment conversation' })
    geometry(log)
    log.scrollTop = 1550
    fireEvent.scroll(log)
    rerender(<ConversationPane messages={[...base, { speaker: 'A', role: null, content: 'Two', isUser: false }]} pending={null} />)
    expect(log.scrollTop).toBe(2000)
    log.scrollTop = 0
    fireEvent.scroll(log)
    rerender(<ConversationPane messages={[...base, { speaker: 'A', role: null, content: 'Two', isUser: false }, { speaker: 'You', role: null, content: 'Mine', isUser: true }]} pending={null} />)
    expect(log.scrollTop).toBe(2000)
    expect(screen.queryByRole('button', { name: /jump to latest/ })).not.toBeInTheDocument()
  })
})

describe('P3.6 plan board parity', () => {
  it('every editable field is a labelled control; template values are "Provided", learner changes are "Your edit"', async () => {
    const onChange = vi.fn()
    const data = { rows: ROWS, 'R2.owner': 'Priya' }
    rtlRender(<PlanBoard artifactId="SYN-BOARD" title="Synthetic board" data={data} schema={SCHEMA} controller={{ autosave: true, saveState: 'SAVED', onChange }} />)
    for (const label of ['Owner', 'Due', 'Status', 'Depends on', 'Why']) {
      expect(screen.getByLabelText(`${label} for Synthetic materials task`, { exact: false })).toBeInTheDocument()
    }
    const r1 = document.querySelector('[data-row="R1"]')
    const r2 = document.querySelector('[data-row="R2"]')
    expect(r1.querySelector('[data-field="owner"]')).toHaveAttribute('data-origin', 'PROVIDED')
    expect(within(r1.querySelector('[data-field="owner"]')).getByText('Provided')).toBeInTheDocument()
    expect(r2.querySelector('[data-field="owner"]')).toHaveAttribute('data-origin', 'LEARNER')
    expect(within(r2.querySelector('[data-field="owner"]')).getByText('Your edit')).toBeInTheDocument()
    expect(r2.querySelector('[data-field="due"]')).toHaveAttribute('data-origin', 'EMPTY')
    const owner = screen.getByLabelText('Owner for Synthetic setup task', { exact: false })
    expect(within(owner).getAllByRole('option').map((o) => o.textContent)).toEqual(['Not set', 'You', 'Priya', 'Sam', 'Unassigned'])
    await userEvent.selectOptions(owner, 'You')
    expect(onChange).toHaveBeenLastCalledWith({ 'R1.owner': 'You' })
    const dep = screen.getByLabelText('Depends on for Synthetic materials task', { exact: false })
    expect(within(dep).getAllByRole('option').map((o) => o.textContent)).toEqual(['None', 'Synthetic setup task'])
    await userEvent.selectOptions(dep, 'R1')
    expect(onChange).toHaveBeenLastCalledWith({ 'R2.dependency': 'R1' })
    await userEvent.type(screen.getByLabelText('Due for Synthetic materials task', { exact: false }), 'D')
    expect(onChange).toHaveBeenLastCalledWith({ 'R2.due': 'D' })
    expect(screen.getByTestId('board-save-state')).toHaveTextContent('All changes saved')
  })

  it('a version conflict keeps the learner\'s board draft and shows the latest server state', async () => {
    const store = createArtifactStore({
      save: async () => { throw Object.assign(new Error('changed'), { status: 409, details: { version: 4, artifact: { data: { rows: ROWS, 'R2.owner': 'Sam' } } } }) },
    })
    store.load([board()])
    store.edit('SYN-BOARD', { 'R2.owner': 'Priya' })
    expect(await store.flush('SYN-BOARD')).toBe('CONFLICT')
    const item = store.getSnapshot().items[0]
    expect(item.local['R2.owner']).toBe('Sam')
    expect(item.recovered.pending).toEqual({ 'R2.owner': 'Priya' })
    expect(item.schema).toEqual(SCHEMA)
    rtlRender(<ArtifactPane items={store.getSnapshot().items} activeId={null} onSelect={() => {}} store={store} />)
    expect(screen.getByRole('alert')).toHaveTextContent('This work material changed elsewhere')
    expect(screen.getByTestId('recovered-draft')).toHaveTextContent('Priya')
    expect(screen.getByLabelText('Owner for Synthetic materials task', { exact: false })).toHaveValue('Sam')
    store.resolveConflict('SYN-BOARD', 'REAPPLY')
    expect(store.getSnapshot().items[0].local['R2.owner']).toBe('Priya')
    expect(store.getSnapshot().items[0].server.version).toBe(4)
  })
})

describe('P3.5/T11 required work material', () => {
  it('an artifact entry without data is a recovery state with retry, not a conversation-only layout', async () => {
    let data = null
    const { spy } = renderPlayer({ '/api/v1/assessment-sessions/sess-p3-0001': () => jsonResponse(200, { data: contract({ artifacts: [board(data)] }) }) })
    const alert = (await screen.findByTestId('material-recovery')).closest('[role="alert"]')
    expect(alert).toHaveTextContent('Synthetic board did not load')
    expect(within(alert).getByTestId('material-recovery')).toHaveTextContent('needs this work material')
    expect(document.querySelector('[data-layout="split"]')).toBeInTheDocument()
    expect(document.querySelector('[data-layout="conversation"]')).not.toBeInTheDocument()
    const before = sessionGets(spy)
    data = { rows: ROWS }
    await userEvent.click(within(alert).getByRole('button', { name: 'Load work material again' }))
    await waitFor(() => expect(sessionGets(spy)).toBeGreaterThan(before))
    expect(await screen.findByLabelText('Owner for Synthetic setup task', { exact: false })).toBeInTheDocument()
    expect(screen.queryByTestId('material-recovery')).not.toBeInTheDocument()
  })

  it('an unsupported material type is named and routed to support, never silently dropped', async () => {
    renderPlayer({ '/api/v1/assessment-sessions/sess-p3-0001': { data: contract({ artifacts: [{ ...board(), type: 'SYN_UNKNOWN_TOOL' }] }) } })
    const alert = (await screen.findByTestId('material-recovery')).closest('[role="alert"]')
    expect(alert).toHaveTextContent('cannot be shown on this version')
    expect(within(alert).getByRole('link', { name: 'Contact support' })).toHaveAttribute('href', '/contact')
  })

  it('a form with no work material keeps one centred conversation', async () => {
    renderPlayer({ '/api/v1/assessment-sessions/sess-p3-0001': { data: contract() } })
    await screen.findByLabelText('Your answer')
    expect(document.querySelector('[data-layout="conversation"]')).toBeInTheDocument()
    expect(screen.queryByTestId('material-recovery')).not.toBeInTheDocument()
  })
})

describe('P3.7 Briefing during ACTIVE and intro without scenario data', () => {
  it('reopened Briefing says the clock keeps running and Escape/Close return focus to the toggle', async () => {
    renderPlayer({ '/api/v1/assessment-sessions/sess-p3-0001': { data: contract() } })
    const toggle = await screen.findByRole('button', { name: 'Briefing' })
    await userEvent.click(toggle)
    const briefing = screen.getByRole('region', { name: 'Briefing' })
    expect(within(briefing).getByTestId('briefing-clock-note')).toHaveTextContent('The clock keeps running')
    expect(within(briefing).getByText('Synthetic context.')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toBeInTheDocument()
    await waitFor(() => expect(briefing).toHaveFocus())
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('region', { name: 'Briefing' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Briefing' })).toHaveFocus())
    await userEvent.click(screen.getByRole('button', { name: 'Briefing' }))
    await userEvent.click(screen.getByRole('button', { name: 'Close briefing' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Briefing' })).toHaveFocus())
  })

  it('missing situation and role: Begin is disabled and the facts can be reloaded; nothing is timed', async () => {
    const pre = contract({
      status: 'ALLOCATED',
      scenario: { title: 'Synthetic Scenario', context: null, yourRole: null, participants: [] },
      timing: { serverTime: '2026-10-01T10:00:00.000Z', startedAt: null, deadlineAt: null, graceDeadlineAt: null, remainingMs: null, begun: false, policyVersion: 'draft-universal-25.v0-proposed', policyDurationMs: 25 * 60000 },
    })
    const { spy } = renderPlayer({ '/api/v1/assessment-sessions/sess-p3-0001': { data: pre } })
    const dialog = await screen.findByRole('dialog', { name: 'Synthetic Scenario' })
    expect(within(dialog).getByRole('button', { name: 'Begin timed assessment' })).toBeDisabled()
    expect(within(dialog).getByText('Scenario details are unavailable')).toBeInTheDocument()
    const before = sessionGets(spy)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Load the situation again' }))
    await waitFor(() => expect(sessionGets(spy)).toBeGreaterThan(before))
    expect(spy.mock.calls.some(([u]) => String(u).endsWith('/begin'))).toBe(false)
  })
})

describe('P3.8 time warnings and the post-cutoff draft', () => {
  it('milestones apply only when the policy is longer than them', () => {
    expect(warningsForPolicy(25 * 60000).map((w) => w.ms / 60000)).toEqual([10, 5, 1])
    expect(warningsForPolicy(8 * 60000).map((w) => w.ms / 60000)).toEqual([5, 1])
    expect(warningsForPolicy(60000).map((w) => w.ms / 60000)).toEqual([])
    expect(warningsForPolicy(null).map((w) => w.ms / 60000)).toEqual([10, 5, 1])
  })

  it('a short policy never announces "10 minutes left"; a milestone is announced once, politely', async () => {
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    renderPlayer({ '/api/v1/assessment-sessions/sess-p3-0001': { data: contract({ timing: { ...contract().timing, deadlineAt: '2026-10-01T10:06:00.000Z', remainingMs: 6 * 60000, policyDurationMs: 8 * 60000 } }) } })
    await screen.findByLabelText('Your answer')
    const status = document.querySelector('p.sr-only[role="status"]')
    expect(status).toHaveTextContent('')
    now = 61000
    await act(async () => { await new Promise((r) => setTimeout(r, 1100)) })
    await waitFor(() => expect(status).toHaveTextContent('Less than 5 minutes left.'))
    expect(document.body.textContent).not.toMatch(/Less than 10 minutes/)
  })

  it('after the cutoff the unsent draft stays visible, read-only, marked not submitted and never sent', async () => {
    sessionStorage.setItem('prism.draft.sess-p3-0001', 'Synthetic late draft')
    const { spy } = renderPlayer({ '/api/v1/assessment-sessions/sess-p3-0001': { data: contract({ timing: { ...contract().timing, deadlineAt: '2026-10-01T10:00:00.000Z', remainingMs: 0 } }) } })
    const answer = await screen.findByLabelText('Your answer')
    expect(answer).toBeDisabled()
    expect(answer).toHaveValue('Synthetic late draft')
    expect(screen.getByTestId('draft-not-submitted')).toHaveTextContent('This draft was not submitted')
    expect(answer).toHaveAttribute('aria-describedby', 'answer-locked-note')
    expect(spy.mock.calls.some(([u]) => String(u).endsWith('/messages'))).toBe(false)
  })
})

describe('P3.9 formal V3 player has no coaching, hints or speech auto-send', () => {
  it('player sources contain no hint/coach/rubric wording and no auto-send timer', () => {
    const dir = resolve(process.cwd(), 'src/features/assessments')
    const files = [
      ...readdirSync(join(dir, 'components')).map((f) => join(dir, 'components', f)),
      join(dir, 'pages', 'AssessmentPlayerPage.jsx'),
      join(dir, 'hooks', 'useAssessmentClock.js'),
      resolve(process.cwd(), 'src/components/artifacts/PlanBoard.jsx'),
      resolve(process.cwd(), 'src/lib/copy/player.js'),
    ].filter((f) => /\.(jsx?|js)$/.test(f) && !/\.test\./.test(f))
    const src = files.map((f) => readFileSync(f, 'utf-8')).join('\n')
    // Strip comments: the rules may be described there, never shown.
    const visible = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    expect(visible).not.toMatch(/\bhints?\b|\bcoach(ing)?\b|\btip:|\bsuggested answer\b|\bmodel answer\b|\brubric\b|\bscoring target\b/i)
    expect(visible).not.toMatch(/SpeechRecognition|webkitSpeechRecognition|autoSend|AUTO_SEND/)
  })
})
