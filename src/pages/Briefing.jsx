import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShieldCheck, MonitorX, Clock, Copy, Eye, Camera, Check } from 'lucide-react'
import { CHARACTERS, CharacterAvatar } from '../lib/characters.jsx'
import PrismLogo from '../components/ui/PrismLogo.jsx'
import { CONSENT_VERSION } from '../../server/lib/sharedConstants.js'

const RULES = [
  { icon: MonitorX, text: 'Do not switch tabs or close this window' },
  { icon: Clock, text: 'You have 30 minutes — the timer cannot be paused' },
  { icon: Camera, text: 'Keep your camera on if prompted' },
  { icon: Copy, text: 'No right-click, copy, or paste' },
  { icon: Eye, text: 'This is your performance — not a research exercise' },
]

// Affirmative consent items (DPDP / EU AI Act). All must be accepted before
// the candidate can enter the assessment. Each item describes something the
// system ACTUALLY does — keep this list in sync with the server behaviour it
// names (faceProctor.js, proctorSocket.js, telemetry) and bump CONSENT_VERSION
// in server/lib/sharedConstants.js whenever the wording or scope set changes.
const CONSENT_ITEMS = [
  { scope: 'data_processing', label: 'I consent to my responses being processed to generate my skills report.' },
  { scope: 'ai_disclosure', label: 'I understand the interviewers are AI-generated characters, not real people.' },
  { scope: 'ai_scoring_oversight', label: 'I understand my responses are scored by an AI system, and that I can request human review of my result.' },
  { scope: 'proctoring', label: 'I consent to proctoring (tab-switch, paste and fullscreen-exit monitoring) during the session.' },
  { scope: 'face_analysis', label: 'I consent to my webcam feed being analysed on my device during the session — including face detection, facial-landmark and gaze estimation, and detection of additional people — with the resulting integrity events (e.g. face absent, multiple faces, looking away) recorded with my session.' },
  { scope: 'phone_camera_relay', label: 'If I link my phone as a second proctoring camera, I consent to its camera frames being relayed through Prism\u2019s server to my desktop in real time. Frames are relayed in memory only and are not stored.' },
  { scope: 'research_calibration', label: 'I consent to my assessment responses, scores, and interaction patterns (such as response timing, typing rhythm and revision counts — never recordings of my voice or keystrokes) being used, in pseudonymised form, for research and for calibrating and improving the scoring system.' },
  { scope: 'own_work', label: 'I confirm this will be my own unaided work.' },
]

const CALIBRATION_PROMPT =
  'In 3–5 sentences, describe a real situation where you had to make a difficult decision with incomplete information. What did you do, and what would you do differently now?'

export default function Briefing() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const sessionId = params.get('session')

  const [selectedCharacter, setSelectedCharacter] = useState(null)
  const [userName, setUserName] = useState(() => localStorage.getItem('prismUserName') || '')
  const [nameError, setNameError] = useState('')
  const [nameFocused, setNameFocused] = useState(false)
  const [consent, setConsent] = useState({})
  const [calibrationAnswer, setCalibrationAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [filter, setFilter] = useState('all') // 'all' | 'male' | 'female'
  const [shaking, setShaking] = useState(false)
  // Track 4.1 — assessment language (selector shows only when PRISM_LANG on).
  const [languages, setLanguages] = useState([])
  const [language, setLanguage] = useState(() => localStorage.getItem('prismLanguage') || 'en')

  useEffect(() => {
    let cancelled = false
    fetch('/api/assessment/languages')
      .then((r) => (r.ok ? r.json() : { enabled: false, languages: [] }))
      .then((d) => { if (!cancelled && d.enabled) setLanguages(d.languages) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const pickLanguage = (code) => {
    setLanguage(code)
    localStorage.setItem('prismLanguage', code)
  }

  const visibleChars = filter === 'all' ? CHARACTERS : CHARACTERS.filter((c) => c.gender === filter)

  // 3D tilt — track the pointer over a card and rotate towards it.
  const handleTilt = (e) => {
    const el = e.currentTarget
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const rotateX = (y - rect.height / 2) / 8
    const rotateY = (rect.width / 2 - x) / 8
    el.style.transform = `perspective(600px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.04)`
  }
  const handleTiltReset = (e, isSelected) => {
    e.currentTarget.style.transform = isSelected
      ? 'perspective(600px) scale(1.05)'
      : 'perspective(600px) scale(1)'
  }

  // Shake all visible cards, then land on a random one and reveal the panel.
  const handleSurprise = () => {
    setShaking(true)
    setTimeout(() => {
      setShaking(false)
      const pool = filter === 'all' ? CHARACTERS : CHARACTERS.filter((c) => c.gender === filter)
      setSelectedCharacter(pool[Math.floor(Math.random() * pool.length)])
    }, 600)
  }

  const allConsented = CONSENT_ITEMS.every((c) => consent[c.scope])

  const toggleConsent = (scope) =>
    setConsent((prev) => ({ ...prev, [scope]: !prev[scope] }))

  const handleNameChange = (e) => {
    const value = e.target.value
    setUserName(value)
    localStorage.setItem('prismUserName', value)
    if (value.trim()) setNameError('')
  }

  const handleEnter = async () => {
    if (!userName.trim()) {
      setNameError('Please enter your name to continue')
      return
    }
    if (!selectedCharacter) return
    if (!sessionId) {
      localStorage.setItem('prismCharacter', JSON.stringify(selectedCharacter))
      navigate('/payment')
      return
    }
    if (!allConsented) {
      setSubmitError('Please accept all consent items to continue.')
      return
    }

    localStorage.setItem('prismCharacter', JSON.stringify(selectedCharacter))
    setSubmitting(true)
    setSubmitError('')
    try {
      // Record affirmative consent (required) and run difficulty calibration
      // (best-effort) before entering the closed assessment surface.
      const consentRes = await fetch('/api/assessment/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          scopes: CONSENT_ITEMS.map((c) => c.scope),
          consentVersion: CONSENT_VERSION,
        }),
      })
      if (!consentRes.ok) {
        const data = await consentRes.json().catch(() => ({}))
        throw new Error(data.error || 'Could not record consent.')
      }

      // Calibration is non-blocking — failures fall back to the default tier.
      try {
        await fetch('/api/assessment/calibrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, answer: calibrationAnswer }),
        })
      } catch {
        /* ignore — server defaults to intermediate tier */
      }
    } catch (err) {
      setSubmitting(false)
      setSubmitError(err.message || 'Something went wrong. Please try again.')
      return
    }

    setSubmitting(false)
    // Trigger fullscreen lock before entering the closed assessment surface.
    document.documentElement.requestFullscreen?.().catch(() => {})
    navigate(`/assessment?session=${sessionId}`)
  }

  return (
    <div className="min-h-screen bg-[var(--color-paper)] text-[var(--color-ink)] flex flex-col overflow-x-hidden">
      <header className="shrink-0 flex items-center px-6 h-16 bg-[var(--color-surface)] border-b border-[var(--color-line)]">
        <PrismLogo size={32} />
      </header>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-xl flex flex-col gap-8"
        >
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--color-accent)]/10 mb-4">
              <ShieldCheck size={22} className="text-[var(--color-accent)]" />
            </div>
            <h1 className="font-serif text-4xl text-[var(--color-ink)] mb-2">Your assessment is about to begin</h1>
            <p className="font-sans text-sm text-[var(--color-ink-muted)]">30-minute assessment · 5 skill dimensions · Verified result</p>
          </div>

          {/* Rules */}
          <ul className="flex flex-col gap-3">
            {RULES.map(({ icon: Icon, text }, i) => (
              <motion.li
                key={text}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.07 }}
                className="flex gap-3 items-center p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-line)]"
              >
                <Icon size={18} className="text-[var(--color-ink-muted)] shrink-0" />
                <span className="font-sans text-sm text-[var(--color-ink)]">{text}</span>
              </motion.li>
            ))}
          </ul>

          {/* Name input */}
          <div className="flex flex-col items-center">
            <label
              htmlFor="prism-name"
              className="font-sans font-bold text-[16px] mb-2"
              style={{ color: 'var(--color-ink)' }}
            >
              What's your name?
            </label>
            <input
              id="prism-name"
              type="text"
              value={userName}
              onChange={handleNameChange}
              onFocus={() => setNameFocused(true)}
              onBlur={() => setNameFocused(false)}
              placeholder="Enter your name..."
              className="w-full max-w-sm rounded-lg px-4 py-3"
              style={{
                backgroundColor: 'var(--color-surface)',
                border: `1px solid ${nameFocused ? 'var(--color-accent)' : 'var(--color-line)'}`,
                borderRadius: '0.5rem',
                fontSize: '16px',
                color: 'var(--color-ink)',
                boxShadow: nameFocused ? '0 0 0 3px rgba(201,168,76,0.25)' : 'none',
                transition: 'all 200ms ease',
                outline: 'none',
              }}
            />
            {nameError && (
              <span
                className="w-full max-w-sm mt-1.5 font-sans"
                style={{ color: 'var(--color-danger)', fontSize: '13px' }}
              >
                {nameError}
              </span>
            )}
          </div>

          {/* Character picker — redesigned */}
          <div className="relative" style={{ width: '100vw', marginLeft: 'calc(50% - 50vw)' }}>
            <style>{`
              @keyframes prismShake {0%,100%{transform:rotate(0deg)}25%{transform:rotate(-5deg)}75%{transform:rotate(5deg)}}
              @keyframes prismCardIn {from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
              @keyframes prismPanelIn {from{opacity:0;transform:translate(110%,-50%)}to{opacity:1;transform:translate(0,-50%)}}
              .prism-card-in{opacity:0;animation:prismCardIn .45s ease forwards;animation-delay:var(--d,0s)}
              .prism-card-shake{animation:prismShake .3s ease 2}
              .prism-panel{animation:prismPanelIn .3s cubic-bezier(0.34,1.56,0.64,1) forwards}
              .prism-card{transition:transform 250ms ease,box-shadow 200ms ease,filter 200ms ease}
              .prism-card:not(.is-selected):hover{filter:brightness(1.1);box-shadow:0 0 0 2px rgba(201,168,76,0.5)}
              .prism-surprise:hover{background:var(--color-info) !important;color:white !important}
            `}</style>

            <div className="mx-auto px-4 w-full" style={{ maxWidth: 1040 }}>
              <h2 className="text-center font-sans font-bold text-[18px] text-[var(--color-ink)] mb-1">Choose your character</h2>
              <p className="text-center font-sans text-[13px] text-[var(--color-ink-muted)] mb-5">
                This is how you will appear in the assessment
              </p>

              {/* Filter tabs + surprise me */}
              <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
                {['all', 'male', 'female'].map((f) => {
                  const active = filter === f
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      className="rounded-full px-5 py-2 font-sans text-[13px] font-semibold capitalize transition-all duration-200"
                      style={
                        active
                          ? { background: 'var(--color-ink)', color: 'var(--color-paper)', border: '1px solid var(--color-ink)' }
                          : { background: 'transparent', color: 'var(--color-ink-muted)', border: '1px solid var(--color-line)' }
                      }
                    >
                      {f}
                    </button>
                  )
                })}
                <button
                  type="button"
                  onClick={handleSurprise}
                  className="prism-surprise rounded-full px-4 py-2 font-sans text-[13px] font-semibold transition-all duration-200"
                  style={{ background: 'transparent', color: 'var(--color-info)', border: '1px solid var(--color-info)' }}
                >
                  🎲 Surprise me
                </button>
              </div>

              {/* Grid — re-keyed on filter so cards re-stagger in */}
              <div
                key={filter}
                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3 justify-items-center"
              >
                {visibleChars.map((char, i) => {
                  const isSelected = selectedCharacter?.id === char.id
                  return (
                    <div key={char.id} className="prism-card-in w-full" style={{ '--d': `${0.05 * (i + 1)}s` }}>
                      <button
                        type="button"
                        onClick={() => setSelectedCharacter(char)}
                        onMouseMove={handleTilt}
                        onMouseLeave={(e) => handleTiltReset(e, isSelected)}
                        aria-pressed={isSelected}
                        className={`prism-card relative w-full rounded-2xl overflow-hidden cursor-pointer ${isSelected ? 'is-selected' : ''} ${shaking ? 'prism-card-shake' : ''}`}
                        style={{
                          background: `linear-gradient(135deg, ${char.gradient[0]}, ${char.gradient[1]})`,
                          minHeight: 200,
                          transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                          ...(isSelected
                            ? { boxShadow: '0 0 0 3px var(--color-accent), 0 0 0 7px rgba(201,168,76,0.30)' }
                            : {}),
                        }}
                      >
                        <div className="flex justify-center pt-4 pb-1">
                          <CharacterAvatar id={char.id} size={88} />
                        </div>

                        <div
                          className="absolute bottom-0 inset-x-0 px-3 py-2 text-left"
                          style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
                        >
                          <div className="font-sans font-bold text-white text-[14px] leading-tight">{char.name}</div>
                          <span
                            className="inline-block mt-1 rounded-full px-2 py-0.5 font-sans text-[11px] text-white"
                            style={{ background: 'rgba(255,255,255,0.15)' }}
                          >
                            {char.personality}
                          </span>
                          <div className="font-sans text-[11px] text-white/70 mt-1 leading-snug">{char.description}</div>
                        </div>

                        {isSelected && (
                          <span
                            className="absolute top-2 right-2 flex items-center justify-center rounded-full"
                            style={{ width: 22, height: 22, background: 'var(--color-accent)' }}
                          >
                            <Check size={13} className="text-white" strokeWidth={3} />
                          </span>
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Selection side panel */}
            {selectedCharacter && (
              <div
                key={selectedCharacter.id}
                className="prism-panel hidden lg:flex flex-col gap-3 fixed right-0 top-1/2 z-40"
                style={{
                  width: 220,
                  transform: 'translateY(-50%)',
                  background: 'var(--color-surface)',
                  borderLeft: '3px solid var(--color-accent)',
                  borderTopLeftRadius: 16,
                  borderBottomLeftRadius: 16,
                  boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
                  padding: 24,
                }}
              >
                <button
                  type="button"
                  onClick={() => setSelectedCharacter(null)}
                  aria-label="Close"
                  className="absolute top-3 right-3 text-[var(--color-ink-muted)] text-lg leading-none"
                >
                  ✕
                </button>
                <div className="flex justify-center">
                  <CharacterAvatar id={selectedCharacter.id} size={120} />
                </div>
                <div className="text-center font-sans font-bold text-[18px]" style={{ color: 'var(--color-ink)' }}>
                  {selectedCharacter.name}
                </div>
                <div className="flex justify-center">
                  <span
                    className="rounded-full px-3 py-1 font-sans text-[12px] font-semibold"
                    style={{ background: 'rgba(201,168,76,0.15)', color: 'var(--color-accent)' }}
                  >
                    {selectedCharacter.personality}
                  </span>
                </div>
                <p className="text-center font-sans text-[13px]" style={{ color: 'var(--color-ink-muted)' }}>
                  {selectedCharacter.description}
                </p>
                <p className="text-center font-sans text-[12px] font-semibold" style={{ color: 'var(--color-success)' }}>
                  This is you ✓
                </p>
                <div className="h-px w-full" style={{ background: 'var(--color-line)' }} />
                <button
                  type="button"
                  onClick={handleEnter}
                  className="w-full rounded-xl py-3 font-sans font-semibold text-[14px]"
                  style={{ background: 'var(--color-ink)', color: 'var(--color-paper)' }}
                >
                  Confirm Character
                </button>
              </div>
            )}
          </div>

          {/* Calibration + consent (only for an active paid session) */}
          {sessionId && (
            <>
              {languages.length > 1 && (
                <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
                  <span className="font-mono text-xs tracking-[0.08em] text-[var(--color-accent)] uppercase">
                    Assessment language
                  </span>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {languages.map((l) => (
                      <button
                        key={l.code}
                        type="button"
                        onClick={() => pickLanguage(l.code)}
                        className="px-4 py-2 rounded-lg font-sans text-sm border transition-colors"
                        style={{
                          borderColor: language === l.code ? 'var(--color-accent)' : 'var(--color-line)',
                          background: language === l.code ? 'color-mix(in srgb, var(--color-accent) 13%, transparent)' : 'transparent',
                          color: language === l.code ? 'var(--color-accent)' : 'var(--color-ink-muted)',
                        }}
                      >
                        {l.nativeLabel}
                      </button>
                    ))}
                  </div>
                  {language !== 'en' && (
                    <p className="font-sans text-[12px] text-[var(--color-ink-muted)] leading-relaxed mt-3">
                      Scoring in this language is provisional — it has not yet been calibrated against the
                      English scale. Your report and credential will say so until our fairness study completes.
                    </p>
                  )}
                </div>
              )}
              <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
                <span className="font-mono text-xs tracking-[0.08em] text-[var(--color-accent)] uppercase">
                  Quick calibration (optional)
                </span>
                <p className="font-sans text-sm text-[var(--color-ink)] leading-relaxed mt-2 mb-3">
                  {CALIBRATION_PROMPT}
                </p>
                <textarea
                  value={calibrationAnswer}
                  onChange={(e) => setCalibrationAnswer(e.target.value)}
                  rows={4}
                  placeholder="Type a few sentences… this helps us match the difficulty to you."
                  className="w-full rounded-lg px-4 py-3 font-sans text-sm bg-[var(--color-paper)] border border-[var(--color-line)] text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/25 transition-all resize-none"
                />
              </div>

              <div className="flex flex-col gap-3">
                <span className="font-mono text-xs tracking-[0.08em] text-[var(--color-accent)] uppercase">
                  Before you begin
                </span>
                {CONSENT_ITEMS.map(({ scope, label }) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => toggleConsent(scope)}
                    className="flex gap-3 items-start text-left p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-line)] hover:border-[var(--color-accent)]/50 transition-colors"
                    aria-pressed={!!consent[scope]}
                  >
                    <span
                      className="mt-0.5 shrink-0 flex items-center justify-center w-5 h-5 rounded-md transition-colors"
                      style={{
                        backgroundColor: consent[scope] ? 'var(--color-accent)' : 'transparent',
                        border: `1.5px solid ${consent[scope] ? 'var(--color-accent)' : 'var(--color-line)'}`,
                      }}
                    >
                      {consent[scope] && <Check size={13} className="text-[var(--color-surface)]" strokeWidth={3} />}
                    </span>
                    <span className="font-sans text-[13px] text-[var(--color-ink)] leading-relaxed">{label}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {submitError && (
            <p className="text-center font-sans text-sm" style={{ color: 'var(--color-danger)' }}>
              {submitError}
            </p>
          )}

          <div className="relative group/btn">
            {(() => {
              const canEnter = !!userName.trim() && !!selectedCharacter && (!sessionId || allConsented) && !submitting
              return (
                <>
                  <motion.button
                    onClick={handleEnter}
                    disabled={!canEnter}
                    className={`w-full py-4 rounded-xl font-sans font-semibold text-sm text-[var(--color-paper)] tracking-wide transition-opacity ${
                      canEnter
                        ? 'bg-[var(--color-ink)] hover:opacity-90 cursor-pointer'
                        : 'bg-[var(--color-ink)]/40 cursor-not-allowed'
                    }`}
                    whileHover={canEnter ? { scale: 1.01 } : {}}
                    whileTap={canEnter ? { scale: 0.98 } : {}}
                  >
                    {submitting ? 'Preparing…' : 'Enter Assessment →'}
                  </motion.button>
                  {!selectedCharacter && (
                    <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-9 px-3 py-1.5 rounded-md bg-[var(--color-ink)] text-[var(--color-paper)] text-xs font-sans whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
                      Please choose a character first
                    </span>
                  )}
                </>
              )
            })()}
          </div>

          <p className="text-center font-sans text-xs text-[var(--color-ink-muted)]">
            By entering you confirm this is your own unaided work.
          </p>
        </motion.div>
      </div>
    </div>
  )
}
