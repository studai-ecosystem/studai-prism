// Azure Speech neural TTS — server-side proxy for the assessment room.
//
// FLAGGED (PRISM_TTS_NEURAL, default off) + free-tier friendly: the F0 Speech
// SKU gives 0.5M characters/month at no cost. The browser NEVER talks to
// Azure directly (build rule: the browser never calls AI services) — the
// room asks POST /api/assessment/speech, which validates that the requested
// text is EXACTLY something the avatar said in that session, then streams
// the audio back. Nothing is persisted; audio exists in memory only.
//
// MEASUREMENT LAW: voice is OUTPUT only. This module synthesizes avatar
// speech; it never receives, stores, or scores candidate audio.

const REGION = () => process.env.AZURE_SPEECH_REGION || ''
const KEY = () => process.env.AZURE_SPEECH_KEY || ''

export function isTtsEnabled() {
  return process.env.PRISM_TTS_NEURAL === 'true' && Boolean(REGION()) && Boolean(KEY())
}

// XML-escape untrusted text before it enters SSML.
export function escapeSsml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// Build the SSML document for one avatar line.
export function buildSsml(text, voice) {
  const v = /^[A-Za-z0-9-]+$/.test(String(voice || '')) ? voice : 'en-IN-NeerjaNeural'
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-IN">` +
    `<voice name="${v}">${escapeSsml(text)}</voice>` +
    `</speak>`
  )
}

// Synthesize one line to MP3. Returns a Buffer. Throws on failure — callers
// translate to an honest fallback (the client drops back to browser voices).
export async function synthesizeSpeech(text, voice) {
  const url = `https://${REGION()}.tts.speech.microsoft.com/cognitiveservices/v1`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': KEY(),
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'prism-assessment',
    },
    body: buildSsml(text, voice),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Azure Speech ${res.status}: ${detail.slice(0, 200)}`)
  }
  return Buffer.from(await res.arrayBuffer())
}
