// Assignment wizard (spec §25): approved assessment → cohorts → window and
// settings → review what students will be told → launch. Institutions pick
// from the approved catalog only; content, rubrics and prompts are fixed.
import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Panel } from '../../../components/ui/Card.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { Input, Select, Checkbox, RadioGroup } from '../../../components/ui/FormControls.jsx'
import { InlineNotice, Callout } from '../../../components/ui/Notice.jsx'
import { useToast } from '../../../components/ui/Toast.jsx'
import { CampusPage, MutationError, crumbs, focusFirstInvalid } from '../components/CampusPage.jsx'
import { useCampusOrg, useCatalog, useCohorts, usePrograms, useConsentPreview, useCreateAssignment } from '../hooks.js'

const STEPS = ['Assessment', 'Who takes it', 'Window and settings', 'Review and launch']
const INTEGRITY = {
  STANDARD: { label: 'Standard', description: 'Taken on the student’s own device, no proctoring.' },
  PROCTORED: { label: 'Proctored', description: 'Identity and integrity checks before and during the assessment.' },
}
const pad = (n) => String(n).padStart(2, '0')
const localValue = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

export default function CampusAssignWizardPage() {
  const { orgId } = useCampusOrg()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const catalog = useCatalog()
  const cohorts = useCohorts()
  const programs = usePrograms()
  const consent = useConsentPreview()
  const create = useCreateAssignment()
  const heading = useRef(null)
  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState({})
  const [form, setForm] = useState(() => {
    const start = new Date()
    start.setMinutes(0, 0, 0)
    start.setHours(start.getHours() + 1)
    const end = new Date(start.getTime() + 14 * 86400000)
    return {
      definitionId: '', cohortIds: [], programId: params.get('program') || '',
      windowStart: localValue(start), windowEnd: localValue(end),
      integrityPolicy: 'STANDARD', accommodationsRequestable: true,
    }
  })
  useEffect(() => { if (step > 0) heading.current?.focus() }, [step])

  const def = (catalog.data || []).find((d) => d.id === form.definitionId)
  const activeCohorts = (cohorts.data || []).filter((c) => c.status === 'ACTIVE')
  const chosen = activeCohorts.filter((c) => form.cohortIds.includes(c.id))
  const studentCount = chosen.reduce((n, c) => n + (c.memberCount || 0), 0)

  function validate(s) {
    const e = {}
    if (s === 0 && !form.definitionId) e.definitionId = 'Choose an assessment.'
    if (s === 1 && !form.cohortIds.length) e.cohortIds = 'Choose at least one cohort.'
    if (s === 2) {
      const a = new Date(form.windowStart)
      const b = new Date(form.windowEnd)
      if (Number.isNaN(a.getTime())) e.windowStart = 'Choose when the window opens.'
      if (Number.isNaN(b.getTime())) e.windowEnd = 'Choose when the window closes.'
      else if (!(b > a)) e.windowEnd = 'The window must close after it opens.'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }
  const next = () => { if (validate(step)) setStep((s) => s + 1); else focusFirstInvalid() }
  const back = () => { setErrors({}); setStep((s) => s - 1) }

  function launch() {
    create.mutate({
      definitionId: form.definitionId,
      cohortIds: form.cohortIds,
      windowStart: new Date(form.windowStart).toISOString(),
      windowEnd: new Date(form.windowEnd).toISOString(),
      integrityPolicy: form.integrityPolicy,
      accommodationsRequestable: form.accommodationsRequestable,
      programId: form.programId || null,
    }, {
      onSuccess: (a) => {
        toast.show(a.status === 'SCHEDULED'
          ? `Scheduled for ${a.rostered} ${a.rostered === 1 ? 'student' : 'students'}. They have been notified.`
          : `Assigned to ${a.rostered} ${a.rostered === 1 ? 'student' : 'students'}. They have been notified.`, { tone: 'positive' })
        navigate(`/campus/${orgId}/assessments/${a.id}`)
      },
    })
  }

  const blocking = [catalog, cohorts].find((q) => q.error) || [catalog, cohorts].find((q) => q.isPending) || null
  return (
    <CampusPage
      title="Assign an assessment"
      breadcrumbs={crumbs(orgId, { label: 'Assessments', to: `/campus/${orgId}/assessments` }, { label: 'Assign' })}
      query={blocking}
    >
      <ol className="mb-6 flex flex-wrap gap-2 text-sm" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? 'step' : undefined} className={i === step ? 'font-semibold text-prism-ink' : 'text-prism-ink-muted'}>
            {i + 1}. {label}{i < STEPS.length - 1 && <span aria-hidden="true" className="ml-2">›</span>}
          </li>
        ))}
      </ol>
      <Panel>
        <h2 ref={heading} tabIndex={-1} className="mb-4 text-lg font-semibold text-prism-ink focus:outline-none">{STEPS[step]}</h2>
        {step === 0 && (
          (catalog.data || []).length === 0
            ? <InlineNotice tone="insufficient">No approved assessments are available yet. Contact StudAI.</InlineNotice>
            : (
              <RadioGroup
                label="Approved assessments"
                value={form.definitionId}
                onChange={(v) => setForm({ ...form, definitionId: v })}
                error={errors.definitionId}
                options={catalog.data.map((d) => ({ value: d.id, label: d.title, description: `${d.description || ''} About ${d.durationMinutes} minutes.` }))}
              />
            )
        )}
        {step === 1 && (
          <div className="space-y-4">
            <fieldset aria-invalid={errors.cohortIds ? true : undefined}>
              <legend className="mb-2 text-sm font-medium text-prism-ink">Cohorts</legend>
              {activeCohorts.length === 0 ? <InlineNotice tone="insufficient">Create a cohort first.</InlineNotice> : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {activeCohorts.map((c) => (
                    <Checkbox
                      key={c.id}
                      label={c.name}
                      description={`${c.memberCount ?? 0} students`}
                      checked={form.cohortIds.includes(c.id)}
                      onChange={() => setForm((f) => ({ ...f, cohortIds: f.cohortIds.includes(c.id) ? f.cohortIds.filter((x) => x !== c.id) : [...f.cohortIds, c.id] }))}
                    />
                  ))}
                </div>
              )}
              {errors.cohortIds && <p role="alert" className="mt-1 text-xs font-medium text-prism-blocked">{errors.cohortIds}</p>}
            </fieldset>
            <p className="text-sm text-prism-ink-muted">Students who join these cohorts later are added automatically while the window is open.</p>
            <Select label="Program" value={form.programId} onChange={(e) => setForm({ ...form, programId: e.target.value })} placeholder="No program" options={(programs.data || []).filter((p) => p.status !== 'ARCHIVED').map((p) => ({ value: p.id, label: p.name }))} />
          </div>
        )}
        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label="Window opens" type="datetime-local" value={form.windowStart} onChange={(e) => setForm({ ...form, windowStart: e.target.value })} error={errors.windowStart} required />
              <Input label="Window closes" type="datetime-local" value={form.windowEnd} onChange={(e) => setForm({ ...form, windowEnd: e.target.value })} error={errors.windowEnd} required />
            </div>
            <RadioGroup
              label="Integrity"
              value={form.integrityPolicy}
              onChange={(v) => setForm({ ...form, integrityPolicy: v })}
              options={(def?.integrityModes || ['STANDARD']).map((m) => ({ value: m, label: INTEGRITY[m]?.label || m, description: INTEGRITY[m]?.description }))}
            />
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium text-prism-ink">Accommodations</legend>
              <Checkbox label="Students can request accommodations" description="Requests are reviewed through the Prism accommodations process." checked={form.accommodationsRequestable} onChange={(e) => setForm({ ...form, accommodationsRequestable: e.target.checked })} />
            </fieldset>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-4">
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-prism-ink-muted">Assessment</dt><dd className="mt-1 font-medium">{def?.title}</dd></div>
              <div><dt className="text-prism-ink-muted">Cohorts</dt><dd className="mt-1">{chosen.map((c) => c.name).join(', ')} ({studentCount} {studentCount === 1 ? 'student' : 'students'} now)</dd></div>
              <div><dt className="text-prism-ink-muted">Window</dt><dd className="mt-1">{new Date(form.windowStart).toLocaleString()} – {new Date(form.windowEnd).toLocaleString()}</dd></div>
              <div><dt className="text-prism-ink-muted">Integrity</dt><dd className="mt-1">{INTEGRITY[form.integrityPolicy]?.label}</dd></div>
            </dl>
            {consent.data ? (
              <Callout title="What students will be told">
                <p className="font-medium text-prism-ink">{consent.data.heading}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">{consent.data.canSee.map((l) => <li key={l}>{l}</li>)}</ul>
                <ul className="mt-2 list-disc space-y-1 pl-5">{consent.data.cannotSee.map((l) => <li key={l}>{l}</li>)}</ul>
              </Callout>
            ) : consent.error ? <InlineNotice tone="partial">The student notice could not be loaded. Students still see it before they start.</InlineNotice> : null}
            <MutationError error={create.error} />
          </div>
        )}
        <div className="mt-6 flex flex-wrap gap-2">
          {step > 0 && <Button variant="secondary" onClick={back}>Back</Button>}
          {step < 3 && <Button onClick={next}>Continue</Button>}
          {step === 3 && (
            <Button onClick={launch} loading={create.isPending} loadingLabel="Assigning…">Assign and notify students</Button>
          )}
        </div>
      </Panel>
    </CampusPage>
  )
}
