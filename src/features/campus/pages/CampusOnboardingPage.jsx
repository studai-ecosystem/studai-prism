// Organization onboarding (spec §37.1): nine steps, saved on the server so
// setup can stop at any point and resume later, on any device.
import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { Panel } from '../../../components/ui/Card.jsx'
import { Button, LinkButton } from '../../../components/ui/Button.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'
import { useToast } from '../../../components/ui/Toast.jsx'
import { cx } from '../../../lib/cx.js'
import { ONBOARDING_STEP_COPY } from '../../../lib/copy/campus.js'
import { CampusPage, MutationError } from '../components/CampusPage.jsx'
import { useCampusOrg, useOnboarding, useSaveOnboarding, useConsentPreview } from '../hooks.js'

function stepLink(orgId, step) {
  return {
    structure: { to: `/campus/${orgId}/settings`, label: 'Open academic structure' },
    team: { to: `/campus/${orgId}/members`, label: 'Open team' },
    students: { to: `/campus/${orgId}/cohorts/import`, label: 'Import students' },
    program: { to: `/campus/${orgId}/programs`, label: 'Open programs' },
    assessment: { to: `/campus/${orgId}/assessments/assign`, label: 'Choose an assessment' },
    schedule: { to: `/campus/${orgId}/assessments/assign`, label: 'Set the window' },
    launch: { to: `/campus/${orgId}/assessments/assign`, label: 'Assign and launch' },
  }[step] || null
}

export default function CampusOnboardingPage() {
  const { orgId, workspace } = useCampusOrg()
  const toast = useToast()
  const query = useOnboarding()
  const save = useSaveOnboarding()
  const consent = useConsentPreview()
  const [current, setCurrent] = useState(null)
  const heading = useRef(null)
  const d = query.data
  useEffect(() => {
    if (!d || current) return
    const resume = typeof d.data.lastStep === 'string' && d.steps.includes(d.data.lastStep) ? d.data.lastStep : d.steps.find((s) => !d.completedSteps.includes(s)) || d.steps[0]
    setCurrent(resume)
  }, [d, current])

  function go(step) {
    setCurrent(step)
    save.mutate({ completedSteps: d.completedSteps, data: { ...d.data, lastStep: step } })
    requestAnimationFrame(() => heading.current?.focus())
  }
  function complete() {
    const done = [...new Set([...d.completedSteps, current])]
    const nextStep = d.steps.find((s) => !done.includes(s)) || current
    save.mutate({ completedSteps: done, data: { ...d.data, lastStep: nextStep } }, {
      onSuccess: () => {
        toast.show(`${ONBOARDING_STEP_COPY[current].title} marked as done.`, { tone: 'positive' })
        setCurrent(nextStep)
        requestAnimationFrame(() => heading.current?.focus())
      },
    })
  }

  const copy = current ? ONBOARDING_STEP_COPY[current] : null
  const link = current ? stepLink(orgId, current) : null
  const doneCount = d ? d.completedSteps.length : 0
  return (
    <CampusPage title="Set up Prism Campus" loadingLabel="Loading setup progress" description="Work through these steps in any order. Your progress is saved." query={query}>
      {d && current && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_1fr]">
          <nav aria-label="Setup steps">
            <p className="mb-2 text-sm text-prism-ink-muted" aria-live="polite">{doneCount} of {d.steps.length} done</p>
            <ol className="space-y-1">
              {d.steps.map((s, i) => {
                const done = d.completedSteps.includes(s)
                return (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => go(s)}
                      aria-current={s === current ? 'step' : undefined}
                      className={cx('flex w-full items-center gap-2 rounded-[var(--prism-radius-md)] px-3 py-2 text-left text-sm', s === current ? 'bg-prism-accent-soft font-semibold text-prism-ink' : 'text-prism-ink-muted hover:bg-prism-subtle')}
                    >
                      <span aria-hidden="true" className="inline-flex w-4 justify-center">{done ? <Check size={14} /> : `${i + 1}.`}</span>
                      <span>{ONBOARDING_STEP_COPY[s].title}</span>
                      {done && <span className="sr-only">(done)</span>}
                    </button>
                  </li>
                )
              })}
            </ol>
          </nav>
          <Panel>
            <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold text-prism-ink focus:outline-none">{copy.title}</h2>
            <p className="mt-2 text-sm text-prism-ink-muted">{copy.body}</p>
            {current === 'profile' && (
              <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-prism-ink-muted">Organization</dt><dd className="mt-1 font-medium">{workspace.organizationName || workspace.name}</dd></div>
              </dl>
            )}
            {current === 'privacy' && consent.data && (
              <Callout className="mt-4" title="What students are told">
                <p className="font-medium text-prism-ink">{consent.data.heading}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">{[...consent.data.canSee, ...consent.data.cannotSee].map((l) => <li key={l}>{l}</li>)}</ul>
              </Callout>
            )}
            <MutationError error={save.error} />
            <div className="mt-6 flex flex-wrap gap-2">
              {link && <LinkButton to={link.to}>{link.label}</LinkButton>}
              {d.completedSteps.includes(current)
                ? <p className="self-center text-sm text-prism-ink-muted">This step is done.</p>
                : <Button onClick={complete} loading={save.isPending}>Mark as done</Button>}
            </div>
          </Panel>
        </div>
      )}
    </CampusPage>
  )
}
