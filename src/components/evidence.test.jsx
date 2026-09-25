import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EvidenceSufficiencyBadge } from './evidence/EvidenceSufficiencyBadge.jsx'
import { CapabilityLevelBadge } from './capability/CapabilityLevelBadge.jsx'
import { InsufficientEvidenceState } from './states/InsufficientEvidenceState.jsx'

const NUMERIC = /\d+\s*%|\b\d+(\.\d+)?\s*\/\s*\d+\b|±/

describe('EvidenceSufficiencyBadge', () => {
  it.each([
    ['SUFFICIENT', 'Sufficient evidence'],
    ['PROVISIONAL', 'Provisional'],
    ['HUMAN_REVIEW_REQUIRED', 'Awaiting review'],
    ['INSUFFICIENT_EVIDENCE', 'Insufficient evidence'],
  ])('%s renders a text label', (status, label) => {
    render(<EvidenceSufficiencyBadge status={status} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('unknown or missing status renders as insufficient, never red', () => {
    const { container } = render(<EvidenceSufficiencyBadge status={undefined} />)
    expect(screen.getByText('Insufficient evidence')).toBeInTheDocument()
    expect(container.innerHTML).not.toMatch(/blocked|red-/)
    expect(container.innerHTML).toMatch(/insufficient/)
  })

  it('explains reasons in plain language for assistive technology', () => {
    render(<EvidenceSufficiencyBadge status="INSUFFICIENT_EVIDENCE" reasons={['BELOW_MINIMUM_EVIDENCE_UNITS', 'SOMETHING_NEW']} />)
    expect(screen.getByText(/Not enough separate pieces of evidence yet\./)).toHaveClass('sr-only')
    expect(screen.getByText(/There is not yet enough reliable evidence/)).toBeInTheDocument()
  })
})

describe('CapabilityLevelBadge', () => {
  it('null level → Insufficient evidence in gray', () => {
    const { container } = render(<CapabilityLevelBadge level={null} />)
    expect(screen.getByText('Insufficient evidence')).toBeInTheDocument()
    expect(container.innerHTML).toMatch(/insufficient/)
  })

  it('INSUFFICIENT band and unknown bands also render as insufficient', () => {
    render(<><CapabilityLevelBadge level={{ band: 'INSUFFICIENT' }} /><CapabilityLevelBadge level={{ band: 'LEVEL_9' }} /></>)
    expect(screen.getAllByText('Insufficient evidence')).toHaveLength(2)
  })

  it('shows the server label, marks provisional, never a number', () => {
    const { container } = render(<CapabilityLevelBadge level={{ band: 'DEMONSTRATED', label: 'Demonstrated', rubricMedian: 4 }} provisional />)
    expect(screen.getByText('Demonstrated (provisional)')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/4/)
    expect(container.textContent).not.toMatch(NUMERIC)
  })

  it('falls back to the local provisional vocabulary', () => {
    render(<CapabilityLevelBadge level={{ band: 'EARLY' }} />)
    expect(screen.getByText('Early evidence')).toBeInTheDocument()
  })
})

describe('InsufficientEvidenceState', () => {
  it('explains why, de-duplicates reasons and offers the action', () => {
    render(
      <InsufficientEvidenceState
        reasons={['BELOW_MINIMUM_EVIDENCE_UNITS', 'BELOW_MINIMUM_EVIDENCE_UNITS', 'NO_JUDGE_AGREEMENT']}
        action={<button type="button">Take an assessment</button>}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Not enough evidence yet' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Take an assessment' })).toBeInTheDocument()
    expect(screen.getByText(/Nothing is estimated or filled in/)).toBeInTheDocument()
  })

  it('is gray, not an error', () => {
    const { container } = render(<InsufficientEvidenceState />)
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.innerHTML).not.toMatch(/blocked/)
  })
})
