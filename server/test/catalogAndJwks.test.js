import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { buildApp } from '../app.js'

test('PRISM catalog and JWKS endpoints operational', async (t) => {
  const app = buildApp()
  const server = http.createServer(app)

  await new Promise((resolve) => server.listen(0, resolve))
  const port = server.address().port

  t.after(() => {
    server.close()
  })

  await t.test('GET /api/assessments/catalog returns versioned definitions and keeps simulations uncalibrated', async () => {
    const res = await fetch(`http://localhost:${port}/api/assessments/catalog`)
    assert.equal(res.status, 200)
    const data = await res.json()
    assert.equal(data.status, 'success')
    assert.ok(Array.isArray(data.catalog))
    assert.ok(data.catalog.length >= 2)

    // Check first item has approved required fields (DEF-05 / §5.1)
    const first = data.catalog[0]
    assert.equal(first.job_family, 'STUDAI-JF-GBO')
    assert.equal(first.is_calibrated, false)
    assert.equal(first.calibration_status, 'PENDING')
    assert.equal(first.validation_status, 'DEVELOPMENTAL')
    assert.ok(first.assessment_definition_id)
    assert.ok(first.version)
    assert.ok(first.title)
    assert.ok(first.status)
    assert.ok(first.duration)
    assert.ok(first.retake_policy)
    assert.ok(first.scenario_set_version)
    assert.ok(first.competency_framework_version)
  })

  await t.test('DEF-05: production returns 503 CATALOG_TEMPORARILY_UNAVAILABLE if database is unconfigured', async () => {
    const oldEnv = process.env.NODE_ENV
    const oldDb = process.env.DATABASE_URL
    process.env.NODE_ENV = 'production'
    delete process.env.DATABASE_URL
    try {
      const res = await fetch(`http://localhost:${port}/api/assessments/catalog`)
      assert.equal(res.status, 503)
      const data = await res.json()
      assert.equal(data.error, 'CATALOG_TEMPORARILY_UNAVAILABLE')
    } finally {
      process.env.NODE_ENV = oldEnv
      if (oldDb !== undefined) process.env.DATABASE_URL = oldDb
    }
  })

  await t.test('GET /.well-known/jwks.json returns Ed25519 public keys', async () => {
    const res = await fetch(`http://localhost:${port}/.well-known/jwks.json`)
    assert.equal(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data.keys))
    assert.ok(data.keys.length > 0)
    assert.equal(data.keys[0].kty, 'OKP')
    assert.equal(data.keys[0].crv, 'Ed25519')
  })
})
