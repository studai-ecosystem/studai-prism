import { describe, it, expect } from 'vitest'
import { parseAuthDestination, accountDestination } from './authDestination.js'

describe('approved sign-in destinations', () => {
  it.each([
    '/app', '/app/settings#profile', '/app/assessments/assignment-1/briefing?ws=campus',
    '/app/reports/session-1?version=2', '/app/campus-invite/invite-token',
    '/app/campus/org-1/assignments/assignment-1/system-check',
    '/campus/org-1/students/student-1', '/score?session=legacy-session',
    '/report/legacy-session/v2', '/payment', '/invite/invite-token', '/profile',
  ])('preserves the safe path and its query/fragment: %s', (next) => {
    expect(parseAuthDestination(`?next=${encodeURIComponent(next)}`)).toEqual({ next, invalid: false })
  })

  it.each([
    'https://external.test', '//external.test', '/\\external.test', '/login', '/register',
    '/api/assessment/report/secret', '/admin', '/unknown', '',
    '/app/%2e%2e/admin', '/app/%252e%252e/admin', '/app/settings%0a',
    '/app/campus-invite/%', '/app/campus-invite/token%2Fother',
  ])('rejects unsafe, malformed or unsupported destinations: %s', (next) => {
    expect(parseAuthDestination(`?next=${encodeURIComponent(next)}`)).toEqual({ next: null, invalid: true })
  })

  it('distinguishes missing input and preserves invitation priority without path injection', () => {
    expect(parseAuthDestination('')).toEqual({ next: null, invalid: false })
    expect(accountDestination('/app/settings#profile', 'old-invite')).toBe('/app/settings#profile')
    expect(accountDestination(null, 'invite/with?syntax')).toBe('/invite/invite%2Fwith%3Fsyntax')
    expect(accountDestination(null, null)).toBe('/app')
  })
})
