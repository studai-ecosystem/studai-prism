import { QueryProvider } from './QueryProvider.jsx'
import { AuthProvider } from './AuthProvider.jsx'
import { FeatureFlagProvider } from './FeatureFlagProvider.jsx'
import { WorkspaceProvider } from './WorkspaceProvider.jsx'
import { ToastProvider } from '../../components/ui/Toast.jsx'

export function AppProviders({ queryClient, children }) {
  return (
    <QueryProvider client={queryClient}>
      <AuthProvider>
        <FeatureFlagProvider>
          <WorkspaceProvider>
            <ToastProvider>{children}</ToastProvider>
          </WorkspaceProvider>
        </FeatureFlagProvider>
      </AuthProvider>
    </QueryProvider>
  )
}

export default AppProviders
