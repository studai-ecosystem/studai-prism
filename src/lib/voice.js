// Prism voice engine — natural, per-persona speech from FREE resources.
//
// Layer 1 (this module): the browser's own speechSynthesis, used PROPERLY.
// The old code fired one default-voice utterance for a whole panel turn, so
// every persona shared the same robotic voice. This module ranks the voices
// the OS actually offers (Windows/Edge ships free neural "Online (Natural)"
// voices, including Indian-English) and assigns each scenario persona a
// deterministic, distinct voice matched to their gender.
//
// Layer 2 (optional, flagged PRISM_TTS_NEURAL): server-proxied Azure Speech
// neural audio — the client asks /api/assessment/tts-status and, when enabled,
// fetches audio per message from /api/assessment/speech, falling back to
// Layer 1 on any error.
//
// MEASUREMENT LAW: voice is OUTPUT ONLY. Nothing in this module reads,
// records, or scores anything about the candidate.

// ── pure, testable core (no DOM) ─────────────────────────────────────────────

// Rough gender guess for a voice from its metadata. Best-effort only — used
// to keep "Nurse Latha" from speaking with an obviously male voice when the
// scenario metadata asks for female (and vice versa).
const FEMALE_MARKERS = /female|neerja|swara|aria|jenny|sonia|natasha|clara|emma|michelle|libby|maisie|ava|zira|heera|kalpana|priya|susan|hazel/i
const MALE_MARKERS = /(^|[^fe])male|prabhat|madhur|guy|ryan|william|liam|davis|tony|christopher|eric|jacob|thomas|sean|ravi|george|mark|david|james/i

export function voiceGender(voice) {
  const name = `${voice?.name || ''} ${voice?.voiceURI || ''}`
  if (FEMALE_MARKERS.test(name)) return 'female'
  if (MALE_MARKERS.test(name)) return 'male'
  return 'unknown'
}

// Score a speechSynthesis voice for Prism's room: neural beats standard,
// Indian English beats other English (the personas are Indian), English
// beats everything else, local beats remote-flaky.
export function voiceScore(voice) {
  const name = `${voice?.name || ''}`.toLowerCase()
  const lang = `${voice?.lang || ''}`.toLowerCase()
  let score = 0
  if (/natural|neural|online/.test(name)) score += 40
  if (lang.startsWith('en-in')) score += 30
  else if (lang.startsWith('en-gb')) score += 18
  else if (lang.startsWith('en')) score += 14
  if (/google/.test(name)) score += 6 // Chrome's better set
  if (/desktop/.test(name)) score -= 4 // older SAPI voices
  return score
}

export function rankVoices(voices) {
  return [...(voices || [])]
    .filter((v) => `${v?.lang || ''}`.toLowerCase().startsWith('en'))
    .sort((a, b) => voiceScore(b) - voiceScore(a))
}

// Deterministic small hash so the same persona always gets the same voice on
// the same machine (stable across the 30-minute session and re-renders).
function hashName(name) {
  let h = 0
  const s = String(name || '')
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff
  return h
}

// Assign one voice per persona, distinct within the cast wherever the device
// has enough voices. `cast` = [{ name, tts: { gender } }] from the scenario.
// Returns Map(personaName -> { voice, pitch, rate }). The tiny pitch offsets
// keep personas tellable-apart even on machines with a single English voice.
export function assignCastVoices(cast, voices) {
  const ranked = rankVoices(voices)
  const byGender = {
    female: ranked.filter((v) => voiceGender(v) === 'female'),
    male: ranked.filter((v) => voiceGender(v) === 'male'),
    unknown: ranked.filter((v) => voiceGender(v) === 'unknown'),
  }
  const used = new Set()
  const out = new Map()

  const pickFrom = (pools, seed) => {
    for (const pool of pools) {
      if (!pool.length) continue
      const unusedPool = pool.filter((v) => !used.has(v.name))
      const source = unusedPool.length ? unusedPool : pool
      return source[seed % source.length]
    }
    return null
  }

  ;(cast || []).forEach((p, i) => {
    const gender = p?.tts?.gender || 'unknown'
    const seed = hashName(p?.name)
    const pools =
      gender === 'female'
        ? [byGender.female, byGender.unknown, byGender.male]
        : gender === 'male'
          ? [byGender.male, byGender.unknown, byGender.female]
          : [byGender.unknown, byGender.female, byGender.male]
    const voice = pickFrom(pools, seed)
    if (voice) used.add(voice.name)
    out.set(p?.name, {
      voice: voice || null,
      // Distinctness on voice-poor systems: a small per-slot pitch offset so
      // even two personas sharing one system voice stay tellable-apart.
      pitch: 1 + (i - 1) * 0.06,
      rate: 1.02,
    })
  })
  return out
}

// ── DOM layer ────────────────────────────────────────────────────────────────

// speechSynthesis populates voices asynchronously; resolve when ready.
export function loadVoices() {
  return new Promise((resolve) => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
    if (!synth) return resolve([])
    const now = synth.getVoices()
    if (now.length) return resolve(now)
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve(synth.getVoices())
    }
    synth.addEventListener?.('voiceschanged', finish, { once: true })
    setTimeout(finish, 1500) // some engines never fire the event
  })
}

// Speak a panel turn message-by-message, each in its persona's voice.
// `messages` = [{ speaker, content }]; `castVoices` from assignCastVoices.
// Returns a cancel function. Falls back silently when synthesis is absent.
export function speakTurn(messages, castVoices, { onDone } = {}) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
  if (!synth || !Array.isArray(messages) || !messages.length) {
    onDone?.()
    return () => {}
  }
  let cancelled = false
  try {
    synth.cancel()
  } catch {
    /* ignore */
  }
  const queue = messages.filter((m) => m?.content)
  const next = (idx) => {
    if (cancelled || idx >= queue.length) {
      if (!cancelled) onDone?.()
      return
    }
    const m = queue[idx]
    const assigned = castVoices?.get?.(m.speaker) || null
    const utter = new SpeechSynthesisUtterance(m.content)
    if (assigned?.voice) utter.voice = assigned.voice
    utter.lang = assigned?.voice?.lang || 'en-IN'
    utter.rate = assigned?.rate ?? 1.02
    utter.pitch = Math.min(2, Math.max(0.5, assigned?.pitch ?? 1))
    utter.onend = () => next(idx + 1)
    utter.onerror = () => next(idx + 1)
    try {
      synth.speak(utter)
    } catch {
      next(idx + 1)
    }
  }
  next(0)
  return () => {
    cancelled = true
    try {
      synth.cancel()
    } catch {
      /* ignore */
    }
  }
}

// ── Layer 2: neural audio via the server (flag-gated) ────────────────────────

// Play server-synthesized audio per message, sequentially. Any failure falls
// back to browser voices for the REMAINDER of the turn. Returns cancel fn.
export function speakTurnNeural(messages, { sessionId, castVoices, onDone } = {}) {
  let cancelled = false
  let currentAudio = null
  const queue = (messages || []).filter((m) => m?.content)

  const fallbackFrom = (idx) => {
    if (cancelled) return
    speakTurn(queue.slice(idx), castVoices, { onDone })
  }

  const next = async (idx) => {
    if (cancelled) return
    if (idx >= queue.length) {
      onDone?.()
      return
    }
    const m = queue[idx]
    try {
      const res = await fetch('/api/assessment/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, speaker: m.speaker, text: m.content }),
      })
      if (!res.ok) throw new Error(`speech ${res.status}`)
      const blob = await res.blob()
      if (cancelled) return
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      currentAudio = audio
      audio.onended = () => {
        URL.revokeObjectURL(url)
        next(idx + 1)
      }
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        fallbackFrom(idx)
      }
      await audio.play()
    } catch {
      fallbackFrom(idx)
    }
  }
  next(0)
  return () => {
    cancelled = true
    try {
      currentAudio?.pause()
    } catch {
      /* ignore */
    }
    try {
      window.speechSynthesis?.cancel()
    } catch {
      /* ignore */
    }
  }
}
