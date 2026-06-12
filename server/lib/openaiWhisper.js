// Server-side speech-to-text via Whisper — OpenAI (api.openai.com) OR Azure OpenAI.
//
// This is intentionally a SEPARATE client from the Azure OpenAI chat model used
// for scenarios/scoring (server/routes/assessment.js). The voice test transcribes
// candidate audio answers here, then feeds the text into the existing AI loop.
//
// Configuration (server/.env) — set ONE of the two:
//   Option A — regular OpenAI:
//     OPENAI_API_KEY            — key from platform.openai.com
//     OPENAI_WHISPER_MODEL      — optional, defaults to 'whisper-1'
//   Option B — Azure OpenAI (needs a 'whisper' model DEPLOYMENT on the resource):
//     AZURE_WHISPER_API_KEY     — Keys and Endpoint → KEY 1
//     AZURE_WHISPER_ENDPOINT    — https://<resource>.openai.azure.com
//     AZURE_WHISPER_DEPLOYMENT  — the deployment name (e.g. 'whisper')
//     AZURE_WHISPER_API_VERSION — optional, defaults to '2024-06-01'
//
// When neither is set, `isWhisperEnabled()` returns false so callers can fall
// back to the browser's WebSpeech dictation instead of failing hard.

import OpenAI, { AzureOpenAI, toFile } from 'openai'

let _client = null

function azureConfigured() {
  return Boolean(
    process.env.AZURE_WHISPER_API_KEY &&
    process.env.AZURE_WHISPER_ENDPOINT &&
    process.env.AZURE_WHISPER_DEPLOYMENT
  )
}

export function isWhisperEnabled() {
  return Boolean(process.env.OPENAI_API_KEY) || azureConfigured()
}

function getClient() {
  if (!_client) {
    if (azureConfigured()) {
      _client = new AzureOpenAI({
        apiKey: process.env.AZURE_WHISPER_API_KEY,
        endpoint: process.env.AZURE_WHISPER_ENDPOINT,
        deployment: process.env.AZURE_WHISPER_DEPLOYMENT,
        apiVersion: process.env.AZURE_WHISPER_API_VERSION || '2024-06-01',
      })
    } else {
      _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    }
  }
  return _client
}

const WHISPER_MODEL = () =>
  azureConfigured()
    ? process.env.AZURE_WHISPER_DEPLOYMENT
    : (process.env.OPENAI_WHISPER_MODEL || 'whisper-1')

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
