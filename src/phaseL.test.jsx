// Phase L: the design-system reference shows each product component in light,
// dark, narrow, Tamil, Devanagari, long-text and focus settings, and controls
// keep a 24 px hit size.
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ProductShowcase from './features/designSystem/ProductShowcase.jsx'
import { Checkbox, RadioGroup } from './components/ui/FormControls.jsx'

const showcase = () => render(<MemoryRouter><ProductShowcase /></MemoryRouter>)

describe('Design system: product components', () => {
  it('names every setting a component is shown in', () => {
    showcase()
    for (const label of ['Dark (assessment theme)', 'Narrow (390 px column)', 'Tamil', 'Devanagari', 'Long text and an unbroken token', /Keyboard focus/]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('shows Tamil and Devanagari text in a card, and a long unbroken token in another', () => {
    showcase()
    expect(screen.getByText('ஒவ்வொரு மதிப்பெண்ணும் சான்றுடன்')).toBeInTheDocument()
    expect(screen.getByText('प्रमाण आधारित तर्क')).toBeInTheDocument()
    expect(screen.getByText(/Supercalifragilisticexpialidocious_unbroken_token/)).toBeInTheDocument()
  })

  it('shows formal and practice evidence apart, and a capability without evidence says so', () => {
    showcase()
    expect(screen.getAllByText('Formal assessment').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Practice evidence').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Insufficient evidence').length).toBeGreaterThan(0)
  })

  it('never lets a number stand in for evidence, and charts keep a table equivalent', () => {
    showcase()
    expect(document.body.textContent).not.toMatch(/\d\s*%/)
    const chart = screen.getAllByText('Students by level')[0].closest('figure')
    expect(within(chart).getByText('Based on 16 students')).toBeInTheDocument()
    expect(within(chart).getByRole('table', { name: 'Students by level' })).toBeInTheDocument()
    expect(screen.getByText('Nothing to chart yet.')).toBeInTheDocument()
  })
})

describe('Control hit size', () => {
  it('checkboxes and radios are 24 px (h-6 w-6)', () => {
    const { container } = render(
      <>
        <Checkbox label="A checkbox" />
        <RadioGroup label="Pick one" name="r" options={[{ value: 'a', label: 'A' }]} value="" onChange={() => {}} />
      </>,
    )
    for (const input of container.querySelectorAll('input[type="checkbox"], input[type="radio"]')) {
      expect(input.className).toMatch(/\bh-6 w-6\b/)
    }
  })
})