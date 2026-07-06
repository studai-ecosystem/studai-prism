import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  User, ScanLine, Monitor, Keyboard, Ear, Users,
  Check, Smartphone, ShieldCheck, ArrowRight, Loader2, RefreshCw,
} from 'lucide-react'
import { startProctorSession, subscribeProctor, recallPairCode } from '../lib/proctorLink.js'
import { getToken } from '../lib/session.js'
import { loadFaceModels, countFacesInImage } from '../lib/faceProctor.js'
import PrismLogo from '../components/ui/PrismLogo.jsx'

// Step 3 of the proctored flow (Duolingo-style environment scan). With the phone
// already linked as a moving camera, we walk the candidate through showing their
// face, their whole room, their desk, under the keyboard, their ears (no
// earphones) and confirming they are alone. Each step captures a LOCAL thumbnail
// from the live phone feed for the candidate's confidence — frames are never
// uploaded or persisted; only the fact that the scan completed is recorded.

const STEPS = [
  {
    id: 'face',
    icon: User,
    title: 'Show your face',
    instruction: 'Hold the phone so your full face is clearly visible and well-lit.',
    hint: 'Look straight at the camera. No hats, masks or sunglasses.',
  },
  {
    id: 'room',
    icon: ScanLine,
    title: 'Scan your whole room',
    instruction: 'Slowly turn the phone 360° to show the entire room around you.',
    hint: 'Go slow so the camera captures every wall, door and corner.',
  },
  {
    id: 'desk',
    icon: Monitor,
    title: 'Show your desk',
    instruction: 'Point the camera at your desk surface. Clear away books, papers and extra devices.',
    hint: 'Only your computer should remain on the desk.',
  },
  {
    id: 'keyboard',
    icon: Keyboard,
    title: 'Under your keyboard',
    instruction: 'Show under your desk and around your keyboard, including your lap.',
    hint: 'No phones, notes or second devices hidden nearby.',
  },
  {
    id: 'ears',
    icon: Ear,
    title: 'Show both ears',
    instruction: 'Turn your head side to side to show both ears.',
    hint: 'Remove any earphones, headphones or earbuds.',
  },
  {
    id: 'alone',
    icon: Users,
    title: 'Confirm you are alone',
    instruction: 'Show the doorway and confirm nobody else is in the room with you.',
    hint: 'You must take the test alone and undisturbed.',
  },
]

// Each step must be held on the live camera for this long before it can be
// confirmed — this stops the candidate clicking straight through without ever
// pointing the camera at anything.
const REQUIRED_HOLD_MS = 4000
// If no new phone frame has arrived within this window, the camera is treated
// as frozen/covered and the hold timer pauses.
const FRAME_STALE_MS = 1500
// Steps where a real face must be visible in the phone frame to continue.
const FACE_STEPS = new Set(['face', 'ears'])

export default function RoomScan() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const sessionId = params.get('session')
  const pairCode = recallPairCode(sessionId)
  const phoneRequired = Boolean(pairCode)

  const [done, setDone] = useState([]) // captured thumbnail dataUrls per completed step index
  const [phoneLinked, setPhoneLinked] = useState(false)
  const [saving, setSaving] = useState(false)
  // Per-step gating: how long the live camera has been held, and (for face
  // steps) whether a face has actually been detected in the phone frame.
  const [holdMs, setHoldMs] = useState(0)
  const [faceSeen, setFaceSeen] = useState(false)
  // The visible step is derived from how many steps are done — this avoids a
  // separate `current` index drifting out of sync with `done`.
  const current = Math.min(done.length, STEPS.length - 1)

  const liveImgRef = useRef(null)
  const latestFrameRef = useRef(null)
  const lastFrameAtRef = useRef(0)
  const modelsReadyRef = useRef(false)

  // Mirror the persistent phone-proctor session into the live preview.
  useEffect(() => {
    if (!pairCode) return undefined
    startProctorSession({ pairCode, sessionId })
    const unsubscribe = subscribeProctor((evt, payload) => {
      if (evt === 'linked') setPhoneLinked(payload.linked)
      else if (evt === 'frame') {
        setPhoneLinked(true)
        latestFrameRef.current = payload.dataUrl
        lastFrameAtRef.current = Date.now()
        if (liveImgRef.current) liveImgRef.current.src = payload.dataUrl
      }
    })
    return unsubscribe
  }, [pairCode, sessionId])

  // Lazily load the face-detection models so the face steps can be verified.
  useEffect(() => {
    if (!phoneRequired) return
    loadFaceModels()
      .then(() => { modelsReadyRef.current = true })
      .catch(() => { modelsReadyRef.current = false })
  }, [phoneRequired])

  const total = STEPS.length
  const completedCount = done.length
  const allComplete = completedCount >= total
  const step = STEPS[current]
  const stepNeedsFace = !allComplete && FACE_STEPS.has(step.id)

  // Reset the per-step gates whenever the candidate moves to a new step.
  useEffect(() => {
    setHoldMs(0)
    setFaceSeen(false)
  }, [current])

  // Drive the hold timer + face detection while a step is active. The timer
  // only advances while the camera is actually live (recent frames arriving),
  // so a frozen or pocketed phone will not pass.
  useEffect(() => {
    if (allComplete) return undefined
    const TICK = 500
    const id = setInterval(async () => {
      const cameraLive = !phoneRequired || Date.now() - lastFrameAtRef.current < FRAME_STALE_MS
      if (cameraLive) setHoldMs((m) => Math.min(m + TICK, REQUIRED_HOLD_MS))
      if (stepNeedsFace && phoneRequired && modelsReadyRef.current && liveImgRef.current && !faceSeen) {
        const faces = await countFacesInImage(liveImgRef.current)
        if (typeof faces === 'number' && faces >= 1) setFaceSeen(true)
      }
    }, TICK)
    return () => clearInterval(id)
  }, [current, allComplete, stepNeedsFace, phoneRequired, faceSeen])

  const confirmStep = useCallback(() => {
    setDone((prev) => (prev.length >= STEPS.length ? prev : [...prev, latestFrameRef.current || null]))
  }, [])

  const goBack = useCallback(() => {
    setDone((prev) => prev.slice(0, -1))
  }, [])

  const finish = useCallback(async () => {
    setSaving(true)
    try {
      if (sessionId) {
        await fetch('/api/assessment/event', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
          },
          body: JSON.stringify({
            sessionId,
            type: 'room_scan_complete',
            meta: { steps: STEPS.map((s) => s.id), phoneUsed: phoneRequired, at: Date.now() },
          }),
        }).catch(() => {})
      }
    } finally {
      navigate(`/briefing?session=${sessionId}`)
    }
  }, [sessionId, phoneRequired, navigate])

  if (!sessionId) {
    navigate('/')
    return null
  }

  const StepIcon = step.icon
  const phoneOk = !phoneRequired || phoneLinked
  const holdDone = holdMs >= REQUIRED_HOLD_MS
  const faceNeeded = phoneRequired && stepNeedsFace
  const faceReady = !faceNeeded || faceSeen
  const canConfirm = phoneOk && holdDone && faceReady
  const holdSecondsLeft = Math.ceil((REQUIRED_HOLD_MS - holdMs) / 1000)

  return (
    <div className="min-h-screen bg-white text-[var(--color-ink)] flex flex-col">
      <header className="shrink-0 flex items-center px-6 h-16 border-b border-[var(--color-line)]">
        <Link to="/" aria-label="Prism home">
          <PrismLogo size={32} />
        </Link>
      </header>

      <div className="flex-1 flex items-start justify-center px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-4xl"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-accent)]/12 text-[var(--color-accent)]">
              <ScanLine size={22} />
            </div>
            <div>
              <h1 className="font-serif text-2xl font-bold text-[var(--color-ink)]">Environment check</h1>
              <p className="font-sans text-sm text-[var(--color-ink-muted)]">
                Use your phone camera to show your surroundings before the test begins.
              </p>
            </div>
          </div>

          {/* Progress */}
          <div className="mt-6 flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div
                key={s.id}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i < completedCount ? 'bg-[var(--color-accent)]' : i === current ? 'bg-[var(--color-accent)]/40' : 'bg-[var(--color-line)]'
                }`}
              />
            ))}
          </div>
          <p className="mt-2 font-sans text-xs text-[var(--color-ink-muted)]">
            Step {Math.min(completedCount + (allComplete ? 0 : 1), total)} of {total}
          </p>

          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Live phone preview */}
            <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-sans text-sm font-semibold text-[var(--color-ink)]">Phone camera</h2>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    phoneLinked || !phoneRequired ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  <Smartphone size={13} />
                  {phoneRequired ? (phoneLinked ? 'Live' : 'Offline') : 'Optional'}
                </span>
              </div>

              <div className="mt-4 flex aspect-[3/4] items-center justify-center overflow-hidden rounded-xl bg-[var(--color-ink)]">
                {phoneRequired ? (
                  <>
                    {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
                    <img
                      ref={liveImgRef}
                      alt="Live phone camera"
                      className={`h-full w-full object-cover ${phoneLinked ? 'block' : 'hidden'}`}
                    />
                    {!phoneLinked && (
                      <div className="flex flex-col items-center gap-2 text-[var(--color-ink-muted)]">
                        <Smartphone size={28} />
                        <p className="font-sans text-xs">Reconnect your phone to continue</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 px-4 text-center text-[var(--color-ink-muted)]">
                    <Smartphone size={28} />
                    <p className="font-sans text-xs">
                      No phone linked. Follow each step using your webcam and surroundings.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Current step / completion */}
            <div className="rounded-2xl border border-[var(--color-line)] bg-white p-6 flex flex-col">
              {!allComplete ? (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25 }}
                  className="flex flex-1 flex-col"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-ink)] text-[var(--color-accent)]">
                    <StepIcon size={24} />
                  </div>
                  <h3 className="mt-4 font-serif text-xl font-bold text-[var(--color-ink)]">{step.title}</h3>
                  <p className="mt-2 font-sans text-sm text-[var(--color-ink)] leading-relaxed">{step.instruction}</p>
                  <p className="mt-2 font-sans text-xs text-[var(--color-ink-muted)]">{step.hint}</p>

                  <div className="mt-auto pt-6">
                    <button
                      type="button"
                      onClick={confirmStep}
                      disabled={!canConfirm}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-accent)] px-6 py-3.5 font-sans text-sm font-bold text-[var(--color-ink)] transition-all hover:bg-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {!phoneOk ? (
                        <>
                          <RefreshCw size={16} />
                          Waiting for phone…
                        </>
                      ) : faceNeeded && !faceSeen ? (
                        <>
                          <RefreshCw size={16} />
                          Show your face to the camera…
                        </>
                      ) : !holdDone ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Hold the camera steady… {holdSecondsLeft}s
                        </>
                      ) : (
                        <>
                          <Check size={18} />
                          {current === total - 1 ? 'Done — show results' : 'I’ve shown this — next'}
                        </>
                      )}
                    </button>
                    {current > 0 && (
                      <button
                        type="button"
                        onClick={goBack}
                        className="mt-2 w-full font-sans text-xs font-semibold text-[var(--color-accent)] hover:underline"
                      >
                        ← Previous step
                      </button>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="complete"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-1 flex-col"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 text-green-700">
                    <ShieldCheck size={24} />
                  </div>
                  <h3 className="mt-4 font-serif text-xl font-bold text-[var(--color-ink)]">Environment check complete</h3>
                  <p className="mt-2 font-sans text-sm text-[var(--color-ink)] leading-relaxed">
                    Thanks — your surroundings are verified. Keep your phone propped up and this
                    screen open for the whole test.
                  </p>
                  <div className="mt-auto pt-6">
                    <button
                      type="button"
                      onClick={finish}
                      disabled={saving}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-ink)] px-6 py-3.5 font-sans text-sm font-bold text-[var(--color-accent)] transition-colors hover:bg-[var(--color-line)] disabled:opacity-60"
                    >
                      {saving ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
                      Continue to briefing
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          </div>

          {/* Checklist summary */}
          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {STEPS.map((s, i) => {
              const Icon = s.icon
              const isDone = i < completedCount
              const isCurrent = i === current && !allComplete
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                    isDone
                      ? 'border-green-200 bg-green-50'
                      : isCurrent
                        ? 'border-[var(--color-accent)]/40 bg-[var(--color-accent)]/5'
                        : 'border-[var(--color-line)] bg-white'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                      isDone ? 'bg-green-600 text-white' : 'bg-[var(--color-paper)] text-[var(--color-ink-muted)]'
                    }`}
                  >
                    {isDone ? <Check size={13} /> : <Icon size={13} />}
                  </span>
                  <span className="font-sans text-xs font-medium text-[var(--color-ink)]">{s.title}</span>
                </div>
              )
            })}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
