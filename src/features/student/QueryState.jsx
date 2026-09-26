// Standard page-body states for student read models (spec §40, §52):
// loading, unauthorized, expired entitlement, offline, temporarily
// unavailable, error. Pages render their PageHeader in every state so each
// route always has an h1 (focus + announcement) and this body below it.
import { Skeleton } from '../../components/ui/Skeleton.jsx'
import { ErrorState, UnauthorizedState, ExpiredEntitlementState } from '../../components/states/index.js'

export function queryStateView(query, { label = 'Loading', homeTo = '/app/home', notFound = null } = {}) {
  // React Query pauses fetches while offline: say so instead of loading forever.
  if (query.isPending && query.fetchStatus === 'paused') {
    return <ErrorState title="You appear to be offline" description="This page will load when your connection is back. Nothing you have done is lost." onRetry={() => query.refetch()} />
  }
  if (query.isPending) return <Skeleton label={label} lines={6} />
  const err = query.error
  if (!err) return null
  if (err.code === 'FORBIDDEN' || err.code === 'NOT_FOUND' || err.status === 404) return <UnauthorizedState homeTo={homeTo} {...(notFound || {})} />
  if (err.code === 'ENTITLEMENT_EXPIRED') return <ExpiredEntitlementState />
  if (err.code === 'NETWORK_ERROR') {
    return <ErrorState title="You appear to be offline" description="Check your connection. Nothing you have done is lost." onRetry={() => query.refetch()} />
  }
  if (err.code === 'CAMPUS_STORE_UNAVAILABLE') {
    return <ErrorState title="This is temporarily unavailable" description="Please try again in a few minutes." requestId={err.requestId} onRetry={() => query.refetch()} />
  }
  return <ErrorState title="We could not load this page" requestId={err.requestId} onRetry={() => query.refetch()} />
}

// Absolute dates only (no relative "3 days ago" that goes stale in a printout).
// A date-only value ("YYYY-MM-DD") is a calendar day, not an instant: it is
// formatted in UTC so no browser time zone moves it to the day before.
export function formatDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const dateOnly = typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso)
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', ...(dateOnly ? { timeZone: 'UTC' } : {}) })
}
