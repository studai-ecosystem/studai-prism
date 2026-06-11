import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, AlertTriangle, Clock, CheckCircle, ShieldCheck, Video, VideoOff, Mic, MicOff, Square, Loader2, Volume2, VolumeX, Smartphone, ScanFace } from 'lucide-react'
import { DURATION_SECONDS, currentStage, overlayStagesDue } from '../lib/assessmentFlow.js'
import ScenarioCard from '../components/assessment/ScenarioCard.jsx'
import { CharacterAvatar } from '../lib/characters.jsx'
import PrismLogo from '../components/ui/PrismLogo.jsx'
import { getToken } from '../lib/session.js'
import { startProctorSession, subscribeProctor, endProctorSession, scheduleEndProctorSession, cancelScheduledEnd, recallPairCode } from '../lib/proctorLink.js'
import { useFaceProctor } from '../hooks/useFaceProctor.js'

const INSTRUCTIONS = [
  { icon: '🎯', text: 'You will be placed in a realistic everyday scenario with AI participants who play different roles.' },
  { icon: '💡', text: 'This is NOT a knowledge test. You do not need to know any industry or job. There is no single right answer — we only want to see how you think and talk things through.' },
  { icon: '🎙️', text: 'This is a spoken assessment. Listen to each question, then tap the mic and speak your answer — it is transcribed automatically. You can also type if you prefer.' },
  { icon: '🧠', text: 'You are assessed on Critical Thinking, Communication, Collaboration, Problem Solving, and AI & Digital Fluency — not on facts you have memorised.' },
  { icon: '⏱️', text: 'You have 10 minutes. Your timer starts once you have read the scenario briefing — it cannot be paused.' },
  { icon: '🚫', text: 'Do not switch tabs or use external tools. This is your performance — not a research exercise.' },
]

function InstructionsScreen({ onBegin, phoneRequired, phoneLinked }) {
  const blocked = phoneRequired && !phoneLinked
  return (
    <div className="flex flex-col h-screen bg-white text-[#1A1A2E]">
      <header className="shrink-0 flex items-center px-6 py-3 bg-[#F5F5FA] border-b border-[#E0E0E8]">
        <PrismLogo size={28} subtitle={null} />
      </header>
      <div className="flex-1 overflow-y-auto py-10 px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-lg mx-auto flex flex-col gap-8"
        >
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#C9A84C]/10 mb-4">
              <ShieldCheck size={22} className="text-[#C9A84C]" />
            </div>
            <h1 className="font-serif text-3xl text-[#1A1A2E] mb-2">Before you begin</h1>
            <p className="font-sans text-sm text-[#64687A]">10-minute assessment · 5 skill dimensions · Certified result</p>
          </div>

          <ul className="flex flex-col gap-4">
            {INSTRUCTIONS.map((item, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.08 }}
                className="flex gap-3 items-start p-4 rounded-xl bg-[#F5F5FA] border border-[#E8E8F0]"
              >
                <span className="text-xl shrink-0 mt-0.5">{item.icon}</span>
                <span className="font-sans text-sm text-[#3A3A4A] leading-relaxed">{item.text}</span>
              </motion.li>
            ))}
          </ul>

          {phoneRequired && (
            <div
              className={`flex items-center gap-3 p-4 rounded-xl border ${
                phoneLinked
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
            >
              <Smartphone size={18} className="shrink-0" />
              <span className="font-sans text-sm">
                {phoneLinked
                  ? 'Phone camera connected — you are ready to begin.'
                  : 'Phone camera disconnected. Reconnect your phone (keep the proctor page open) to begin.'}
              </span>
            </div>
          )}

          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            onClick={onBegin}
            disabled={blocked}
            className="w-full py-4 rounded-xl bg-[#1A1A2E] font-sans font-semibold text-sm text-[#C9A84C] tracking-wide hover:bg-[#252A3A] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {blocked ? 'Waiting for phone camera…' : 'Begin Assessment →'}
          </motion.button>

          <p className="text-center font-sans text-xs text-[#A0A4B0]">
            By beginning you confirm this is your own unaided work.
          </p>
        </motion.div>
      </div>
    </div>
  )
}

function formatTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0')
  const s = (secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

// Avatar colours per speaker (deterministic)
const AVATAR_COLORS = ['#C9A84C', '#3CB97A', '#7C6ADE', '#E05252', '#4A9EE8']
function speakerColor(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function Avatar({ name }) {
  const color = speakerColor(name)
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-[#0A0D14] shrink-0"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function InlineTyping({ name }) {
  return (
    <div className="flex gap-3 items-start">
      <Avatar name={name} />
      <div className="bg-[#E0E0E8] border border-[#D0D0DC] rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1 items-center">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-[#8A8FA0]"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, delay: i * 0.2, repeat: Infinity }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function AiMessage({ msg, isNew }) {
  const list = msg.messages || []
  // Reveal participants one at a time so avatars don't all "speak" at once.
  // Already-seen history (isNew === false) renders fully and instantly.
  const [visibleCount, setVisibleCount] = useState(isNew ? 0 : list.length)
  const [typing, setTyping] = useState(isNew && list.length > 0)

  useEffect(() => {
    if (!isNew) return
    if (visibleCount >= list.length) {
      setTyping(false)
      return
    }
    // Show a brief typing indicator, then reveal the next speaker's message.
    setTyping(true)
    const typingTimer = setTimeout(() => {
      setTyping(false)
      setVisibleCount((c) => c + 1)
    }, 900)
    return () => clearTimeout(typingTimer)
  }, [isNew, visibleCount, list.length])

  return (
    <motion.div
      initial={isNew ? { opacity: 0, y: 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-3"
    >
      {list.slice(0, visibleCount).map((m, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex gap-3 items-start"
        >
          <Avatar name={m.speaker} />
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-sans text-xs font-semibold text-[#1A1A2E]">{m.speaker}</span>
              <span className="font-sans text-[10px] text-[#64687A] bg-[#EEEEF4] px-2 py-0.5 rounded-full">
                {m.role}
              </span>
            </div>
            <div className="bg-[#E0E0E8] border border-[#D0D0DC] rounded-2xl rounded-tl-sm px-4 py-3 max-w-lg">
              <p className="font-sans text-sm text-[#1A1A2E]/90 leading-relaxed">{m.content}</p>
            </div>
          </div>
        </motion.div>
      ))}
      {typing && visibleCount < list.length && (
        <InlineTyping name={list[visibleCount]?.speaker || 'AI'} />
      )}
    </motion.div>
  )
}

function UserMessage({ content, character, userName }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex justify-end items-start gap-2"
    >
      <div className="bg-[#C9A84C]/15 border border-[#C9A84C]/30 rounded-2xl rounded-tr-sm px-4 py-3 max-w-lg">
        <p className="font-sans text-sm text-[#1A1A2E] leading-relaxed">{content}</p>
      </div>
      {character && (
        <div className="flex flex-col items-center shrink-0">
          <CharacterAvatar id={character.id} size={32} />
          <span className="font-sans text-[10px] font-semibold text-[#64687A] mt-0.5">{userName}</span>
        </div>
      )}
    </motion.div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-8 h-8 rounded-full bg-[#EEEEF4] flex items-center justify-center shrink-0">
        <span className="text-[#64687A] text-xs">AI</span>
      </div>
      <div className="bg-[#111520] border border-[#252A3A] rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1 items-center">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-[#8A8FA0]"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, delay: i * 0.2, repeat: Infinity }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Assessment() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const sessionId = params.get('session')

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState('instructions') // 'instructions' | 'chat'
  const [initialising, setInitialising] = useState(false)
  const [error, setError] = useState(null)
  const [timeLeft, setTimeLeft] = useState(DURATION_SECONDS)
  const [submitting, setSubmitting] = useState(false)
  const [exchangeCount, setExchangeCount] = useState(0)
  const [mediaAllowed, setMediaAllowed] = useState(null) // null | true | false
  const [tabViolations, setTabViolations] = useState(0)
  const [showTabWarning, setShowTabWarning] = useState(false)
  const [scenario, setScenario] = useState(null)
  const [activeOverlay, setActiveOverlay] = useState(null) // stage overlay key | null
  const [character, setCharacter] = useState(null)
  const [userName, setUserName] = useState('')
  const [listening, setListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(true)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(true)
  // Phone proctor link (second camera). pairCode is remembered from the
  // link-phone step; if present, the test requires the phone to stay connected.
  const [phonePairCode] = useState(() => recallPairCode(params.get('session')))
  const [phoneLinked, setPhoneLinked] = useState(false)
  // Speech-to-text mode: 'whisper' (server) when configured, else 'webspeech'
  // (browser live dictation) so the spoken test still works without an API key.
  const [sttMode, setSttMode] = useState('whisper')
  // Live face-proctoring (laptop webcam). Transient banner shown on a violation.
  const [faceWarning, setFaceWarning] = useState(null)
  const faceWarningTimerRef = useRef(null)
  const firedStagesRef = useRef(new Set())
  const timerRef = useRef(null)
  const streamRef = useRef(null)
  const videoRef = useRef(null)
  const recognitionRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const phoneImgRef = useRef(null)
  const voiceAnswerRef = useRef('')
  const answerModeRef = useRef(false) // true while the primary mic is capturing a full spoken answer (WebSpeech fallback)
  // Browsers auto-stop SpeechRecognition after a few seconds of silence (even
  // with continuous=true). This ref records whether we still WANT to be
  // listening, so onend/onerror can transparently restart it instead of going
  // silent mid-answer.
  const listeningIntentRef = useRef(false)

  // Callback ref — attaches the stream as soon as the <video> element mounts
  const videoCallbackRef = useCallback((node) => {
    videoRef.current = node
    if (node && streamRef.current) {
      node.srcObject = streamRef.current
    }
  }, [])

  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Redirect if no session
  useEffect(() => {
    if (!sessionId) navigate('/')
  }, [sessionId, navigate])

  // Load the player's chosen character (set on the Briefing screen)
  useEffect(() => {
    try {
      const stored = localStorage.getItem('prismCharacter')
      if (stored) setCharacter(JSON.parse(stored))
    } catch {
      setCharacter(null)
    }
    setUserName(localStorage.getItem('prismUserName') || '')
  }, [])

  // Clean up timer and media stream on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (faceWarningTimerRef.current) clearTimeout(faceWarningTimerRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      try { mediaRecorderRef.current?.stop() } catch { /* ignore */ }
      try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
    }
  }, [])

  // Re-attach to the PERSISTENT phone-proctor session (started on the link-phone
  // page) and mirror its live state. The session is a module-level singleton so
  // navigating link-phone → briefing → assessment keeps the phone linked.
  useEffect(() => {
    if (!phonePairCode) return undefined
    cancelScheduledEnd() // cancel any teardown queued by a StrictMode fake unmount
    startProctorSession({ pairCode: phonePairCode, sessionId })
    const unsubscribe = subscribeProctor((evt, payload) => {
      if (evt === 'linked') setPhoneLinked(payload.linked)
      else if (evt === 'frame') {
        setPhoneLinked(true)
        if (phoneImgRef.current) phoneImgRef.current.src = payload.dataUrl
      }
    })
    return () => {
      unsubscribe()
      // Genuine unmount → end the session (tells the phone to stop its camera).
      // A StrictMode re-mount cancels this before it fires.
      scheduleEndProctorSession()
    }
  }, [phonePairCode, sessionId])

  // Tell the phone to stop its camera if the tab is closed or hard-refreshed.
  useEffect(() => {
    if (!phonePairCode) return undefined
    const onPageHide = () => endProctorSession()
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [phonePairCode])

  // Detect whether server-side Whisper STT is available. If not, the spoken
  // answer flow falls back to the browser's live dictation so the test still
  // works without an OpenAI key.
  useEffect(() => {
    let cancelled = false
    fetch('/api/assessment/stt-status')
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => { if (!cancelled) setSttMode(d.enabled ? 'whisper' : 'webspeech') })
      .catch(() => { if (!cancelled) setSttMode('webspeech') })
    return () => { cancelled = true }
  }, [])

  // Report a proctoring event to the server (best-effort, never blocks the UI).
  const reportProctorEvent = useCallback((type, meta) => {
    if (!sessionId) return
    fetch('/api/assessment/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, type, meta: meta && typeof meta === 'object' ? meta : {} }),
    }).catch(() => {})
  }, [sessionId])

  // Surface a face-proctoring violation as a brief on-screen banner + log it.
  const FACE_MESSAGES = {
    face_absent: 'Please stay in view of your camera.',
    multiple_faces: 'More than one person detected. You must take this test alone.',
    looking_away: 'Please keep your eyes on the screen.',
  }
  const handleFaceEvent = useCallback((type, meta) => {
    reportProctorEvent(type, meta)
    const message = FACE_MESSAGES[type]
    if (!message) return
    setFaceWarning(message)
    if (faceWarningTimerRef.current) clearTimeout(faceWarningTimerRef.current)
    faceWarningTimerRef.current = setTimeout(() => setFaceWarning(null), 5000)
  }, [reportProctorEvent]) // eslint-disable-line react-hooks/exhaustive-deps

  // Run live face proctoring on the laptop webcam while the chat is active and
  // no overlay is blocking (scenario briefing / proctor alerts pause it).
  const faceProctorActive = phase === 'chat' && mediaAllowed === true && !activeOverlay && !submitting
  const { status: faceStatus, faceCount } = useFaceProctor({
    videoRef,
    active: faceProctorActive,
    onEvent: handleFaceEvent,
  })

  // Silence the avatar immediately if the candidate mutes narration mid-sentence.
  useEffect(() => {
    if (!ttsEnabled) {
      try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
    }
  }, [ttsEnabled])


  // Set up browser speech recognition for voice-to-text dictation
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setVoiceSupported(false)
      return
    }
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event) => {
      let finalTranscript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript
        }
      }
      if (finalTranscript) {
        if (answerModeRef.current) {
          // Primary mic (WebSpeech fallback): accumulate the whole spoken answer
          // and mirror it into the box so the candidate sees it before it sends.
          voiceAnswerRef.current = (voiceAnswerRef.current ? voiceAnswerRef.current.trimEnd() + ' ' : '') + finalTranscript.trim()
          setInput(voiceAnswerRef.current)
        } else {
          setInput((prev) => (prev ? prev.trimEnd() + ' ' : '') + finalTranscript.trim())
        }
      }
    }
    // Restart automatically if the browser ended the session while we still
    // intend to keep listening (silence timeout / transient hiccup). Without
    // this the mic silently dies "after some time" and stops transcribing.
    recognition.onend = () => {
      if (listeningIntentRef.current) {
        try {
          recognition.start()
          return // still listening — keep UI state as-is
        } catch { /* will retry on next tick below */ }
        setTimeout(() => {
          if (!listeningIntentRef.current) return
          try { recognition.start() } catch { /* give up this round */ }
        }, 250)
        return
      }
      setListening(false)
    }
    recognition.onerror = (event) => {
      // Fatal errors mean we cannot recover — stop intending to listen so we
      // don't spin restarting. Transient ones ('no-speech', 'aborted',
      // 'network') let onend restart us.
      if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
        listeningIntentRef.current = false
        answerModeRef.current = false
        setListening(false)
        setRecording(false)
      }
    }

    recognitionRef.current = recognition
    return () => {
      listeningIntentRef.current = false
      try { recognition.stop() } catch { /* ignore */ }
      recognitionRef.current = null
    }
  }, [])

  const toggleVoice = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition) return
    if (listening) {
      listeningIntentRef.current = false
      try { recognition.stop() } catch { /* ignore */ }
      setListening(false)
    } else {
      try {
        listeningIntentRef.current = true
        recognition.start()
        setListening(true)
      } catch { /* already started */ }
    }
  }, [listening])

  // Tab-switch & screenshot proctoring
  useEffect(() => {
    if (phase !== 'chat') return
    const report = (type) => {
      if (!sessionId) return
      fetch('/api/assessment/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, type }),
      }).catch(() => {})
    }
    const handleVisibility = () => {
      if (document.hidden) {
        setTabViolations((v) => v + 1)
        setShowTabWarning(true)
        report('tab_switch')
      }
    }
    const handleKey = (e) => {
      const isScreenshot =
        e.key === 'PrintScreen' ||
        (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4' || e.key === 's'))
      if (isScreenshot) {
        e.preventDefault()
        setShowTabWarning(true)
        report('screenshot_attempt')
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      document.removeEventListener('keydown', handleKey)
    }
  }, [phase, sessionId])

  // Enforce fullscreen while assessment is active; re-enter if user exits
  useEffect(() => {
    if (phase !== 'chat') return
    const handleFSChange = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {})
      }
    }
    // Enter fullscreen immediately
    document.documentElement.requestFullscreen?.().catch(() => {})
    document.addEventListener('fullscreenchange', handleFSChange)
    return () => document.removeEventListener('fullscreenchange', handleFSChange)
  }, [phase])

  // Attach stream to video element after mediaAllowed becomes true
  useEffect(() => {
    if (mediaAllowed === true && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [mediaAllowed])

  // Staged flow — fire each stage's overlay once, as elapsed time crosses it
  useEffect(() => {
    if (phase !== 'chat') return
    const elapsed = DURATION_SECONDS - timeLeft
    for (const stage of overlayStagesDue(elapsed)) {
      if (!firedStagesRef.current.has(stage.id)) {
        firedStagesRef.current.add(stage.id)
        setActiveOverlay(stage.overlay)
      }
    }
  }, [timeLeft, phase])

  // Start countdown only once chat begins
  const startTimer = useCallback(() => {
    if (timerRef.current) return
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current)
          handleSubmit(true)
          return 0
        }
        return t - 1
      })
    }, 1000)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const startSession = useCallback(async () => {
    if (!sessionId) return
    // Transition immediately so the button feels responsive
    setPhase('chat')
    setInitialising(true)
    // NOTE: the countdown does NOT start here — it begins only once the
    // candidate has read the scenario briefing card and clicked continue.
    // Camera + microphone — request immediately, attach when granted
    navigator.mediaDevices?.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        streamRef.current = stream
        setMediaAllowed(true)
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => setMediaAllowed(false))
    try {
      const token = getToken()
      const res = await fetch('/api/assessment/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ sessionId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to start assessment session')
      setMessages([{ type: 'ai', messages: data.messages, isNew: true }])
      setScenario(data.scenario || null)
      setInitialising(false)
      // Gate the conversation behind the scenario briefing so the candidate
      // understands the situation before the clock starts. Mark the stage as
      // fired so the staged-flow effect doesn't re-open it once the timer runs.
      if (data.scenario) {
        firedStagesRef.current.add('scenario')
        setActiveOverlay('scenario_card')
      } else {
        startTimer()
      }
    } catch (e) {
      setError(e.message)
      setInitialising(false)
    }
  }, [sessionId, startTimer])

  // Dismiss the scenario briefing — this is what actually starts the
  // assessment clock. Safe to call when the timer is already running (no-op).
  const beginAfterScenario = useCallback(() => {
    setActiveOverlay(null)
    startTimer()
  }, [startTimer])

  const handleSubmit = useCallback(async (autoSubmit = false) => {
    if (submitting) return
    setSubmitting(true)

    try {
      const res = await fetch('/api/assessment/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      if (!res.ok) throw new Error('Evaluation failed')
      const data = await res.json()
      // Test is over — tell the phone to switch its camera off.
      endProctorSession()
      navigate(`/score?session=${sessionId}`, { state: { report: data } })
    } catch (e) {
      setError('Could not generate your score. Please try again.')
      setSubmitting(false)
    }
  }, [sessionId, navigate, submitting])

  // Read an AI turn aloud so the candidate can take the test by ear (voice-only
  // experience). Uses the browser's built-in speech synthesis — no network.
  const speak = useCallback((aiMessages) => {
    if (!ttsEnabled) return
    const synth = window.speechSynthesis
    if (!synth || !Array.isArray(aiMessages)) return
    const text = aiMessages.map((m) => m.content).filter(Boolean).join(' ')
    if (!text) return
    try {
      synth.cancel()
      const utter = new SpeechSynthesisUtterance(text)
      utter.lang = 'en-US'
      utter.rate = 1
      synth.speak(utter)
    } catch { /* ignore */ }
  }, [ttsEnabled])

  // Core send used by both typed and spoken answers.
  const sendText = useCallback(async (rawText) => {
    const text = (rawText || '').trim()
    if (!text || loading || submitting) return

    setInput('')
    setMessages((prev) => [...prev, { type: 'user', content: text }])
    setExchangeCount((c) => c + 1)
    setLoading(true)

    try {
      const res = await fetch('/api/assessment/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text }),
      })
      if (!res.ok) throw new Error('Failed to get AI response')
      const data = await res.json()
      setMessages((prev) => [...prev, { type: 'ai', messages: data.messages, isNew: true }])
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          type: 'ai',
          messages: [{ speaker: 'System', role: 'Error', content: 'Sorry, something went wrong. Please try again.' }],
          isNew: true,
        },
      ])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [loading, submitting, sessionId, speak])

  // Read each new AI turn aloud once, in order (covers the opening message and
  // every reply). Tracks the last spoken index so toggling TTS won't replay.
  // IMPORTANT: stay silent while the scenario briefing card is on screen — the
  // candidate must read the problem statement before any avatar starts talking.
  const spokenIdxRef = useRef(-1)
  useEffect(() => {
    if (phase !== 'chat') return
    if (activeOverlay === 'scenario_card') return // don't speak over the briefing
    const lastIdx = messages.length - 1
    if (lastIdx <= spokenIdxRef.current) return
    const last = messages[lastIdx]
    if (last && last.type === 'ai' && last.isNew && Array.isArray(last.messages)) {
      spokenIdxRef.current = lastIdx
      speak(last.messages)
    }
  }, [messages, phase, speak, activeOverlay])


  const sendMessage = useCallback(() => {
    if (listening) {
      try { recognitionRef.current?.stop() } catch { /* ignore */ }
      setListening(false)
    }
    sendText(input)
  }, [input, listening, sendText])

  // ── Voice answer: record → upload → Whisper transcript → send ───────────────
  const handleRecordingStop = useCallback(async () => {
    const chunks = audioChunksRef.current
    audioChunksRef.current = []
    if (!chunks.length) return
    const blob = new Blob(chunks, { type: chunks[0].type || 'audio/webm' })
    setTranscribing(true)
    try {
      const form = new FormData()
      const ext = blob.type.includes('ogg') ? 'ogg' : 'webm'
      form.append('audio', blob, `answer.${ext}`)
      const res = await fetch('/api/assessment/transcribe', { method: 'POST', body: form })
      if (res.status === 503) {
        // Server-side transcription not configured — fall back to dictation.
        setError('Voice transcription is unavailable right now. Type your answer or use the dictation mic.')
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not transcribe your answer.')
      if (data.transcript) {
        await sendText(data.transcript)
      }
    } catch (e) {
      setError(e.message || 'Could not transcribe your answer. Please try again.')
    } finally {
      setTranscribing(false)
    }
  }, [sendText])

  const startRecording = useCallback(async () => {
    if (recording || loading || submitting || transcribing) return
    // Stop the avatar talking so it doesn't bleed into the recording.
    try { window.speechSynthesis?.cancel() } catch { /* ignore */ }

    let stream = streamRef.current
    if (!stream || stream.getAudioTracks().length === 0) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch {
        setError('Microphone access is required to answer by voice.')
        return
      }
    }
    try {
      const audioStream = new MediaStream(stream.getAudioTracks())
      const recorder = new MediaRecorder(audioStream)
      audioChunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) audioChunksRef.current.push(e.data) }
      recorder.onstop = handleRecordingStop
      mediaRecorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch {
      setError('Voice recording is not supported in this browser. Please type your answer.')
    }
  }, [recording, loading, submitting, transcribing, handleRecordingStop])

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop() } catch { /* ignore */ }
    }
    setRecording(false)
  }, [])

  // Unified primary "speak your answer" control. Uses server Whisper when it is
  // configured; otherwise falls back to the browser's live dictation and
  // auto-sends the recognised text when the candidate stops — so the spoken
  // test works even without an OpenAI key.
  const startVoiceAnswer = useCallback(async () => {
    if (loading || submitting || initialising || transcribing) return
    if (sttMode === 'whisper') return startRecording()
    const recognition = recognitionRef.current
    if (!recognition) {
      setError('Voice input is not supported in this browser. Please type your answer.')
      return
    }
    try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
    setInput('')
    voiceAnswerRef.current = ''
    answerModeRef.current = true
    listeningIntentRef.current = true
    try {
      recognition.start()
      setRecording(true)
    } catch {
      // already started — ensure UI reflects recording
      setRecording(true)
    }
  }, [sttMode, loading, submitting, initialising, transcribing, startRecording])

  const stopVoiceAnswer = useCallback(() => {
    if (sttMode === 'whisper') return stopRecording()
    const recognition = recognitionRef.current
    answerModeRef.current = false
    listeningIntentRef.current = false
    try { recognition?.stop() } catch { /* ignore */ }
    setRecording(false)
    // Let the final recognition result settle, then send the spoken answer.
    setTimeout(() => {
      const text = (voiceAnswerRef.current || '').trim()
      voiceAnswerRef.current = ''
      if (text) sendText(text)
    }, 450)
  }, [sttMode, stopRecording, sendText])


  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const warningThreshold = 5 * 60 // 5 minutes
  const isWarning = timeLeft <= warningThreshold && timeLeft > 0
  const stage = currentStage(DURATION_SECONDS - timeLeft)

  if (!sessionId) return null

  if (phase === 'instructions') {
    return (
      <InstructionsScreen
        onBegin={startSession}
        phoneRequired={Boolean(phonePairCode)}
        phoneLinked={phoneLinked}
      />
    )
  }

  return (
    <div className="flex flex-col h-screen bg-white text-[#1A1A2E]">
      {/* Top bar */}
      <header className="shrink-0 flex items-center justify-between px-6 py-3 bg-[#F5F5FA] border-b border-[#E0E0E8]">
        <div className="flex items-center gap-3">
          <PrismLogo size={28} subtitle={null} />
          <span className="hidden sm:inline font-sans text-xs text-[#64687A] bg-[#EEEEF4] px-2 py-0.5 rounded-full">
            {stage.label}
          </span>
        </div>

        <div />

        <motion.button
          onClick={() => handleSubmit(false)}
          disabled={submitting || exchangeCount < 3}
          className="flex items-center gap-2 px-4 py-2 rounded-md font-sans font-semibold text-sm bg-[#C9A84C] text-[#1A1A2E] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          whileHover={exchangeCount >= 3 ? { scale: 1.02 } : {}}
          whileTap={exchangeCount >= 3 ? { scale: 0.97 } : {}}
          title={exchangeCount < 3 ? 'Please engage more before submitting' : 'End assessment and get your score'}
        >
          <CheckCircle size={15} />
          <span>Submit & Get Score</span>
        </motion.button>
      </header>

      {/* Warning banner */}
      <AnimatePresence>
        {isWarning && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 overflow-hidden bg-[#E05252]/10 border-b border-[#E05252]/30"
          >
            <div className="flex items-center gap-2 px-6 py-2">
              <AlertTriangle size={14} className="text-[#E05252] shrink-0" />
              <p className="font-sans text-xs text-[#E05252]">
                Less than 5 minutes remaining. Wrap up your thoughts and click "Submit & Get Score".
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 max-w-4xl mx-auto w-full select-none" onCopy={(e) => e.preventDefault()}>
        <div className="bg-white rounded-2xl border border-[#E0E0E8] shadow-sm min-h-full p-5 sm:p-7 flex flex-col gap-6">
        {initialising ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-4">
            <div className="w-8 h-8 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin" />
            <p className="font-sans text-sm text-[#8A8FA0]">Setting up your scenario…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center">
            <AlertTriangle size={32} className="text-[#E05252]" />
            <p className="font-sans text-sm text-[#64687A]">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="font-sans text-xs text-[#C9A84C] underline"
            >
              Reload page
            </button>
          </div>
        ) : (
          <>
            {messages.map((msg, i) =>
              msg.type === 'user' ? (
                <UserMessage key={i} content={msg.content} character={character} userName={userName} />
              ) : (
                <AiMessage key={i} msg={msg} isNew={msg.isNew} />
              )
            )}
            {loading && <TypingIndicator />}
          </>
        )}
        <div ref={bottomRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="shrink-0 bg-[#F5F5FA] border-t border-[#E0E0E8] px-4 sm:px-8 py-4">
        <div className="max-w-4xl mx-auto flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={loading || submitting || initialising || recording || transcribing}
            placeholder="Speak your answer with the mic — or type here (Enter to send)"
            rows={2}
            className="flex-1 resize-none bg-white border border-[#E0E0E8] rounded-xl px-4 py-3 font-sans text-sm text-[#1A1A2E] placeholder-[#64687A] focus:outline-none focus:border-[#C9A84C]/60 transition-colors disabled:opacity-50"
            aria-label="Your response"
          />

          {/* Narration toggle — read the avatar's questions aloud */}
          <motion.button
            onClick={() => setTtsEnabled((v) => !v)}
            disabled={initialising}
            aria-label={ttsEnabled ? 'Mute avatar narration' : 'Unmute avatar narration'}
            title={ttsEnabled ? 'Avatar narration on' : 'Avatar narration off'}
            className={`flex items-center justify-center w-11 h-11 rounded-xl border transition-colors disabled:opacity-40 cursor-pointer shrink-0 ${
              ttsEnabled
                ? 'bg-white border-[#C9A84C]/60 text-[#C9A84C]'
                : 'bg-white border-[#E0E0E8] text-[#64687A] hover:text-[#1A1A2E]'
            }`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {ttsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </motion.button>

          {/* Primary voice answer — record → transcribe → send */}
          <motion.button
            onClick={recording ? stopVoiceAnswer : startVoiceAnswer}
            disabled={loading || submitting || initialising || transcribing}
            aria-label={recording ? 'Stop recording and submit' : 'Record your spoken answer'}
            title={recording ? 'Stop & submit' : 'Hold a thought, then record your spoken answer'}
            className={`relative flex items-center justify-center w-11 h-11 rounded-xl border transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0 ${
              recording
                ? 'bg-[#E05252] border-[#E05252] text-white'
                : 'bg-[#1A1A2E] border-[#1A1A2E] text-[#C9A84C] hover:bg-[#252A3A]'
            }`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {transcribing ? (
              <Loader2 size={16} className="animate-spin" />
            ) : recording ? (
              <Square size={15} />
            ) : (
              <Mic size={16} />
            )}
            {recording && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#E05252] animate-ping" />
            )}
          </motion.button>

          {/* Optional browser dictation into the text box (only useful as a
              separate control when Whisper does the primary capture). */}
          {voiceSupported && sttMode === 'whisper' && (
            <motion.button
              onClick={toggleVoice}
              disabled={loading || submitting || initialising || recording || transcribing}
              aria-label={listening ? 'Stop dictation' : 'Dictate into the box'}
              title={listening ? 'Stop dictation' : 'Dictate into the box'}
              className={`relative flex items-center justify-center w-11 h-11 rounded-xl border transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0 ${
                listening
                  ? 'bg-[#E05252] border-[#E05252] text-white'
                  : 'bg-white border-[#E0E0E8] text-[#64687A] hover:border-[#C9A84C]/60 hover:text-[#1A1A2E]'
              }`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {listening ? <Mic size={16} /> : <MicOff size={16} />}
              {listening && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#E05252] animate-ping" />
              )}
            </motion.button>
          )}

          <motion.button
            onClick={sendMessage}
            disabled={!input.trim() || loading || submitting || initialising || recording || transcribing}
            aria-label="Send message"
            className="flex items-center justify-center w-11 h-11 rounded-xl bg-[#C9A84C] text-[#0A0D14] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Send size={16} />
          </motion.button>
        </div>
        <p className="max-w-4xl mx-auto font-sans text-[10px] text-[#64687A] mt-2 px-1">
          {recording
            ? 'Recording… tap the stop button when you have finished speaking.'
            : transcribing
              ? 'Transcribing your answer…'
              : listening
                ? 'Dictating… your words appear in the box; tap send when ready.'
                : 'Tap the dark mic to speak your answer · the speaker icon mutes narration · or type and press Enter.'}
        </p>
      </div>

      {/* Staged-flow overlays */}
      <AnimatePresence>
        {activeOverlay === 'scenario_card' && scenario && (
          <ScenarioCard scenario={scenario} onDismiss={beginAfterScenario} />
        )}
      </AnimatePresence>

      {/* Tab-switch / screenshot warning overlay */}
      <AnimatePresence>
        {showTabWarning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.9, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 16 }}
              className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl"
            >
              <div className="w-12 h-12 rounded-full bg-[#E05252]/10 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={24} className="text-[#E05252]" />
              </div>
              <h2 className="font-serif text-xl text-[#1A1A2E] mb-2">Proctoring Alert</h2>
              <p className="font-sans text-sm text-[#64687A] mb-1">
                Tab switching or screenshot attempts are not allowed.
              </p>
              <p className="font-sans text-xs text-[#E05252] font-semibold mb-6">
                Violation {tabViolations} recorded
              </p>
              <button
                onClick={() => setShowTabWarning(false)}
                className="w-full py-3 rounded-xl bg-[#1A1A2E] font-sans font-semibold text-sm text-[#C9A84C] hover:bg-[#252A3A] transition-colors"
              >
                Return to Assessment
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live face-proctoring violation toast */}
      <AnimatePresence>
        {faceWarning && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[95]"
          >
            <div className="flex items-center gap-2 rounded-full bg-[#E05252] px-4 py-2 shadow-lg">
              <AlertTriangle size={15} className="text-white shrink-0" />
              <span className="font-sans text-xs font-semibold text-white">{faceWarning}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Phone-disconnected overlay — blocks the test until the second camera is
          back, so the candidate cannot continue unproctored. */}
      <AnimatePresence>
        {phase === 'chat' && phonePairCode && !phoneLinked && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-black/85 backdrop-blur-sm flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.9, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 16 }}
              className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl"
            >
              <div className="w-12 h-12 rounded-full bg-[#7C6ADE]/10 flex items-center justify-center mx-auto mb-4">
                <Smartphone size={24} className="text-[#7C6ADE]" />
              </div>
              <h2 className="font-serif text-xl text-[#1A1A2E] mb-2">Phone camera disconnected</h2>
              <p className="font-sans text-sm text-[#64687A] mb-4">
                Your second camera went offline. Re-open the proctor page on your phone (or scan the
                QR again) and keep that screen on. The test will resume automatically once it
                reconnects.
              </p>
              <div className="inline-flex items-center gap-2 font-sans text-xs text-[#7C6ADE] font-semibold">
                <Loader2 size={14} className="animate-spin" />
                Waiting for your phone…
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Camera / proctoring overlay — always in DOM so ref is stable */}
      <div className={`fixed bottom-4 right-4 z-50 flex flex-col items-end gap-1.5 transition-opacity duration-300 ${phase === 'chat' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {/* Phone second-camera feed (when a phone was linked) */}
        {phonePairCode && (
          <div className="relative">
            {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
            <img
              ref={phoneImgRef}
              alt="Phone proctor camera"
              className={`w-44 h-32 rounded-xl object-cover shadow-2xl bg-black border-2 ${
                phoneLinked ? 'border-[#7C6ADE]' : 'border-[#E05252]/60'
              } ${phoneLinked ? 'block' : 'opacity-30'}`}
            />
            {phoneLinked ? (
              <span className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 rounded-full px-2 py-0.5">
                <Smartphone size={10} className="text-[#7C6ADE]" />
                <span className="font-sans text-[10px] text-white font-semibold tracking-wide">PHONE</span>
              </span>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/80 rounded-xl">
                <Smartphone size={18} className="text-[#E05252]" />
                <span className="font-sans text-[10px] text-[#E05252]">Phone offline</span>
              </div>
            )}
          </div>
        )}
        <div className="relative">
          <video
            ref={videoCallbackRef}
            autoPlay
            muted
            playsInline
            className={`w-44 h-32 rounded-xl object-cover shadow-2xl bg-black border-2 ${
              mediaAllowed === true ? 'border-[#C9A84C]' : 'border-[#E05252]/60'
            }`}
          />
          {/* Live indicator */}
          {mediaAllowed === true && (
            <span className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 rounded-full px-2 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E05252] animate-pulse" />
              <span className="font-sans text-[10px] text-white font-semibold tracking-wide">LIVE</span>
            </span>
          )}
          {mediaAllowed === false && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/80 rounded-xl">
              <VideoOff size={20} className="text-[#E05252]" />
              <span className="font-sans text-[10px] text-[#E05252]">Camera blocked</span>
            </div>
          )}
          {mediaAllowed === null && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-xl">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
        <span className="font-sans text-[10px] text-[#64687A] bg-white/90 backdrop-blur px-2 py-0.5 rounded-full border border-[#E0E0E8] flex items-center gap-1">
          <Video size={10} />
          Proctored
        </span>
        <span className="font-sans text-[10px] text-[#64687A] bg-white/90 backdrop-blur px-2 py-0.5 rounded-full border border-[#E0E0E8] flex items-center gap-1">
          {mediaAllowed === true ? (
            <>
              <Mic size={10} className="text-[#3CB97A]" />
              Mic on
            </>
          ) : (
            <>
              <MicOff size={10} className="text-[#E05252]" />
              Mic off
            </>
          )}
        </span>
        {/* Live face-proctoring status */}
        {mediaAllowed === true && faceStatus !== 'idle' && (
          <span
            className={`font-sans text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1 backdrop-blur ${
              faceStatus === 'ok'
                ? 'text-[#3CB97A] bg-white/90 border-[#E0E0E8]'
                : faceStatus === 'loading'
                  ? 'text-[#64687A] bg-white/90 border-[#E0E0E8]'
                  : faceStatus === 'unavailable'
                    ? 'text-[#A0A4B0] bg-white/90 border-[#E0E0E8]'
                    : 'text-white bg-[#E05252] border-[#E05252]'
            }`}
          >
            <ScanFace size={10} />
            {faceStatus === 'ok' && 'Face OK'}
            {faceStatus === 'loading' && 'Starting…'}
            {faceStatus === 'no-face' && 'No face'}
            {faceStatus === 'multiple-faces' && `${faceCount} faces`}
            {faceStatus === 'looking-away' && 'Look here'}
            {faceStatus === 'unavailable' && 'Face check off'}
          </span>
        )}
      </div>
    </div>
  )
}
