import logger from '../../lib/logger.js'
import { converse } from './bedrockClient.js'
import { policyFor } from './modelRouter.js'
import { recordUsage } from './costTracker.js'
import { toCompletionEnvelope } from './responseParser.js'

const MAX_MESSAGES = 200
const MAX_TEXT_CHARS = 1_000_000

function cleanText(value) {
  const text = String(value ?? '')
  if (!text.trim()) throw new Error('AI message content cannot be empty')
  if (text.length > MAX_TEXT_CHARS) throw new Error('AI message content exceeds the configured limit')
  return text
}

function appendMessage(messages, role, text) {
  const last = messages[messages.length - 1]
  if (last?.role === role) {
    last.content[0].text += `\n\n${text}`
  } else {
    messages.push({ role, content: [{ text }] })
  }
}

export function normalizeMessages(sourceMessages) {
  if (!Array.isArray(sourceMessages) || !sourceMessages.length) {
    throw new Error('At least one AI message is required')
  }
  if (sourceMessages.length > MAX_MESSAGES) throw new Error('Too many AI messages')

  const system = []
  const messages = []
  for (const source of sourceMessages) {
    const role = source?.role
    const text = cleanText(source?.content)
    if (role === 'system') {
      system.push({ text })
    } else if (role === 'user' || role === 'assistant') {
      appendMessage(messages, role, text)
    } else {
      throw new Error(`Unsupported AI message role: ${role}`)
    }
  }

  while (messages[0]?.role === 'assistant') {
    system.push({ text: `Prior assistant context:\n${messages.shift().content[0].text}` })
  }
  if (!messages.length) throw new Error('At least one user message is required')

  return { system, messages }
}

function guardrailConfig() {
  if (!process.env.BEDROCK_GUARDRAIL_ID || !process.env.BEDROCK_GUARDRAIL_VERSION) return null
  return {
    guardrailIdentifier: process.env.BEDROCK_GUARDRAIL_ID,
    guardrailVersion: process.env.BEDROCK_GUARDRAIL_VERSION,
  }
}

function outputConfig(jsonSchema) {
  if (!jsonSchema) return null
  return {
    textFormat: {
      type: 'json_schema',
      structure: {
        jsonSchema: {
          name: jsonSchema.name,
          description: jsonSchema.description,
          schema: JSON.stringify(jsonSchema.schema),
        },
      },
    },
  }
}

export function buildConverseRequest(params, { task, modelId }) {
  const { system, messages } = normalizeMessages(params.messages)
  if (process.env.BEDROCK_PROMPT_CACHE === 'true' && system.length) {
    system.push({ cachePoint: { type: 'default' } })
  }
  const inferenceConfig = {
    maxTokens: Number(params.max_completion_tokens || params.max_tokens || 1024),
  }
  if (Number.isFinite(Number(params.temperature))) inferenceConfig.temperature = Number(params.temperature)
  if (Number.isFinite(Number(params.top_p))) inferenceConfig.topP = Number(params.top_p)

  return {
    modelId,
    messages,
    ...(system.length ? { system } : {}),
    inferenceConfig,
    requestMetadata: {
      application: 'studai-prism',
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      task,
    },
    ...(guardrailConfig() ? { guardrailConfig: guardrailConfig() } : {}),
    ...(outputConfig(params.json_schema) ? { outputConfig: outputConfig(params.json_schema) } : {}),
  }
}

function fallbackEligible(error) {
  return !new Set([
    'AccessDeniedException',
    'ValidationException',
    'UnrecognizedClientException',
    'AI_GUARDRAIL_BLOCKED',
  ]).has(error?.name) && error?.code !== 'AI_GUARDRAIL_BLOCKED'
}

export function createCompletionService({ converseFn = converse } = {}) {
  return async function createCompletion(params, options = {}) {
    const task = options.task || 'conversation'
    const policy = policyFor(task, params?.model)
    const retries = Number.isInteger(options.retries) ? options.retries : 2
    const expectJson = params?.response_format?.type === 'json_object' || Boolean(params?.json_schema)

    const invoke = async (modelId, fallback) => {
      const request = buildConverseRequest(params, { task, modelId })
      const response = await converseFn(request, {
        region: policy.region,
        timeoutMs: policy.timeoutMs,
        retries,
        task,
      })
      recordUsage({ task, modelId, response, fallback })
      return toCompletionEnvelope(response, { modelId, expectJson, fallback })
    }

    try {
      return await invoke(policy.modelId, false)
    } catch (error) {
      if (!policy.allowFallback || !fallbackEligible(error)) throw error
      logger.warn('ai_model_fallback', {
        provider: 'aws-bedrock',
        task,
        fromModel: policy.modelId,
        toModel: policy.fallbackModelId,
        reason: error?.name || error?.code || 'unknown',
      })
      return invoke(policy.fallbackModelId, true)
    }
  }
}

export const createCompletion = createCompletionService()