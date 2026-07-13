import { useNavigate } from 'react-router-dom'
import { useAdminList, PageHeader, ErrorNotice, Toolbar, SearchBox, DataTable, Pager, Pill, when } from './ui.jsx'

// ── /admin/candidates — candidate list (Phase 2) ─────────────────────────────

export default function AdminCandidates() {
  const navigate = useNavigate()
  const { data, error, busy, params, setFilter, setPage, reload } = useAdminList('/api/admin/users')

  return (
    <div className="p-6 max-w-6xl">
      <PageHeader
        title="Candidates"
        subtitle="Email is masked unless your role grants users:read_pii. Every PII view is audited."
      />
      <ErrorNotice error={error} />
      <Toolbar onRefresh={reload} busy={busy}>
        <SearchBox value={params.q} onChange={(q) => setFilter({ q })} placeholder="Name, email, candidate id…" />
      </Toolbar>
      <DataTable
        busy={busy}
        rowKey={(u) => u.id}
        onRowClick={(u) => navigate(`/admin/candidates/${u.id}`)}
        columns={[
          { key: 'name', label: 'Name', render: (u) => u.name || '—' },
          { key: 'email', label: 'Email', className: 'font-mono text-[12px]' },
          { key: 'college', label: 'College' },
          { key: 'year', label: 'Year' },
          {
            key: 'accountState', label: 'State',
            render: (u) => <Pill tone={u.accountState === 'suspended' ? 'danger' : 'ok'}>{u.accountState}</Pill>,
          },
          { key: 'createdAt', label: 'Created', render: (u) => when(u.createdAt), className: 'whitespace-nowrap font-mono text-[11px]' },
        ]}
        rows={data?.rows}
        empty="No candidates match."
      />
      <Pager data={data} onPage={setPage} />
    </div>
  )
}
