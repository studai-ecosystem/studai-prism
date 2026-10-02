import { useRef } from 'react'
import { Modal } from '../../../components/ui/Modal.jsx'
import { Button, LinkButton } from '../../../components/ui/Button.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'

// Scenario intro (P3.7): shown automatically before the timed phase of a run
// whose server timing says `begun: false`. Only the explicit button begins the
// clock; Escape, the X and the backdrop are "Not yet" and never start time.
// Everything shown is the server-pinned contract; nothing is generated here.
function minutes(ms) {
  return Number.isFinite(ms) ? Math.round(ms / 60000) : null
}

export function ScenarioIntroDialog({ open, contract, onBegin, onNotYet, notYetTo, beginning, error }) {
  const beginRef = useRef(null)
  const s = contract?.scenario
  const timing = contract?.timing || {}
  const duration = minutes(timing.policyDurationMs ?? (timing.deadlineAt && timing.startedAt ? new Date(timing.deadlineAt) - new Date(timing.startedAt) : null))
  const hasMaterials = (contract?.artifacts || []).length > 0
  return (
    <Modal
      open={open}
      onClose={onNotYet}
      themeClass="theme-assessment"
      size="lg"
      title={s?.title || 'Your assessment'}
      description="Read the situation first. The clock starts only when you choose to begin."
      initialFocusRef={beginRef}
      footer={(
        <>
          {notYetTo ? <LinkButton variant="secondary" to={notYetTo}>Not yet</LinkButton> : <Button variant="secondary" onClick={onNotYet}>Not yet</Button>}
          <Button ref={beginRef} onClick={onBegin} loading={beginning} loadingLabel="Starting…" disabled={!s}>Begin timed assessment</Button>
        </>
      )}
    >
      <div className="space-y-4 text-sm" data-testid="scenario-intro">
        {s?.context && <section><h3 className="font-semibold text-prism-ink">The situation</h3><p className="mt-1 text-prism-ink-muted">{s.context}</p></section>}
        {s?.yourRole && <section><h3 className="font-semibold text-prism-ink">Your role</h3><p className="mt-1 text-prism-ink-muted">{s.yourRole}</p></section>}
        {s?.participants?.length > 0 && (
          <section>
            <h3 className="font-semibold text-prism-ink">People in this conversation</h3>
            <ul className="mt-1 flex flex-wrap gap-2">
              {s.participants.map((p) => (
                <li key={p.name} className="flex items-center gap-2 rounded-[var(--prism-radius-md)] border border-prism-border px-2 py-1 text-prism-ink">
                  <span aria-hidden="true" className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-prism-subtle text-xs font-semibold">{p.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}</span>
                  <span>{p.name}{p.role ? <span className="text-prism-ink-muted">, {p.role}</span> : null}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section>
          <h3 className="font-semibold text-prism-ink">How you respond</h3>
          <p className="mt-1 text-prism-ink-muted">
            You reply in the conversation by typing.{hasMaterials ? ' This assessment also includes work material you can open and edit; your changes are saved as you go.' : ' This assessment has no separate work material.'}
          </p>
        </section>
        <section>
          <h3 className="font-semibold text-prism-ink">Time</h3>
          <p className="mt-1 text-prism-ink-muted">
            {duration ? `You have ${duration} minutes to answer once you begin.` : 'The time allowed is shown by the clock once you begin.'}
            {' '}Reading this briefing does not use any of that time. You can reopen the briefing during the assessment; the clock keeps running then.
            {timing.policyVersion?.includes('proposed') ? ' This timing policy is proposed and under review.' : ''}
          </p>
        </section>
        {error && <Callout tone="blocked" role="alert" title="The assessment did not start">{error.message}{error.requestId ? ` Reference: ${error.requestId}` : ''} Nothing has been timed yet; try again.</Callout>}
        {!s && <Callout tone="blocked" title="Scenario details are unavailable">We could not load the situation for this assessment, so it cannot begin. Try again or go back.</Callout>}
      </div>
    </Modal>
  )
}

export default ScenarioIntroDialog
