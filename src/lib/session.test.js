import { describe, it, expect, vi } from 'vitest'
import { login, fetchMe, updateProfile, clearUser, getToken, clearSessionArtifacts } from './session.js'

const user = (email) => ({ name: 'Synthetic user', email, college: '', year: '' })
const reply = (status, body) => new Response(JSON.stringify(body), { status })

describe('account-bound session updates', () => {
  it('logout removes only known candidate drafts/preferences and workspace, preserving invitation context', () => {
    localStorage.setItem('prism_token', 'synthetic-token')
    localStorage.setItem('prism_user', JSON.stringify(user('a@test.local')))
    localStorage.setItem('prismUserName', 'Synthetic name')
    sessionStorage.setItem('prism.draft.synthetic-session', 'Synthetic draft')
    sessionStorage.setItem('prism.pending.synthetic-session', 'Synthetic pending input')
    sessionStorage.setItem('prismActiveWorkspace', 'synthetic-campus')
    sessionStorage.setItem('prismInviteToken', 'synthetic-invite')
    sessionStorage.setItem('unrelated-key', 'keep')
    clearUser()
    expect(getToken()).toBeNull()
    expect(localStorage.getItem('prismUserName')).toBeNull()
    expect(sessionStorage.getItem('prism.draft.synthetic-session')).toBeNull()
    expect(sessionStorage.getItem('prism.pending.synthetic-session')).toBeNull()
    expect(sessionStorage.getItem('prismActiveWorkspace')).toBeNull()
    expect(sessionStorage.getItem('prismInviteToken')).toBe('synthetic-invite')
    expect(sessionStorage.getItem('unrelated-key')).toBe('keep')
  })

  it('a late old-account 401 cannot clear a replacement session', async () => {
    localStorage.setItem('prism_token', 'old-token')
    localStorage.setItem('prism_user', JSON.stringify(user('a@test.local')))
    let finish
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const old = fetchMe()
    const rejected = expect(old).rejects.toThrow('Your account changed')
    localStorage.setItem('prism_token', 'new-token')
    localStorage.setItem('prism_user', JSON.stringify(user('b@test.local')))
    finish(reply(401, { error: 'expired' }))
    await rejected
    expect(getToken()).toBe('new-token')
  })

  it('an old profile response cannot overwrite the new account', async () => {
    localStorage.setItem('prism_token', 'old-token')
    localStorage.setItem('prism_user', JSON.stringify(user('a@test.local')))
    let finish
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const old = updateProfile({ name: 'Old account name' })
    const rejected = expect(old).rejects.toThrow('Your account changed')
    localStorage.setItem('prism_token', 'new-token')
    localStorage.setItem('prism_user', JSON.stringify(user('b@test.local')))
    finish(reply(200, { user: user('a@test.local') }))
    await rejected
    expect(JSON.parse(localStorage.getItem('prism_user')).email).toBe('b@test.local')
  })

  it('logout invalidates an in-flight login instead of silently signing back in', async () => {
    let finish
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const pending = login({ email: 'a@test.local', password: 'synthetic-password' })
    const rejected = expect(pending).rejects.toThrow('Your account changed')
    clearUser()
    finish(reply(200, { token: 'late-token', user: user('a@test.local') }))
    await rejected
    expect(getToken()).toBeNull()
  })

  it('account refresh preserves same-owner drafts and surfaces service failure without clearing the account', async () => {
    localStorage.setItem('prism_token', 'same-token')
    localStorage.setItem('prism_user', JSON.stringify(user('a@test.local')))
    sessionStorage.setItem('prism.draft.synthetic-session', 'Synthetic draft')
    const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(reply(200, { user: user('a@test.local') })).mockResolvedValueOnce(reply(503, { error: 'unavailable' }))
    await fetchMe()
    expect(sessionStorage.getItem('prism.draft.synthetic-session')).toBe('Synthetic draft')
    await expect(fetchMe()).rejects.toThrow('Your account could not be loaded')
    expect(getToken()).toBe('same-token')
    expect(mock).toHaveBeenCalledTimes(2)
    clearSessionArtifacts()
  })
})
