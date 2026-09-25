import { EmptySectionPage } from '../../shared/EmptySectionPage.jsx'
import { EMPTY_COPY } from '../../../lib/copy/emptyStates.js'

export default function GrowthPage() {
  return (
    <EmptySectionPage
      title="Growth"
      description="Change between comparable assessments over time."
      empty={EMPTY_COPY.growth}
    />
  )
}
