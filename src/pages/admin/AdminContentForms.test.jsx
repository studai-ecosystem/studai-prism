// P4.8 — Forms tab of /admin/content: versions list, coverage matrix, diff,
// synthetic preview output, attachments/comments/decisions panels, and
// transition buttons that stay disabled without permission or a satisfied
// pilot gate. Fixture data lives only here; the API is mocked at adminFetch.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const perms = new Set(['content:read', 'content:write', 'content:publish'])
vi.mock('../../lib/adminApi.js', () => ({
  adminFetch: vi.fn(),
  adminHasPermission: (k) => perms.has(k),
}))
const { adminFetch } = await import('../../lib/adminApi.js')
const { default: FormsTab } = await import('./AdminContentForms.jsx')

const FORM = { formId: 'draft-core-teamready-a:0.1.0-draft', contentId: 'draft-core-teamready-a', version: '0.1.0-draft', title: 'Get the team ready', kind: 'UNIVERSAL_FORM', state: 'REVIEW', stages: 6, opportunities: 16 }
const VERSION = {
  ...FORM, approvalHistory: [{ state: 'DRAFT', at: null, by: null, reason: 'Initial original draft; not self-approved.' }, { state: 'REVIEW', at: '2026-10-03T00:00:00.000Z', by: 'adm-1', reason: 'Internal read-through complete.' }],
  package: { behaviours: [{ id: 'STATE_MAIN_POINT' }, { id: 'REPAIR_MISTAKE' }] },
  attachments: [{ id: 'att-1', kind: 'COUNTEREXAMPLE', behaviourId: 'STATE_MAIN_POINT', text: 'Synthetic counterexample text.', createdBy: 'adm-1', createdAt: '2026-10-03T00:00:00.000Z' }],
  comments: [],
  decisions: [{ id: 'dec-1', reviewerRole: 'CONTENT', reviewerId: 'adm-1', decision: 'APPROVE', reason: 'Reads plainly; no format bias.', createdAt: '2026-10-03T00:00:00.000Z' }],
  pilotGate: { ok: false, contentApprovals: 1, measurementApprovals: 0, missing: ['MEASUREMENT_APPROVAL'] },
}
const COVERAGE = {
  note: 'Authoring coverage floor only; not the governed evidence sufficiency floor.',
  families: [
    { capabilityId: 'CAP-L1-REASONING', requiredOpportunities: 3, optionalOpportunities: 0, distinctGroups: 3, requiredGroups: 3, meetsAuthoringFloor: true, opportunities: [{ id: 'OPP-R-1', required: true }] },
    { capabilityId: 'CAP-L1-EXECUTION', requiredOpportunities: 2, optionalOpportunities: 1, distinctGroups: 3, requiredGroups: 2, meetsAuthoringFloor: true, opportunities: [{ id: 'OPP-E-1', required: true }, { id: 'OPP-E-2', required: false }] },
  ],
  untargetedBehaviours: [],
}
const PREVIEW = {
  is_synthetic: true, requiredPlanned: 11, requiredAnswered: 11, stop: { reason: 'COVERAGE_COMPLETE' }, reviewRequired: [],
  stages: [{ id: 'UNDERSTAND', label: 'Understand', stimuli: [{ opportunityId: 'OPP-R-1', speaker: 'Priya', aiGenerated: false, worldChangeId: null, renderHash: 'abcdef1234567890', content: 'Here is where we are: 24 participants are expected.' }] },
    { id: 'CHECK_RECOMMENDATION', label: 'Check a recommendation', stimuli: [{ opportunityId: 'OPP-AI', speaker: 'Planning assistant', aiGenerated: true, worldChangeId: null, renderHash: '0123456789abcdef', content: 'AI-generated recommendation (not checked by a person): book for 40.' }] }],
  coverage: { 'CAP-L1-REASONING': { answeredGroups: 3, floor: 2, meetsAuthoringFloor: true } },
}
const DIFF = {
  title: null, facts: { added: [], removed: [], changed: [{ id: 'F-PARTICIPANTS', fields: ['text'] }] }, stages: { added: [], removed: [], changed: [] }, worldChanges: { added: [], removed: [], changed: [] },
  opportunities: { added: ['OPP-NEW'], removed: [], changed: [] }, behaviours: { added: [], removed: [], changed: [] }, anchors: { added: [], removed: [], changed: [] }, board: { changed: false }, director: { changed: false },
}

function route(path, opts) {
  if (path === '/api/admin/content/forms') return { forms: [FORM] }
  if (path.endsWith('/versions')) return { versions: [{ version: '0.1.0-draft', state: 'REVIEW' }, { version: '0.2.0-draft', state: 'DRAFT' }] }
  if (path.includes('/versions/0.1.0-draft')) return VERSION
  if (path.includes('/coverage')) return COVERAGE
  if (path.endsWith('/preview')) return PREVIEW
  if (path.includes('/diff')) return DIFF
  if (opts?.method === 'POST') return { ok: true }
  throw new Error(`unexpected ${path}`)
}

describe('AdminContent Forms tab', () => {
  beforeEach(() => { adminFetch.mockReset(); adminFetch.mockImplementation(async (path, opts) => route(path, opts)) })

  it('lists forms, opens a version, shows the coverage matrix and the pilot gate; the pilot button is disabled until the gate is satisfied', async () => {
    render(<FormsTab />)
    const row = await screen.findByText('Get the team ready')
    fireEvent.click(row)
    const detail = await screen.findByTestId('form-detail')
    expect(await within(detail).findByTestId('pilot-gate')).toHaveTextContent('1 content approval(s), 0 measurement approval(s) · missing: measurement approval')
    const pilot = within(detail).getByTestId('transition-APPROVED_FOR_PILOT')
    expect(pilot).toBeDisabled()
    expect(pilot).toHaveAttribute('title', expect.stringContaining('content reviewer and a measurement reviewer'))
    expect(within(detail).getByTestId('transition-DRAFT')).toBeEnabled()
    expect(within(detail).getByTestId('transition-APPROVED_FOR_INTENDED_USE')).toBeDisabled()
    const coverage = await screen.findByTestId('coverage-panel')
    expect(within(coverage).getByRole('table', { name: 'Opportunity coverage by capability family' })).toBeInTheDocument()
    expect(within(coverage).getByText('reasoning')).toBeInTheDocument()
    expect(within(coverage).getAllByText('met')).toHaveLength(2)
    expect(within(coverage).getByText(/OPP-E-2 \(optional\)/)).toBeInTheDocument()
    // No score-like numbers anywhere in the tab.
    expect(detail.textContent).not.toMatch(/%|score/i)
  })

  it('runs the synthetic preview and shows stimulus per stage with the AI-generated marker', async () => {
    render(<FormsTab />)
    fireEvent.click(await screen.findByText('Get the team ready'))
    await screen.findByTestId('form-detail')
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Run synthetic preview' }))
    const panel = await screen.findByTestId('preview-panel')
    await waitFor(() => expect(within(panel).getByText(/synthetic · required 11\/11/)).toBeInTheDocument())
    expect(within(panel).getByText(/OPP-AI · Planning assistant · AI-generated/)).toBeInTheDocument()
    expect(within(panel).getByText(/book for 40/)).toBeInTheDocument()
    expect(adminFetch).toHaveBeenCalledWith(expect.stringMatching(/\/preview$/), expect.objectContaining({ method: 'POST', body: expect.objectContaining({ version: '0.1.0-draft' }) }))
  })

  it('compares two versions and lists structured changes', async () => {
    render(<FormsTab />)
    fireEvent.click(await screen.findByText('Get the team ready'))
    await screen.findByTestId('form-detail')
    fireEvent.click(screen.getByRole('button', { name: 'Diff' }))
    const panel = await screen.findByTestId('diff-panel')
    fireEvent.change(within(panel).getByLabelText('To'), { target: { value: '0.2.0-draft' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Compare' }))
    await waitFor(() => expect(within(panel).getByText('~ F-PARTICIPANTS: text')).toBeInTheDocument())
    expect(within(panel).getByText('+ OPP-NEW')).toBeInTheDocument()
    expect(adminFetch).toHaveBeenCalledWith(expect.stringContaining('/diff?from=0.1.0-draft&to=0.2.0-draft'))
  })

  it('attachments, comments and decisions panels post to the review routes', async () => {
    render(<FormsTab />)
    fireEvent.click(await screen.findByText('Get the team ready'))
    await screen.findByTestId('form-detail')
    fireEvent.click(screen.getByRole('button', { name: 'Attachments' }))
    const att = await screen.findByTestId('attachments-panel')
    expect(within(att).getByText('Synthetic counterexample text.')).toBeInTheDocument()
    fireEvent.change(within(att).getByLabelText('Behaviour'), { target: { value: 'REPAIR_MISTAKE' } })
    fireEvent.change(within(att).getByLabelText('Text'), { target: { value: 'A synthetic exemplar of a repaired mistake.' } })
    fireEvent.click(within(att).getByRole('button', { name: 'Attach' }))
    await waitFor(() => expect(adminFetch).toHaveBeenCalledWith(expect.stringMatching(/\/attachments$/), expect.objectContaining({ method: 'POST', body: { version: '0.1.0-draft', kind: 'EXEMPLAR', behaviourId: 'REPAIR_MISTAKE', text: 'A synthetic exemplar of a repaired mistake.' } })))
    fireEvent.click(screen.getByRole('button', { name: 'Decisions' }))
    const dec = await screen.findByTestId('decisions-panel')
    expect(within(dec).getByText('Reads plainly; no format bias.')).toBeInTheDocument()
    expect(within(dec).getByLabelText('Reviewer role')).toHaveValue('CONTENT')
    expect(within(within(dec).getByLabelText('Reviewer role')).queryByRole('option', { name: 'measurement' })).toBeNull()
    fireEvent.change(within(dec).getByLabelText('Decision'), { target: { value: 'REQUEST_CHANGES' } })
    fireEvent.change(within(dec).getByLabelText('Reason'), { target: { value: 'Stage 3 wording needs a plainer sentence.' } })
    fireEvent.click(within(dec).getByRole('button', { name: 'Record decision' }))
    await waitFor(() => expect(adminFetch).toHaveBeenCalledWith(expect.stringMatching(/\/review-decisions$/), expect.objectContaining({ method: 'POST', body: { version: '0.1.0-draft', reviewerRole: 'CONTENT', decision: 'REQUEST_CHANGES', reason: 'Stage 3 wording needs a plainer sentence.' } })))
  })
})
