// PROD-READY Phase 1S (N4): the desktop side of the phone-proctor socket
// presents the signed-in owner's token; the phone never sends one (the issued
// pairing code is its only credential).
import { describe, it, expect, vi, afterEach } from 'vitest'

const ioMock = vi.fn(() => ({ on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }))
vi.mock('socket.io-client', () => ({ io: (...args) => ioMock(...args) }))

const { connectProctor } = await import('./proctorLink.js')

afterEach(() => {
  ioMock.mockClear()
  localStorage.clear()
})

describe('proctor socket handshake', () => {
  it('sends the owner token for the desktop role', () => {
    localStorage.setItem('prism_token', 'synthetic-owner-token')
    connectProctor({ pairCode: 'ABCDEF', role: 'desktop', sessionId: 's-1' })
    const [, options] = ioMock.mock.calls[0]
    expect(options.path).toBe('/proctor-socket')
    expect(options.query).toEqual({ pairCode: 'ABCDEF', role: 'desktop', sessionId: 's-1' })
    expect(options.auth).toEqual({ token: 'synthetic-owner-token' })
  })

  it('never sends a token for the phone role', () => {
    localStorage.setItem('prism_token', 'synthetic-owner-token')
    connectProctor({ pairCode: 'ABCDEF', role: 'phone' })
    expect(ioMock.mock.calls[0][1].auth).toEqual({})
  })
})
