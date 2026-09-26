import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { AppProviders } from '../app/providers/index.jsx'
import { createQueryClient } from '../app/providers/QueryProvider.jsx'

export function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

export function signIn(user = { name: 'Synthetic Student', email: 'synthetic@test.local', college: 'Synthetic', year: '4th Year' }, token = `test-token-${user.email}`) {
  localStorage.setItem('prism_token', token)
  localStorage.setItem('prism_user', JSON.stringify(user))
}

export function meBody({ flags = {}, workspaces, permissions = [] } = {}) {
  return {
    data: {
      user: { id: 'u-test', email: 'synthetic@test.local', name: 'Synthetic Student' },
      flags,
      permissions: { global: permissions },
      workspaces: workspaces || [{ id: 'personal', type: 'PERSONAL', name: 'Personal', organizationId: null, organizationName: null, visibilityPolicy: 'OWNER_ONLY' }],
    },
  }
}

// Routes fetch calls by URL prefix. The longest matching prefix wins, and an
// absolute URL matches on its path, so a broad `/api/` hang cannot swallow
// `/api/v1/me` (that left FlagRoute on "Loading" until the assertion timed out).
export function mockFetch(routes) {
  const entries = Object.entries(routes).sort((a, b) => b[0].length - a[0].length)
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const raw = String(url?.url || url)
    let path = raw
    try {
      const parsed = new URL(raw, 'http://test.local')
      path = `${parsed.pathname}${parsed.search}`
    } catch { /* already a path */ }
    for (const [prefix, handler] of entries) {
      if (raw.startsWith(prefix) || path.startsWith(prefix)) {
        return typeof handler === 'function' ? handler(raw) : jsonResponse(200, handler)
      }
    }
    throw new Error(`unexpected fetch ${raw}`)
  })
}

export function renderApp(ui, { route = '/' } = {}) {
  const queryClient = createQueryClient()
  return {
    queryClient,
    ...render(
      <MemoryRouter initialEntries={[route]}>
        <AppProviders queryClient={queryClient}>{ui}</AppProviders>
      </MemoryRouter>,
    ),
  }
}
