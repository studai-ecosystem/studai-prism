import { useNavigate } from 'react-router-dom'
import { useAdminList, PageHeader, ErrorNotice, Toolbar, SearchBox, DataTable, Pager, Pill, field, when, mono } from './ui.jsx'

// ── /admin/sessions — assessment-session explorer (Phase 2) ──────────────────

export default function AdminSessions() {
  const navigate = useNavigate()
  const { data, error, busy, params, setFilter, setPage, reload } = useAdminList('/api/admin/sessions')

  return (
    <div className="p-6 max-w-6xl">
      <PageHeader
        title="Sessions"
        subtitle="Transcripts are never editable. Scores are never editable — corrections run through the dual-approved report supersession workflow."
      />
      <ErrorNotice error={error} />
      <Toolbar onRefresh={reload} busy={busy}>
        <SearchBox value={params.q} onChange={(q) => setFilter({ q })} placeholder="Session id or candidate email…" />
        <select
          aria-label="Status filter"
          className={field}
          value={params.status || ''}
          onChange={(e) => setFilter({ status: e.target.value || undefined })}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
        </select>
      </Toolbar>
      <DataTable
        busy={busy}
        rowKey={(s) => s.sessionId}
        onRowClick={(s) => navigate(`/admin/sessions/${s.sessionId}`)}
        columns={[
          { key: 'sessionId', label: 'Session', render: (s) => `${mono(s.sessionId, 13)}…`, className: 'font-mono text-[12px]' },
          { key: 'scenarioId', label: 'Scenario' },
          { key: 'userEmail', label: 'Candidate', className: 'font-mono text-[12px]' },
          { key: 'language', label: 'Lang', className: 'font-mono text-[11px]' },
          { key: 'exchangeCount', label: 'Turns', className: 'tabular-nums' },
          { key: 'overall', label: 'Score', render: (s) => s.overall ?? '—', className: 'tabular-nums' },
          {
            key: 'state', label: 'State',
            render: (s) => (
              <span className="flex gap-1 flex-wrap">
                <Pill tone={s.completedAt ? 'ok' : 'info'}>{s.completedAt ? 'completed' : 'active'}</Pill>
                {s.admin?.reviewState === 'held' && <Pill tone="warn">review hold</Pill>}
                {s.admin?.invalid && <Pill tone="danger">invalid</Pill>}
                {s.flaggedForReview && <Pill tone="warn">flagged</Pill>}
              </span>
            ),
          },
          { key: 'startedAt', label: 'Started', render: (s) => when(s.startedAt), className: 'whitespace-nowrap font-mono text-[11px]' },
        ]}
        rows={data?.rows}
        empty="No sessions match."
      />
      <Pager data={data} onPage={setPage} />
    </div>
  )
}
