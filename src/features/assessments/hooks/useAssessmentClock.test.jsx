import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, renderHook, screen } from '@testing-library/react'
import { remainingAssessmentTime, useAssessmentClock } from './useAssessmentClock.js'
import { AssessmentHeader } from '../components/AssessmentHeader.jsx'
import { SessionContractSchema } from '../api/assessmentSessionApi.js'

const timing = {
  serverTime: '2026-10-02T10:00:00.000Z',
  startedAt: '2026-10-02T10:00:00.000Z',
  deadlineAt: '2026-10-02T10:30:00.000Z',
  remainingMs: 1800000,
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('server countdown presentation', () => {
  it('uses the supplied deadline without inventing or overriding a duration', () => {
    expect(remainingAssessmentTime(timing, 100, 100)).toBe(1800000)
    expect(remainingAssessmentTime({ ...timing, deadlineAt: '2026-10-02T10:35:00.000Z' }, 100, 100)).toBe(2100000)
    expect(remainingAssessmentTime(timing, 100, 60100)).toBe(1740000)
  })

  it('uses monotonic elapsed time, not the candidate device wall clock', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2050-01-01T00:00:00.000Z'))
    expect(remainingAssessmentTime(timing, 100, 60100)).toBe(1740000)
  })

  it('a rerender or remount keeps elapsed time from the original network receipt', () => {
    let now = 100
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const first = renderHook(() => useAssessmentClock(timing, 100))
    expect(first.result.current).toBe(1800000)
    now = 60100
    first.rerender()
    expect(first.result.current).toBe(1740000)
    first.unmount()
    const resumed = renderHook(() => useAssessmentClock(timing, 100))
    expect(resumed.result.current).toBe(1740000)
  })

  it('a refreshed server snapshot continues the same deadline instead of restarting', () => {
    vi.spyOn(performance, 'now').mockReturnValue(60100)
    const refreshed = { ...timing, serverTime: '2026-10-02T10:01:00.000Z', remainingMs: 1740000 }
    expect(remainingAssessmentTime(refreshed, 60100, 60100)).toBe(1740000)
    expect(remainingAssessmentTime(refreshed, 60100, 61100)).toBe(1739000)
  })

  it('ticks every second and stops at zero', () => {
    vi.useFakeTimers()
    let now = 100
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const clock = renderHook(() => useAssessmentClock(timing, 100))
    now += 1000
    act(() => vi.advanceTimersByTime(1000))
    expect(clock.result.current).toBe(1799000)
    now += 1800000
    act(() => vi.advanceTimersByTime(1000))
    expect(clock.result.current).toBe(0)
  })

  it('missing deadlines are untimed; invalid clock inputs fail explicitly', () => {
    expect(remainingAssessmentTime(null, undefined, 100)).toBeNull()
    expect(remainingAssessmentTime({ ...timing, deadlineAt: null }, 100, 100)).toBeNull()
    expect(() => remainingAssessmentTime(timing, undefined, 100)).toThrow('The assessment clock could not be read.')
    expect(() => remainingAssessmentTime({ ...timing, serverTime: 'invalid' }, 100, 100)).toThrow()
    const schema = SessionContractSchema.shape.timing
    expect(schema.safeParse({ ...timing, serverTime: 'invalid' }).success).toBe(false)
    expect(schema.safeParse({ ...timing, remainingMs: -1 }).success).toBe(false)
  })

  it.each([[1800000, '30:00'], [1799999, '30:00'], [1799000, '29:59'], [60000, '01:00'], [0, '00:00']])('formats %i milliseconds as %s', (ms, text) => {
    render(<AssessmentHeader title="Synthetic scenario" remainingMs={ms} />)
    expect(screen.getByRole('timer')).toHaveTextContent(text)
  })
})
