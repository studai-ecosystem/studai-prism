export class AiResponseError extends Error {
  constructor(message, code = 'AI_RESPONSE_INVALID') {
    super(message)
    this.name = 'AiResponseError'
    this.code = code
  }
}

export function textFromConverse(response) {
  if (response?.stopReason === 'guardrail_intervened') {
    throw new AiResponseError('Amazon Bedrock Guardrail blocked the model response', 'AI_GUARDRAIL_BLOCKED')
  }
  const blocks = response?.output?.message?.content || []
  const text = blocks
    .filter((block) => typeof block?.text === 'string')
    .map((block) => block.text)
    .join('')
    .trim()
  if (!text) throw new AiResponseError('Amazon Bedrock returned no text content')
  return text
}

function balancedJsonObject(text) {
  const start = text.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, index + 1)
    }
  }
  return null
}

export function parseJsonText(value) {
  const text = String(value || '').trim()
  if (!text) throw new AiResponseError('AI response was empty')
  const unfenced = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  for (const candidate of [unfenced, balancedJsonObject(unfenced)]) {
    if (!candidate) continue
    try {
      const parsed = JSON.parse(candidate)
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') continue
      return parsed
    } catch {
      // Try the balanced object next.
    }
  }
  throw new AiResponseError('AI response did not contain a valid JSON object')
}

function finishReason(stopReason) {
  if (stopReason === 'max_tokens') return 'length'
  if (stopReason === 'stop_sequence') return 'stop'
  return 'stop'
}

export function toCompletionEnvelope(response, { modelId, expectJson = false, fallback = false } = {}) {
  const rawText = textFromConverse(response)
  const content = expectJson ? JSON.stringify(parseJsonText(rawText)) : rawText
  const inputTokens = Number(response?.usage?.inputTokens) || 0
  const outputTokens = Number(response?.usage?.outputTokens) || 0
  const cacheReadTokens = Number(response?.usage?.cacheReadInputTokens) || 0
  const cacheWriteTokens = Number(response?.usage?.cacheWriteInputTokens) || 0
  return {
    id: response?.$metadata?.requestId || null,
    model: modelId,
    choices: [{
      index: 0,
      finish_reason: finishReason(response?.stopReason),
      message: { role: 'assistant', content },
    }],
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
      cache_read_input_tokens: cacheReadTokens,
      cache_write_input_tokens: cacheWriteTokens,
    },
    provider: 'aws-bedrock',
    _bedrock: {
      requestId: response?.$metadata?.requestId || null,
      latencyMs: Number(response?.metrics?.latencyMs) || null,
      stopReason: response?.stopReason || null,
      fallback,
    },
  }
}