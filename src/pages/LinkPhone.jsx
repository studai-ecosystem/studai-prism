import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Smartphone, Loader2, Check, Wifi, ShieldCheck, RefreshCw } from 'lucide-react'
import QRCode from 'qrcode'
import { startProctorSession, subscribeProctor, rememberPairCode, endProctorSession, clearRememberedPair } from '../lib/proctorLink.js'
import PrismLogo from '../components/ui/PrismLogo.jsx'

// Step 2 of the proctored flow: link a phone as a second camera.
// The laptop shows a QR code → the phone opens /m/:pairCode → the phone's
// rear-camera frames stream back here over socket.io. Video frames are relayed
// peer-to-peer through the room and never persisted.

export default function LinkPhone() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const sessionId = params.get('session')

  const [pairCode, setPairCode] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [phoneUrl, setPhoneUrl] = useState('')
  const [linked, setLinked] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [unsupported, setUnsupported] = useState(false)

  const socketRef = useRef(null)
  const canvasRef = useRef(null)
  const imgRef = useRef(null)
  const lastFrameAtRef = useRef(0)
  // 1. Create a pairing code + discover a LAN URL the phone can reach.
  const setup = useCallback(async () => {
    if (!sessionId) {
      setError('Missing session. Please sign in again.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const pairRes = await fetch('/api/device/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      if (!pairRes.ok) {
        const data = await pairRes.json().catch(() => ({}))
        throw new Error(data.error || 'Could not create a pairing code.')
      }
      const { pairCode: code } = await pairRes.json()
      setPairCode(code)

      // Build a phone-reachable URL. Prefer a configured public URL, else the
      // laptop's LAN IP on the dev front-end port, else the current origin.
      let base = window.location.origin
      try {
        const netRes = await fetch('/api/device/network-info')
        if (netRes.ok) {
          const net = await netRes.json()
          if (net.publicBaseUrl) {
            base = net.publicBaseUrl.replace(/\/$/, '')
          } else if (net.addresses?.length) {
            base = `${window.location.protocol}//${net.addresses[0]}:${net.frontendPort}`
          }
        }
      } catch {
        /* fall back to current origin */
      }
      const url = `${base}/m/${code}`
      setPhoneUrl(url)
      setQrDataUrl(await QRCode.toDataURL(url, { width: 240, margin: 1 }))
    } catch (err) {
      setError(err.message || 'Setup failed. Please retry.')
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    setup()
  }, [setup])

  // 2. Open the PERSISTENT desktop proctor session and subscribe to it. The
  // session is a module-level singleton that survives navigation, so the phone
  // stays linked through briefing → assessment. We deliberately do NOT
  // disconnect it on unmount — only the assessment's end/abandon tears it down.
  useEffect(() => {
    if (!pairCode) return
    rememberPairCode(sessionId, pairCode)
    const session = startProctorSession({ pairCode, sessionId })
    if (!session) {
      setUnsupported(true)
      return undefined
    }
    session.socket.on('connect_error', () => setUnsupported(true))

    const unsubscribe = subscribeProctor((evt, payload) => {
      if (evt === 'linked') setLinked(payload.linked)
      else if (evt === 'frame') {
        lastFrameAtRef.current = Date.now()
        setLinked(true)
        if (imgRef.current) imgRef.current.src = payload.dataUrl
      } else if (evt === 'error') {
        setUnsupported(true)
      }
    })

    return unsubscribe
  }, [pairCode, sessionId])

  const handleContinue = () => {
    if (!linked) return
    navigate(`/room-scan?session=${sessionId}`)
  }

  return (
    <div className="min-h-screen bg-white text-[#1A1A2E] flex flex-col">
      <header className="shrink-0 flex items-center px-6 h-16 border-b border-[#E0E0E8]">
        <Link to="/" aria-label="Prism home">
          <PrismLogo size={32} />
        </Link>
      </header>

      <div className="flex-1 flex items-start justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-3xl"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#C9A84C]/12 text-[#9A7B23]">
              <Smartphone size={22} />
            </div>
            <div>
              <h1 className="font-serif text-2xl font-bold text-[#1A1A2E]">Connect your phone camera</h1>
              <p className="font-sans text-sm text-[#7A7F8C]">
                Your phone acts as a second camera during the proctored test.
              </p>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* QR / instructions */}
            <div className="rounded-2xl border border-[#E0E0E8] bg-white p-6">
              <h2 className="font-sans text-sm font-semibold text-[#1A1A2E]">Scan to link</h2>
              <ol className="mt-2 list-decimal space-y-1 pl-4 font-sans text-xs text-[#7A7F8C]">
                <li>Open your phone camera and scan the code.</li>
                <li>Allow camera access on your phone.</li>
                <li>Prop the phone to show you and your desk from the side.</li>
              </ol>

              <div className="mt-5 flex items-center justify-center rounded-xl bg-[#F5F5FA] p-5">
                {loading ? (
                  <Loader2 size={28} className="animate-spin text-[#9A7B23]" />
                ) : qrDataUrl ? (
                  <img src={qrDataUrl} alt="Pairing QR code" className="h-[200px] w-[200px]" />
                ) : (
                  <p className="text-center font-sans text-xs text-[#A0A4B0]">QR unavailable</p>
                )}
              </div>

              {pairCode && (
                <p className="mt-3 text-center font-sans text-xs text-[#7A7F8C]">
                  Pairing code: <span className="font-mono font-semibold tracking-widest text-[#1A1A2E]">{pairCode}</span>
                </p>
              )}
              {phoneUrl && (
                <p className="mt-1 break-all text-center font-sans text-[11px] text-[#A0A4B0]">{phoneUrl}</p>
              )}

              {(error || unsupported) && (
                <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2">
                  <p className="font-sans text-xs text-amber-700">
                    {unsupported
                      ? 'Live phone linking is unavailable on this network. You can retry or skip this step.'
                      : error}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={setup}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#E0E0E8] px-3 py-1.5 font-sans text-xs font-semibold text-[#5A5F6E] hover:bg-[#F5F5FA]"
                    >
                      <RefreshCw size={12} /> Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        endProctorSession()
                        clearRememberedPair(sessionId)
                        navigate(`/room-scan?session=${sessionId}`)
                      }}
                      className="rounded-lg px-3 py-1.5 font-sans text-xs font-semibold text-[#9A7B23] hover:underline"
                    >
                      Skip for now
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Live preview / status */}
            <div className="rounded-2xl border border-[#E0E0E8] bg-white p-6">
              <div className="flex items-center justify-between">
                <h2 className="font-sans text-sm font-semibold text-[#1A1A2E]">Phone camera</h2>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    linked ? 'bg-green-50 text-green-700' : 'bg-[#F5F5FA] text-[#A0A4B0]'
                  }`}
                >
                  {linked ? <Check size={13} /> : <Wifi size={13} />}
                  {linked ? 'Connected' : 'Waiting'}
                </span>
              </div>

              <div className="mt-4 flex aspect-[3/4] items-center justify-center overflow-hidden rounded-xl bg-[#0A0D14]">
                {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
                <img
                  ref={imgRef}
                  alt="Live phone camera preview"
                  className={`h-full w-full object-cover ${linked ? 'block' : 'hidden'}`}
                />
                {!linked && (
                  <div className="flex flex-col items-center gap-2 text-[#5A5F6E]">
                    <Smartphone size={28} />
                    <p className="font-sans text-xs">Waiting for phone…</p>
                  </div>
                )}
              </div>
              <canvas ref={canvasRef} className="hidden" />
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={handleContinue}
              disabled={!linked}
              className="flex items-center justify-center gap-2 rounded-xl bg-[#C9A84C] px-6 py-3.5 font-sans text-sm font-bold text-[#1A1A2E] transition-all hover:bg-[#b89640] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShieldCheck size={18} />
              Continue to briefing
            </button>
            {!linked && (
              <span className="font-sans text-xs text-[#A0A4B0]">
                Link your phone to continue.
              </span>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
