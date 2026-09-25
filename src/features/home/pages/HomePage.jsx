import { EmptySectionPage } from '../../shared/EmptySectionPage.jsx'
import { EMPTY_COPY, START_ASSESSMENT_PATH } from '../../../lib/copy/emptyStates.js'

export default function HomePage() {
  return (
    <EmptySectionPage
      title="Home"
      description="Your next step and a summary of your evidence."
      empty={EMPTY_COPY.home}
      action={{ to: START_ASSESSMENT_PATH, label: 'Start an assessment' }}
    />
  )
}
