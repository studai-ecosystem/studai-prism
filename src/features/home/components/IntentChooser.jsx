// New-learner intention chooser (P3.3): Understand / Practise / Prepare.
// Shown only when the workspace has no owned history. Each card states what
// the path is for and whether it is available now; nothing about the learner
// is assumed or invented.
import { Card } from '../../../components/ui/Card.jsx'
import { LinkButton } from '../../../components/ui/Button.jsx'
import { StatusChip } from '../../../components/ui/Badge.jsx'
import { INTENT_COPY } from '../../../lib/copy/student.js'

export function IntentChooser({ assessmentTo, practiceTo }) {
  const cards = [
    { id: 'understand', copy: INTENT_COPY.UNDERSTAND, to: assessmentTo, primary: true },
    { id: 'practise', copy: INTENT_COPY.PRACTISE, to: practiceTo, primary: false },
    { id: 'prepare', copy: INTENT_COPY.PREPARE, to: null, primary: false },
  ]
  return (
    <section aria-labelledby="intent-title" className="space-y-3" data-testid="intent-chooser">
      <h2 id="intent-title" className="text-lg font-semibold text-prism-ink">{INTENT_COPY.heading}</h2>
      <ul className="grid gap-4 lg:grid-cols-3">
        {cards.map(({ id, copy, to, primary }) => (
          <li key={id}>
            <Card as="article" className={primary ? 'flex h-full flex-col gap-3 border-prism-accent-soft p-5' : 'flex h-full flex-col gap-3 p-5'} data-testid={`intent-${id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-prism-ink">{copy.title}</h3>
                {!to && <StatusChip tone="neutral" label={copy.unavailable} />}
              </div>
              <p className="flex-1 text-sm text-prism-ink-muted">{copy.description}</p>
              {to ? (
                <LinkButton to={to} variant={primary ? 'primary' : 'secondary'}>{copy.cta}</LinkButton>
              ) : (
                <span aria-disabled="true" className="inline-flex h-10 items-center rounded-[var(--prism-radius-md)] border border-prism-border px-4 text-sm font-medium text-prism-ink-subtle">{copy.unavailable}</span>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default IntentChooser
