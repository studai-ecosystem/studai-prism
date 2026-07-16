import {
  BedrockRuntimeClient,
  ConverseCommand,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime'
import logger from '../../lib/logger.js'
import { awsRegion } from './modelRouter.js'

const clients = new Map()

export class AiTimeoutError extends Error {
  constructor(timeoutMs) {
    super(`AI request exceeded ${timeoutMs}ms`)
    this.name = 'AiTimeoutError'
    this.code = 'AI_TIMEOUT'
  }
}

export function runtimeClient(region = awsRegion()) {
  if (!clients.has(region)) {
    clients.set(region, new BedrockRuntimeClient({ region, maxAttempts: 1 }))
  }
  return clients.get(region)
}

export function isRetryableError(error) {
  const status = Number(error?.$metadata?.httpStatusCode || error?.statusCode || error?.status)
  if (status === 429 || status >= 500) return true
  return new Set([
    'ThrottlingException',
    'ServiceUnavailableException',
    'InternalServerException',
    'ModelNotReadyException',
    'ModelTimeoutException',
    'TimeoutError',
    'AiTimeoutError',
  ]).has(error?.name)
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function sendOnce(client, command, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  timer.unref?.()
  try {
    return await client.send(command, { abortSignal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') throw new AiTimeoutError(timeoutMs)
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function executeCommand(command, {
  region = awsRegion(),
  timeoutMs = 30_000,
  retries = 2,
  task = 'unknown',
  modelId = null,
  client = runtimeClient(region),
  sleep = wait,
} = {}) {
  let lastError
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await sendOnce(client, command, timeoutMs)
    } catch (error) {
      lastError = error
      if (!isRetryableError(error) || attempt >= retries) break
      const backoffMs = 400 * (2 ** attempt) + Math.floor(Math.random() * 100)
      logger.warn('ai_retry', { provider: 'aws-bedrock', task, modelId, attempt: attempt + 1, backoffMs })
      await sleep(backoffMs)
    }
  }
  throw lastError
}

export function converse(input, options = {}) {
  return executeCommand(new ConverseCommand(input), { ...options, modelId: input.modelId })
}

export function invokeModel(input, options = {}) {
  return executeCommand(new InvokeModelCommand(input), { ...options, modelId: input.modelId })
}

export { ConverseCommand, InvokeModelCommand }