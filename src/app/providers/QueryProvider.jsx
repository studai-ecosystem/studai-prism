import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Network retries live in src/api/client.js (safe methods only), so React
// Query does not retry on top of them. Sensitive data is never persisted.
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false, networkMode: 'online' },
      mutations: { retry: false, networkMode: 'online' },
    },
  })
}

export function QueryProvider({ client, children }) {
  const [qc] = useState(() => client || createQueryClient())
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

export default QueryProvider
