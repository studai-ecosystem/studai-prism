import test from 'node:test'
import assert from 'node:assert/strict'
import { isTelemetryEnabled, auditLog, recordItemResponse } from '../lib/telemetry.js'

// These tests assert the Phase 0 "zero behavior change" contract: with the flag
// off (or no DB), telemetry is fully inert — disabled and non-throwing.

function withEnv(vars, fn) {
  const prev = {}
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  try {
    return fn()
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

test('telemetry disabled when flag is off', () => {
  withEnv({ PRISM_V2_TELEMETRY: undefined, DATABASE_URL: 'postgres://x/y' }, () => {
    assert.equal(isTelemetryEnabled(), false)
  })
})

test('telemetry disabled when flag on but no DATABASE_URL', () => {
  withEnv({ PRISM_V2_TELEMETRY: 'true', DATABASE_URL: undefined }, () => {
    assert.equal(isTelemetryEnabled(), false)
  })
})

test('telemetry enabled only when flag on AND DATABASE_URL set', () => {
  withEnv({ PRISM_V2_TELEMETRY: 'true', DATABASE_URL: 'postgres://x/y' }, () => {
    assert.equal(isTelemetryEnabled(), true)
  })
})

test('auditLog is a silent no-op when disabled (never throws)', () => {
  withEnv({ PRISM_V2_TELEMETRY: undefined }, () => {
    assert.doesNotThrow(() => auditLog('ai_turn', 'not-a-uuid', { x: 1 }))
  })
})

test('recordItemResponse is a silent no-op when disabled (never throws)', () => {
  withEnv({ PRISM_V2_TELEMETRY: undefined }, () => {
    assert.doesNotThrow(() =>
      recordItemResponse({
        sessionId: '11111111-1111-4111-8111-111111111111',
        scenarioKey: 'group-project',
        dimension: 'communication',
        exchangeNo: 1,
        candidateText: 'hello',
        latencyMs: 1234,
      }),
    )
  })
})
