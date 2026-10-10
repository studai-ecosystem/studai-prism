// Identity check for a V3 assessment (charter §9, IDENTITY_ASSURANCE_SPEC_v1;
// PROD-READY Phase 4). Shows the current level and what each level means;
// the learner can record a Level 1 self-declaration (their name, nothing
// else). Level 2 is recorded by the institution; Level 3 is not offered.
import { useState } from 'react'
import { Panel } from '../../../components/ui/Card.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { Checkbox, Input } from '../../../components/ui/FormControls.jsx'
import { Callout, InlineNotice } from '../../../components/ui/Notice.jsx'
import { Badge } from '../../../components/ui/Badge.jsx'
import { Skeleton } from '../../../components/ui/Skeleton.jsx'
import { formatDate } from '../../student/QueryState.jsx'
import { useDeclareIdentity, useIdentityCheck } from '../hooks.js'
import { IDENTITY_COPY } from '../../../lib/copy/support.js'

export function IdentityCheckCard({ sessionId, defaultName = '' }) {
  const identity = useIdentityCheck(sessionId)
  const declare = useDeclareIdentity(sessionId)
  const [name, setName] = useState(defaultName || '')
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState(null)

  let body
  if (identity.isPending) body = <Skeleton label="Loading the identity check" lines={2} />
  else if (identity.error) {
    body = (
      <Callout tone="partial" title="The identity check could not be loaded">
        <p>{identity.error.message}</p>
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => identity.refetch()}>Try again</Button>
      </Callout>
    )
  } else {
    const d = identity.data
    const l1 = d.options.find((o) => o.level === 'L1')
    const submit = async (e) => {
      e.preventDefault()
      if (name.trim().length < 2) { setError('Enter your full name.'); return }
      if (!confirmed) { setError('Tick the box to confirm.'); return }
      setError(null)
      try { await declare.mutateAsync({ declaredName: name.trim() }) } catch { /* shown below */ }
    }
    body = (
      <div className="space-y-4">
        <p className="text-sm text-prism-ink-muted">{IDENTITY_COPY.intro}</p>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-prism-ink-subtle">{IDENTITY_COPY.currentLevel}</p>
          <p className="mt-1 text-sm font-semibold text-prism-ink" data-testid="identity-level">{d.current.label}</p>
          <p className="text-sm text-prism-ink-muted">{d.current.explanation}</p>
        </div>
        <ul className="space-y-2" aria-label="Identity levels">
          {d.options.map((o) => (
            <li key={o.level} className="flex flex-wrap items-start gap-2 text-sm">
              <Badge tone={o.available ? 'accent' : 'neutral'}>{o.label}</Badge>
              <span className="text-prism-ink-muted">{IDENTITY_COPY.levels[o.level]}</span>
            </li>
          ))}
        </ul>
        {d.selfDeclaration.recorded ? (
          <div className="space-y-2">
            <p role="status" className="text-sm text-prism-ink">{IDENTITY_COPY.declared(formatDate(d.selfDeclaration.declaredAt))}</p>
            {d.selfDeclaration.nameMatchesAccount === false && <InlineNotice tone="info">{IDENTITY_COPY.nameDiffers}</InlineNotice>}
          </div>
        ) : d.otherRecordOnFile ? (
          <p className="text-sm text-prism-ink-muted">{IDENTITY_COPY.otherRecord}</p>
        ) : l1?.available ? (
          <form onSubmit={submit} className="space-y-3" noValidate>
            <Input id="identity-name" label={IDENTITY_COPY.declareLabel} hint={IDENTITY_COPY.declareHint} value={name} maxLength={120} autoComplete="name" onChange={(e) => setName(e.target.value)} />
            <Checkbox id="identity-confirm" label={IDENTITY_COPY.confirm} checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            {error && <p role="alert" className="text-sm font-medium text-prism-blocked">{error}</p>}
            {declare.error && <Callout tone="blocked" role="alert" title="Not saved">{declare.error.message}</Callout>}
            <Button type="submit" variant="secondary" loading={declare.isPending} loadingLabel={IDENTITY_COPY.submitting}>{IDENTITY_COPY.submit}</Button>
          </form>
        ) : null}
      </div>
    )
  }
  return <Panel title={IDENTITY_COPY.title} data-testid="identity-check-card">{body}</Panel>
}

export default IdentityCheckCard
