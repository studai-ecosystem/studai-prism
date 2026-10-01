import { ExpiredEntitlementState } from '../../components/states/ExpiredEntitlementState.jsx'
import { Skeleton } from '../../components/ui/Skeleton.jsx'

// Renders the expired state when the server-reported entitlement has ended.
// `entitlement` is the server's summary: { status: 'ACTIVE' | 'EXPIRED' | 'EXHAUSTED' | 'NONE' }.
// An unknown (not yet loaded) entitlement renders a loading state, never the children.
export function EntitlementGuard({ entitlement, children, noneFallback = null }) {
  const status = entitlement?.status
  if (!status) return <Skeleton label="Checking access" />
  if (status === 'ACTIVE') return children
  if (status === 'NONE' && noneFallback) return noneFallback
  return <ExpiredEntitlementState />
}

export default EntitlementGuard
