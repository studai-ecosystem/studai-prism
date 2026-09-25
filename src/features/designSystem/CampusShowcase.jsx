import { useState } from 'react'
import { Plus } from 'lucide-react'
import {
  Button, IconButton, LinkButton, Badge, StatusChip, Card, Panel, StatCard, ProgressBar, Tabs,
  SegmentedControl, Tooltip, Popover, Modal, Drawer, DropdownMenu, Avatar, Input, Select, Textarea,
  Checkbox, RadioGroup, Switch, DataTable, Pagination, Breadcrumbs, PageHeader, EmptyState, ErrorState,
  Skeleton, InlineNotice, Callout, useToast,
} from '../../components/ui/index.js'
import { PartialDataNotice } from '../../components/states/PartialDataNotice.jsx'
import { UnauthorizedState } from '../../components/states/UnauthorizedState.jsx'
import { ExpiredEntitlementState } from '../../components/states/ExpiredEntitlementState.jsx'

// Living catalogue of the Prism Campus primitives (spec §8.1) and page
// states (spec §40). All content is illustrative UI copy — no measurement data.
const ROWS = [
  { id: 'c1', name: 'Cohort A (synthetic)', status: 'Invited' },
  { id: 'c2', name: 'Cohort B (synthetic)', status: 'Active' },
]

export default function CampusShowcase() {
  const toast = useToast()
  const [tab, setTab] = useState('one')
  const [seg, setSeg] = useState('list')
  const [modal, setModal] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [radio, setRadio] = useState('a')
  const [on, setOn] = useState(false)
  const [sort, setSort] = useState({ key: 'name', direction: 'asc' })
  const [selected, setSelected] = useState([])

  const h3 = 'mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-prism-ink-subtle'
  return (
    <div className="prism-app rounded-[var(--prism-radius-lg)] p-6">
      <PageHeader title="Prism Campus primitives" description="Light application theme. Every control is keyboard operable." context={{ type: 'PERSONAL' }} breadcrumbs={[{ label: 'Design system', to: '/design-system' }, { label: 'Campus' }]} />

      <h3 className={h3}>Buttons</h3>
      <div className="flex flex-wrap items-center gap-2">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button loading>Saving</Button>
        <IconButton label="Add item"><Plus size={18} /></IconButton>
        <LinkButton to="/design-system">Link button</LinkButton>
      </div>

      <h3 className={h3}>Badges and status (colour always paired with text)</h3>
      <div className="flex flex-wrap gap-2">
        <Badge>Neutral</Badge><Badge tone="accent">Sponsored</Badge>
        <StatusChip tone="positive" label="Sufficient evidence" />
        <StatusChip tone="partial" label="Provisional" />
        <StatusChip tone="insufficient" label="Insufficient evidence" />
        <StatusChip tone="blocked" label="Blocked" />
      </div>

      <h3 className={h3}>Surfaces</h3>
      <div className="grid gap-4 md:grid-cols-3">
        <Card><p className="text-sm">Card content.</p></Card>
        <Panel title="Panel" description="With header and actions" actions={<Button size="sm" variant="secondary">Action</Button>}><p className="text-sm">Body.</p></Panel>
        <StatCard label="Assessments completed" value={null} provenance="Counted from your finished assessments" />
      </div>
      <ProgressBar className="mt-4" label="Setup progress" value={3} max={7} valueText="3 of 7 steps" />

      <h3 className={h3}>Navigation and choice</h3>
      <Breadcrumbs items={[{ label: 'Home', to: '/design-system' }, { label: 'Section', to: '/design-system' }, { label: 'Current' }]} />
      <Tabs label="Example tabs" value={tab} onChange={setTab} tabs={[{ id: 'one', label: 'Summary', content: <p className="text-sm">Summary tab.</p> }, { id: 'two', label: 'Evidence', content: <p className="text-sm">Evidence tab.</p> }]} />
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <SegmentedControl label="View" value={seg} onChange={setSeg} options={[{ value: 'list', label: 'List' }, { value: 'grid', label: 'Grid' }]} />
        <Tooltip content="Supplementary help text"><button type="button" className="text-sm underline">Hover or focus me</button></Tooltip>
        <Popover label="More information" trigger="Popover"><p className="text-sm">Popover content.</p></Popover>
        <DropdownMenu label="Row actions" trigger="Actions" items={[{ id: 'a', label: 'Resend invite', onSelect: () => toast.show('Invite resent (example)') }, { id: 'b', label: 'Remove', danger: true, onSelect: () => toast.show('Removed (example)', { tone: 'blocked' }) }]} />
        <Avatar name="Synthetic Student" />
      </div>

      <h3 className={h3}>Overlays and feedback</h3>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setModal(true)}>Open modal</Button>
        <Button variant="secondary" onClick={() => setDrawer(true)}>Open drawer</Button>
        <Button variant="secondary" onClick={() => toast.show('Saved', { tone: 'positive' })}>Show toast</Button>
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title="Example dialog" description="Focus is trapped; Escape closes." footer={<Button onClick={() => setModal(false)}>Done</Button>}>
        <p className="text-sm">Dialog body.</p>
      </Modal>
      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Example drawer"><p className="text-sm">Drawer body.</p></Drawer>
      <div className="mt-4 grid gap-3">
        <InlineNotice tone="info">Inline information.</InlineNotice>
        <InlineNotice tone="insufficient">Not enough evidence to describe this capability yet.</InlineNotice>
        <Callout tone="partial" title="Callout">Longer explanatory message.</Callout>
      </div>

      <h3 className={h3}>Forms</h3>
      <div className="grid max-w-xl gap-4">
        <Input label="Email" type="email" hint="We never share this." />
        <Input label="Cohort name" error="Enter a cohort name." required />
        <Select label="Department" placeholder="Choose…" options={[{ value: 'x', label: 'Example department' }]} />
        <Textarea label="Notes" />
        <Checkbox label="I understand what my institution can see" description="Required before a sponsored assessment." />
        <RadioGroup label="Visibility" value={radio} onChange={setRadio} options={[{ value: 'a', label: 'Only me' }, { value: 'b', label: 'Me and my institution' }]} />
        <Switch label="Reduce motion" checked={on} onChange={setOn} />
      </div>

      <h3 className={h3}>Data table</h3>
      <DataTable
        caption="Example cohorts"
        columns={[{ key: 'name', header: 'Name', sortable: true }, { key: 'status', header: 'Status' }]}
        rows={ROWS}
        sort={sort}
        onSortChange={setSort}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
      />
      <Pagination summary="Showing 2 rows" hasPrevious={false} hasNext={false} />

      <h3 className={h3}>Page states</h3>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton lines={3} label="Loading example" />
        <EmptyState title="Nothing here yet" description="Explain what the user can do next." headingLevel={4} />
        <ErrorState title="We could not load this" requestId="req-example" onRetry={() => toast.show('Retry (example)')} />
        <UnauthorizedState />
        <ExpiredEntitlementState />
        <PartialDataNotice missing={['Communication evidence']} />
      </div>
      <div className="theme-assessment mt-6 rounded-[var(--prism-radius-lg)] bg-prism-canvas p-4 text-prism-ink">
        <p className="text-sm">Assessment theme (dark scope): <StatusChip tone="insufficient" label="Insufficient evidence" /></p>
      </div>
    </div>
  )
}
