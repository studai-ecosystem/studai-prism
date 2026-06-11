// Server-side speech-to-text via OpenAI Whisper (api.openai.com).
//
// This is intentionally a SEPARATE client from the Azure OpenAI chat model used
// for scenarios/scoring (server/routes/assessment.js). The voice test transcribes
// candidate audio answers here, then feeds the text into the existing AI loop.
//
// Configuration (server/.env):
//   OPENAI_API_KEY        — required to enable real transcription
//   OPENAI_WHISPER_MODEL  — optional, defaults to 'whisper-1'
//
// When no key is set, `isWhisperEnabled()` returns false so callers can fall
// back to the browser's WebSpeech dictation instead of failing hard.

import OpenAI, { toFile } from 'openai'

let _client = null

export function isWhisperEnabled() {
  return Boolean(process.env.OPENAI_API_KEY)
}

function getClient() {
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return _client
}

const WHISPER_MODEL = () => process.env.OPENAI_WHISPER_MODEL || 'whisper-1'

// Transcribe a raw audio buffer to text.
//   buffer   — Node Buffer of the recorded audio
//   filename — original name (used to infer container/codec, e.g. answer.webm)
//   language — optional ISO-639-1 hint (default 'en')
// Returns the transcript string (trimmed). Throws on API failure.
export async function transcribeAudio(buffer, filename = 'answer.webm', language = 'en') {
  const file = await toFile(buffer, filename)
  const result = await getClient().audio.transcriptions.create({
    file,
    model: WHISPER_MODEL(),
    language,
    response_format: 'json',
  })
  return (result.text || '').trim()
}
