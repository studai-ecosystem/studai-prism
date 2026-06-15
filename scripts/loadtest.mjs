// Dependency-free load tester for the Prism server.
//
//   node scripts/loadtest.mjs --url http://localhost:3001/api/health \
//        --concurrency 50 --duration 15 [--method GET] [--body '{}']
//
// Fires `concurrency` parallel workers that hammer the URL for `duration`
// seconds, then reports throughput, latency percentiles, and error counts.
// Read-only by default (GET) — point it at /api/health to test capacity safely.

import http from 'node:http'
import https from 'node:https'

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def
}

const URL_ = arg('url', 'http://localhost:3001/api/health')
const CONCURRENCY = Number(arg('concurrency', '50'))
const DURATION = Number(arg('duration', '15'))
const METHOD = arg('method', 'GET').toUpperCase()
const BODY = arg('body', null)

const target = new URL(URL_)
const client = target.protocol === 'https:' ? https : http
const latencies = []
let ok = 0
let errors = 0
let inFlight = 0
const deadline = Date.now() + DURATION * 1000

function once() {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint()
    const req = client.request(
      {
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: target.pathname + target.search,
        method: METHOD,
        headers: BODY ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(BODY) } : {},
      },
      (res) => {
        res.on('data', () => {})
        res.on('end', () => {
          const ms = Number(process.hrtime.bigint() - start) / 1e6
          latencies.push(ms)
          if (res.statusCode >= 200 && res.statusCode < 400) ok++
          else errors++
          resolve()
        })
      },
    )
    req.on('error', () => { errors++; resolve() })
    if (BODY) req.write(BODY)
    req.end()
  })
}

async function worker() {
  while (Date.now() < deadline) {
    inFlight++
    await once()
    inFlight--
  }
}

function pct(sorted, p) {
  if (!sorted.length) return 0
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[i]
}

console.log(`load: ${METHOD} ${URL_}  c=${CONCURRENCY}  ${DURATION}s`)
const t0 = Date.now()
await Promise.all(Array.from({ length: CONCURRENCY }, worker))
const elapsed = (Date.now() - t0) / 1000

const sorted = latencies.slice().sort((a, b) => a - b)
const total = ok + errors
console.log(JSON.stringify({
  requests: total,
  ok,
  errors,
  rps: Math.round(total / elapsed),
  latency_ms: {
    p50: +pct(sorted, 50).toFixed(1),
    p95: +pct(sorted, 95).toFixed(1),
    p99: +pct(sorted, 99).toFixed(1),
    max: +(sorted[sorted.length - 1] || 0).toFixed(1),
  },
  elapsed_s: +elapsed.toFixed(1),
}, null, 2))
