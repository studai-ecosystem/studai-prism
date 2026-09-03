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

  await t.test('GET /api/assessments/catalog returns calibrated simulations', async () => {
    const res = await fetch(`http://localhost:${port}/api/assessments/catalog`)
    assert.equal(res.status, 200)
    const data = await res.json()
    assert.equal(data.status, 'success')
    assert.ok(Array.isArray(data.catalog))
    assert.ok(data.catalog.length >= 2)
    assert.equal(data.catalog[0].job_family, 'STUDAI-JF-BIZOPS-L1')
    assert.equal(data.catalog[0].is_calibrated, true)
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
