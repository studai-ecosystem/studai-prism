// Track 3.1 — client-side behavioral signal capture.
//
// Derives INTERACTION-PATTERN features (timing, typing cadence, revisions,
// speech-onset delay) from how an answer was produced. Only summary numbers
// ever leave the device — never keystroke logs, never audio. The server
// clamps every value again (untrusted client) before persisting.

// ── typing / revision tracker ────────────────────────────────────────────────
// One tracker per candidate turn. Feed it key events + input snapshots from
// the answer textarea; read a compact summary at send time.
export function createTurnTracker() {
  let promptShownAt = null // when the candidate could start answering
  let firstKeyAt = null
  let lastKeyAt = null
  let keyCount = 0
  let backspaceCount = 0
  let grossChars = 0 // total characters ever typed (before revisions)
  let pasteAttempts = 0
  const interKeyMs = []
  let longPauseCount = 0 // gaps > 2s between keystrokes mid-answer
  let maxPauseMs = 0
  let voice = null // set by the voice meter when the answer was spoken
  let dictationUsed = false

  return {
    promptShown() {
      promptShownAt = Date.now()
    },
    key(e) {
      const now = Date.now()
      if (firstKeyAt === null) firstKeyAt = now
      if (lastKeyAt !== null) {
        const gap = now - lastKeyAt
        interKeyMs.push(gap)
        if (gap > 2000) longPauseCount += 1
        if (gap > maxPauseMs) maxPauseMs = gap
      }
      lastKeyAt = now
      keyCount += 1
      if (e && (e.key === 'Backspace' || e.key === 'Delete')) backspaceCount += 1
      else if (e && typeof e.key === 'string' && e.key.length === 1) grossChars += 1
    },
    paste() {
      pasteAttempts += 1
    },
    dictation() {
      dictationUsed = true
    },
    setVoice(v) {
      voice = v
    },
    // Compact, PII-free summary for this turn. `finalText` is used only for
    // its LENGTH (revision ratio) — the text itself is sent separately.
    summary(finalText) {
      const now = Date.now()
      const netChars = (finalText || '').length
      const sorted = [...interKeyMs].sort((a, b) => a - b)
      const mean = sorted.length ? sorted.reduce((s, v) => s + v, 0) / sorted.length : null
      const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null
      const sd = sorted.length > 1
        ? Math.sqrt(sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / (sorted.length - 1))
        : null
      const modality = voice ? (keyCount > 0 ? 'mixed' : 'voice') : dictationUsed ? 'dictation' : 'typed'
      return {
        responseMs: promptShownAt ? now - promptShownAt : null,
        modality,
        typing: keyCount > 0
          ? {
              keyCount,
              backspaceCount,
              grossChars,
              netChars,
              revisionRatio: grossChars > 0 ? +(1 - netChars / Math.max(grossChars, 1)).toFixed(3) : 0,
              firstKeyMs: promptShownAt && firstKeyAt ? firstKeyAt - promptShownAt : null,
              meanInterKeyMs: mean !== null ? Math.round(mean) : null,
              medianInterKeyMs: median !== null ? Math.round(median) : null,
              sdInterKeyMs: sd !== null ? Math.round(sd) : null,
              longPauseCount,
              maxPauseMs,
              pasteAttempts,
            }
          : null,
        voice,
      }
    },
    reset() {
      promptShownAt = null
      firstKeyAt = null
      lastKeyAt = null
      keyCount = 0
      backspaceCount = 0
      grossChars = 0
      pasteAttempts = 0
      interKeyMs.length = 0
      longPauseCount = 0
      maxPauseMs = 0
      voice = null
      dictationUsed = false
    },
  }
}

// ── voice onset / pause meter ────────────────────────────────────────────────
// Watches the mic stream's RMS level while a spoken answer is being recorded.
// Produces timing summaries ONLY — the audio itself is never stored or
// analysed beyond loudness (no content, no prosody, no emotion; scoring any
// of those is prohibited by project rule).
export function createVoiceMeter(stream) {
  let ctx = null
  let raf = null
  const startedAt = Date.now()
  let speechOnsetAt = null
  let lastLoudAt = null
  let silenceGapCount = 0
  const THRESHOLD = 0.02 // RMS floor that counts as speech
  const GAP_MS = 1500 // silence longer than this mid-answer counts as a gap

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    ctx = new AudioCtx()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    const buf = new Float32Array(analyser.fftSize)
    const tick = () => {
      analyser.getFloatTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
      const rms = Math.sqrt(sum / buf.length)
      const now = Date.now()
      if (rms >= THRESHOLD) {
        if (speechOnsetAt === null) speechOnsetAt = now
        else if (lastLoudAt !== null && now - lastLoudAt > GAP_MS) silenceGapCount += 1
        lastLoudAt = now
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
  } catch {
    /* metering unavailable — summaries stay null */
  }

  return {
    stop() {
      if (raf) cancelAnimationFrame(raf)
      try { ctx?.close() } catch { /* ignore */ }
      return {
        speechOnsetMs: speechOnsetAt !== null ? speechOnsetAt - startedAt : null,
        recordingMs: Date.now() - startedAt,
        silenceGapCount,
      }
    },
  }
}
