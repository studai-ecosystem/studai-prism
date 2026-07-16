import { invokeModel } from './bedrockClient.js'
import { policyFor } from './modelRouter.js'
import { recordUsage } from './costTracker.js'

const decoder = new TextDecoder()

export function buildEmbeddingPayload(text, modelId, inputType = 'search_document') {
  if (modelId.startsWith('cohere.')) {
    return { texts: [text], input_type: inputType, embedding_types: ['float'] }
  }
  return { inputText: text, dimensions: 1024, normalize: true }
}

export async function embedText(value, { inputType = 'search_document' } = {}) {
  const text = String(value || '').trim()
  if (!text) throw new Error('Embedding input cannot be empty')
  if (text.length > 50_000) throw new Error('Embedding input is too large')
  const policy = policyFor('embedding')
  const response = await invokeModel({
    modelId: policy.modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(buildEmbeddingPayload(text, policy.modelId, inputType)),
  }, {
    region: policy.region,
    timeoutMs: policy.timeoutMs,
    retries: 2,
    task: 'embedding',
  })
  const body = JSON.parse(decoder.decode(response.body))
  const vector = body.embedding || body.embeddings?.float?.[0] || body.embeddings?.[0]
  if (!Array.isArray(vector) || !vector.length) throw new Error('Embedding model returned no vector')
  recordUsage({
    task: 'embedding',
    modelId: policy.modelId,
    response: {
      ...response,
      usage: { inputTokens: Number(body.inputTextTokenCount) || 0, outputTokens: 0 },
    },
  })
  return { vector, modelId: policy.modelId, dimensions: vector.length }
}