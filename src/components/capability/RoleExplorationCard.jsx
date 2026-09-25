import { Card } from '../ui/Card.jsx'
import { Badge } from '../ui/Badge.jsx'

// Role exploration result (spec §18). Self-reported and demonstrated reasons
// are listed separately and labelled; what is unknown is always shown. No
// percentages, scores or "match".
export function RoleExplorationCard({ role, headingLevel = 3 }) {
  const H = `h${headingLevel}`
  return (
    <Card as="article" className="space-y-3 p-5">
      <H className="text-base font-semibold text-prism-ink">{role.title}</H>
      <div>
        <p className="text-sm font-semibold text-prism-ink">Why it appears</p>
        <ul className="mt-1 space-y-1 text-sm text-prism-ink">
          {role.selfReportedReasons.map((r) => (
            <li key={r} className="flex gap-2"><Badge tone="neutral">You said</Badge><span>{r}</span></li>
          ))}
          {role.demonstratedReasons.map((r) => (
            <li key={r} className="flex gap-2"><Badge tone="accent">Prism observed</Badge><span>{r}</span></li>
          ))}
        </ul>
      </div>
      {role.unknowns.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-prism-ink">What remains unknown</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-prism-ink-muted">
            {role.unknowns.map((u) => <li key={u}>{u}</li>)}
          </ul>
        </div>
      )}
      <p className="text-sm text-prism-ink"><span className="font-semibold">Next step: </span>{role.nextStep.label}</p>
    </Card>
  )
}

export default RoleExplorationCard
