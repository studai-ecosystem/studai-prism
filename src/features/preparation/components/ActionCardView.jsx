// The preparation action card (CH-34): AI assistance based on what the
// learner wrote, shown with its provenance. A missing card is an honest,
// explicit error — never a generic stand-in.
import { useState } from 'react'
import { Panel } from '../../../components/ui/Card.jsx'
import { Badge } from '../../../components/ui/Badge.jsx'
import { Button, LinkButton } from '../../../components/ui/Button.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'
import { PREPARATION_COPY } from '../../../lib/copy/student.js'
import { CheckinForm } from './CheckinForm.jsx'

export function ActionCardView({ attempt, checkin }) {
  const [showCheckin, setShowCheckin] = useState(false)
  const card = attempt.card
  return (
    <div className="space-y-4" data-testid="action-card">
      {card ? (
        <Panel title="Your preparation card" description={PREPARATION_COPY.cardIntro} actions={<Badge tone="neutral">{PREPARATION_COPY.assistanceLabel}</Badge>}>
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="font-medium text-prism-ink">Situation</dt>
              <dd className="mt-1 text-prism-ink-muted">{card.situation}</dd>
            </div>
            <div>
              <dt className="font-medium text-prism-ink">Plan</dt>
              <dd className="mt-1">
                <ol className="list-decimal space-y-1 pl-5 text-prism-ink">
                  {card.plan.map((step, i) => <li key={i}>{step}</li>)}
                </ol>
              </dd>
            </div>
            <div>
              <dt className="font-medium text-prism-ink">Opening message</dt>
              <dd className="mt-1 rounded-[var(--prism-radius-md)] border border-prism-border bg-prism-canvas px-3 py-2 text-prism-ink">{card.keyMessage}</dd>
            </div>
            {card.risks.length > 0 && (
              <div>
                <dt className="font-medium text-prism-ink">What could come up</dt>
                <dd className="mt-1">
                  <ul className="list-disc space-y-1 pl-5 text-prism-ink">
                    {card.risks.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </dd>
              </div>
            )}
            <div>
              <dt className="font-medium text-prism-ink">Checkpoint</dt>
              <dd className="mt-1 text-prism-ink-muted">{card.checkpoint}</dd>
            </div>
          </dl>
        </Panel>
      ) : (
        <Callout tone="insufficient" title="No card was written" role="status">
          {PREPARATION_COPY.cardError[attempt.cardError] || 'No card is available for this rehearsal. Your rehearsal is kept.'}
        </Callout>
      )}
      <div className="flex flex-wrap gap-2">
        {!showCheckin && <Button variant="secondary" onClick={() => setShowCheckin(true)}>Save a check-in later</Button>}
        <LinkButton to="/app/prepare" variant="ghost">Back</LinkButton>
      </div>
      {showCheckin && (
        <Panel title="After the real conversation" description={PREPARATION_COPY.checkinPrompt} headingLevel={3}>
          <CheckinForm
            sourceType="PREPARATION"
            sourceId={attempt.id}
            onSubmit={(body) => checkin.mutate(body)}
            submitting={checkin.isPending}
            error={checkin.error}
            saved={checkin.isSuccess}
            onDone={() => { checkin.reset(); setShowCheckin(false) }}
          />
        </Panel>
      )}
    </div>
  )
}

export default ActionCardView
