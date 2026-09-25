import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { jsonResponse } from '../../test/utils.jsx'
import { artifactStore } from '../../lib/artifactStore.js'
import ArtifactRenderer from './ArtifactRenderer.jsx'

const budget = {
  artifactId: 'A-BUDGET', type: 'BUDGET_MODELER', title: 'Synthetic budget',
  data: { totalBudget: 1000, allocations: { searchSpend: 400, retentionSpend: 300 }, constraints: { minRetention: 200 } },
}

beforeEach(() => {
  artifactStore.setSession('s-art', [JSON.parse(JSON.stringify(budget))], 'Synthetic')
})

describe('work materials (fail closed)', () => {
  it('unknown types and missing data render as unavailable, never sample content', () => {
    render(<>
      <ArtifactRenderer artifact={{ artifactId: 'X', type: 'EMAIL_THREAD', title: 'Inbox', data: {} }} sessionId="s" />
      <ArtifactRenderer artifact={{ artifactId: 'Y', type: 'ANALYTICS_DASHBOARD', title: 'Dashboard', data: {} }} sessionId="s" />
    </>)
    expect(screen.getAllByText(/this work material cannot be displayed/)).toHaveLength(2)
  })

  it('a failed save says "Not saved — retry" and keeps the plan; success says Saved only after the server confirms', async () => {
    const user = userEvent.setup()
    let ok = false
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => (ok
      ? jsonResponse(200, { ok: true, artifacts: artifactStore.getState().artifacts })
      : jsonResponse(500, { error: 'Failed to update artifact' })))
    render(<ArtifactRenderer artifact={artifactStore.getState().artifacts[0]} sessionId="s-art" />)
    await user.type(screen.getByLabelText('Your reasoning'), 'Synthetic reasoning')
    await user.click(screen.getByRole('button', { name: 'Save plan' }))
    expect(await screen.findByText(/Not saved — retry/)).toBeInTheDocument()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Your reasoning')).toHaveValue('Synthetic reasoning')
    ok = true
    await user.click(screen.getByRole('button', { name: 'Retry save' }))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('shows only data from the artifact (no invented projections)', () => {
    const { container } = render(<ArtifactRenderer artifact={artifactStore.getState().artifacts[0]} sessionId="s-art" />)
    expect(screen.getByText('Allocated 700 of 1,000')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/Projected|Profitable|ROAS/)
  })
})
