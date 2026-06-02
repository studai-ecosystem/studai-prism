import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, AlertTriangle, Clock, CheckCircle, ShieldCheck, Video, VideoOff } from 'lucide-react'
import { DURATION_SECONDS, currentStage, overlayStagesDue } from '../lib/assessmentFlow.js'
import ScenarioCard from '../components/assessment/ScenarioCard.jsx'

const INSTRUCTIONS = [
  { icon: '🎯', text: 'You will be placed in a realistic business scenario with AI participants who play different roles.' },
  { icon: '💬', text: 'Respond naturally — as if this were a real professional conversation. Type your answers in full sentences.' },
  { icon: '🧠', text: 'You are assessed on Critical Thinking, Communication, Collaboration, Problem Solving, and AI & Digital Fluency.' },
  { icon: '⏱️', text: 'You have 30 minutes. The timer starts when you click Begin. It cannot be paused.' },
  { icon: '🚫', text: 'Do not switch tabs or use external tools. This is your performance — not a research exercise.' },
]

function InstructionsScreen({ onBegin }) {
  return (
    <div className="flex flex-col h-screen bg-white text-[#1A1A2E]">
      <header className="shrink-0 flex items-center px-6 py-3 bg-[#F5F5FA] border-b border-[#E0E0E8]">
        <span className="font-serif text-lg text-[#1A1A2E]">Prism</span>
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
            <p className="font-sans text-sm text-[#64687A]">30-minute assessment · 5 skill dimensions · Certified result</p>
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

          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            onClick={onBegin}
            className="w-full py-4 rounded-xl bg-[#1A1A2E] font-sans font-semibold text-sm text-[#C9A84C] tracking-wide hover:bg-[#252A3A] transition-colors cursor-pointer"
          >
            Begin Assessment →
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

function AiMessage({ msg, isNew }) {
  return (
    <motion.div
      initial={isNew ? { opacity: 0, y: 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-3"
    >
      {msg.messages
        ? msg.messages.map((m, i) => (
            <div key={i} className="flex gap-3 items-start">
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
            </div>
          ))
        : null}
    </motion.div>
  )
}

function UserMessage({ content }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex justify-end"
    >
      <div className="bg-[#C9A84C]/15 border border-[#C9A84C]/30 rounded-2xl rounded-tr-sm px-4 py-3 max-w-lg">
        <p className="font-sans text-sm text-[#1A1A2E] leading-relaxed">{content}</p>
      </div>
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
  const firedStagesRef = useRef(new Set())
  const timerRef = useRef(null)
  const streamRef = useRef(null)
  const videoRef = useRef(null)

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

  // Clean up timer and media stream on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // Tab-switch & screenshot proctoring
  useEffect(() => {
    if (phase !== 'chat') return
    const handleVisibility = () => {
      if (document.hidden) {
        setTabViolations((v) => v + 1)
        setShowTabWarning(true)
      }
    }
    const handleKey = (e) => {
      const isScreenshot =
        e.key === 'PrintScreen' ||
        (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4' || e.key === 's'))
      if (isScreenshot) {
        e.preventDefault()
        setShowTabWarning(true)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      document.removeEventListener('keydown', handleKey)
    }
  }, [phase])

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
    startTimer()
    // Camera + microphone — request immediately, attach when granted
    navigator.mediaDevices?.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        streamRef.current = stream
        setMediaAllowed(true)
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => setMediaAllowed(false))
    try {
      const res = await fetch('/api/assessment/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      if (!res.ok) throw new Error('Failed to start assessment session')
      const data = await res.json()
      setMessages([{ type: 'ai', messages: data.messages, isNew: true }])
      setScenario(data.scenario || null)
      setInitialising(false)
    } catch (e) {
      setError(e.message)
      setInitialising(false)
    }
  }, [sessionId, startTimer])

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
      navigate(`/score?session=${sessionId}`, { state: { report: data } })
    } catch (e) {
      setError('Could not generate your score. Please try again.')
      setSubmitting(false)
    }
  }, [sessionId, navigate, submitting])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
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
  }, [input, loading, submitting, sessionId])

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
    return <InstructionsScreen onBegin={startSession} />
  }

  return (
    <div className="flex flex-col h-screen bg-white text-[#1A1A2E]">
      {/* Top bar */}
      <header className="shrink-0 flex items-center justify-between px-6 py-3 bg-[#F5F5FA] border-b border-[#E0E0E8]">
        <div className="flex items-center gap-3">
          <span className="font-serif text-lg text-[#1A1A2E]">Prism</span>
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
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 flex flex-col gap-6 max-w-4xl mx-auto w-full select-none" onCopy={(e) => e.preventDefault()}>
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
                <UserMessage key={i} content={msg.content} />
              ) : (
                <AiMessage key={i} msg={msg} isNew={msg.isNew} />
              )
            )}
            {loading && <TypingIndicator />}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="shrink-0 bg-[#F5F5FA] border-t border-[#E0E0E8] px-4 sm:px-8 py-4">
        <div className="max-w-4xl mx-auto flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={loading || submitting || initialising}
            placeholder="Type your response… (Enter to send, Shift+Enter for new line)"
            rows={2}
            className="flex-1 resize-none bg-white border border-[#E0E0E8] rounded-xl px-4 py-3 font-sans text-sm text-[#1A1A2E] placeholder-[#64687A] focus:outline-none focus:border-[#C9A84C]/60 transition-colors disabled:opacity-50"
            aria-label="Your response"
          />
          <motion.button
            onClick={sendMessage}
            disabled={!input.trim() || loading || submitting || initialising}
            aria-label="Send message"
            className="flex items-center justify-center w-11 h-11 rounded-xl bg-[#C9A84C] text-[#0A0D14] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Send size={16} />
          </motion.button>
        </div>
        <p className="max-w-4xl mx-auto font-sans text-[10px] text-[#64687A] mt-2 px-1">
          Press Enter to send · Shift+Enter for new line · Your conversation is private and processed for scoring only.
        </p>
      </div>

      {/* Staged-flow overlays */}
      <AnimatePresence>
        {activeOverlay === 'scenario_card' && scenario && (
          <ScenarioCard scenario={scenario} onDismiss={() => setActiveOverlay(null)} />
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

      {/* Camera / proctoring overlay — always in DOM so ref is stable */}
      <div className={`fixed bottom-4 right-4 z-50 flex flex-col items-end gap-1.5 transition-opacity duration-300 ${phase === 'chat' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
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
      </div>
    </div>
  )
}
