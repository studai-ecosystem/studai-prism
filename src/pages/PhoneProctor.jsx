import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Camera, CheckCircle2, AlertTriangle, Loader2, RefreshCw, SwitchCamera } from 'lucide-react'
import { connectProctor } from '../lib/proctorLink.js'

// Mobile page (route /m/:pairCode). Opened by scanning the QR on the laptop.
// Captures the rear camera and streams JPEG frames to the laptop over socket.io.
// Frames are relayed peer-to-peer through the room — nothing is uploaded/stored.

const FRAME_INTERVAL_MS = 1000 // 1 fps is plenty for a side-view proctor camera
const FRAME_WIDTH = 480
const JPEG_QUALITY = 0.5
// If no desktop is watching for this long, the phone stops the camera on its
// own — so leaving the test on the laptop also releases the phone camera.
const DESKTOP_GRACE_MS = 20000

export default function PhoneProctor() {
  const { pairCode } = useParams()
  const [status, setStatus] = useState('starting') // starting | streaming | denied | error | ended
  const [message, setMessage] = useState('Requesting camera access…')
  // Which camera is in use: 'environment' (rear) or 'user' (front/selfie). The
  // candidate can flip it so they can frame their own face without turning the
  // whole phone around.
  const [facingMode, setFacingMode] = useState('environment')

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const socketRef = useRef(null)
  const streamRef = useRef(null)
  const frameTimerRef = useRef(null)
  const cancelledRef = useRef(false)
  const desktopGraceRef = useRef(null)
  // Keep the latest facing mode in a ref so startCamera (a stable callback)
  // always reads the current value without being re-created on every toggle.
  const facingRef = useRef('environment')

  // Fully release the camera + stop streaming. Used when the test ends or the
  // laptop disconnects, and on unmount.
  const stopEverything = useCallback(() => {
    if (frameTimerRef.current) { clearInterval(frameTimerRef.current); frameTimerRef.current = null }
    if (desktopGraceRef.current) { clearTimeout(desktopGraceRef.current); desktopGraceRef.current = null }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const endSession = useCallback((msg) => {
    cancelledRef.current = true
    stopEverything()
    setStatus('ended')
    setMessage(msg)
    try { socketRef.current?.disconnect() } catch { /* ignore */ }
  }, [stopEverything])

  const sendFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    const socket = socketRef.current
    if (!video || !canvas || !socket || video.readyState < 2) return
    const ratio = video.videoHeight / video.videoWidth || 0.75
    canvas.width = FRAME_WIDTH
    canvas.height = Math.round(FRAME_WIDTH * ratio)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
    socket.emit('proctor:frame', { dataUrl, at: Date.now() })
  }, [])

  // Open (or re-open) the rear camera and start streaming. Safe to call again
  // from the retry button — it tears down any previous stream/timer first.
  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error')
      setMessage('This browser cannot access the camera. Try Chrome or Safari on your phone.')
      return
    }
    if (frameTimerRef.current) clearInterval(frameTimerRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())

    setStatus('starting')
    setMessage('Requesting camera access…')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingRef.current }, width: { ideal: 1280 } },
        audio: false,
      })
      if (cancelledRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setStatus('streaming')
      setMessage('You are connected. Keep this screen on.')

      frameTimerRef.current = setInterval(() => {
        sendFrame()
        socketRef.current?.emit('proctor:heartbeat', { at: Date.now() })
      }, FRAME_INTERVAL_MS)
    } catch (err) {
      if (cancelledRef.current) return
      if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
        setStatus('denied')
        setMessage('Camera access was blocked. Tap “Enable camera” below and choose Allow.')
      } else if (err?.name === 'NotFoundError') {
        setStatus('error')
        setMessage('No camera was found on this device.')
      } else {
        setStatus('error')
        setMessage('Could not start the camera. Tap retry below.')
      }
    }
  }, [sendFrame])

  // Flip between the rear and front (selfie) camera and reopen the stream.
  const toggleFacing = useCallback(() => {
    const next = facingRef.current === 'environment' ? 'user' : 'environment'
    facingRef.current = next
    setFacingMode(next)
    startCamera()
  }, [startCamera])

  useEffect(() => {
    cancelledRef.current = false

    // Connect to the proctoring room as the phone, then open the camera.
    try {
      socketRef.current = connectProctor({ pairCode, role: 'phone' })
      socketRef.current.on('connect_error', () => {
        if (!cancelledRef.current && status !== 'streaming') {
          setStatus('error')
          setMessage('Could not reach the test server. Check you are on the same Wi‑Fi.')
        }
      })

      // The laptop ended the test → stop the camera immediately.
      socketRef.current.on('proctor:end', () => {
        endSession('The test has ended. Your camera is off. You can close this page.')
      })

      // Track whether a desktop is actually watching. If the laptop goes away
      // (test closed/abandoned) and does not come back within the grace window,
      // release the camera so it does not stay on indefinitely.
      socketRef.current.on('proctor:presence', ({ desktop } = {}) => {
        if (cancelledRef.current) return
        if (desktop > 0) {
          if (desktopGraceRef.current) { clearTimeout(desktopGraceRef.current); desktopGraceRef.current = null }
        } else if (!desktopGraceRef.current) {
          desktopGraceRef.current = setTimeout(() => {
            endSession('Disconnected from the test on your computer. Your camera is off — you can close this page.')
          }, DESKTOP_GRACE_MS)
        }
      })
    } catch {
      setStatus('error')
      setMessage('Live linking is not supported on this device.')
      return undefined
    }

    startCamera()

    return () => {
      cancelledRef.current = true
      stopEverything()
      socketRef.current?.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairCode, startCamera])

  return (
    <div className="min-h-screen bg-[var(--color-ink)] text-white flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 text-[var(--color-accent)]">
          <Camera size={20} />
          <h1 className="font-sans text-base font-semibold">Prism proctor camera</h1>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            style={facingMode === 'user' ? { transform: 'scaleX(-1)' } : undefined}
            className={`aspect-[3/4] w-full object-cover ${status === 'streaming' ? 'block' : 'hidden'}`}
          />
          {status !== 'streaming' && (
            <div className="flex aspect-[3/4] w-full items-center justify-center">
              {status === 'starting' && <Loader2 size={32} className="animate-spin text-[var(--color-accent)]" />}
              {(status === 'denied' || status === 'error') && (
                <AlertTriangle size={32} className="text-amber-400" />
              )}
              {status === 'ended' && <CheckCircle2 size={32} className="text-green-400" />}
            </div>
          )}
        </div>
        <canvas ref={canvasRef} className="hidden" />

        {(status === 'streaming' || status === 'starting') && (
          <button
            type="button"
            onClick={toggleFacing}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 font-sans text-sm font-semibold text-white transition-colors hover:bg-white/20"
          >
            <SwitchCamera size={16} />
            {facingMode === 'environment' ? 'Switch to selfie camera' : 'Switch to back camera'}
          </button>
        )}

        <div className="mt-5 flex items-start gap-2 rounded-xl bg-white/5 px-4 py-3">
          {status === 'streaming' || status === 'ended' ? (
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-green-400" />
          ) : (
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-400" />
          )}
          <p className="font-sans text-sm text-white/80">{message}</p>
        </div>

        {(status === 'denied' || status === 'error') && (
          <button
            type="button"
            onClick={startCamera}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-3 font-sans text-sm font-bold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-accent)]"
          >
            <RefreshCw size={16} />
            Enable camera
          </button>
        )}

        {status === 'denied' && (
          <p className="mt-3 font-sans text-xs leading-relaxed text-white/50">
            If no prompt appears, tap the lock/ⓘ icon in your browser’s address bar →
            Permissions → allow Camera, then tap “Enable camera”.
          </p>
        )}

        <p className="mt-4 text-center font-sans text-xs text-white/40">
          Code {pairCode} · Keep your phone propped up and this screen awake.
        </p>
      </div>
    </div>
  )
}

