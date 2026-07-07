import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, AlertTriangle, CheckCircle, ShieldCheck, Video, VideoOff, Mic, MicOff, Square, Loader2, Volume2, VolumeX, Smartphone, ScanFace, Target, Lightbulb, Brain, Timer, Ban, Eye, EyeOff, ChevronDown, X } from 'lucide-react'
import { DURATION_SECONDS, ASSESSMENT_FLOW, currentStage, overlayStagesDue } from '../lib/assessmentFlow.js'
import ScenarioCard from '../components/assessment/ScenarioCard.jsx'
import { CharacterAvatar } from '../lib/characters.jsx'
import PrismLogo from '../components/ui/PrismLogo.jsx'
import { getToken } from '../lib/session.js'
import { startProctorSession, subscribeProctor, endProctorSession, scheduleEndProctorSession, cancelScheduledEnd, recallPairCode } from '../lib/proctorLink.js'
import { useFaceProctor } from '../hooks/useFaceProctor.js'
import { createTurnTracker, createVoiceMeter } from '../lib/turnSignals.js'
import { loadVoices, assignCastVoices, speakTurn, speakTurnNeural } from '../lib/voice.js'

const INSTRUCTIONS = [
  { Icon: Target, text: 'You will be placed in a realistic everyday scenario with AI participants who play different roles.' },
  { Icon: Lightbulb, text: 'This is NOT a knowledge test. You do not need to know any industry or job. There is no single right answer — we only want to see how you think and talk things through.' },
  { Icon: Mic, text: 'This is a spoken assessment. Listen to each question, then tap the mic and speak your answer — it is transcribed automatically. You can also type if you prefer.' },
  { Icon: Brain, text: 'You are assessed on Critical Thinking, Communication, Collaboration, Problem Solving, and AI & Digital Fluency — not on facts you have memorised.' },
  { Icon: Timer, text: 'You have 30 minutes. Your timer starts once you have read the scenario briefing — it cannot be paused.' },
  { Icon: Ban, text: 'Do not switch tabs or use external tools. This is your performance — not a research exercise.' },
]

function InstructionsScreen({ onBegin, phoneRequired, phoneLinked }) {
  const blocked = phoneRequired && !phoneLinked
  return (
    <div className="flex flex-col h-screen bg-[var(--color-paper)] text-[var(--color-ink)]">
      <header className="shrink-0 flex items-center justify-between px-6 py-3 bg-[var(--color-surface)] border-b border-[var(--color-line)]">
        <PrismLogo size={28} subtitle={null} />
        <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--color-ink-muted)]">
          Assessment · about 30 minutes
        </span>
      </header>
      <div className="flex-1 overflow-y-auto py-10 px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-lg mx-auto flex flex-col gap-8"
        >
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--color-accent)]/10 mb-4">
              <ShieldCheck size={22} className="text-[var(--color-accent)]" />
            </div>
            <h1 className="font-serif text-3xl text-[var(--color-ink)] mb-2">Before you begin</h1>
            <p className="font-sans text-sm text-[var(--color-ink-muted)]">30-minute assessment · 5 skill dimensions · Verified result</p>
          </div>

          <ul className="flex flex-col gap-3">
            {INSTRUCTIONS.map((item, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.08 + i * 0.06 }}
                className="flex gap-3.5 items-start p-4 rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-line)]"
              >
                <span className="shrink-0 mt-0.5 w-8 h-8 rounded-full bg-[var(--color-paper)] border border-[var(--color-line)] flex items-center justify-center">
                  <item.Icon size={15} className="text-[var(--color-ink-muted)]" aria-hidden="true" />
                </span>
                <span className="font-sans text-sm text-[var(--color-ink)] leading-relaxed">{item.text}</span>
              </motion.li>
            ))}
          </ul>

          {phoneRequired && (
            <div
              className={`flex items-center gap-3 p-4 rounded-[var(--radius-md)] border font-sans text-sm ${
                phoneLinked
                  ? 'bg-[var(--color-success-surface)] border-[var(--color-success)]/30 text-[var(--color-success)]'
                  : 'bg-[var(--color-warn-surface)] border-[var(--color-reliability-moderate)]/30 text-[var(--color-reliability-moderate)]'
              }`}
            >
              <Smartphone size={18} className="shrink-0" />
              <span>
                {phoneLinked
                  ? 'Phone camera connected — you are ready to begin.'
                  : 'Phone camera disconnected. Reconnect your phone (keep the proctor page open) to begin.'}
              </span>
            </div>
          )}

          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            onClick={onBegin}
            disabled={blocked}
            className="w-full py-4 rounded-[var(--radius-md)] bg-[var(--color-ink)] font-sans font-semibold text-sm text-[var(--color-paper)] tracking-wide hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {blocked ? 'Waiting for phone camera…' : 'Begin assessment'}
          </motion.button>

          <p className="text-center font-sans text-xs text-[var(--color-ink-muted)]">
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

// ── The screenplay transcript ────────────────────────────────────────────────
// The room is a stage, not a chat app: turns render as a script — a mono
// speaker label above body text — never bubbles. The candidate's turns are
// visually distinct but equal (an accent rule, same typography).

function initialsOf(name) {
  return (name || '?').trim().charAt(0).toUpperCase()
}

function SpeakerBadge({ name, speaking }) {
  return (
    <span
      aria-hidden="true"
      className={`w-7 h-7 rounded-full flex items-center justify-center font-mono text-[11px] shrink-0 border transition-colors ${
        speaking
          ? 'bg-[var(--color-accent-bright)]/15 border-[var(--color-accent-bright)] text-[var(--color-accent-bright)]'
          : 'bg-[var(--color-room-surface)] border-[var(--color-room-line)] text-[var(--color-ink-muted)]'
      }`}
    >
      {initialsOf(name)}
    </span>
  )
}

// One spoken turn in the script. `you` marks the candidate's own turns.
function ScriptTurn({ speaker, role, content, you = false, animate = false }) {
  return (
    <motion.div
      initial={animate ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`group flex flex-col gap-1.5 pl-4 border-l-2 ${
        you ? 'border-[var(--color-accent-bright)]' : 'border-[var(--color-room-line)]'
      }`}
    >
      <div className="flex items-baseline gap-2 flex-wrap">
        <span
          className={`font-mono text-[11px] tracking-[0.08em] uppercase ${
            you ? 'text-[var(--color-accent-bright)]' : 'text-[var(--color-ink)]'
          }`}
        >
          {speaker}
        </span>
        {role && (
          <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">{role}</span>
        )}
      </div>
      <p className="font-sans text-[15px] leading-[1.7] text-[var(--color-ink)] max-w-prose whitespace-pre-wrap">
        {content}
      </p>
    </motion.div>
  )
}

// Inline stage direction while a persona is composing (paired with text so
// nothing conveys by motion alone — LAW 4).
function RespondingNote({ name }) {
  return (
    <div className="flex items-center gap-2 pl-4 border-l-2 border-[var(--color-room-line)]" role="status">
      <span className="inline-flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="w-1 h-1 rounded-full bg-[var(--color-ink-muted)]"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1, delay: i * 0.2, repeat: Infinity }}
          />
        ))}
      </span>
      <span className="font-mono text-[11px] text-[var(--color-ink-muted)] italic">
        {name ? `${name} is responding…` : 'The panel is responding…'}
      </span>
    </div>
  )
}

// A full panel turn: participants reveal one at a time so voices don't
// overlap. Reports the currently-speaking persona upward so the stage
// foregrounds the right presence card. Already-seen history renders instantly.
function PanelTurn({ msg, isNew, onSpeakingChange }) {
  const list = msg.messages || []
  const [visibleCount, setVisibleCount] = useState(isNew ? 0 : list.length)

  useEffect(() => {
    if (!isNew) return
    if (visibleCount >= list.length) {
      onSpeakingChange?.(null)
      return
    }
    onSpeakingChange?.(list[visibleCount]?.speaker || null)
    const t = setTimeout(() => setVisibleCount((c) => c + 1), 900)
    return () => clearTimeout(t)
  }, [isNew, visibleCount, list.length, onSpeakingChange])

  return (
    <div className="flex flex-col gap-5">
      {list.slice(0, visibleCount).map((m, i) => (
        <ScriptTurn
          key={i}
          speaker={m.speaker}
          role={m.role}
          content={m.content}
          animate={isNew}
        />
      ))}
      {isNew && visibleCount < list.length && (
        <RespondingNote name={list[visibleCount]?.speaker} />
      )}
    </div>
  )
}

// ── The persona stage ──────────────────────────────────────────────────────
// Presence cards for the AI participants: idle / listening (candidate is
// speaking) / speaking (voice bars + label). Continuity from the briefing.

function VoiceBars() {
  return (
    <span className="inline-flex items-end gap-[2px] h-3" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="prism-voicebar w-[2.5px] rounded-full bg-[var(--color-accent-bright)]" style={{ animationDelay: `${i * 120}ms` }} />
      ))}
    </span>
  )
}

function PersonaCard({ name, role, state }) {
  const speaking = state === 'speaking'
  const listening = state === 'listening'
  return (
    <div
      className={`flex items-center gap-2.5 rounded-[var(--radius-md)] border px-3 py-2 min-w-0 transition-colors ${
        speaking
          ? 'bg-[var(--color-room-surface)] border-[var(--color-accent-bright)]'
          : 'bg-[var(--color-room-surface)] border-[var(--color-room-line)]'
      }`}
    >
      <SpeakerBadge name={name} speaking={speaking} />
      <div className="min-w-0">
        <p className="font-sans text-xs font-semibold text-[var(--color-ink)] truncate">{name}</p>
        <p className="font-mono text-[10px] text-[var(--color-ink-muted)] truncate flex items-center gap-1.5">
          {speaking ? (
            <>
              <VoiceBars />
              speaking
            </>
          ) : listening ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent-bright)]" aria-hidden="true" />
              listening
            </>
          ) : (
            role || 'in the room'
          )}
        </p>
      </div>
    </div>
  )
}

// The candidate's own turn — same script treatment, marked with the accent
// rule and their chosen identity. Never a right-aligned bubble.
function CandidateTurn({ content, character, userName }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col gap-1.5 pl-4 border-l-2 border-[var(--color-accent-bright)]"
    >
      <div className="flex items-center gap-2">
        {character && <CharacterAvatar id={character.id} size={20} />}
        <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--color-accent-bright)]">
          {userName || 'You'}
        </span>
        <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">you</span>
      </div>
      <p className="font-sans text-[15px] leading-[1.7] text-[var(--color-ink)] max-w-prose whitespace-pre-wrap">{content}</p>
    </motion.div>
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
  // Part E room state — presentation only, never score-affecting.
  const [activeSpeaker, setActiveSpeaker] = useState(null) // persona currently "speaking" in the reveal
  const [followNow, setFollowNow] = useState(true) // transcript auto-follow; false once the candidate scrolls up
  const [notice, setNotice] = useState(null) // transient, dismissible console notice (STT hiccups etc.)
  const [reviewDeadline, setReviewDeadline] = useState(null) // ASR review window: ms epoch when the transcript auto-commits
  const [reviewLeft, setReviewLeft] = useState(0) // seconds left in the review window (display)
  const [selfViewOpen, setSelfViewOpen] = useState(true) // own-camera thumbnail expanded vs. collapsed to the strip
  const [recordSeconds, setRecordSeconds] = useState(0) // elapsed recording clock for the listening state
  // Phone proctor link (second camera). pairCode is remembered from the
  // link-phone step; if present, the test requires the phone to stay connected.
  const [phonePairCode] = useState(() => recallPairCode(params.get('session')))
  const [phoneLinked, setPhoneLinked] = useState(false)
  // Speech-to-text mode: 'whisper' (server) when configured, else 'webspeech'
  // (browser live dictation) so the spoken test still works without an API key.
  const [sttMode, setSttMode] = useState('whisper')
  // Neural persona voices (PRISM_TTS_NEURAL): server-proxied Azure Speech when
  // the flag is lit; otherwise the persona-mapped browser voices. Either way
  // each participant speaks with their OWN voice — never one robot for all.
  const [neuralTts, setNeuralTts] = useState(false)
  const castVoicesRef = useRef(null) // Map(personaName -> {voice,pitch,rate})
  const speakCancelRef = useRef(null)
  // The exam frame, honestly reported: standalone app window vs browser tab,
  // and whether the Keyboard Lock API is holding Esc/Alt+Tab inside fullscreen.
  // The desktop shell (Tauri) announces itself via a PrismShell user agent.
  const [standalone] = useState(() =>
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)')?.matches ||
      window.navigator.standalone === true ||
      /PrismShell/.test(window.navigator.userAgent || '')))
  const [keysLocked, setKeysLocked] = useState(false)
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
  // Track 3.1 — per-turn interaction-pattern signals (timing/typing/voice
  // summaries only; consented under the research scope; server re-clamps).
  const turnTrackerRef = useRef(createTurnTracker())
  const voiceMeterRef = useRef(null)
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
  const transcriptRef = useRef(null)

  // Auto-follow the script — but never fight the candidate: once they scroll
  // up to re-read, following pauses and a "jump to now" affordance appears.
  useEffect(() => {
    if (followNow) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, followNow])

  const handleTranscriptScroll = useCallback(() => {
    const el = transcriptRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160
    setFollowNow(atBottom)
  }, [])

  const jumpToNow = useCallback(() => {
    setFollowNow(true)
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // Elapsed clock for the listening state — the candidate always sees that the
  // mic is live and for how long (push-to-talk, no open-mic ambiguity).
  useEffect(() => {
    if (!recording) {
      setRecordSeconds(0)
      return undefined
    }
    const t = setInterval(() => setRecordSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [recording])

  // ASR review window: the transcribed turn sits in the input for a short,
  // consistent window (12s) so the candidate can correct mis-recognitions —
  // corrections are captured by the Track 3.1 turn tracker as typing signals —
  // then it commits. No unlimited editing: this is a spoken assessment.
  const REVIEW_SECONDS = 12
  const enterReview = useCallback((transcript) => {
    setInput(transcript)
    setReviewDeadline(Date.now() + REVIEW_SECONDS * 1000)
    setReviewLeft(REVIEW_SECONDS)
    setTimeout(() => inputRef.current?.focus(), 60)
  }, [])

  const commitReviewRef = useRef(null)
  useEffect(() => {
    if (!reviewDeadline) return undefined
    const tick = setInterval(() => {
      const left = Math.max(0, Math.ceil((reviewDeadline - Date.now()) / 1000))
      setReviewLeft(left)
      if (left <= 0) {
        clearInterval(tick)
        commitReviewRef.current?.()
      }
    }, 250)
    return () => clearInterval(tick)
  }, [reviewDeadline])

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
      speakCancelRef.current?.()
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

  // Detect whether neural persona voices are lit (PRISM_TTS_NEURAL). Dark →
  // the persona-mapped browser voices carry the room; nothing else changes.
  useEffect(() => {
    let cancelled = false
    fetch('/api/assessment/tts-status')
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => { if (!cancelled) setNeuralTts(Boolean(d.enabled)) })
      .catch(() => { if (!cancelled) setNeuralTts(false) })
    return () => { cancelled = true }
  }, [])

  // Give every persona their own voice as soon as we know the cast. The
  // assignment is deterministic per name, distinct within the scenario, and
  // prefers the natural/Indian-English voices this device actually has.
  useEffect(() => {
    if (!scenario?.participants?.length) return
    let cancelled = false
    loadVoices().then((voices) => {
      if (cancelled) return
      castVoicesRef.current = assignCastVoices(scenario.participants, voices)
    })
    return () => { cancelled = true }
  }, [scenario])

  // Report a proctoring event to the server (best-effort, never blocks the UI).
  const reportProctorEvent = useCallback((type, meta) => {
    if (!sessionId) return
    fetch('/api/assessment/event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
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
      speakCancelRef.current?.()
      try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
    }
  }, [ttsEnabled])

  // The exam frame, recorded honestly (E.4): whether the room runs in the
  // installed app window or a browser tab — once per session at chat start —
  // and focus losses while in the standalone app (a tab-switch has no meaning
  // there, but losing the window to another app does).
  useEffect(() => {
    if (phase !== 'chat') return undefined
    reportProctorEvent('display_mode', { standalone })
    if (!standalone) return undefined
    const onBlur = () => reportProctorEvent('app_blur', {})
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [phase, standalone, reportProctorEvent])


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
        headers: {
          'Content-Type': 'application/json',
          ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        },
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

  // Enforce fullscreen while assessment is active; re-enter if user exits.
  // The proctoring strip reports the TRUE state (E.4: indicators must match
  // actual capture behaviour — never claim fullscreen that isn't).
  // Where the Keyboard Lock API exists (Chromium), Esc/Alt+Tab are held
  // INSIDE fullscreen so the browser chrome (tab strip) never surfaces — the
  // strip shows whether the lock actually engaged, never assumes it.
  const [fsActive, setFsActive] = useState(false)
  useEffect(() => {
    if (phase !== 'chat') return
    const lockKeys = () => {
      const kb = navigator.keyboard
      if (!kb?.lock) {
        setKeysLocked(false)
        return
      }
      kb.lock(['Escape', 'Tab', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'])
        .then(() => setKeysLocked(true))
        .catch(() => setKeysLocked(false))
    }
    const handleFSChange = () => {
      setFsActive(Boolean(document.fullscreenElement))
      if (!document.fullscreenElement) {
        setKeysLocked(false)
        document.documentElement.requestFullscreen?.().catch(() => {})
      } else {
        lockKeys()
      }
    }
    // Enter fullscreen immediately
    document.documentElement.requestFullscreen?.().then(() => { setFsActive(true); lockKeys() }).catch(() => {})
    document.addEventListener('fullscreenchange', handleFSChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFSChange)
      try { navigator.keyboard?.unlock?.() } catch { /* ignore */ }
    }
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
        body: JSON.stringify({ sessionId, language: localStorage.getItem('prismLanguage') || 'en' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Server errors may be structured ({ error: { message } }) — always
        // surface a human sentence, never "[object Object]".
        const msg =
          typeof data.error === 'string'
            ? data.error
            : data.error?.message || data.message || 'Failed to start assessment session'
        throw new Error(msg)
      }
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
        turnTrackerRef.current.promptShown()
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
    turnTrackerRef.current.promptShown() // first answer's clock starts now
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
      // Honest, non-destructive failure: the conversation stays on screen and
      // the candidate can retry — never a raw error, never a lost transcript.
      setNotice('We could not score your conversation just now. Nothing was lost — please press Submit again.')
      setSubmitting(false)
    }
  }, [sessionId, navigate, submitting])

  // Read an AI turn aloud so the candidate can take the test by ear. Each
  // message is spoken in ITS persona's voice — neural (server, flagged) when
  // available, otherwise the best matching voices this browser offers.
  const speak = useCallback((aiMessages) => {
    if (!ttsEnabled) return
    if (!Array.isArray(aiMessages) || !aiMessages.length) return
    speakCancelRef.current?.()
    if (neuralTts && sessionId) {
      speakCancelRef.current = speakTurnNeural(aiMessages, {
        sessionId,
        castVoices: castVoicesRef.current,
      })
    } else {
      speakCancelRef.current = speakTurn(aiMessages, castVoicesRef.current)
    }
  }, [ttsEnabled, neuralTts, sessionId])

  // Core send used by both typed and spoken answers.
  const sendText = useCallback(async (rawText) => {
    const text = (rawText || '').trim()
    if (!text || loading || submitting) return

    // Committing ends any ASR review window.
    setReviewDeadline(null)

    // Track 3.1: summarise HOW this answer was produced, then reset for the
    // next turn. Summary numbers only — never keystrokes, never audio.
    const telemetry = turnTrackerRef.current.summary(text)
    turnTrackerRef.current.reset()

    setInput('')
    setMessages((prev) => [...prev, { type: 'user', content: text }])
    setExchangeCount((c) => c + 1)
    setLoading(true)

    try {
      const res = await fetch('/api/assessment/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text, telemetry }),
      })
      if (!res.ok) throw new Error('Failed to get AI response')
      const data = await res.json()
      setMessages((prev) => [...prev, { type: 'ai', messages: data.messages, isNew: true }])
      turnTrackerRef.current.promptShown() // next answer's clock starts now
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
      form.append('sessionId', sessionId) // Track 4.1: server applies the session's ASR language hint
      const res = await fetch('/api/assessment/transcribe', { method: 'POST', body: form })
      if (res.status === 503) {
        // Server-side transcription not configured — fall back to dictation.
        setNotice('Voice transcription is unavailable right now. Type your answer or use the dictation mic.')
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not transcribe your answer.')
      if (data.transcript) {
        // E.2: the candidate reviews the transcript for a short window (typing
        // corrections are Track 3.1 signals), then it commits.
        enterReview(data.transcript)
      }
    } catch (e) {
      setNotice(e.message || 'Could not transcribe your answer. Please try again.')
    } finally {
      setTranscribing(false)
    }
  }, [enterReview, sessionId])

  const startRecording = useCallback(async () => {
    if (recording || loading || submitting || transcribing) return
    // Stop the avatar talking so it doesn't bleed into the recording.
    try { window.speechSynthesis?.cancel() } catch { /* ignore */ }

    let stream = streamRef.current
    if (!stream || stream.getAudioTracks().length === 0) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch {
        setNotice('Microphone access is required to answer by voice.')
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
      // Track 3.1: speech-onset/pause timing from loudness only — audio is
      // never persisted, and nothing about tone/prosody is measured.
      voiceMeterRef.current = createVoiceMeter(audioStream)
      recorder.start()
      setRecording(true)
    } catch {
      setNotice('Voice recording is not supported in this browser. Please type your answer.')
    }
  }, [recording, loading, submitting, transcribing, handleRecordingStop])

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop() } catch { /* ignore */ }
    }
    if (voiceMeterRef.current) {
      turnTrackerRef.current.setVoice(voiceMeterRef.current.stop())
      voiceMeterRef.current = null
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
      setNotice('Voice input is not supported in this browser. Please type your answer.')
      return
    }
    try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
    setInput('')
    voiceAnswerRef.current = ''
    answerModeRef.current = true
    listeningIntentRef.current = true
    turnTrackerRef.current.dictation()
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
    // Let the final recognition result settle, then open the review window on
    // the spoken answer (same commit semantics as the Whisper path).
    setTimeout(() => {
      const text = (voiceAnswerRef.current || '').trim()
      voiceAnswerRef.current = ''
      if (text) enterReview(text)
    }, 450)
  }, [sttMode, stopRecording, enterReview])


  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Keep the review auto-commit closure fresh: at the deadline the CURRENT
  // text in the box (with any corrections) is what commits.
  useEffect(() => {
    commitReviewRef.current = () => {
      if (!input.trim()) {
        setReviewDeadline(null)
        return
      }
      sendText(input)
    }
  })

  // Transient notices self-dismiss — they are hints, not blockers.
  useEffect(() => {
    if (!notice) return undefined
    const t = setTimeout(() => setNotice(null), 8000)
    return () => clearTimeout(t)
  }, [notice])

  // The persona stage: presence cards for the AI participants. Prefer the
  // scenario's cast (briefing continuity); fall back to speakers seen in the
  // script. Max 4 cards — this is a stage, not a roster.
  const personas = useMemo(() => {
    const seen = new Map()
    for (const p of scenario?.participants || []) {
      if (p?.name) seen.set(p.name, { name: p.name, role: p.role || '' })
    }
    for (const m of messages) {
      if (m.type !== 'ai') continue
      for (const t of m.messages || []) {
        if (t.speaker && t.speaker !== 'System' && !seen.has(t.speaker)) {
          seen.set(t.speaker, { name: t.speaker, role: t.role || '' })
        }
      }
    }
    return Array.from(seen.values()).slice(0, 4)
  }, [scenario, messages])

  // E.3 — time as calm information: elapsed + phase, gentle thresholds at 75%
  // and 90% (visual shift + polite announcement), never a red countdown. The
  // adaptive engine may extend, so duration is framed as "about 30 minutes".
  const elapsed = DURATION_SECONDS - timeLeft
  const progress = Math.min(1, elapsed / DURATION_SECONDS)
  const timePhase = progress >= 0.9 ? 'final' : progress >= 0.75 ? 'closing' : 'open'
  const stage = currentStage(elapsed)

  // Everything the mic state machine tells the candidate (and screen readers).
  const micStatus = recording
    ? `Listening — ${formatTime(recordSeconds)}. Tap the stop button to end your turn.`
    : transcribing
      ? 'Transcribing your answer…'
      : reviewDeadline
        ? `Check your transcribed answer — it sends in ${reviewLeft}s. Fix anything the transcription got wrong, or send now.`
        : listening
          ? 'Dictating — your words appear in the box. Send when ready.'
          : loading
            ? 'The panel is responding…'
            : 'Tap the mic to speak your answer, or type. Enter sends.'

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
    <div className="room-dark flex flex-col h-screen bg-[var(--color-room)] text-[var(--color-ink)] font-sans">
      <style>{`
        .prism-voicebar{height:3px;animation:prismVoice 900ms ease-in-out infinite}
        @keyframes prismVoice{0%,100%{height:3px}50%{height:12px}}
        .room-dark ::selection{background:var(--color-accent-bright);color:var(--color-room)}
        .room-dark textarea::placeholder{color:var(--color-ink-muted);opacity:0.8}
      `}</style>

      {/* Top bar: identity · stage · calm time · submit */}
      <header className="shrink-0 border-b border-[var(--color-room-line)] bg-[var(--color-room-surface)]">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-2.5">
          <div className="flex items-center gap-3 min-w-0">
            <PrismLogo size={24} subtitle={null} wordmarkColor="var(--color-room-ink)" />
            <span className="hidden sm:inline font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--color-ink-muted)]">
              {stage.label}
            </span>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <span
              className={`font-mono text-[11px] tabular-nums ${
                timePhase === 'open' ? 'text-[var(--color-ink-muted)]' : 'text-[var(--color-reliability-moderate)]'
              }`}
              role="timer"
              aria-label={`${formatTime(elapsed)} elapsed of about thirty minutes`}
            >
              {formatTime(elapsed)} <span className="hidden sm:inline">· about 30 min</span>
            </span>
            <button
              onClick={() => handleSubmit(false)}
              disabled={submitting || exchangeCount < 3}
              className="flex items-center gap-2 px-3.5 py-2 rounded-[var(--radius-sm)] font-sans font-semibold text-xs border border-[var(--color-room-line)] bg-[var(--color-room)] text-[var(--color-ink)] enabled:hover:border-[var(--color-accent-bright)] enabled:hover:text-[var(--color-accent-bright)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title={exchangeCount < 3 ? 'Please engage more before submitting' : 'End assessment and get your score'}
            >
              <CheckCircle size={14} />
              <span>Submit & Get Score</span>
            </button>
          </div>
        </div>

        {/* Thin session progress with phase markers — information, not alarm */}
        <div className="relative h-[3px] bg-[var(--color-room-line)]" aria-hidden="true">
          <div
            className="absolute inset-y-0 left-0 bg-[var(--color-accent-bright)] transition-[width] duration-1000 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
          {ASSESSMENT_FLOW.filter((s) => s.atSecond > 60).map((s) => (
            <span
              key={s.id}
              className="absolute top-0 bottom-0 w-px bg-[var(--color-room)]"
              style={{ left: `${(s.atSecond / DURATION_SECONDS) * 100}%` }}
            />
          ))}
        </div>
      </header>

      {/* Polite time announcements for screen readers */}
      <div aria-live="polite" className="sr-only">
        {timePhase === 'closing' && 'The conversation is in its closing phase.'}
        {timePhase === 'final' && 'Final minutes. Wrap up your thoughts and submit when ready.'}
      </div>

      {/* Gentle wrap-up ribbon (replaces the old red banner) */}
      <AnimatePresence>
        {timePhase !== 'open' && !submitting && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 overflow-hidden bg-[var(--color-room-surface)] border-b border-[var(--color-room-line)]"
          >
            <div className="flex items-center gap-2 px-4 sm:px-6 py-1.5">
              <Timer size={12} className="text-[var(--color-reliability-moderate)] shrink-0" />
              <p className="font-mono text-[11px] text-[var(--color-ink-muted)]">
                {timePhase === 'final'
                  ? 'Final minutes — wrap up and press Submit & Get Score when you are ready.'
                  : 'Closing phase — start bringing your thinking together.'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PERSONA STAGE — who is in the room, and who has the floor */}
      {!initialising && !error && personas.length > 0 && (
        <div className="shrink-0 border-b border-[var(--color-room-line)] bg-[var(--color-room)]">
          <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-2.5 flex gap-2 overflow-x-auto">
            {personas.map((p) => (
              <PersonaCard
                key={p.name}
                name={p.name}
                role={p.role}
                state={
                  activeSpeaker === p.name
                    ? 'speaking'
                    : recording || listening
                      ? 'listening'
                      : 'idle'
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* THE SCRIPT — speaker-labeled turns, not bubbles */}
      <div
        ref={transcriptRef}
        onScroll={handleTranscriptScroll}
        className="relative flex-1 overflow-y-auto select-none"
        onCopy={(e) => e.preventDefault()}
      >
        <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-6 flex flex-col gap-7 min-h-full">
          {initialising ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-4" role="status">
              <div className="w-8 h-8 border-2 border-[var(--color-accent-bright)] border-t-transparent rounded-full animate-spin" aria-hidden="true" />
              <p className="font-mono text-xs text-[var(--color-ink-muted)]">Setting up your scenario…</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center">
              <AlertTriangle size={28} className="text-[var(--color-danger)]" />
              <p className="font-sans text-sm text-[var(--color-ink-muted)] max-w-sm">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="font-mono text-xs text-[var(--color-accent-bright)] underline underline-offset-4 cursor-pointer"
              >
                Reload page
              </button>
            </div>
          ) : (
            <>
              {messages.map((msg, i) =>
                msg.type === 'user' ? (
                  <CandidateTurn key={i} content={msg.content} character={character} userName={userName} />
                ) : (
                  <PanelTurn
                    key={i}
                    msg={msg}
                    isNew={msg.isNew}
                    onSpeakingChange={msg.isNew ? setActiveSpeaker : undefined}
                  />
                )
              )}
              {loading && <RespondingNote name={null} />}
            </>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Jump-to-now affordance when the candidate has scrolled up */}
        <AnimatePresence>
          {!followNow && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              onClick={jumpToNow}
              className="sticky bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3.5 py-2 rounded-[var(--radius-full)] bg-[var(--color-room-surface)] border border-[var(--color-room-line)] font-mono text-[11px] text-[var(--color-ink)] shadow-lg hover:border-[var(--color-accent-bright)] transition-colors cursor-pointer"
            >
              <ChevronDown size={13} aria-hidden="true" />
              Jump to now
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Transient console notice — honest, dismissible, never a raw error */}
      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 overflow-hidden bg-[var(--color-room-surface)] border-t border-[var(--color-room-line)]"
          >
            <div className="max-w-3xl mx-auto w-full flex items-start gap-2 px-4 sm:px-6 py-2">
              <AlertTriangle size={13} className="text-[var(--color-reliability-moderate)] shrink-0 mt-0.5" aria-hidden="true" />
              <p className="flex-1 font-sans text-xs text-[var(--color-ink)]" role="status">{notice}</p>
              <button
                onClick={() => setNotice(null)}
                aria-label="Dismiss notice"
                className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] cursor-pointer"
              >
                <X size={13} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CANDIDATE CONSOLE — the mic state machine + full typing parity */}
      <div className="shrink-0 bg-[var(--color-room-surface)] border-t border-[var(--color-room-line)] px-4 sm:px-6 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
        {/* ASR review strip — visible commit window, explicit send-now */}
        <AnimatePresence>
          {reviewDeadline && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="max-w-3xl mx-auto mb-2.5 flex items-center gap-2.5 px-3.5 py-2 rounded-[var(--radius-md)] border border-[var(--color-accent-bright)]/50 bg-[var(--color-room)]"
            >
              <span className="font-mono text-[11px] text-[var(--color-accent-bright)] tabular-nums shrink-0" aria-hidden="true">
                {reviewLeft}s
              </span>
              <p className="flex-1 font-sans text-xs text-[var(--color-ink)]">
                Check your transcribed answer below — fix anything the transcription missed. It sends automatically.
              </p>
              <button
                onClick={sendMessage}
                className="font-mono text-[11px] text-[var(--color-accent-bright)] underline underline-offset-4 shrink-0 cursor-pointer"
              >
                Send now
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="max-w-3xl mx-auto flex gap-2.5 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { turnTrackerRef.current.key(e); onKeyDown(e) }}
            onPaste={() => turnTrackerRef.current.paste()}
            disabled={loading || submitting || initialising || recording || transcribing}
            placeholder={
              recording
                ? 'Listening — speak your answer…'
                : transcribing
                  ? 'Transcribing…'
                  : 'Speak with the mic, or type here — both count the same'
            }
            rows={2}
            className="flex-1 resize-none bg-[var(--color-room)] border border-[var(--color-room-line)] rounded-[var(--radius-md)] px-4 py-3 font-sans text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-accent-bright)]/70 transition-colors disabled:opacity-50"
            aria-label="Your response"
          />

          {/* Narration toggle — the panel's questions read aloud */}
          <button
            onClick={() => setTtsEnabled((v) => !v)}
            disabled={initialising}
            aria-label={ttsEnabled ? 'Mute panel narration' : 'Unmute panel narration'}
            title={ttsEnabled ? 'Narration on' : 'Narration off'}
            className={`flex items-center justify-center w-11 h-11 rounded-[var(--radius-md)] border transition-colors disabled:opacity-40 cursor-pointer shrink-0 ${
              ttsEnabled
                ? 'bg-[var(--color-room)] border-[var(--color-room-line)] text-[var(--color-ink)]'
                : 'bg-[var(--color-room)] border-[var(--color-room-line)] text-[var(--color-ink-muted)]'
            }`}
          >
            {ttsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          {/* THE MIC — push-to-talk state machine: ready → listening →
              processing → review → committed. Explicit end-turn, always. */}
          <button
            onClick={recording ? stopVoiceAnswer : startVoiceAnswer}
            disabled={loading || submitting || initialising || transcribing || Boolean(reviewDeadline)}
            aria-label={recording ? `Stop recording — ${formatTime(recordSeconds)} recorded` : 'Record your spoken answer'}
            title={recording ? 'End your turn' : 'Speak your answer'}
            className={`relative flex items-center justify-center gap-2 h-11 rounded-[var(--radius-md)] border transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0 ${
              recording
                ? 'px-3.5 bg-[var(--color-room)] border-[var(--color-accent-bright)] text-[var(--color-accent-bright)]'
                : 'w-11 bg-[var(--color-accent-bright)]/10 border-[var(--color-accent-bright)]/60 text-[var(--color-accent-bright)] hover:bg-[var(--color-accent-bright)]/20'
            }`}
          >
            {transcribing ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : recording ? (
              <>
                <VoiceBars />
                <span className="font-mono text-[11px] tabular-nums">{formatTime(recordSeconds)}</span>
                <Square size={13} aria-hidden="true" />
              </>
            ) : (
              <Mic size={16} aria-hidden="true" />
            )}
          </button>

          {/* Optional browser dictation into the text box (only useful as a
              separate control when Whisper does the primary capture). */}
          {voiceSupported && sttMode === 'whisper' && (
            <button
              onClick={toggleVoice}
              disabled={loading || submitting || initialising || recording || transcribing}
              aria-label={listening ? 'Stop dictation' : 'Dictate into the box'}
              title={listening ? 'Stop dictation' : 'Dictate into the box'}
              className={`relative flex items-center justify-center w-11 h-11 rounded-[var(--radius-md)] border transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0 ${
                listening
                  ? 'bg-[var(--color-room)] border-[var(--color-accent-bright)] text-[var(--color-accent-bright)]'
                  : 'bg-[var(--color-room)] border-[var(--color-room-line)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
              }`}
            >
              {listening ? <Mic size={16} /> : <MicOff size={16} />}
            </button>
          )}

          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading || submitting || initialising || recording || transcribing}
            aria-label="Send your answer"
            className="flex items-center justify-center w-11 h-11 rounded-[var(--radius-md)] bg-[var(--color-ink)] text-[var(--color-room)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0 hover:opacity-90 transition-opacity"
          >
            <Send size={16} />
          </button>
        </div>

        {/* Mic state, announced — one line, always true */}
        <p className="max-w-3xl mx-auto font-mono text-[10px] text-[var(--color-ink-muted)] mt-2 px-1" aria-live="polite">
          {micStatus}
        </p>
      </div>

      {/* Staged-flow overlays */}
      <AnimatePresence>
        {activeOverlay === 'scenario_card' && scenario && (
          <ScenarioCard scenario={scenario} onDismiss={beginAfterScenario} />
        )}
      </AnimatePresence>

      {/* Scoring hold state — a graceful curtain, never a frozen room */}
      <AnimatePresence>
        {submitting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[105] bg-[var(--color-room)]/95 backdrop-blur-sm flex items-center justify-center px-6"
          >
            <div className="text-center max-w-sm" role="status">
              <div className="w-10 h-10 mx-auto mb-5 border-2 border-[var(--color-accent-bright)] border-t-transparent rounded-full animate-spin" aria-hidden="true" />
              <h2 className="font-serif text-2xl text-[var(--color-ink)] mb-2">Scoring your conversation</h2>
              <p className="font-sans text-sm text-[var(--color-ink-muted)] leading-relaxed">
                An independent panel of AI judges is reading your full transcript.
                This usually takes under a minute — please keep this window open.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Integrity notice — calm, tells the candidate exactly what was recorded */}
      <AnimatePresence>
        {showTabWarning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-[var(--color-room)]/90 backdrop-blur-sm flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 12 }}
              className="bg-[var(--color-room-surface)] border border-[var(--color-room-line)] rounded-[var(--radius-lg)] p-7 max-w-sm w-full mx-4 text-center shadow-2xl"
            >
              <div className="w-11 h-11 rounded-full bg-[var(--color-reliability-moderate)]/15 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={22} className="text-[var(--color-reliability-moderate)]" aria-hidden="true" />
              </div>
              <h2 className="font-serif text-xl text-[var(--color-ink)] mb-2">Integrity event recorded</h2>
              <p className="font-sans text-sm text-[var(--color-ink-muted)] mb-1 leading-relaxed">
                Leaving this tab or attempting a screenshot is recorded with your session and may be
                reviewed by a person.
              </p>
              <p className="font-mono text-[11px] text-[var(--color-ink-muted)] mb-6">
                Recorded events this session: {tabViolations}
              </p>
              <button
                onClick={() => setShowTabWarning(false)}
                className="w-full py-3 rounded-[var(--radius-md)] bg-[var(--color-room-ink)] font-sans font-semibold text-sm text-[var(--color-room)] hover:opacity-90 transition-opacity cursor-pointer"
              >
                Return to the conversation
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live face-proctoring notice — calm and specific */}
      <AnimatePresence>
        {faceWarning && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[95]"
          >
            <div className="flex items-center gap-2 rounded-[var(--radius-full)] bg-[var(--color-room-surface)] border border-[var(--color-reliability-moderate)] px-4 py-2 shadow-lg">
              <ScanFace size={14} className="text-[var(--color-reliability-moderate)] shrink-0" aria-hidden="true" />
              <span className="font-sans text-xs font-medium text-[var(--color-ink)]" role="status">{faceWarning}</span>
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
            className="fixed inset-0 z-[90] bg-[var(--color-room)]/95 backdrop-blur-sm flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 12 }}
              className="bg-[var(--color-room-surface)] border border-[var(--color-room-line)] rounded-[var(--radius-lg)] p-7 max-w-sm w-full mx-4 text-center shadow-2xl"
            >
              <div className="w-11 h-11 rounded-full bg-[var(--color-info)]/15 flex items-center justify-center mx-auto mb-4">
                <Smartphone size={22} className="text-[var(--color-info)]" aria-hidden="true" />
              </div>
              <h2 className="font-serif text-xl text-[var(--color-ink)] mb-2">Phone camera disconnected</h2>
              <p className="font-sans text-sm text-[var(--color-ink-muted)] mb-4 leading-relaxed">
                Your second camera went offline. Re-open the proctor page on your phone (or scan the
                QR again) and keep that screen on. The test will resume automatically once it
                reconnects.
              </p>
              <div className="inline-flex items-center gap-2 font-mono text-xs text-[var(--color-ink)]" role="status">
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                Waiting for your phone…
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PROCTORING PRESENCE — honest, always-visible, collapsible thumbnail.
          The video element stays mounted (and playing) even when collapsed so
          face proctoring never silently stops (indicators = actual capture). */}
      <div className={`fixed bottom-4 right-4 z-50 flex flex-col items-end gap-1.5 transition-opacity duration-300 ${phase === 'chat' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {/* Phone second-camera feed (when a phone was linked) */}
        {phonePairCode && (
          <div className={`relative ${selfViewOpen ? '' : 'hidden'}`}>
            {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
            <img
              ref={phoneImgRef}
              alt="Phone proctor camera"
              className={`w-40 h-28 rounded-[var(--radius-md)] object-cover shadow-2xl bg-[var(--color-room)] border ${
                phoneLinked ? 'border-[var(--color-room-line)]' : 'border-[var(--color-danger)]/60'
              } ${phoneLinked ? 'block' : 'opacity-30'}`}
            />
            {phoneLinked ? (
              <span className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-[var(--color-room)]/70 rounded-[var(--radius-full)] px-2 py-0.5">
                <Smartphone size={10} className="text-[var(--color-room-ink)]" aria-hidden="true" />
                <span className="font-mono text-[9px] text-[var(--color-room-ink)] tracking-wide">PHONE</span>
              </span>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[var(--color-room)]/85 rounded-[var(--radius-md)]">
                <Smartphone size={16} className="text-[var(--color-danger)]" aria-hidden="true" />
                <span className="font-mono text-[10px] text-[var(--color-danger)]">Phone offline</span>
              </div>
            )}
          </div>
        )}
        <div className={`relative ${selfViewOpen ? '' : 'w-px h-px overflow-hidden opacity-0'}`}>
          <video
            ref={videoCallbackRef}
            autoPlay
            muted
            playsInline
            className={`w-40 h-28 rounded-[var(--radius-md)] object-cover shadow-2xl bg-[var(--color-room)] border ${
              mediaAllowed === true ? 'border-[var(--color-room-line)]' : 'border-[var(--color-danger)]/60'
            }`}
          />
          {/* Live indicator */}
          {mediaAllowed === true && (
            <span className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-[var(--color-room)]/70 rounded-[var(--radius-full)] px-2 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-danger)] animate-pulse" aria-hidden="true" />
              <span className="font-mono text-[9px] text-[var(--color-room-ink)] tracking-wide">REC</span>
            </span>
          )}
          {mediaAllowed === false && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[var(--color-room)]/85 rounded-[var(--radius-md)]">
              <VideoOff size={18} className="text-[var(--color-danger)]" aria-hidden="true" />
              <span className="font-mono text-[10px] text-[var(--color-danger)]">Camera blocked</span>
            </div>
          )}
          {mediaAllowed === null && (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-room)]/70 rounded-[var(--radius-md)]">
              <div className="w-5 h-5 border-2 border-[var(--color-room-ink)] border-t-transparent rounded-full animate-spin" aria-hidden="true" />
            </div>
          )}
        </div>

        {/* The truthful indicator strip */}
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={() => setSelfViewOpen((v) => !v)}
            className="font-mono text-[10px] text-[var(--color-ink-muted)] bg-[var(--color-room-surface)] px-2 py-0.5 rounded-[var(--radius-full)] border border-[var(--color-room-line)] flex items-center gap-1 hover:text-[var(--color-ink)] transition-colors cursor-pointer"
            aria-pressed={!selfViewOpen}
          >
            {selfViewOpen ? <EyeOff size={10} aria-hidden="true" /> : <Eye size={10} aria-hidden="true" />}
            {selfViewOpen ? 'Hide preview' : 'Show preview'}
          </button>
          <span className="font-mono text-[10px] text-[var(--color-ink-muted)] bg-[var(--color-room-surface)] px-2 py-0.5 rounded-[var(--radius-full)] border border-[var(--color-room-line)] flex items-center gap-1">
            {mediaAllowed === true ? <Video size={10} aria-hidden="true" /> : <VideoOff size={10} className="text-[var(--color-danger)]" aria-hidden="true" />}
            {mediaAllowed === true ? 'Camera recording' : mediaAllowed === false ? 'Camera blocked' : 'Camera starting…'}
          </span>
          <span className="font-mono text-[10px] text-[var(--color-ink-muted)] bg-[var(--color-room-surface)] px-2 py-0.5 rounded-[var(--radius-full)] border border-[var(--color-room-line)] flex items-center gap-1">
            {mediaAllowed === true ? (
              <>
                <Mic size={10} className="text-[var(--color-success)]" aria-hidden="true" />
                Mic on
              </>
            ) : (
              <>
                <MicOff size={10} className="text-[var(--color-danger)]" aria-hidden="true" />
                Mic off
              </>
            )}
          </span>
          {!fsActive && (
            <span className="font-mono text-[10px] text-[var(--color-reliability-moderate)] bg-[var(--color-room-surface)] px-2 py-0.5 rounded-[var(--radius-full)] border border-[var(--color-room-line)] flex items-center gap-1">
              <AlertTriangle size={10} aria-hidden="true" />
              Not fullscreen
            </span>
          )}
          <span className="font-mono text-[10px] text-[var(--color-ink-muted)] bg-[var(--color-room-surface)] px-2 py-0.5 rounded-[var(--radius-full)] border border-[var(--color-room-line)]">
            {standalone ? 'App window' : 'Browser tab'}{fsActive ? (keysLocked ? ' · keys held' : '') : ''}
          </span>
          {/* Live face-proctoring status */}
          {mediaAllowed === true && faceStatus !== 'idle' && (
            <span
              className={`font-mono text-[10px] px-2 py-0.5 rounded-[var(--radius-full)] border flex items-center gap-1 bg-[var(--color-room-surface)] ${
                faceStatus === 'ok'
                  ? 'text-[var(--color-success)] border-[var(--color-room-line)]'
                  : faceStatus === 'loading' || faceStatus === 'unavailable'
                    ? 'text-[var(--color-ink-muted)] border-[var(--color-room-line)]'
                    : 'text-[var(--color-danger)] border-[var(--color-danger)]/50'
              }`}
            >
              <ScanFace size={10} aria-hidden="true" />
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
    </div>
  )
}
