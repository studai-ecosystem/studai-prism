import { useEffect, useState } from 'react'

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
