import logger from '../../lib/logger.js'

const DEFAULT_RATES = Object.freeze({
  // Promotional price through 2026-08-31; the standard rate is applied after.
  'global.anthropic.claude-sonnet-5': {
    inputPerMillion: 2,
    outputPerMillion: 10,
    promotionalThrough: '2026-08-31T23:59:59Z',
    standardInputPerMillion: 3,
    standardOutputPerMillion: 15,
  },
  // July 2026 standard global inference, sourced from ap-south-1.
  'global.amazon.nova-2-lite-v1:0': { inputPerMillion: 0.35, outputPerMillion: 2.95 },
  // July 2026 in-Region pricing in ap-south-1.
  'mistral.mistral-large-3-675b-instruct': { inputPerMillion: 0.59, outputPerMillion: 1.76 },
  'mistral.ministral-3-14b-instruct': { inputPerMillion: 0.24, outputPerMillion: 0.24 },
  'mistral.voxtral-mini-3b-2507': { inputPerMillion: 0.05, outputPerMillion: 0.05 },
})

function configuredRates() {
  if (!process.env.BEDROCK_COST_RATES_JSON) return {}
  try {
    const parsed = JSON.parse(process.env.BEDROCK_COST_RATES_JSON)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    logger.warn('bedrock_cost_rates_invalid', { detail: 'BEDROCK_COST_RATES_JSON is not valid JSON' })
    return {}
  }
}

export function rateFor(modelId, now = new Date()) {
  const rate = configuredRates()[modelId] || DEFAULT_RATES[modelId] || null
  if (!rate) return null
  if (rate.promotionalThrough && now > new Date(rate.promotionalThrough)) {
    return {
      ...rate,
      inputPerMillion: rate.standardInputPerMillion,
      outputPerMillion: rate.standardOutputPerMillion,
    }
  }
  return rate
}

export function estimateCost(modelId, usage, now = new Date()) {
  const rate = rateFor(modelId, now)
  if (!rate) return null
  const input = Number(usage?.inputTokens ?? usage?.prompt_tokens) || 0
  const output = Number(usage?.outputTokens ?? usage?.completion_tokens) || 0
  const cacheRead = Number(usage?.cacheReadInputTokens ?? usage?.cache_read_input_tokens) || 0
  const cacheWrite = Number(usage?.cacheWriteInputTokens ?? usage?.cache_write_input_tokens) || 0
  const cost =
    (input * Number(rate.inputPerMillion || 0)) / 1_000_000 +
    (output * Number(rate.outputPerMillion || 0)) / 1_000_000 +
    (cacheRead * Number(rate.cacheReadPerMillion || rate.inputPerMillion || 0)) / 1_000_000 +
    (cacheWrite * Number(rate.cacheWritePerMillion || rate.inputPerMillion || 0)) / 1_000_000
  return +cost.toFixed(8)
}

export function recordUsage({ task, modelId, response, fallback = false }) {
  const usage = response?.usage || {}
  const costUsd = estimateCost(modelId, usage)
  logger.info('ai_usage', {
    provider: 'aws-bedrock',
    task,
    modelId,
    fallback,
    requestId: response?.$metadata?.requestId || null,
    inputTokens: Number(usage.inputTokens) || 0,
    outputTokens: Number(usage.outputTokens) || 0,
    cacheReadInputTokens: Number(usage.cacheReadInputTokens) || 0,
    cacheWriteInputTokens: Number(usage.cacheWriteInputTokens) || 0,
    latencyMs: Number(response?.metrics?.latencyMs) || null,
    estimatedCostUsd: costUsd,
  })
  return costUsd
}

export { DEFAULT_RATES }