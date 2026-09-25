import { EmptySectionPage } from '../../shared/EmptySectionPage.jsx'
import { EMPTY_COPY } from '../../../lib/copy/emptyStates.js'

export default function SharingPage() {
  return (
    <EmptySectionPage
      title="Sharing"
      description="Control who can see your results and for how long."
      empty={EMPTY_COPY.sharing}
    />
  )
}
