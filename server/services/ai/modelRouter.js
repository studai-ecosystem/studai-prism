const DEFAULT_MODELS = Object.freeze({
  primary: 'global.anthropic.claude-sonnet-5',
  conversation: 'mistral.mistral-large-3-675b-instruct',
  fast: 'mistral.ministral-3-14b-instruct',
  fallback: 'global.amazon.nova-2-lite-v1:0',
  embedding: 'amazon.titan-embed-text-v2:0',
  speechToText: 'mistral.voxtral-mini-3b-2507',
  multimodal: 'mistral.mistral-large-3-675b-instruct',
})

const TASK_POLICIES = Object.freeze({
  opening: { model: 'conversation', fallback: true, timeoutMs: 25_000 },
  conversation: { model: 'conversation', fallback: true, timeoutMs: 25_000 },
  calibration: { model: 'fast', fallback: true, timeoutMs: 12_000 },
  entry_estimator: { model: 'fast', fallback: true, timeoutMs: 12_000 },
  micro_rater: { model: 'fast', fallback: true, timeoutMs: 12_000 },
  judge_full: { model: 'primary', fallback: false, timeoutMs: 60_000 },
  judge_turn: { model: 'primary', fallback: false, timeoutMs: 30_000 },
  replay: { model: 'conversation', fallback: true, timeoutMs: 25_000 },
  teamfit: { model: 'conversation', fallback: true, timeoutMs: 30_000 },
  embedding: { model: 'embedding', fallback: false, timeoutMs: 15_000 },
  speech_to_text: { model: 'speechToText', fallback: false, timeoutMs: 45_000 },
  multimodal: { model: 'multimodal', fallback: true, timeoutMs: 30_000 },
})

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function configuredModels() {
  return {
    primary: process.env.BEDROCK_PRIMARY_MODEL || DEFAULT_MODELS.primary,
    conversation: process.env.BEDROCK_CONVERSATION_MODEL || DEFAULT_MODELS.conversation,
    fast: process.env.BEDROCK_FAST_MODEL || DEFAULT_MODELS.fast,
    fallback: process.env.BEDROCK_FALLBACK_MODEL || DEFAULT_MODELS.fallback,
    embedding: process.env.BEDROCK_EMBEDDING_MODEL || DEFAULT_MODELS.embedding,
    speechToText: process.env.BEDROCK_STT_MODEL || DEFAULT_MODELS.speechToText,
    multimodal: process.env.BEDROCK_MULTIMODAL_MODEL || DEFAULT_MODELS.multimodal,
  }
}

function extraJudgeModels() {
  return [process.env.PRISM_JUDGE_MODEL_B, ...(process.env.PRISM_JUDGE_MODELS || '').split(',')]
    .map((model) => String(model || '').trim())
    .filter(Boolean)
}

export function aiProvider() {
  return process.env.AI_PROVIDER || 'aws-bedrock'
}

export function awsRegion() {
  return process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-south-1'
}

export function modelFor(task) {
  const policy = TASK_POLICIES[task]
  if (!policy) throw new Error(`Unknown AI task: ${task}`)
  return configuredModels()[policy.model]
}

export function allowedModelIds() {
  return new Set([...Object.values(configuredModels()), ...extraJudgeModels()])
}

export function assertAllowedModel(modelId) {
  if (!allowedModelIds().has(modelId)) {
    throw new Error(`AI model is not configured for this deployment: ${modelId}`)
  }
  return modelId
}

export function policyFor(task, requestedModel) {
  const policy = TASK_POLICIES[task]
  if (!policy) throw new Error(`Unknown AI task: ${task}`)
  const modelId = requestedModel ? assertAllowedModel(requestedModel) : modelFor(task)
  const configured = configuredModels()
  const fallbackModelId = policy.fallback && configured.fallback !== modelId
    ? configured.fallback
    : null
  const timeoutOverride = task.startsWith('judge_')
    ? process.env.BEDROCK_JUDGE_TIMEOUT_MS
    : process.env.BEDROCK_TIMEOUT_MS

  return {
    task,
    modelId,
    fallbackModelId,
    allowFallback: Boolean(policy.fallback && fallbackModelId),
    timeoutMs: positiveInt(timeoutOverride, policy.timeoutMs),
    region: awsRegion(),
  }
}

export function judgeModel() {
  return modelFor('judge_full')
}

export function conversationModel() {
  return modelFor('conversation')
}

export function fastModel() {
  return modelFor('micro_rater')
}

export function speechToTextModel() {
  return modelFor('speech_to_text')
}

export function embeddingModel() {
  return modelFor('embedding')
}

export { DEFAULT_MODELS, TASK_POLICIES }