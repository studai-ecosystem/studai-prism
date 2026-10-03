import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminFetch, adminHasPermission } from '../../lib/adminApi.js'
import { ErrorNotice, Notice, DataTable, Pill, btn, field, when, actWithReason } from './ui.jsx'

// ── /admin/content → Forms tab (P4.8 review tooling) ─────────────────────────
// Dense operational view over authored assessment forms: versions, a two-
// version structured diff, the opportunity coverage matrix, the synthetic
// preview runner (no session, no evidence), exemplar/counterexample
// attachments, comments, reviewer decisions and the state transitions. Every
// transition button is disabled unless this admin holds the permission and
// the server-side pilot gate is satisfied; nothing here approves content.

const STATE_TONE = { DRAFT: 'info', REVIEW: 'warn', APPROVED_FOR_PILOT: 'ok', APPROVED_FOR_INTENDED_USE: 'ok', RETIRED: 'muted' }
const NEXT_STATES = {
  DRAFT: ['REVIEW', 'RETIRED'],
  REVIEW: ['DRAFT', 'APPROVED_FOR_PILOT', 'RETIRED'],
  APPROVED_FOR_PILOT: ['REVIEW', 'APPROVED_FOR_INTENDED_USE', 'RETIRED'],
  APPROVED_FOR_INTENDED_USE: ['RETIRED'],
  RETIRED: [],
}
const REVIEWER_ROLE_PERMISSIONS = { CONTENT: ['content:publish'], MEASUREMENT: ['scenarios:manage', 'validation:manage'], ACCESSIBILITY: ['accommodations:manage'] }
const label = (s) => String(s || '').replaceAll('_', ' ').toLowerCase()
const familyName = (capabilityId) => label(String(capabilityId).split('-').pop())
const api = (contentId, suffix = '') => `/api/admin/content/forms/${encodeURIComponent(contentId)}${suffix}`

export default function FormsTab() {
  const [forms, setForms] = useState(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)

  const load = useCallback(async () => {
    setError('')
    try { setForms((await adminFetch('/api/admin/content/forms')).forms) } catch (err) { setError(err.message) }
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4" data-testid="forms-tab">
      <ErrorNotice error={error} />
      <DataTable
        caption="Authored assessment forms and their versions"
        busy={!forms}
        rows={forms}
        rowKey={(f) => f.formId}
        onRowClick={(f) => setSelected(f)}
        empty="No authored forms in this build."
        columns={[
          { key: 'title', label: 'Form' },
          { key: 'contentId', label: 'Content id', className: 'font-mono text-[12px]' },
          { key: 'version', label: 'Version', className: 'font-mono text-[12px] tabular-nums' },
          { key: 'kind', label: 'Kind', render: (f) => label(f.kind) },
          { key: 'state', label: 'State', render: (f) => <Pill tone={STATE_TONE[f.state] || 'muted'}>{label(f.state)}</Pill> },
          { key: 'stages', label: 'Stages', className: 'tabular-nums' },
          { key: 'opportunities', label: 'Opportunities', className: 'tabular-nums' },
        ]}
      />
      {selected && <FormDetail form={selected} onChanged={load} onClose={() => setSelected(null)} />}
    </div>
  )
}

function FormDetail({ form, onChanged, onClose }) {
  const [version, setVersion] = useState(null)
  const [versions, setVersions] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [panel, setPanel] = useState('coverage')
  const canWrite = adminHasPermission('content:write')
  const canPublish = adminHasPermission('content:publish')

  const load = useCallback(async () => {
    setError('')
    try {
      const [v, list] = await Promise.all([adminFetch(api(form.contentId, `/versions/${encodeURIComponent(form.version)}`)), adminFetch(api(form.contentId, '/versions'))])
      setVersion(v)
      setVersions(list.versions || [])
    } catch (err) { setError(err.message) }
  }, [form.contentId, form.version])
  useEffect(() => { load() }, [load])

  const run = async (fn, okMsg) => {
    setError(''); setNotice('')
    try {
      const r = await fn()
      if (r === null) return
      if (okMsg) setNotice(okMsg)
      await load()
      await onChanged()
    } catch (err) { setError(err.message) }
  }

  const state = version?.state || form.state
  const gate = version?.pilotGate
  const transitionAllowed = (to) => canPublish && NEXT_STATES[state]?.includes(to) && (to !== 'APPROVED_FOR_PILOT' || gate?.ok)
  const transitionWhy = (to) => {
    if (!canPublish) return 'Requires the content:publish permission.'
    if (!NEXT_STATES[state]?.includes(to)) return `Not reachable from ${label(state)}.`
    if (to === 'APPROVED_FOR_PILOT' && !gate?.ok) return `Pilot approval needs recorded APPROVE decisions from a content reviewer and a measurement reviewer (missing: ${(gate?.missing || []).map(label).join(', ') || 'decisions'}).`
    return ''
  }
  const transition = async (to) => actWithReason(`/api/admin/content/forms/${encodeURIComponent(form.formId)}/transition`, { to }, `Reason for moving ${form.formId} to ${label(to)} (at least 10 characters, recorded in the audit trail):`)

  const panels = [['coverage', 'Coverage'], ['diff', 'Diff'], ['preview', 'Preview'], ['attachments', 'Attachments'], ['comments', 'Comments'], ['decisions', 'Decisions']]
  return (
    <section aria-labelledby="form-detail-title" className="rounded-[10px] border border-prism-border bg-prism-surface p-4 space-y-3" data-testid="form-detail">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="form-detail-title" className="font-display text-base text-prism-ink">{form.title}</h2>
          <p className="font-mono text-[11px] text-prism-ink-muted">{form.formId} · <Pill tone={STATE_TONE[state] || 'muted'}>{label(state)}</Pill></p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {['REVIEW', 'DRAFT', 'APPROVED_FOR_PILOT', 'APPROVED_FOR_INTENDED_USE', 'RETIRED'].filter((to) => to !== state).map((to) => (
            <button key={to} type="button" className={btn} disabled={!transitionAllowed(to)} title={transitionWhy(to)} aria-describedby={transitionAllowed(to) ? undefined : `why-${to}`}
              onClick={() => run(() => transition(to), `Moved to ${label(to)}.`)} data-testid={`transition-${to}`}>
              Move to {label(to)}
            </button>
          ))}
          <button type="button" className={btn} onClick={onClose}>Close</button>
        </div>
      </div>
      {['REVIEW', 'DRAFT', 'APPROVED_FOR_PILOT', 'APPROVED_FOR_INTENDED_USE', 'RETIRED'].filter((to) => to !== state && !transitionAllowed(to)).map((to) => (
        <p key={to} id={`why-${to}`} className="sr-only">{transitionWhy(to)}</p>
      ))}
      {gate && (
        <p className="font-sans text-[12px] text-prism-ink-muted" data-testid="pilot-gate">
          Pilot gate: {gate.contentApprovals} content approval(s), {gate.measurementApprovals} measurement approval(s){gate.missing?.length ? ` · missing: ${gate.missing.map(label).join(', ')}` : ' · satisfied'}.
        </p>
      )}
      <ErrorNotice error={error} />
      <Notice>{notice}</Notice>
      {version?.approvalHistory?.length > 0 && (
        <ol className="font-mono text-[11px] text-prism-ink-muted" aria-label="Approval history">
          {version.approvalHistory.map((h, i) => <li key={i}>{label(h.state)} · {when(h.at)} · {h.by || 'system'} · {h.reason}</li>)}
        </ol>
      )}
      <nav className="flex flex-wrap gap-1.5" aria-label="Form panels">
        {panels.map(([id, text]) => (
          <button key={id} type="button" onClick={() => setPanel(id)} aria-pressed={panel === id}
            className={`rounded-[6px] px-3 py-1 font-sans text-[12px] border ${panel === id ? 'border-brand-green-ink text-prism-ink bg-prism-subtle' : 'border-prism-border text-prism-ink-muted hover:text-prism-ink'}`}>
            {text}
          </button>
        ))}
      </nav>
      {panel === 'coverage' && <CoveragePanel contentId={form.contentId} version={form.version} />}
      {panel === 'diff' && <DiffPanel contentId={form.contentId} versions={versions} current={form.version} />}
      {panel === 'preview' && <PreviewPanel contentId={form.contentId} version={form.version} />}
      {panel === 'attachments' && <AttachmentsPanel form={form} version={version} canWrite={canWrite} run={run} />}
      {panel === 'comments' && <CommentsPanel form={form} version={version} canWrite={canWrite} run={run} />}
      {panel === 'decisions' && <DecisionsPanel form={form} version={version} run={run} />}
    </section>
  )
}

function CoveragePanel({ contentId, version }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    adminFetch(api(contentId, `/coverage?version=${encodeURIComponent(version)}`)).then((d) => live && setData(d)).catch((e) => live && setError(e.message))
    return () => { live = false }
  }, [contentId, version])
  if (error) return <ErrorNotice error={error} />
  if (!data) return <p className="font-sans text-sm text-prism-ink-muted">Loading coverage…</p>
  return (
    <div className="space-y-2" data-testid="coverage-panel">
      <p className="font-sans text-[12px] text-prism-ink-muted">{data.note}</p>
      <DataTable
        caption="Opportunity coverage by capability family"
        rows={data.families}
        rowKey={(f) => f.capabilityId}
        columns={[
          { key: 'capabilityId', label: 'Family', render: (f) => familyName(f.capabilityId) },
          { key: 'requiredOpportunities', label: 'Required', className: 'tabular-nums' },
          { key: 'optionalOpportunities', label: 'Optional', className: 'tabular-nums' },
          { key: 'distinctGroups', label: 'Groups', className: 'tabular-nums' },
          { key: 'requiredGroups', label: 'Required groups', className: 'tabular-nums' },
          { key: 'meetsAuthoringFloor', label: 'Authoring floor', render: (f) => (f.meetsAuthoringFloor == null ? '—' : f.meetsAuthoringFloor ? 'met' : 'not met') },
          { key: 'opportunities', label: 'Opportunities', render: (f) => <span className="font-mono text-[11px]">{f.opportunities.map((o) => `${o.id}${o.required ? '' : ' (optional)'}`).join(', ')}</span> },
        ]}
      />
      {data.untargetedBehaviours?.length > 0 && <p className="font-sans text-[12px] text-prism-ink">Behaviours with no opportunity: {data.untargetedBehaviours.join(', ')}</p>}
    </div>
  )
}

function DiffPanel({ contentId, versions, current }) {
  const [from, setFrom] = useState(versions[0]?.version || current)
  const [to, setTo] = useState(current)
  const [diff, setDiff] = useState(null)
  const [error, setError] = useState('')
  const compare = async () => {
    setError(''); setDiff(null)
    try { setDiff(await adminFetch(api(contentId, `/diff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`))) } catch (e) { setError(e.message) }
  }
  const section = (name, d) => (
    <li key={name}>
      <span className="font-medium text-prism-ink">{name}</span>: {d.added.length} added, {d.removed.length} removed, {d.changed.length} changed
      {(d.added.length > 0 || d.removed.length > 0 || d.changed.length > 0) && (
        <ul className="ml-4 font-mono text-[11px] text-prism-ink-muted">
          {d.added.map((id) => <li key={`a-${id}`}>+ {id}</li>)}
          {d.removed.map((id) => <li key={`r-${id}`}>− {id}</li>)}
          {d.changed.map((c) => <li key={`c-${c.id}`}>~ {c.id}: {c.fields.join(', ')}</li>)}
        </ul>
      )}
    </li>
  )
  return (
    <div className="space-y-2" data-testid="diff-panel">
      <div className="flex flex-wrap items-end gap-2">
        <label className="font-sans text-[12px] text-prism-ink">From
          <select className={`${field} ml-2`} value={from} onChange={(e) => setFrom(e.target.value)}>{versions.map((v) => <option key={v.version} value={v.version}>{v.version}</option>)}</select>
        </label>
        <label className="font-sans text-[12px] text-prism-ink">To
          <select className={`${field} ml-2`} value={to} onChange={(e) => setTo(e.target.value)}>{versions.map((v) => <option key={v.version} value={v.version}>{v.version}</option>)}</select>
        </label>
        <button type="button" className={btn} onClick={compare}>Compare</button>
      </div>
      <ErrorNotice error={error} />
      {diff && (
        <ul className="font-sans text-[13px] text-prism-ink space-y-1">
          {diff.title && <li>title: “{diff.title.before}” → “{diff.title.after}”</li>}
          {['facts', 'stages', 'worldChanges', 'opportunities', 'behaviours', 'anchors'].map((k) => section(k, diff[k]))}
          <li>board: {diff.board.changed ? 'changed' : 'unchanged'} · director policy: {diff.director.changed ? 'changed' : 'unchanged'}</li>
        </ul>
      )}
    </div>
  )
}

function PreviewPanel({ contentId, version }) {
  const [seed, setSeed] = useState('review-seed')
  const [out, setOut] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const runPreview = async () => {
    setError(''); setBusy(true)
    try { setOut(await adminFetch(api(contentId, '/preview'), { method: 'POST', body: { version, seed } })) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-2" data-testid="preview-panel">
      <p className="font-sans text-[12px] text-prism-ink-muted">Synthetic preview: the Director and the fact boundary run over a canned script. No session, no learner, no evidence is written.</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="font-sans text-[12px] text-prism-ink">Seed <input className={`${field} ml-2`} value={seed} onChange={(e) => setSeed(e.target.value)} /></label>
        <button type="button" className={btn} onClick={runPreview} disabled={busy}>{busy ? 'Running…' : 'Run synthetic preview'}</button>
      </div>
      <ErrorNotice error={error} />
      {out && (
        <div className="space-y-2">
          <p className="font-mono text-[11px] text-prism-ink-muted">synthetic · required {out.requiredAnswered}/{out.requiredPlanned} · stop {label(out.stop.reason)} · review required {out.reviewRequired.length}</p>
          <ol className="space-y-2" aria-label="Stimulus per stage">
            {out.stages.map((s) => (
              <li key={s.id} className="rounded-[6px] border border-prism-border p-2">
                <p className="font-sans text-[13px] font-medium text-prism-ink">{s.label}</p>
                {s.stimuli.length === 0 ? <p className="font-sans text-[12px] text-prism-ink-muted">Not presented in this preview.</p> : s.stimuli.map((st) => (
                  <div key={st.renderHash} className="mt-1">
                    <p className="font-mono text-[11px] text-prism-ink-muted">{st.opportunityId} · {st.speaker}{st.aiGenerated ? ' · AI-generated' : ''}{st.worldChangeId ? ` · world change ${st.worldChangeId}` : ''} · {st.renderHash.slice(0, 12)}</p>
                    <p className="font-sans text-[13px] text-prism-ink">{st.content}</p>
                  </div>
                ))}
              </li>
            ))}
          </ol>
          <ul className="font-mono text-[11px] text-prism-ink-muted">
            {Object.entries(out.coverage).map(([cap, c]) => <li key={cap}>{familyName(cap)}: {c.answeredGroups} answered group(s), floor {c.floor} · {c.meetsAuthoringFloor ? 'met' : 'not met'}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

function AttachmentsPanel({ form, version, canWrite, run }) {
  const [kind, setKind] = useState('EXEMPLAR')
  const [behaviourId, setBehaviourId] = useState('')
  const [text, setText] = useState('')
  const behaviours = useMemo(() => version?.package?.behaviours || [], [version])
  const submit = () => run(async () => {
    const r = await adminFetch(api(form.contentId, '/attachments'), { method: 'POST', body: { version: form.version, kind, behaviourId: kind === 'NOTE' ? null : behaviourId || null, text } })
    setText('')
    return r
  }, 'Attachment added.')
  return (
    <div className="space-y-2" data-testid="attachments-panel">
      <DataTable caption="Exemplars, counterexamples and notes" rows={version?.attachments || []} rowKey={(a) => a.id} empty="No attachments yet."
        columns={[
          { key: 'kind', label: 'Kind', render: (a) => label(a.kind) },
          { key: 'behaviourId', label: 'Behaviour', className: 'font-mono text-[11px]' },
          { key: 'text', label: 'Text' },
          { key: 'createdBy', label: 'By', className: 'font-mono text-[11px]' },
          { key: 'createdAt', label: 'When', render: (a) => when(a.createdAt) },
        ]} />
      {canWrite && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <label className="font-sans text-[12px] text-prism-ink">Kind
            <select className={`${field} ml-2`} value={kind} onChange={(e) => setKind(e.target.value)}>{['EXEMPLAR', 'COUNTEREXAMPLE', 'NOTE'].map((k) => <option key={k} value={k}>{label(k)}</option>)}</select>
          </label>
          {kind !== 'NOTE' && (
            <label className="font-sans text-[12px] text-prism-ink">Behaviour
              <select className={`${field} ml-2`} value={behaviourId} onChange={(e) => setBehaviourId(e.target.value)} required>
                <option value="">Choose…</option>
                {behaviours.map((b) => <option key={b.id} value={b.id}>{b.id}</option>)}
              </select>
            </label>
          )}
          <label className="font-sans text-[12px] text-prism-ink grow">Text <input className={`${field} ml-2 w-full`} value={text} onChange={(e) => setText(e.target.value)} required minLength={3} /></label>
          <button type="submit" className={btn}>Attach</button>
        </form>
      )}
    </div>
  )
}

function CommentsPanel({ form, version, canWrite, run }) {
  const [text, setText] = useState('')
  const submit = () => run(async () => {
    const r = await adminFetch(api(form.contentId, '/comments'), { method: 'POST', body: { version: form.version, text } })
    setText('')
    return r
  }, 'Comment added.')
  return (
    <div className="space-y-2" data-testid="comments-panel">
      <ul className="space-y-1 font-sans text-[13px] text-prism-ink" aria-label="Reviewer comments">
        {(version?.comments || []).length === 0 && <li className="text-prism-ink-muted">No comments yet.</li>}
        {(version?.comments || []).map((c) => <li key={c.id}><span className="font-mono text-[11px] text-prism-ink-muted">{c.author || 'unknown'} · {when(c.createdAt)}</span><br />{c.text}</li>)}
      </ul>
      {canWrite && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <label className="font-sans text-[12px] text-prism-ink grow">Comment <input className={`${field} ml-2 w-full`} value={text} onChange={(e) => setText(e.target.value)} required minLength={2} /></label>
          <button type="submit" className={btn}>Add comment</button>
        </form>
      )}
    </div>
  )
}

function DecisionsPanel({ form, version, run }) {
  const myRoles = Object.entries(REVIEWER_ROLE_PERMISSIONS).filter(([, perms]) => perms.some((p) => adminHasPermission(p))).map(([r]) => r)
  const [reviewerRole, setReviewerRole] = useState(myRoles[0] || '')
  const [decision, setDecision] = useState('APPROVE')
  const [reason, setReason] = useState('')
  const submit = () => run(async () => {
    const r = await adminFetch(api(form.contentId, '/review-decisions'), { method: 'POST', body: { version: form.version, reviewerRole, decision, reason } })
    setReason('')
    return r
  }, 'Decision recorded.')
  return (
    <div className="space-y-2" data-testid="decisions-panel">
      <DataTable caption="Reviewer decisions" rows={version?.decisions || []} rowKey={(d) => d.id} empty="No decisions recorded."
        columns={[
          { key: 'reviewerRole', label: 'Role', render: (d) => label(d.reviewerRole) },
          { key: 'decision', label: 'Decision', render: (d) => <Pill tone={d.decision === 'APPROVE' ? 'ok' : d.decision === 'REJECT' ? 'danger' : 'warn'}>{label(d.decision)}</Pill> },
          { key: 'reviewerId', label: 'Reviewer', className: 'font-mono text-[11px]' },
          { key: 'reason', label: 'Reason' },
          { key: 'createdAt', label: 'When', render: (d) => when(d.createdAt) },
        ]} />
      {myRoles.length === 0 ? <p className="font-sans text-[12px] text-prism-ink-muted">Your roles do not include a reviewer role for this form.</p> : (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <label className="font-sans text-[12px] text-prism-ink">Reviewer role
            <select className={`${field} ml-2`} value={reviewerRole} onChange={(e) => setReviewerRole(e.target.value)}>{myRoles.map((r) => <option key={r} value={r}>{label(r)}</option>)}</select>
          </label>
          <label className="font-sans text-[12px] text-prism-ink">Decision
            <select className={`${field} ml-2`} value={decision} onChange={(e) => setDecision(e.target.value)}>{['APPROVE', 'REQUEST_CHANGES', 'REJECT'].map((d) => <option key={d} value={d}>{label(d)}</option>)}</select>
          </label>
          <label className="font-sans text-[12px] text-prism-ink grow">Reason <input className={`${field} ml-2 w-full`} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={10} /></label>
          <button type="submit" className={btn}>Record decision</button>
        </form>
      )}
    </div>
  )
}
