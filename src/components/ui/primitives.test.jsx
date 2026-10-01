import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import {
  Button, IconButton, Badge, StatusChip, StatCard, ProgressBar, Tabs, SegmentedControl, Tooltip,
  Popover, Modal, Drawer, DropdownMenu, Avatar, Input, Select, Textarea, Checkbox, RadioGroup, Switch,
  DataTable, Pagination, Breadcrumbs, PageHeader, Skeleton, InlineNotice, Callout, ToastProvider, useToast,
} from './index.js'

const inRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('Button family', () => {
  it('Button fires onClick, disables while loading and exposes aria-busy', async () => {
    const onClick = vi.fn()
    const { rerender } = render(<Button onClick={onClick}>Save</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    rerender(<Button onClick={onClick} loading loadingLabel="Saving…">Save</Button>)
    const busy = screen.getByRole('button', { name: 'Saving…' })
    expect(busy).toBeDisabled()
    expect(busy).toHaveAttribute('aria-busy', 'true')
  })
  it('IconButton has an accessible name', () => {
    render(<IconButton label="Close">x</IconButton>)
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })
})

describe('status primitives', () => {
  it('StatusChip pairs colour with a text label', () => {
    render(<StatusChip tone="insufficient" label="Insufficient evidence" />)
    expect(screen.getByText('Insufficient evidence')).toBeInTheDocument()
  })
  it('Badge renders children', () => {
    render(<Badge tone="accent">Sponsored</Badge>)
    expect(screen.getByText('Sponsored')).toBeInTheDocument()
  })
  it('StatCard shows an explicit empty label instead of inventing a number', () => {
    render(<StatCard label="Completed" value={null} provenance="From finished assessments" />)
    expect(screen.getByText('Not available yet')).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
  it('ProgressBar exposes progressbar semantics', () => {
    render(<ProgressBar label="Setup" value={3} max={7} valueText="3 of 7 steps" />)
    const bar = screen.getByRole('progressbar', { name: 'Setup' })
    expect(bar).toHaveAttribute('aria-valuenow', '3')
    expect(bar).toHaveAttribute('aria-valuetext', '3 of 7 steps')
  })
  it('Avatar derives initials and an accessible label', () => {
    render(<Avatar name="Asha Rao" />)
    expect(screen.getByRole('img', { name: 'Asha Rao' })).toHaveTextContent('AR')
  })
  it('Skeleton announces loading', () => {
    render(<Skeleton label="Loading report" />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading report')
  })
  it('InlineNotice and Callout render their content', () => {
    render(<><InlineNotice>Inline</InlineNotice><Callout title="Heads up">Body</Callout></>)
    expect(screen.getByText('Inline')).toBeInTheDocument()
    expect(screen.getByText('Heads up')).toBeInTheDocument()
  })
})

describe('Tabs', () => {
  function Harness() {
    const [v, setV] = useState('a')
    return <Tabs label="Report sections" value={v} onChange={setV} tabs={[{ id: 'a', label: 'Summary', content: 'Summary body' }, { id: 'b', label: 'Evidence', content: 'Evidence body' }, { id: 'c', label: 'Method', content: 'Method body' }]} />
  }
  it('supports click and arrow-key navigation with roving tabindex', async () => {
    render(<Harness />)
    const summary = screen.getByRole('tab', { name: 'Summary' })
    expect(summary).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Summary body')
    summary.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Evidence' })).toHaveFocus()
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Evidence body')
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Method' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Evidence' })).toHaveAttribute('tabindex', '-1')
  })
})

describe('Modal and Drawer', () => {
  function Harness({ Comp }) {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>Open</button>
        <Comp open={open} onClose={() => setOpen(false)} title="Share report"><button type="button">Inside</button></Comp>
      </>
    )
  }
  it('Modal traps focus, closes on Escape and returns focus to the opener', async () => {
    render(<Harness Comp={Modal} />)
    const opener = screen.getByRole('button', { name: 'Open' })
    await userEvent.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Share report' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByRole('button', { name: 'Close dialog' })).toHaveFocus()
    await userEvent.tab()
    expect(within(dialog).getByRole('button', { name: 'Inside' })).toHaveFocus()
    await userEvent.tab()
    expect(within(dialog).getByRole('button', { name: 'Close dialog' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })
  it('Drawer is a labelled modal dialog that closes on Escape', async () => {
    render(<Harness Comp={Drawer} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByRole('dialog', { name: 'Share report' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('Popover, DropdownMenu, Tooltip', () => {
  it('Popover opens, then closes on Escape returning focus', async () => {
    render(<Popover label="Details" trigger="More">Panel text</Popover>)
    const btn = screen.getByRole('button', { name: 'Details' })
    await userEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Panel text')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByText('Panel text')).not.toBeInTheDocument()
    expect(btn).toHaveFocus()
  })
  it('DropdownMenu is keyboard operable', async () => {
    const onA = vi.fn()
    render(<DropdownMenu label="Actions" trigger="Actions" items={[{ id: 'a', label: 'Resend', onSelect: onA }, { id: 'b', label: 'Remove' }]} />)
    const btn = screen.getByRole('button', { name: 'Actions' })
    btn.focus()
    await userEvent.keyboard('{ArrowDown}')
    const menu = await screen.findByRole('menu', { name: 'Actions' })
    await vi.waitFor(() => expect(within(menu).getByRole('menuitem', { name: 'Resend' })).toHaveFocus())
    await userEvent.keyboard('{ArrowDown}')
    expect(within(menu).getByRole('menuitem', { name: 'Remove' })).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}{Enter}')
    expect(onA).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
  it('Tooltip appears on focus and describes the trigger', async () => {
    render(<Tooltip content="Help text"><button type="button">Info</button></Tooltip>)
    await userEvent.tab()
    const tip = screen.getByRole('tooltip')
    expect(tip).toHaveTextContent('Help text')
    expect(screen.getByRole('button', { name: 'Info' })).toHaveAttribute('aria-describedby', tip.id)
  })
})

describe('form controls', () => {
  it('Input wires label, hint and error', () => {
    render(<Input label="Cohort name" error="Enter a name." required />)
    const input = screen.getByLabelText(/Cohort name/)
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Enter a name.')
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name.')
  })
  it('Select renders options, placeholder and fires onChange', async () => {
    const onChange = vi.fn()
    render(<Select label="Department" placeholder="Choose…" options={[{ value: 'eng', label: 'Engineering' }]} onChange={onChange} hint="Optional" />)
    const sel = screen.getByLabelText('Department')
    expect(sel).toHaveAccessibleDescription('Optional')
    await userEvent.selectOptions(sel, 'eng')
    expect(onChange).toHaveBeenCalled()
    expect(sel).toHaveValue('eng')
  })
  it('Textarea, Checkbox, RadioGroup and Switch are labelled and operable', async () => {
    function Harness() {
      const [r, setR] = useState('a')
      const [s, setS] = useState(false)
      return (
        <>
          <Textarea label="Notes" />
          <Checkbox label="I understand" description="Required" />
          <RadioGroup label="Visibility" value={r} onChange={setR} options={[{ value: 'a', label: 'Only me' }, { value: 'b', label: 'Institution' }]} />
          <Switch label="Reduce motion" checked={s} onChange={setS} />
        </>
      )
    }
    render(<Harness />)
    expect(screen.getByLabelText('Notes')).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('I understand'))
    expect(screen.getByLabelText('I understand')).toBeChecked()
    await userEvent.click(screen.getByLabelText('Institution'))
    expect(screen.getByLabelText('Institution')).toBeChecked()
    const sw = screen.getByRole('switch', { name: 'Reduce motion' })
    await userEvent.click(sw)
    expect(sw).toHaveAttribute('aria-checked', 'true')
  })
  it('SegmentedControl is a labelled radio group', async () => {
    const onChange = vi.fn()
    render(<SegmentedControl label="View" value="list" onChange={onChange} options={[{ value: 'list', label: 'List' }, { value: 'grid', label: 'Grid' }]} />)
    expect(screen.getByRole('group', { name: 'View' })).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Grid'))
    expect(onChange).toHaveBeenCalledWith('grid')
  })
})

describe('DataTable and Pagination', () => {
  const columns = [{ key: 'name', header: 'Name', sortable: true }, { key: 'status', header: 'Status' }]
  const rows = [{ id: '1', name: 'Alpha', status: 'Active' }, { id: '2', name: 'Beta', status: 'Invited' }]
  it('renders a captioned table with aria-sort and reports sort intent (server-driven)', async () => {
    const onSortChange = vi.fn()
    render(<DataTable caption="Cohorts" columns={columns} rows={rows} sort={{ key: 'name', direction: 'asc' }} onSortChange={onSortChange} />)
    const table = screen.getByRole('table', { name: 'Cohorts' })
    const header = within(table).getByRole('columnheader', { name: /Name/ })
    expect(header).toHaveAttribute('aria-sort', 'ascending')
    await userEvent.click(within(header).getByRole('button'))
    expect(onSortChange).toHaveBeenCalledWith({ key: 'name', direction: 'desc' })
    expect(within(table).getAllByRole('row')).toHaveLength(3)
  })
  it('shows loading and empty rows', () => {
    const { rerender } = render(<DataTable caption="C" columns={columns} rows={[]} loading />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    rerender(<DataTable caption="C" columns={columns} rows={[]} emptyMessage="No cohorts yet." />)
    expect(screen.getByText('No cohorts yet.')).toBeInTheDocument()
  })
  it('supports row selection including select-all', async () => {
    const onSel = vi.fn()
    render(<DataTable caption="C" columns={columns} rows={rows} selectable selected={[]} onSelectedChange={onSel} />)
    await userEvent.click(screen.getByLabelText('Select all rows'))
    expect(onSel).toHaveBeenCalledWith(['1', '2'])
  })
  it('Pagination buttons respect availability', async () => {
    const onNext = vi.fn()
    render(<Pagination summary="Page 1" hasPrevious={false} hasNext onNext={onNext} />)
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onNext).toHaveBeenCalled()
  })
})

describe('page chrome', () => {
  it('Breadcrumbs marks the current page', () => {
    inRouter(<Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Cohorts' }]} />)
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
    expect(screen.getByText('Cohorts')).toHaveAttribute('aria-current', 'page')
  })
  it('PageHeader renders an h1 and the workspace context', () => {
    inRouter(<PageHeader title="Capabilities" context={{ type: 'CAMPUS_STUDENT', organizationName: 'Synthetic University' }} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Capabilities' })).toBeInTheDocument()
    expect(screen.getByText('Synthetic University')).toBeInTheDocument()
  })
})

describe('Toast', () => {
  function Trigger() {
    const t = useToast()
    return (
      <>
        <button type="button" onClick={() => t.show('Saved')}>ok</button>
        <button type="button" onClick={() => t.show('Failed', { tone: 'blocked' })}>bad</button>
      </>
    )
  }
  it('announces polite toasts in a status region and errors in an alert region', async () => {
    render(<ToastProvider durationMs={0}><Trigger /></ToastProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'ok' }))
    await userEvent.click(screen.getByRole('button', { name: 'bad' }))
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
    expect(screen.getByRole('alert')).toHaveTextContent('Failed')
    await userEvent.click(screen.getAllByRole('button', { name: 'Dismiss notification' })[0])
    expect(screen.getByRole('status')).not.toHaveTextContent('Saved')
  })
  it('useToast outside the provider throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Trigger />)).toThrow(/ToastProvider/)
    spy.mockRestore()
  })
})
