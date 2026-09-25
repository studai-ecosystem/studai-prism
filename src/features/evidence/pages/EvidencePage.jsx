import { EmptySectionPage } from '../../shared/EmptySectionPage.jsx'
import { EMPTY_COPY } from '../../../lib/copy/emptyStates.js'

export default function EvidencePage() {
  return (
    <EmptySectionPage
      title="Evidence"
      description="Observed actions from your assessments, kept separate from practice."
      empty={EMPTY_COPY.evidence}
    />
  )
}
