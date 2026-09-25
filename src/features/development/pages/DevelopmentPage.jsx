import { EmptySectionPage } from '../../shared/EmptySectionPage.jsx'
import { EMPTY_COPY } from '../../../lib/copy/emptyStates.js'

export default function DevelopmentPage() {
  return (
    <EmptySectionPage
      title="Development"
      description="Practice missions linked to the priorities in your latest report."
      empty={EMPTY_COPY.development}
    />
  )
}
