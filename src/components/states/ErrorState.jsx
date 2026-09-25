import { AlertTriangle } from 'lucide-react'
import { StateBlock } from './StateBlock.jsx'
import { Button } from '../ui/Button.jsx'

// Recoverable error. Shows the request id so support can trace it; never
// shows internal error details or substitutes invented content.
export function ErrorState({ title = 'Something went wrong', description = 'Please try again. If this keeps happening, contact support.', requestId, onRetry, action }) {
  return (
    <StateBlock
      role="alert"
      tone="blocked"
      icon={AlertTriangle}
      title={title}
      description={description}
      action={action || (onRetry ? <Button variant="secondary" onClick={() => onRetry()}>Try again</Button> : null)}
    >
      {requestId && <p className="mt-3 font-mono text-xs text-prism-ink-subtle">Reference: {requestId}</p>}
    </StateBlock>
  )
}

export default ErrorState
