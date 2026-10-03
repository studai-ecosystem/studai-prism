// src/components/artifacts/ArtifactRenderer.jsx — renders a work material
// exactly as the server's session payload describes it. Only types with a
// data-driven component render; anything else is named as unavailable rather
// than filled with sample content (spec §12.2, §33). Saving goes through a
// `controller`: the V3 player passes its versioned store; without one the
// legacy workspace store is used (legacy /workspace route, unchanged).
import AnalyticsDashboard from './AnalyticsDashboard.jsx'
import CustomerTicketLog from './CustomerTicketLog.jsx'
import BudgetModeler from './BudgetModeler.jsx'
import PlanBoard from './PlanBoard.jsx'
import { ArtifactUnavailable } from './ArtifactUnavailable.jsx'
import { artifactStore } from '../../lib/artifactStore.js'

const COMPONENTS = {
  ANALYTICS_DASHBOARD: AnalyticsDashboard,
  CUSTOMER_TICKET_LOG: CustomerTicketLog,
  BUDGET_MODELER: BudgetModeler,
  PLAN_BOARD: PlanBoard,
}

export const isSupportedArtifactType = (type) => Object.prototype.hasOwnProperty.call(COMPONENTS, String(type || '').toUpperCase())

function legacyController(artifactId, sessionId) {
  return {
    autosave: false,
    onChange: (updates) => artifactStore.updateLocalArtifact(artifactId, updates),
    save: (notes) => artifactStore.persistArtifact(sessionId, artifactId, notes),
  }
}

export default function ArtifactRenderer({ artifact, sessionId, controller }) {
  const Component = COMPONENTS[String(artifact?.type || '').toUpperCase()]
  if (!Component || !artifact?.data) return <ArtifactUnavailable title={artifact?.title} />
  return (
    <Component
      artifactId={artifact.artifactId}
      title={artifact.title}
      data={artifact.data}
      schema={artifact.schema || null}
      controller={controller || legacyController(artifact.artifactId, sessionId)}
    />
  )
}
