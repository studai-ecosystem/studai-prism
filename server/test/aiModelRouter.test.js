import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aiProvider,
  allowedModelIds,
  modelFor,
  policyFor,
} from '../services/ai/modelRouter.js'

function withEnv(values, fn) {
  const saved = new Map()
  for (const [key, value] of Object.entries(values)) {
    saved.set(key, process.env[key])
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    return fn()
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test('AI router defaults to AWS Bedrock and environment-switchable models', () => {
  withEnv({ AI_PROVIDER: undefined, BEDROCK_FAST_MODEL: 'test.fast-v1' }, () => {
    assert.equal(aiProvider(), 'aws-bedrock')
    assert.equal(modelFor('micro_rater'), 'test.fast-v1')
    assert.ok(allowedModelIds().has('test.fast-v1'))
  })
})

test('AI router never falls back for score-affecting judge tasks', () => {
  withEnv({
    BEDROCK_PRIMARY_MODEL: 'test.judge-v1',
    BEDROCK_FALLBACK_MODEL: 'test.fallback-v1',
  }, () => {
    for (const task of ['judge_full', 'judge_turn']) {
      const policy = policyFor(task)
      assert.equal(policy.modelId, 'test.judge-v1')
      assert.equal(policy.allowFallback, false)
      assert.equal(policy.fallbackModelId, null)
    }
  })
})

test('AI router allows a configured fallback only for non-scoring tasks', () => {
  withEnv({
    BEDROCK_CONVERSATION_MODEL: 'test.conversation-v1',
    BEDROCK_FALLBACK_MODEL: 'test.fallback-v1',
  }, () => {
    const policy = policyFor('conversation')
    assert.equal(policy.modelId, 'test.conversation-v1')
    assert.equal(policy.allowFallback, true)
    assert.equal(policy.fallbackModelId, 'test.fallback-v1')
  })
})

test('AI router rejects an unconfigured model override', () => {
  assert.throws(() => policyFor('judge_full', 'attacker.supplied-model'), /not configured/)
  assert.throws(() => policyFor('unknown-task'), /Unknown AI task/)
})

test('AI router accepts explicitly configured secondary judge models', () => {
  withEnv({ PRISM_JUDGE_MODEL_B: 'test.secondary-judge-v1' }, () => {
    const policy = policyFor('judge_turn', 'test.secondary-judge-v1')
    assert.equal(policy.modelId, 'test.secondary-judge-v1')
    assert.equal(policy.allowFallback, false)
  })
})