import { useEffect, useRef, useState } from 'react'
import { loadFaceModels, analyzeFrame } from '../lib/faceProctor.js'

// Drives the live face-proctoring loop for the assessment. Given the webcam
// <video> ref and whether proctoring is active, it periodically analyses frames
// and surfaces a human-readable status plus debounced violation events.
//
//   status: 'idle' | 'loading' | 'ok' | 'no-face' | 'multiple-faces'
//           | 'looking-away' | 'unavailable'
//
// Events are reported via onEvent(type, meta) only after a condition persists
// for a few ticks, and are throttled so the log isn't spammed. Types:
//   'face_absent' | 'multiple_faces' | 'looking_away'

const TICK_MS = 1500
const PERSIST_TICKS = 2          // condition must hold this many ticks to count
const EVENT_THROTTLE_MS = 15000  // min gap between repeat events of one type

export function useFaceProctor({ videoRef, active, onEvent }) {
  const [status, setStatus] = useState('idle')
  const [faceCount, setFaceCount] = useState(null)

  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  const streakRef = useRef({ absent: 0, multiple: 0, away: 0 })
  const lastEventAtRef = useRef({ face_absent: 0, multiple_faces: 0, looking_away: 0 })

  useEffect(() => {
    if (!active) {
      setStatus('idle')
      return undefined
    }

    let cancelled = false
    let timer = null

    const fireThrottled = (type, meta) => {
      const now = Date.now()
      if (now - (lastEventAtRef.current[type] || 0) < EVENT_THROTTLE_MS) return
      lastEventAtRef.current[type] = now
      try { onEventRef.current?.(type, meta) } catch { /* ignore */ }
    }

    const tick = async () => {
      if (cancelled) return
      try {
        const result = await analyzeFrame(videoRef.current)
        if (cancelled) return
        if (result) {
          const { faces, lookingAway } = result
          setFaceCount(faces)
          const s = streakRef.current

          if (faces === 0) {
            s.absent += 1; s.multiple = 0; s.away = 0
            if (s.absent >= PERSIST_TICKS) {
              setStatus('no-face')
              fireThrottled('face_absent', { ticks: s.absent })
            }
          } else if (faces > 1) {
            s.multiple += 1; s.absent = 0; s.away = 0
            if (s.multiple >= PERSIST_TICKS) {
              setStatus('multiple-faces')
              fireThrottled('multiple_faces', { faces })
            }
          } else if (lookingAway) {
            s.away += 1; s.absent = 0; s.multiple = 0
            if (s.away >= PERSIST_TICKS) {
              setStatus('looking-away')
              fireThrottled('looking_away', { ticks: s.away })
            }
          } else {
            s.absent = 0; s.multiple = 0; s.away = 0
            setStatus('ok')
          }
        }
      } catch {
        // A single failed frame is not fatal — keep looping.
      } finally {
        if (!cancelled) timer = setTimeout(tick, TICK_MS)
      }
    }

    setStatus('loading')
    loadFaceModels()
      .then(() => {
        if (cancelled) return
        setStatus('ok')
        timer = setTimeout(tick, TICK_MS)
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable')
      })

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [active, videoRef])

  return { status, faceCount }
}
