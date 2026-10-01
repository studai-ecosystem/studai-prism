// Phase F: the evidence component system. Every conclusion is shown with what
// it rests on, practice is never confused with formal evidence, and absent
// data is stated rather than filled in.
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { EvidenceCard } from './EvidenceCard.jsx'
import { EvidenceCoverage } from './EvidenceCoverage.jsx'
import { EvidenceTimeline } from './EvidenceTimeline.jsx'
import { EvidenceDetailDrawer } from './EvidenceDetailDrawer.jsx'
import { EvidenceQuote } from './EvidenceQuote.jsx'

const item = (over = {}) => ({
  id: 'e1', kind: 'FORMAL', claim: 'c', claimStatus: 'PROVISIONAL',
  capability: { id: 'CAP-A', name: 'Synthetic Reasoning' }, assessmentTitle: 'Synthetic Scenario',
  candidateAction: { quote: 'check which customers raised the issue', turn: 2, artifactId: null },
  observedBehavior: 'Checked the source of the complaints.', rubricAnchor: { criteria: 'Identifies the problem source.' },
  evidenceStatus: 'PROVISIONAL', provenance: { source: 'CONVERSATION', turn: 2, reviewedBy: 'AI' },
  ...over,
})
const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('EvidenceCard', () => {
  it('connects action, behaviour, capability and described behaviour, and cites its source', () => {
    wrap(<EvidenceCard item={item()} />)
    const steps = within(screen.getByRole('article')).getAllByRole('listitem').map((li) => li.textContent)
    expect(steps[0]).toMatch(/What you did.*check which customers raised the issue/)
    expect(steps[1]).toMatch(/Observed behaviour.*Checked the source/)
    expect(steps[2]).toMatch(/Capability.*Synthetic Reasoning/)
    expect(steps[3]).toMatch(/Described behaviour at this level.*Identifies the problem source/)
    expect(screen.getByRole('article')).toHaveTextContent('Synthetic Scenario \u00b7 Exchange 2')
    expect(screen.getByText('Formal assessment')).toBeInTheDocument()
  })
  it('leaves out a step it has no value for and shows no quote it was not given', () => {
    wrap(<EvidenceCard item={item({ candidateAction: { quote: null, turn: null, artifactId: 'A1' }, rubricAnchor: null })} />)
    expect(screen.getByText('Worked in a scenario document')).toBeInTheDocument()
    expect(screen.queryByText(/Described behaviour/)).not.toBeInTheDocument()
    expect(screen.queryByRole('blockquote')).not.toBeInTheDocument()
  })
  it('practice evidence is dashed, labelled, and carries no sufficiency', () => {
    wrap(<EvidenceCard item={item({ kind: 'PRACTICE', evidenceStatus: 'SUFFICIENT' })} />)
    expect(screen.getByRole('article')).toHaveAttribute('data-kind', 'PRACTICE')
    expect(screen.getByRole('article').className).toMatch(/border-dashed/)
    expect(screen.getByText('Practice evidence')).toBeInTheDocument()
    expect(screen.queryByText('Sufficient evidence')).not.toBeInTheDocument()
  })
  it('uses third-person wording for someone else\u2019s view', () => {
    wrap(<EvidenceCard item={item()} audience="OTHER" />)
    expect(screen.getByText('What the student did')).toBeInTheDocument()
  })
})

describe('EvidenceQuote', () => {
  it('renders nothing without a verified quote', () => {
    const { container } = render(<EvidenceQuote quote={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('EvidenceCoverage', () => {
  it('says how many capabilities are described, in words and never as a percentage', () => {
    render(<EvidenceCoverage items={[{ id: 'a', level: { band: 'EARLY', label: 'Early evidence' } }, { id: 'b', level: null }, { id: 'c', level: null }]} />)
    expect(screen.getByTestId('evidence-coverage')).toHaveTextContent('1 of 3 capabilities have enough evidence to describe.')
    expect(document.body.textContent).not.toMatch(/\d\s*%/)
  })
  it('shows nothing for an empty list', () => {
    const { container } = render(<EvidenceCoverage items={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('EvidenceTimeline', () => {
  it('lists newest first; an assessment without enough evidence shows no level', () => {
    render(<EvidenceTimeline entries={[
      { id: 's1', title: 'Earlier assessment', date: '2026-09-01T10:00:00.000Z', level: { band: 'EARLY', label: 'Early evidence' }, status: 'PROVISIONAL' },
      { id: 's2', title: 'Later assessment', date: '2026-10-01T10:00:00.000Z', level: null, status: 'INSUFFICIENT_EVIDENCE' },
    ]} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Later assessment')
    expect(rows[0]).toHaveTextContent('Insufficient evidence')
    expect(rows[1]).toHaveTextContent('Earlier assessment')
    expect(rows[1]).toHaveTextContent('Early evidence (provisional)')
  })
})

describe('EvidenceDetailDrawer', () => {
  it('shows how the evidence was reviewed and closes', async () => {
    let closed = false
    render(<EvidenceDetailDrawer item={item()} onClose={() => { closed = true }} />)
    const dialog = screen.getByRole('dialog', { name: 'Synthetic Reasoning' })
    expect(within(dialog).getByText('Reviewed by AI, not yet by a person')).toBeInTheDocument()
    expect(within(dialog).getByText('Provisional claim')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(closed).toBe(true)
  })
  it('renders nothing when no item is open', () => {
    render(<EvidenceDetailDrawer item={null} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})