// Student import wizard (spec §23): choose a CSV → see every row the server
// validated (problems first) → confirm → result. Nothing is sent until the
// admin confirms, and a retried confirm never invites anyone twice.
import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Panel, StatCard } from '../../../components/ui/Card.jsx'
import { Button, LinkButton } from '../../../components/ui/Button.jsx'
import { Select, Checkbox, Field } from '../../../components/ui/FormControls.jsx'
import { DataTable } from '../../../components/ui/DataTable.jsx'
import { InlineNotice, Callout } from '../../../components/ui/Notice.jsx'
import { StatusChip } from '../../../components/ui/Badge.jsx'
import { newIdempotencyKey } from '../../../api/client.js'
import { campusAdminApi } from '../../../api/campusAdmin.js'
import { IMPORT_ERROR_TEXT, IMPORT_ACTION_TEXT, IMPORT_OUTCOME_TEXT } from '../../../lib/copy/campus.js'
import { CampusPage, MutationError, crumbs, focusFirstInvalid } from '../components/CampusPage.jsx'
import { useCampusOrg, useCohorts, usePreviewImport, useCommitImport } from '../hooks.js'

const MAX_BYTES = 1_000_000
const STEPS = ['Choose file', 'Check rows', 'Done']

// Blob.text() is missing in some older browsers; FileReader works everywhere.
function readText(file) {
  if (typeof file.text === 'function') return file.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

function StepIndicator({ step }) {
  return (
    <ol className="mb-6 flex flex-wrap gap-2 text-sm" aria-label="Import steps">
      {STEPS.map((label, i) => (
        <li key={label} aria-current={i === step ? 'step' : undefined} className={i === step ? 'font-semibold text-prism-ink' : 'text-prism-ink-muted'}>
          {i + 1}. {label}{i < STEPS.length - 1 && <span aria-hidden="true" className="ml-2">›</span>}
        </li>
      ))}
    </ol>
  )
}

export default function CampusImportPage() {
  const { orgId } = useCampusOrg()
  const [params] = useSearchParams()
  const cohorts = useCohorts()
  const preview = usePreviewImport()
  const commit = useCommitImport()
  const [file, setFile] = useState(null)
  const [fileError, setFileError] = useState(null)
  const [defaultCohortId, setDefaultCohortId] = useState(params.get('cohort') || '')
  const [problemsOnly, setProblemsOnly] = useState(false)
  const [result, setResult] = useState(null)
  const commitKey = useRef(null)
  const heading = useRef(null)
  const step = result ? 2 : preview.data ? 1 : 0
  const cohortOptions = (cohorts.data || []).filter((c) => c.status === 'ACTIVE').map((c) => ({ value: c.id, label: c.name }))

  async function onFile(e) {
    const f = e.target.files?.[0]
    setFile(null)
    setFileError(null)
    if (!f) return
    if (!/\.csv$/i.test(f.name) && f.type !== 'text/csv') return setFileError('Choose a .csv file.')
    if (f.size > MAX_BYTES) return setFileError('This file is larger than 1 MB. Split it into smaller files.')
    const text = await readText(f).catch(() => null)
    if (text === null) return setFileError('This file could not be read. Try saving it again as CSV.')
    return setFile({ name: f.name, text })
  }

  function onCheck(e) {
    e.preventDefault()
    if (!file) { setFileError('Choose a CSV file first.'); return focusFirstInvalid() }
    commitKey.current = newIdempotencyKey('import')
    return preview.mutate({ fileName: file.name, csv: file.text, ...(defaultCohortId ? { defaultCohortId } : {}) }, {
      onSuccess: () => requestAnimationFrame(() => heading.current?.focus()),
    })
  }

  function onCommit() {
    commit.mutate({ jobId: preview.data.job.id, key: commitKey.current }, {
      onSuccess: async (r) => {
        // Per-row outcomes; if they cannot be loaded the totals still show.
        const detail = await campusAdminApi.getImport(orgId, r.job.id).catch(() => null)
        setResult({ job: r.job, rows: detail?.rows || null })
        requestAnimationFrame(() => heading.current?.focus())
      },
    })
  }

  function restart() {
    preview.reset()
    commit.reset()
    setResult(null)
    setFile(null)
    requestAnimationFrame(() => document.getElementById('import-file')?.focus())
  }

  const rows = useMemo(() => {
    const all = result?.rows || preview.data?.rows || []
    const sorted = [...all].sort((a, b) => (a.action === 'ERROR' ? 0 : 1) - (b.action === 'ERROR' ? 0 : 1) || a.rowNumber - b.rowNumber)
    return problemsOnly ? sorted.filter((r) => r.action === 'ERROR') : sorted
  }, [preview.data, result, problemsOnly])
  const totals = result?.job.totals || preview.data?.job.totals

  return (
    <CampusPage
      title="Import students"
      description="Invite students from a CSV file with an email column. Optional columns: name, student ID, department, cohort."
      breadcrumbs={crumbs(orgId, { label: 'Cohorts', to: `/campus/${orgId}/cohorts` }, { label: 'Import students' })}
    >
      <StepIndicator step={step} />
      {step === 0 && (
        <Panel title="Choose a file">
          <form onSubmit={onCheck} className="space-y-4" noValidate>
            <Field id="import-file" label="CSV file" hint="Up to 2,000 students and 1 MB. The first row must be the column names." error={fileError}>
              <input
                id="import-file"
                type="file"
                accept=".csv,text/csv"
                onChange={onFile}
                aria-invalid={fileError ? true : undefined}
                aria-describedby={fileError ? 'import-file-error' : 'import-file-hint'}
                className="text-sm text-prism-ink file:mr-3 file:rounded-[var(--prism-radius-md)] file:border file:border-prism-border-strong file:bg-prism-surface file:px-3 file:py-1.5 file:text-sm file:font-semibold"
              />
            </Field>
            {file && <p className="text-sm text-prism-ink-muted">Selected: {file.name}</p>}
            <Select
              label="Default cohort"
              value={defaultCohortId}
              onChange={(e) => setDefaultCohortId(e.target.value)}
              options={cohortOptions}
              placeholder="None — use the cohort column"
              hint="Used for rows without a cohort."
            />
            <MutationError error={preview.error} />
            <Button type="submit" loading={preview.isPending} loadingLabel="Checking…">Check file</Button>
          </form>
        </Panel>
      )}
      {step >= 1 && totals && (
        <div className="space-y-4">
          <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold text-prism-ink focus:outline-none">
            {step === 1 ? 'Check the rows before sending' : 'Import complete'}
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Rows in file" value={totals.rows} />
            {step === 1 ? (
              <>
                <StatCard label="Will be invited" value={totals.invite} />
                <StatCard label="Already enrolled" value={totals.alreadyMember} provenance="Added to the cohort, not invited again" />
                <StatCard label="Rows with problems" value={totals.errors} provenance="Will be skipped" />
              </>
            ) : (
              <>
                <StatCard label="Invited" value={totals.invited ?? 0} />
                <StatCard label="Skipped" value={totals.skipped ?? 0} provenance="Already enrolled or had a problem" />
                <StatCard label="Failed" value={totals.failed ?? 0} />
              </>
            )}
          </div>
          {step === 1 && totals.errors > 0 && (
            <InlineNotice tone="partial">{totals.errors} {totals.errors === 1 ? 'row has a problem and will' : 'rows have problems and will'} be skipped. Fix the file and check it again, or continue without them.</InlineNotice>
          )}
          {step === 2 && (
            <Callout tone="positive" title="Invitations are on their way">Students receive a private link by email. They appear as enrolled once they accept.</Callout>
          )}
          {/* Actions sit above the row list so they are reachable without scrolling a long file. */}
          <MutationError error={commit.error} />
          <div className="flex flex-wrap gap-2">
            {step === 1 ? (
              <>
                <Button onClick={onCommit} loading={commit.isPending} loadingLabel="Sending…" disabled={totals.invite + totals.alreadyMember === 0}>
                  {totals.invite > 0 ? `Invite ${totals.invite} ${totals.invite === 1 ? 'student' : 'students'}` : 'Add to cohorts'}
                </Button>
                <Button variant="secondary" onClick={restart}>Choose another file</Button>
              </>
            ) : (
              <>
                <LinkButton to={`/campus/${orgId}/students`} variant="primary">View students</LinkButton>
                <Button variant="secondary" onClick={restart}>Import another file</Button>
              </>
            )}
          </div>
          <Checkbox label="Show only rows with problems" checked={problemsOnly} onChange={(e) => setProblemsOnly(e.target.checked)} />
          <DataTable
            caption="Rows in the file"
            rows={rows}
            rowKey={(r) => r.rowNumber}
            emptyMessage="No rows to show."
            columns={[
              { key: 'rowNumber', header: 'Row', align: 'right' },
              { key: 'email', header: 'Email', render: (r) => r.raw.email || <span className="text-prism-ink-muted">(empty)</span> },
              { key: 'name', header: 'Name', render: (r) => r.raw.name || '' },
              { key: 'cohort', header: 'Cohort', render: (r) => r.normalized?.cohortName || r.raw.cohort || '' },
              {
                key: 'result',
                header: step === 1 ? 'What will happen' : 'Result',
                render: (r) => (r.action === 'ERROR'
                  ? <span><StatusChip tone="blocked" label="Problem" /> <span className="text-sm">{r.errors.map((c) => IMPORT_ERROR_TEXT[c] || c).join('; ')}</span></span>
                  : step === 2 && r.outcome ? IMPORT_OUTCOME_TEXT[r.outcome] : IMPORT_ACTION_TEXT[r.action]),
              },
            ]}
          />
        </div>
      )}
    </CampusPage>
  )
}
