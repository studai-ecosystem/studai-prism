import { CircleDashed } from 'lucide-react'
import { StateBlock } from './StateBlock.jsx'
import { reasonText } from '../../lib/copy/evidence.js'

// Honest "not enough evidence" state (spec §33, §40). Gray and explanatory:
// it names why nothing is described and never substitutes a value.
export function InsufficientEvidenceState({
  title = 'Not enough evidence yet',
  description = 'Prism only describes a capability when there is enough reliable evidence of what you did. Nothing is estimated or filled in.',
  reasons = [],
  action,
  headingLevel = 2,
  className,
}) {
  const unique = [...new Set(reasons.map(reasonText))]
  return (
    <StateBlock icon={CircleDashed} title={title} description={description} action={action} headingLevel={headingLevel} tone="insufficient" className={className}>
      {unique.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-left text-sm text-prism-ink-muted">
          {unique.map((r) => <li key={r}>{r}</li>)}
        </ul>
      )}
    </StateBlock>
  )
}

export default InsufficientEvidenceState
