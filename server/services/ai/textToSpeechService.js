import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly'
import { awsClientConfig } from '../../config/awsCredentials.js'
import logger from '../../lib/logger.js'
import { awsRegion } from './modelRouter.js'

const clients = new Map()
const ENGINES = new Set(['standard', 'neural', 'long-form', 'generative'])

function pollyClient(region = awsRegion()) {
  if (!clients.has(region)) {
    clients.set(region, new PollyClient(awsClientConfig({ region, maxAttempts: 3 })))
  }
  return clients.get(region)
}

export function isTextToSpeechEnabled() {
  return process.env.PRISM_TTS_NEURAL === 'true' && process.env.POLLY_TTS_ENABLED === 'true'
}

export function buildPollyRequest(text, voice = {}) {
  const value = String(text || '')
  if (!value || value.length > 600) throw new Error('Speech text must contain 1-600 characters')
  const voiceId = /^[A-Za-z]+$/.test(String(voice.voiceId || '')) ? voice.voiceId : 'Kajal'
  const engine = ENGINES.has(voice.engine) ? voice.engine : 'neural'
  return {
    Engine: engine,
    LanguageCode: voice.languageCode || 'en-IN',
    OutputFormat: 'mp3',
    SampleRate: '24000',
    Text: value,
    TextType: 'text',
    VoiceId: voiceId,
  }
}

async function audioBuffer(stream) {
  if (stream?.transformToByteArray) return Buffer.from(await stream.transformToByteArray())
  const chunks = []
  for await (const chunk of stream || []) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

export async function synthesizeSpeech(text, voice) {
  const region = process.env.POLLY_REGION || awsRegion()
  const controller = new AbortController()
  const timeoutMs = Number(process.env.POLLY_TIMEOUT_MS) || 15_000
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  timer.unref?.()
  try {
    const response = await pollyClient(region).send(
      new SynthesizeSpeechCommand(buildPollyRequest(text, voice)),
      { abortSignal: controller.signal },
    )
    const buffer = await audioBuffer(response.AudioStream)
    if (!buffer.length) throw new Error('Amazon Polly returned no audio')
    const pricePerMillion = Number(process.env.POLLY_PRICE_PER_MILLION_CHARS || 16)
    logger.info('ai_tts_usage', {
      provider: 'amazon-polly',
      requestId: response?.$metadata?.requestId || null,
      voiceId: voice?.voiceId || 'Kajal',
      characters: Number(response.RequestCharacters) || String(text).length,
      estimatedCostUsd: +((String(text).length * pricePerMillion) / 1_000_000).toFixed(8),
    })
    return buffer
  } finally {
    clearTimeout(timer)
  }
}