// Campus billing (spec §38, §19.1; C11.06). Seats, usage and the contract
// term for billing roles (billing.read). Prices appear only after StudAI
// finance approval; nothing here is ever shown to students.
import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Panel, StatCard } from '../../../components/ui/Card.jsx'
import { StatusChip } from '../../../components/ui/Badge.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { Input, Select } from '../../../components/ui/FormControls.jsx'
import { DataTable } from '../../../components/ui/DataTable.jsx'
import { EmptyState } from '../../../components/states/EmptyState.jsx'
import { useToast } from '../../../components/ui/Toast.jsx'
import { billingApi } from '../../../api/billing.js'
import { BILLING_COPY } from '../../../lib/copy/campus.js'
import { formatDate, queryStateView } from '../../student/QueryState.jsx'
import { CampusPage, MutationError, downloadText } from '../components/CampusPage.jsx'
import { useCampusOrg } from '../hooks.js'

const monthLabel = (period) => new Date(`${period}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })

function ContractPanel({ c }) {
  const included = Object.entries(c.components).filter(([, v]) => v).map(([k]) => BILLING_COPY.components[k] || k)
  return (
    <Panel
      title={c.name}
      headingLevel={3}
      description={`${formatDate(c.termStart)} to ${formatDate(c.termEnd)}. ${BILLING_COPY.billableEvent[c.billableEvent]}`}
      actions={<StatusChip tone={BILLING_COPY.contractTone[c.status]} label={BILLING_COPY.contractStatus[c.status]} />}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Included seats" value={c.seats.included} provenance="Seats in this contract" />
        <StatCard label="Seats in use" value={c.seats.inUse} provenance="Started or completed sponsored assessments" />
        <StatCard label="Seats available" value={c.seats.available} provenance={c.status === 'ACTIVE' ? 'Left to assign in this term' : 'This contract no longer grants new starts'} />
      </div>
      <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <div><dt className="text-prism-ink-muted">Assessments started</dt><dd className="mt-1 font-medium text-prism-ink">{c.usage.started}</dd></div>
        <div><dt className="text-prism-ink-muted">Billable assessments</dt><dd className="mt-1 font-medium text-prism-ink">{c.usage.billable}</dd></div>
        <div><dt className="text-prism-ink-muted">Seats returned unused</dt><dd className="mt-1 font-medium text-prism-ink">{c.usage.released}</dd></div>
      </dl>
      {included.length > 0 && <p className="mt-4 text-sm text-prism-ink-muted">Included in this contract: {included.join(', ')}.</p>}
      {c.pricing ? (
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3" data-testid="approved-pricing">
          {c.pricing.perAssessmentRate != null && <div><dt className="text-prism-ink-muted">Rate per billable assessment</dt><dd className="mt-1 font-medium text-prism-ink">{c.pricing.perAssessmentRate} {c.pricing.currency}</dd></div>}
          {c.pricing.reassessmentRate != null && <div><dt className="text-prism-ink-muted">Rate per reassessment</dt><dd className="mt-1 font-medium text-prism-ink">{c.pricing.reassessmentRate} {c.pricing.currency}</dd></div>}
          {c.pricing.platformFee != null && <div><dt className="text-prism-ink-muted">Platform fee</dt><dd className="mt-1 font-medium text-prism-ink">{c.pricing.platformFee} {c.pricing.currency}</dd></div>}
        </dl>
      ) : <p className="mt-4 text-sm text-prism-ink-muted">{BILLING_COPY.pricingHidden}</p>}
    </Panel>
  )
}

function UsageByMonth() {
  const { orgId, key } = useCampusOrg()
  const query = useQuery({ queryKey: key('billing', 'usage'), queryFn: () => billingApi.usage(orgId, {}) })
  const state = queryStateView(query, { label: 'Loading usage', homeTo: `/campus/${orgId}/overview` })
  if (state) return state
  return (
    <div className="space-y-2">
      <DataTable
        caption="Sponsored assessments by month"
        rowKey={(r) => r.period}
        rows={query.data.months}
        emptyMessage="No sponsored assessments yet."
        columns={[
          { key: 'period', header: 'Month', render: (r) => monthLabel(r.period) },
          { key: 'started', header: 'Started' },
          { key: 'billable', header: 'Billable' },
          { key: 'released', header: 'Returned unused' },
        ]}
      />
      <p className="text-xs text-prism-ink-subtle">{query.data.note}</p>
    </div>
  )
}

function InvoiceExport({ contracts }) {
  const { orgId } = useCampusOrg()
  const toast = useToast()
  const [contractId, setContractId] = useState(contracts[0]?.id || '')
  const [periodStart, setStart] = useState('')
  const [periodEnd, setEnd] = useState('')
  const [error, setError] = useState(null)
  const run = useMutation({
    mutationFn: () => billingApi.exportInvoice(orgId, { contractId, periodStart, periodEnd }),
    onSuccess: (f) => { downloadText(f.fileName, f.csv, f.contentType); toast.show(`Usage downloaded: ${f.export.billableCount} billable ${f.export.billableCount === 1 ? 'assessment' : 'assessments'}.`, { tone: 'positive' }) },
  })
  const submit = (e) => {
    e.preventDefault()
    if (!contractId || !periodStart || !periodEnd) { setError('Choose a contract and both dates.'); return }
    if (periodEnd < periodStart) { setError('The end date must be on or after the start date.'); return }
    setError(null)
    run.mutate()
  }
  return (
    <form className="space-y-3" onSubmit={submit} noValidate aria-label="Download usage for finance">
      <p className="text-sm text-prism-ink-muted">{BILLING_COPY.exportHelp}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Select label="Contract" value={contractId} onChange={(e) => setContractId(e.target.value)} options={contracts.map((c) => ({ value: c.id, label: c.name }))} />
        <Input label="Period start" type="date" value={periodStart} onChange={(e) => setStart(e.target.value)} />
        <Input label="Period end" type="date" value={periodEnd} onChange={(e) => setEnd(e.target.value)} error={error || undefined} />
      </div>
      <Button type="submit" variant="secondary" loading={run.isPending}>Download usage CSV</Button>
      <MutationError error={run.error} />
    </form>
  )
}

export default function CampusBillingPage() {
  const { orgId, key } = useCampusOrg()
  const query = useQuery({ queryKey: key('billing'), queryFn: () => billingApi.summary(orgId) })
  const d = query.data
  return (
    <CampusPage title="Billing" description={BILLING_COPY.intro} query={query}>
      {d && (d.contracts.length === 0 && d.otherSponsorship.length === 0 ? (
        <EmptyState title="No sponsored seats yet" description={BILLING_COPY.noContract} />
      ) : (
        <div className="space-y-6">
          <section aria-labelledby="contracts-heading" className="space-y-4">
            <h2 id="contracts-heading" className="text-base font-semibold text-prism-ink">Contracts</h2>
            {d.contracts.length === 0 ? <p className="text-sm text-prism-ink-muted">{BILLING_COPY.noContract}</p> : d.contracts.map((c) => <ContractPanel key={c.id} c={c} />)}
          </section>
          {d.otherSponsorship.length > 0 && (
            <section aria-labelledby="other-heading" className="space-y-3">
              <h2 id="other-heading" className="text-base font-semibold text-prism-ink">Other sponsored seats</h2>
              <DataTable
                caption="Sponsored seats set up outside a contract"
                rowKey={(p) => p.id}
                rows={d.otherSponsorship}
                columns={[
                  { key: 'window', header: 'Valid', render: (p) => `${formatDate(p.validFrom)} to ${p.validUntil ? formatDate(p.validUntil) : 'no end date'}` },
                  { key: 'included', header: 'Included seats', render: (p) => p.seats.included },
                  { key: 'inUse', header: 'In use', render: (p) => p.seats.inUse },
                  { key: 'available', header: 'Available', render: (p) => p.seats.available },
                ]}
              />
            </section>
          )}
          <section aria-labelledby="usage-heading" className="space-y-3">
            <h2 id="usage-heading" className="text-base font-semibold text-prism-ink">Usage</h2>
            <UsageByMonth />
          </section>
          {d.contracts.length > 0 && (
            <section aria-labelledby="export-heading" className="space-y-3">
              <h2 id="export-heading" className="text-base font-semibold text-prism-ink">Usage for finance</h2>
              <InvoiceExport contracts={d.contracts} />
              {d.invoiceExports.length > 0 && (
                <DataTable
                  caption="Recent usage downloads"
                  rowKey={(x) => x.id}
                  rows={d.invoiceExports}
                  columns={[
                    { key: 'period', header: 'Period', render: (x) => `${formatDate(x.periodStart)} to ${formatDate(x.periodEnd)}` },
                    { key: 'count', header: 'Billable assessments', render: (x) => x.billableCount },
                    { key: 'at', header: 'Downloaded', render: (x) => formatDate(x.createdAt) },
                  ]}
                />
              )}
            </section>
          )}
        </div>
      ))}
    </CampusPage>
  )
}
