import { converse } from './bedrockClient.js'
import { policyFor } from './modelRouter.js'
import { recordUsage } from './costTracker.js'
import { textFromConverse } from './responseParser.js'
import { renderPrompt } from './promptManager.js'

const AUDIO_FORMATS = new Set(['mp3', 'opus', 'wav', 'aac', 'flac', 'mp4', 'ogg', 'mkv', 'mka', 'm4a', 'mpeg', 'mpga', 'pcm', 'webm'])

export function isSpeechToTextEnabled() {
  return process.env.BEDROCK_STT_ENABLED === 'true'
}

export function audioFormat(filename) {
  const raw = String(filename || '').split('?')[0].split('.').pop()?.toLowerCase()
  if (raw === 'oga') return 'ogg'
  if (raw === 'weba') return 'webm'
  return AUDIO_FORMATS.has(raw) ? raw : 'webm'
}

export function buildTranscriptionRequest(buffer, filename, language, modelId) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Audio buffer is required')
  const hint = language || 'auto-detect'
  return {
    modelId,
    messages: [{
      role: 'user',
      content: [
        { audio: { format: audioFormat(filename), source: { bytes: buffer } } },
        { text: renderPrompt('speech_transcription.v1', { LANGUAGE_HINT: hint }) },
      ],
    }],
    inferenceConfig: { maxTokens: 2000, temperature: 0 },
    requestMetadata: {
      application: 'studai-prism',
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      task: 'speech_to_text',
    },
  }
}

export async function transcribeAudio(buffer, filename = 'answer.webm', language = 'en') {
  const policy = policyFor('speech_to_text')
  const response = await converse(buildTranscriptionRequest(buffer, filename, language, policy.modelId), {
    region: policy.region,
    timeoutMs: policy.timeoutMs,
    retries: 2,
    task: 'speech_to_text',
  })
  recordUsage({ task: 'speech_to_text', modelId: policy.modelId, response })
  return textFromConverse(response).replace(/^['"]|['"]$/g, '').trim()
}