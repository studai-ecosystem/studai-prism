import { useParams } from 'react-router-dom'
import { PageHeader } from '../../components/ui/PageHeader.jsx'
import { EmptyState } from '../../components/states/EmptyState.jsx'
import { LinkButton } from '../../components/ui/Button.jsx'
import { EMPTY_COPY } from '../../lib/copy/emptyStates.js'
import { fillPath, LEGACY_PARAM } from '../../app/routing.jsx'

// Shown when a V3 route is enabled before its phase ships its page. It links
// to the working legacy page (with the ?legacy=1 escape hatch so the legacy
// alias does not bounce back) instead of inventing content.
export default function NotYetAvailablePage({ title, legacyPattern }) {
  const params = useParams()
  const legacyTo = legacyPattern ? `${fillPath(legacyPattern, params)}?${LEGACY_PARAM}=1` : null
  return (
    <div>
      <PageHeader title={title} />
      <EmptyState
        title={EMPTY_COPY.notYetAvailable.title}
        description={EMPTY_COPY.notYetAvailable.description}
        action={legacyTo ? <LinkButton to={legacyTo} variant="primary">Open the current version</LinkButton> : null}
      />
    </div>
  )
}
