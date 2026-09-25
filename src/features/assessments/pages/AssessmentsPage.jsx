import { EmptySectionPage } from '../../shared/EmptySectionPage.jsx'
import { EMPTY_COPY, START_ASSESSMENT_PATH } from '../../../lib/copy/emptyStates.js'

export default function AssessmentsPage() {
  return (
    <EmptySectionPage
      title="Assessments"
      description="Assessments you can take, are taking, or have completed."
      empty={EMPTY_COPY.assessments}
      action={{ to: START_ASSESSMENT_PATH, label: 'Start an assessment' }}
    />
  )
}
