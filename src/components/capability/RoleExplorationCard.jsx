import { Link } from 'react-router-dom'
import { Card } from '../ui/Card.jsx'
import { Badge } from '../ui/Badge.jsx'
import { LinkButton } from '../ui/Button.jsx'

// Role exploration result (spec 18). What you said you enjoy and what Prism
// observed are two separate blocks, each labelled; what is unknown is always
// shown. A role is something to explore, never a verdict: no percentages,
// scores, rankings or "match".
export function RoleExplorationCard({ role, headingLevel = 3, assessmentsPath = '/app/assessments', developmentPath = '/app/development' }) {
  const H = `h${headingLevel}`
  return (
    <Card as="article" className="space-y-4 p-5" data-testid="role-card">
      <H className="text-base font-semibold text-prism-ink">{role.title}</H>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 rounded-[var(--prism-radius-md)] border border-dashed border-prism-border-strong p-3" data-testid="role-interest">
          <p className="text-xs font-semibold uppercase tracking-wide text-prism-ink-subtle">From what you told us</p>
          {role.selfReportedReasons.length === 0
            ? <p className="text-sm text-prism-ink-muted">No interest you chose points to this role.</p>
            : <ul className="space-y-1 text-sm text-prism-ink">{role.selfReportedReasons.map((r) => <li key={r} className="flex flex-col items-start gap-1"><Badge tone="neutral" className="whitespace-nowrap">You said</Badge><span>{r}</span></li>)}</ul>}
        </div>
        <div className="space-y-1 rounded-[var(--prism-radius-md)] border border-prism-border p-3" data-testid="role-evidence">
          <p className="text-xs font-semibold uppercase tracking-wide text-prism-ink-subtle">From your assessments</p>
          {role.demonstratedReasons.length === 0
            ? <p className="text-sm text-prism-ink-muted">No formal evidence connects to this role yet.</p>
            : <ul className="space-y-1 text-sm text-prism-ink">{role.demonstratedReasons.map((r) => <li key={r} className="flex flex-col items-start gap-1"><Badge tone="accent" className="whitespace-nowrap">Prism observed</Badge><span>{r}</span></li>)}</ul>}
        </div>
      </div>
      {role.unknowns.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-prism-ink">What remains unknown</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-prism-ink-muted">
            {role.unknowns.map((u) => <li key={u}>{u}</li>)}
          </ul>
        </div>
      )}
      <div className="space-y-2">
        <p className="text-sm text-prism-ink"><span className="font-semibold">Next step: </span>{role.nextStep.label}</p>
        <div className="flex flex-wrap items-center gap-3">
          {role.nextStep.type === 'FORMAL_ASSESSMENT' && <LinkButton to={assessmentsPath} variant="secondary" size="sm">Go to assessments</LinkButton>}
          <Link to={developmentPath} className="inline-flex min-h-6 items-center text-sm font-medium text-prism-accent-strong underline">Practise in Development<span className="sr-only"> (not specific to {role.title})</span></Link>
        </div>
      </div>
    </Card>
  )
}

export default RoleExplorationCard