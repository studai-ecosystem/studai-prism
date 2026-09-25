// src/components/artifacts/ArtifactRenderer.jsx — renders a work material
// exactly as the server's session payload describes it. Only types with a
// data-driven component render; anything else is named as unavailable rather
// than filled with sample content (spec §12.2, §33; data-driven primitives
// for every type arrive with Workspace V3, C5.09).
import AnalyticsDashboard from './AnalyticsDashboard.jsx'
import CustomerTicketLog from './CustomerTicketLog.jsx'
import BudgetModeler from './BudgetModeler.jsx'
import { ArtifactUnavailable } from './ArtifactUnavailable.jsx'

const COMPONENTS = {
  ANALYTICS_DASHBOARD: AnalyticsDashboard,
  CUSTOMER_TICKET_LOG: CustomerTicketLog,
  BUDGET_MODELER: BudgetModeler,
}

export default function ArtifactRenderer({ artifact, sessionId }) {
  const Component = COMPONENTS[String(artifact?.type || '').toUpperCase()]
  if (!Component || !artifact?.data) return <ArtifactUnavailable title={artifact?.title} />
  return <Component artifactId={artifact.artifactId} title={artifact.title} data={artifact.data} sessionId={sessionId} />
}
