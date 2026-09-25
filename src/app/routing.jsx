import { Navigate, useParams, useLocation } from 'react-router-dom'
import { useFlag, useFeatureFlags } from './providers/FeatureFlagProvider.jsx'
import { Skeleton } from '../components/ui/Skeleton.jsx'
import { ErrorState } from '../components/states/ErrorState.jsx'
import { DocumentTitle } from '../components/ui/DocumentTitle.jsx'

const SHELL_FLAG = 'PRISM_APP_SHELL_V3'

// A V3 surface is live only when its own flag is on AND, for pages that live
// inside the new shell, the shell flag is on too. Legacy aliases and V3 routes
// share this predicate so no flag combination can bounce between them.
export function useV3Enabled(flag, { requiresShell = false } = {}) {
  const own = useFlag(flag)
  const shell = useFlag(SHELL_FLAG)
  return {
    enabled: own.enabled && (!requiresShell || shell.enabled),
    loading: own.loading || (requiresShell && shell.loading),
  }
}

// Renders `on` when enabled, `off` otherwise. While flags load a skeleton
// shows. `onError="error"` renders a retryable error instead of silently
// falling back when the flag source (GET /api/v1/me) fails.
export function FlagRoute({ flag, on, off, requiresShell = false, onError = 'off' }) {
  const { enabled, loading } = useV3Enabled(flag, { requiresShell })
  const { error, refetch } = useFeatureFlags()
  if (loading) return <><DocumentTitle title="Loading" /><Skeleton variant="page" label="Loading" /></>
  if (error && error.code !== 'UNAUTHENTICATED' && onError === 'error') {
    return (
      <div className="prism-app px-4 py-10">
        <DocumentTitle title="Workspace unavailable" />
        <ErrorState title="We could not load your workspace" requestId={error.requestId} onRetry={() => refetch()} />
      </div>
    )
  }
  return enabled ? on : off
}

// Builds a path from route params, e.g. '/app/assessment/:sessionId'.
export function fillPath(pattern, params) {
  return pattern.replace(/:([A-Za-z]+)/g, (_, k) => encodeURIComponent(params[k] ?? ''))
}

// Navigate to `to` (a pattern using the current params), keeping the query string.
export function ParamRedirect({ to, dropLegacyParam = false }) {
  const params = useParams()
  const { search } = useLocation()
  const qs = new URLSearchParams(search)
  if (dropLegacyParam) qs.delete('legacy')
  const s = qs.toString()
  return <Navigate to={`${fillPath(to, params)}${s ? `?${s}` : ''}`} replace />
}

export const LEGACY_PARAM = 'legacy'

// Legacy ↔ V3 compatibility (spec §6.5). The legacy URL moves to the V3 URL
// only when the V3 surface is live; `?legacy=1` always keeps the legacy page
// reachable (the escape hatch the V3 page links to).
export function LegacyAlias({ flag, v3Path, legacy, requiresShell = false }) {
  const { search } = useLocation()
  if (new URLSearchParams(search).get(LEGACY_PARAM) === '1') return legacy
  return <FlagRoute flag={flag} requiresShell={requiresShell} on={<ParamRedirect to={v3Path} />} off={legacy} />
}

// The V3 URL renders its page only when live; otherwise it resolves to the
// legacy page, preserving params.
export function V3Route({ flag, legacyPath, page, requiresShell = false }) {
  return <FlagRoute flag={flag} requiresShell={requiresShell} onError="error" on={page} off={<ParamRedirect to={legacyPath} dropLegacyParam />} />
}
