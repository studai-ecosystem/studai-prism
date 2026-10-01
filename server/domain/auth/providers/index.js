// Sign-in providers (spec §50 P11 "SSO-ready architecture"; C11.04).
//
// Interface: { id, kind, status(): 'ENABLED' | 'NOT_CONFIGURED', begin(ctx), complete(ctx) }
//   - password: the existing email + password sign-in (/api/auth/login and
//     /api/auth/register, JWT with token version). Its routes are unchanged;
//     begin() tells a client where that flow lives.
//   - sso: an interface only. There is no live single sign-on; begin() and
//     complete() fail with NOT_IMPLEMENTED (HTTP 501) until an institution's
//     identity provider is configured by a human (HA-C011).
// Whatever the provider, the result must be the same Prism identity (one
// user per verified email) — providers never create a second account.
import { ApiError } from '../../http/errors.js'

export const passwordProvider = Object.freeze({
  id: 'password',
  kind: 'PASSWORD',
  name: 'Email and password',
  status: () => 'ENABLED',
  begin: () => ({ method: 'PASSWORD', loginPath: '/api/auth/login', registerPath: '/api/auth/register' }),
  complete: () => { throw new ApiError('NOT_IMPLEMENTED', 'Password sign-in completes at /api/auth/login.') },
})

export const ssoProvider = Object.freeze({
  id: 'sso',
  kind: 'SSO',
  name: 'Single sign-on',
  status: () => 'NOT_CONFIGURED',
  begin: () => { throw new ApiError('NOT_IMPLEMENTED', 'Single sign-on is not available yet. Sign in with your email and password.') },
  complete: () => { throw new ApiError('NOT_IMPLEMENTED', 'Single sign-on is not available yet. Sign in with your email and password.') },
})

const PROVIDERS = [passwordProvider, ssoProvider]

export function listAuthProviders() {
  return PROVIDERS.map((p) => ({ id: p.id, kind: p.kind, name: p.name, status: p.status() }))
}

export function getAuthProvider(id) {
  return PROVIDERS.find((p) => p.id === id) || null
}
