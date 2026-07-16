import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AiTimeoutError,
  executeCommand,
} from '../services/ai/bedrockClient.js'
import {
  buildConverseRequest,
  createCompletionService,
} from '../services/ai/completionService.js'
import { estimateCost } from '../services/ai/costTracker.js'
import { buildEmbeddingPayload } from '../services/ai/embeddingService.js'
import {
  AiResponseError,
  parseJsonText,
  toCompletionEnvelope,
} from '../services/ai/responseParser.js'
import {
  audioFormat,
  buildTranscriptionRequest,
} from '../services/ai/speechToTextService.js'
import { buildPollyRequest } from '../services/ai/textToSpeechService.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function withEnv(values, fn) {
  const saved = new Map()
  for (const [key, value] of Object.entries(values)) {
    saved.set(key, process.env[key])
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    })
}

function bedrockResponse(text, overrides = {}) {
  return {
    output: { message: { role: 'assistant', content: [{ text }] } },
    stopReason: 'end_turn',
    usage: { inputTokens: 100, outputTokens: 20 },
    metrics: { latencyMs: 123 },
    $metadata: { requestId: 'bedrock-request-1' },
    ...overrides,
  }
}

test('Bedrock request conversion separates system instructions and normalizes history', () => {
  const request = buildConverseRequest({
    max_completion_tokens: 350,
    temperature: 0.4,
    messages: [
      { role: 'system', content: 'System one' },
      { role: 'assistant', content: 'Earlier opening' },
      { role: 'user', content: 'Candidate answer' },
      { role: 'user', content: 'Additional context' },
    ],
  }, { task: 'conversation', modelId: 'test.model-v1' })

  assert.equal(request.modelId, 'test.model-v1')
  assert.equal(request.inferenceConfig.maxTokens, 350)
  assert.equal(request.inferenceConfig.temperature, 0.4)
  assert.equal(request.system.length, 2)
  assert.match(request.system[1].text, /Earlier opening/)
  assert.equal(request.messages.length, 1)
  assert.match(request.messages[0].content[0].text, /Candidate answer\n\nAdditional context/)
  assert.deepEqual(request.requestMetadata, {
    application: 'studai-prism', environment: 'development', task: 'conversation',
  })
})

test('Bedrock response parser recovers fenced JSON and preserves usage metadata', () => {
  const parsed = parseJsonText('```json\n{"scores":{"communication":81}}\n```')
  assert.equal(parsed.scores.communication, 81)

  const completion = toCompletionEnvelope(
    bedrockResponse('Result follows:\n{"ok":true}', {
      usage: { inputTokens: 100, outputTokens: 20, cacheReadInputTokens: 50, cacheWriteInputTokens: 10 },
    }),
    { modelId: 'test.model-v1', expectJson: true },
  )
  assert.deepEqual(JSON.parse(completion.choices[0].message.content), { ok: true })
  assert.equal(completion.usage.total_tokens, 180)
  assert.equal(completion._bedrock.latencyMs, 123)
  assert.throws(() => parseJsonText('not json'), AiResponseError)
})

test('Bedrock Guardrail intervention is explicit and never falls back', async () => {
  await withEnv({
    BEDROCK_CONVERSATION_MODEL: 'test.conversation-v1',
    BEDROCK_FALLBACK_MODEL: 'test.fallback-v1',
  }, async () => {
    const calls = []
    const service = createCompletionService({
      converseFn: async (request) => {
        calls.push(request.modelId)
        return bedrockResponse('blocked', { stopReason: 'guardrail_intervened' })
      },
    })
    await assert.rejects(
      service({ messages: [{ role: 'user', content: 'candidate text' }] }, { task: 'conversation' }),
      (error) => error instanceof AiResponseError && error.code === 'AI_GUARDRAIL_BLOCKED',
    )
    assert.deepEqual(calls, ['test.conversation-v1'])
  })
})

test('completion service falls back for conversation but never for judges', async () => {
  await withEnv({
    BEDROCK_CONVERSATION_MODEL: 'test.conversation-v1',
    BEDROCK_PRIMARY_MODEL: 'test.judge-v1',
    BEDROCK_FALLBACK_MODEL: 'test.fallback-v1',
  }, async () => {
    const calls = []
    const service = createCompletionService({
      converseFn: async (request) => {
        calls.push(request.modelId)
        if (request.modelId !== 'test.fallback-v1') {
          const error = new Error('unavailable')
          error.name = 'ServiceUnavailableException'
          throw error
        }
        return bedrockResponse('{"ok":true}')
      },
    })
    const result = await service({
      messages: [{ role: 'user', content: 'hello' }],
      response_format: { type: 'json_object' },
    }, { task: 'conversation' })
    assert.deepEqual(calls, ['test.conversation-v1', 'test.fallback-v1'])
    assert.equal(result._bedrock.fallback, true)

    calls.length = 0
    await assert.rejects(
      service({ messages: [{ role: 'user', content: 'score this' }] }, { task: 'judge_full' }),
      /unavailable/,
    )
    assert.deepEqual(calls, ['test.judge-v1'])
  })
})

test('Bedrock command execution retries throttles and enforces an abort timeout', async () => {
  let sends = 0
  const client = {
    async send() {
      sends += 1
      if (sends === 1) {
        const error = new Error('slow down')
        error.name = 'ThrottlingException'
        throw error
      }
      return { ok: true }
    },
  }
  const result = await executeCommand({}, {
    client,
    retries: 1,
    timeoutMs: 100,
    sleep: async () => {},
    task: 'conversation',
  })
  assert.deepEqual(result, { ok: true })
  assert.equal(sends, 2)

  const hanging = {
    send(_command, { abortSignal }) {
      return new Promise((_resolve, reject) => {
        abortSignal.addEventListener('abort', () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        })
      })
    },
  }
  await assert.rejects(
    executeCommand({}, { client: hanging, retries: 0, timeoutMs: 5 }),
    AiTimeoutError,
  )
})

test('cost tracker applies current and post-promotion Claude rates', () => {
  const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000 }
  assert.equal(estimateCost('global.anthropic.claude-sonnet-5', usage, new Date('2026-07-16')), 12)
  assert.equal(estimateCost('global.anthropic.claude-sonnet-5', usage, new Date('2026-09-01')), 18)
  assert.equal(estimateCost('mistral.mistral-large-3-675b-instruct', usage), 2.35)
  assert.equal(estimateCost('mistral.voxtral-mini-3b-2507', usage), 0.1)
  assert.equal(estimateCost('unpriced.model', usage), null)
})

test('speech-to-text request keeps WebM bytes in memory and forbids interpretation', () => {
  const bytes = Buffer.from([1, 2, 3, 4])
  const request = buildTranscriptionRequest(bytes, 'answer.webm', 'hi', 'test.voxtral')
  const audio = request.messages[0].content[0].audio
  assert.equal(audio.format, 'webm')
  assert.equal(audio.source.bytes, bytes)
  assert.match(request.messages[0].content[1].text, /Return only the transcript text/)
  assert.match(request.messages[0].content[1].text, /Do not.*infer emotion/i)
  assert.equal(audioFormat('clip.oga'), 'ogg')
  assert.equal(audioFormat('unknown.bin'), 'webm')
})

test('embedding and Polly adapters build provider-native requests', () => {
  assert.deepEqual(buildEmbeddingPayload('hello', 'amazon.titan-embed-text-v2:0'), {
    inputText: 'hello', dimensions: 1024, normalize: true,
  })
  assert.deepEqual(buildEmbeddingPayload('hello', 'cohere.embed-v4:0', 'search_query'), {
    texts: ['hello'], input_type: 'search_query', embedding_types: ['float'],
  })
  assert.deepEqual(buildPollyRequest('Hello', {
    voiceId: 'Kajal', engine: 'neural', languageCode: 'en-IN',
  }), {
    Engine: 'neural', LanguageCode: 'en-IN', OutputFormat: 'mp3', SampleRate: '24000',
    Text: 'Hello', TextType: 'text', VoiceId: 'Kajal',
  })
  assert.throws(() => buildPollyRequest('a'.repeat(601), {}), /1-600/)
})

test('all cloud AI SDK imports stay inside the centralized gateway', async () => {
  const roots = ['routes', 'lib', 'engine', 'scoring']
  const walk = async (relative) => {
    const files = []
    for (const entry of await readdir(join(__dirname, '..', relative), { withFileTypes: true })) {
      const child = join(relative, entry.name)
      if (entry.isDirectory()) files.push(...(await walk(child)))
      else if (entry.name.endsWith('.js')) files.push(child)
    }
    return files
  }
  for (const file of (await Promise.all(roots.map(walk))).flat()) {
    const source = await readFile(join(__dirname, '..', file), 'utf8')
    for (const banned of [
      "from 'openai'",
      '@aws-sdk/client-bedrock-runtime',
      '@aws-sdk/client-polly',
      'AZURE_OPENAI_',
      'AZURE_WHISPER_',
      'AZURE_SPEECH_',
    ]) {
      assert.ok(!source.includes(banned), `${file} bypasses services/ai (${banned})`)
    }
  }
})