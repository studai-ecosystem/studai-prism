// Home primary action (P3.3): one dominant CTA from the server read model.
// Every state names what is true now and offers only the allowed action.
// A technical failure leads with recovery and support; it never sells.
import { Link } from 'react-router-dom'
import { Card } from '../../../components/ui/Card.jsx'
import { LinkButton } from '../../../components/ui/Button.jsx'
import { Badge } from '../../../components/ui/Badge.jsx'
import { formatDate } from '../../student/QueryState.jsx'
import { PRIMARY_ACTION_COPY, SCOPE_LABEL } from '../../../lib/copy/student.js'

const ASSIGNMENT_KINDS = new Set(['ASSESSMENT_DUE', 'ASSESSMENT_IN_PROGRESS', 'ASSESSMENT_READY', 'REPORT_READY'])
const SESSION_KINDS = new Set(['ASSESSMENT_PROCESSING', 'ASSESSMENT_TECHNICAL_FAILED'])

export function NextActionCard({ action, sponsorName, historyTo }) {
  const copy = PRIMARY_ACTION_COPY[action.kind]
  const assignment = ASSIGNMENT_KINDS.has(action.kind)
  const session = SESSION_KINDS.has(action.kind)
  const failed = action.kind === 'ASSESSMENT_TECHNICAL_FAILED'
  const processing = action.kind === 'ASSESSMENT_PROCESSING'
  const due = formatDate(action.dueAt)
  const received = formatDate(action.completedAt)
  const title = assignment ? action.title : copy.title
  const to = processing ? historyTo : action.to
  return (
    <Card className="space-y-3 border-prism-accent-soft p-6" aria-labelledby="primary-action" data-testid="next-action" data-kind={action.kind}>
      <p className="text-xs font-semibold uppercase tracking-wide text-prism-accent-strong">{copy.eyebrow}</p>
      <h2 id="primary-action" className="text-xl font-semibold text-prism-ink">{title}</h2>
      {(assignment || session) && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-prism-ink-muted">
          {session && action.title && <span className="font-medium text-prism-ink">{action.title}</span>}
          {action.scope && <Badge tone={action.scope === 'SPONSORED' ? 'accent' : 'neutral'}>{action.scope === 'SPONSORED' ? SCOPE_LABEL.SPONSORED(sponsorName) : SCOPE_LABEL.PERSONAL}</Badge>}
          {due && <span>Due {due}</span>}
          {session && received && <span>Responses received {received}</span>}
        </div>
      )}
      {copy.description && <p className="max-w-2xl text-sm text-prism-ink-muted">{copy.description}</p>}
      <div className="flex flex-wrap items-center gap-3">
        {to && copy.cta && <LinkButton to={to} variant="primary">{copy.cta}</LinkButton>}
        {failed && (
          <LinkButton to="/contact" variant={to ? 'secondary' : 'primary'}>{copy.support}</LinkButton>
        )}
      </div>
      {failed && action.sessionId && (
        <p className="text-xs text-prism-ink-subtle">Reference: {action.sessionId}</p>
      )}
      {processing && (
        <p className="text-sm text-prism-ink-muted">
          You can also <Link to={historyTo} className="font-medium text-prism-accent-strong underline">see this assessment in History</Link>; its status updates there.
        </p>
      )}
    </Card>
  )
}

export default NextActionCard
