import { useEffect, useState } from 'react'

// Announced once each, politely, as the server clock passes them (P3.8).
// A milestone is used only when the run's policy is longer than it, so a
// short policy never opens with a "10 minutes left" warning.
export const TIME_WARNINGS = Object.freeze([{ ms: 10 * 60000, text: 'Less than 10 minutes left.' }, { ms: 5 * 60000, text: 'Less than 5 minutes left.' }, { ms: 60000, text: 'Less than 1 minute left.' }])
export function warningsForPolicy(policyDurationMs) {
  if (!Number.isFinite(policyDurationMs) || policyDurationMs <= 0) return TIME_WARNINGS
  return TIME_WARNINGS.filter((w) => policyDurationMs > w.ms)
}

export function remainingAssessmentTime(timing, receivedAt, now) {
  if (!timing?.deadlineAt) return null
  const serverTime = Date.parse(timing.serverTime)
  const deadline = Date.parse(timing.deadlineAt)
  if (![serverTime, deadline, receivedAt, now].every(Number.isFinite)) {
    throw new Error('The assessment clock could not be read.')
  }
  return Math.max(0, deadline - serverTime - Math.max(0, now - receivedAt))
}

export function useAssessmentClock(timing, receivedAt) {
  const [, setTick] = useState(0)
  const running = Boolean(timing?.deadlineAt)
  useEffect(() => {
    if (!running) return undefined
    const timer = setInterval(() => setTick((tick) => tick + 1), 1000)
    return () => clearInterval(timer)
  }, [running])
  return remainingAssessmentTime(timing, receivedAt, performance.now())
}
