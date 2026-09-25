import { EmptySectionPage } from '../../shared/EmptySectionPage.jsx'
import { EMPTY_COPY, START_ASSESSMENT_PATH } from '../../../lib/copy/emptyStates.js'

export default function CapabilitiesPage() {
  return (
    <EmptySectionPage
      title="My Capabilities"
      description="What your formal assessments show about how you work, with the evidence behind each conclusion."
      empty={EMPTY_COPY.capabilities}
      action={{ to: START_ASSESSMENT_PATH, label: 'Start an assessment' }}
    />
  )
}
