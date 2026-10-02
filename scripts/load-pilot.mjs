#!/usr/bin/env node
// P9.6 pilot load harness — dependency-free (native fetch + promise pools).
//
//   PRISM_LOAD_TARGET_URL=http://127.0.0.1:4173 node scripts/load-pilot.mjs --synthetic \
//        [--concurrency 10] [--iterations 20] [--session <id> --token <bearer> --workspace <id>]
//
// Refuses to run without BOTH the explicit --synthetic flag and
// PRISM_LOAD_TARGET_URL. It registers throwaway synthetic accounts
// (<random>@synthetic.invalid) on the target and measures p50/p95 for:
//   history_read   GET /api/v1/me/history            (owned history read)
//   report_read    GET /api/v1/assessment-sessions/:id/report  (only with --session)
//   action_ack     POST /api/v1/assessment-sessions/:id/messages (only with --session; durable ack)
//   begin          POST /api/v1/assessment-sessions/:id/begin    (only with --session; idempotent replay)
// Measurements the harness cannot take honestly are reported NOT_MEASURED
// with the reason, never estimated. Targets printed are the source plan's
// PLANNING TARGETS, not an SLA and not a measurement.
//
// Output: one JSON document on stdout with hardware, concurrency, dataset,
// provider-condition and uncertainty fields. No tokens or learner text.
import os from 'node:os'
import { randomBytes } from 'node:crypto'

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const arg = (name, def) => { const i = argv.indexOf(`--${name}`); return i !== -1 && argv[i + 1] ? argv[i + 1] : def }

const TARGET = process.env.PRISM_LOAD_TARGET_URL
if (!TARGET || !flag('synthetic')) {
  process.stdout.write(JSON.stringify({
    status: 'REFUSED',
    reason: !TARGET ? 'PRISM_LOAD_TARGET_URL is not set' : '--synthetic flag missing: this harness only runs against synthetic accounts on a disposable target',
    planningTargets: PLANNING_TARGETS(),
  }, null, 2) + '\n')
  process.exit(2)
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]|[^/]+\.(local|internal|test|invalid))(:\d+)?\/?$/.test(TARGET) && process.env.PRISM_LOAD_ALLOW_REMOTE !== 'true') {
  process.stdout.write(JSON.stringify({ status: 'REFUSED', reason: 'target does not look disposable; set PRISM_LOAD_ALLOW_REMOTE=true only for an authorized staging host' }, null, 2) + '\n')
  process.exit(2)
}

const BASE = TARGET.replace(/\/$/, '')
const CONCURRENCY = Math.max(1, Number(arg('concurrency', '10')))
const ITERATIONS = Math.max(1, Number(arg('iterations', '20')))
const SESSION = arg('session', null)
const TOKEN = arg('token', process.env.PRISM_LOAD_SESSION_TOKEN || null)
const WORKSPACE = arg('workspace', process.env.PRISM_LOAD_WORKSPACE_ID || null)

function PLANNING_TARGETS() {
  return {
    note: 'Source-plan initial engineering targets. Planning targets only — not current measurements, not a public SLA.',
    history_read_p95_ms: 1500,
    report_read_p95_ms: 1500,
    action_ack_p95_ms: 1000,
    first_ai_reply_p95_ms: 8000,
    report_publication_p95_ms: 180000,
  }
}

const percentile = (xs, p) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}
const summarize = (name, samples, errors, extra = {}) => ({
  name, status: samples.length ? 'MEASURED' : 'NOT_MEASURED', samples: samples.length, errors,
  p50_ms: percentile(samples, 50), p95_ms: percentile(samples, 95), max_ms: samples.length ? Math.max(...samples) : null, ...extra,
})

async function timed(fn) {
  const t0 = process.hrtime.bigint()
  const res = await fn()
  return { ms: Number(process.hrtime.bigint() - t0) / 1e6, res }
}

async function pool(n, items, worker) {
  const out = []
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await worker(items[idx], idx) }
  }))
  return out
}

async function registerSynthetic(k) {
  const email = `load-${Date.now().toString(36)}-${k}-${randomBytes(4).toString('hex')}@synthetic.invalid`
  const r = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `Synthetic Load ${k}`, email, password: randomBytes(12).toString('base64url'), ageConfirmed: true, college: 'Synthetic', year: '1' }),
  })
  if (!r.ok) return null
  const body = await r.json().catch(() => null)
  if (!body?.token) return null
  const ws = await fetch(`${BASE}/api/v1/workspaces`, { headers: { Authorization: `Bearer ${body.token}` } }).then((x) => (x.ok ? x.json() : null)).catch(() => null)
  const personal = (ws?.data?.workspaces || ws?.data || []).find?.((w) => w.type === 'PERSONAL') || null
  return { token: body.token, workspaceId: personal?.id || null }
}

async function main() {
  const startedAt = new Date().toISOString()
  const health = await timed(() => fetch(`${BASE}/api/health`).then((r) => r.status).catch(() => 0))
  const accounts = (await pool(CONCURRENCY, Array.from({ length: CONCURRENCY }, (_, k) => k), registerSynthetic)).filter(Boolean)
  const results = []

  // history_read
  {
    const samples = []
    let errors = 0
    const jobs = Array.from({ length: ITERATIONS * Math.max(1, accounts.length) }, (_, i) => accounts[i % Math.max(1, accounts.length)])
    if (accounts.length) {
      await pool(CONCURRENCY, jobs, async (acct) => {
        const { ms, res } = await timed(() => fetch(`${BASE}/api/v1/me/history`, { headers: { Authorization: `Bearer ${acct.token}`, ...(acct.workspaceId ? { 'X-Prism-Workspace': acct.workspaceId } : {}) } }).then((r) => r.status).catch(() => 0))
        if (res >= 200 && res < 300) samples.push(ms); else errors += 1
      })
    }
    results.push(summarize('history_read', samples, errors, accounts.length ? {} : { reason: 'synthetic registration failed on the target' }))
  }

  // Session-bound measurements: only with an explicitly supplied in-progress synthetic session.
  const sessionHeaders = SESSION && TOKEN ? { Authorization: `Bearer ${TOKEN}`, ...(WORKSPACE ? { 'X-Prism-Workspace': WORKSPACE } : {}) } : null
  const noSession = { reason: 'no --session/--token supplied; the harness does not fabricate runs' }
  {
    const samples = []
    let errors = 0
    if (sessionHeaders) {
      await pool(CONCURRENCY, Array.from({ length: ITERATIONS }), async () => {
        const { ms, res } = await timed(() => fetch(`${BASE}/api/v1/assessment-sessions/${SESSION}/report`, { headers: sessionHeaders }).then((r) => r.status).catch(() => 0))
        if (res === 200) samples.push(ms); else errors += 1
      })
    }
    results.push(summarize('report_read', samples, errors, sessionHeaders ? {} : noSession))
  }
  {
    const samples = []
    let errors = 0
    if (sessionHeaders) {
      await pool(CONCURRENCY, Array.from({ length: ITERATIONS }), async (_, i) => {
        const { ms, res } = await timed(() => fetch(`${BASE}/api/v1/assessment-sessions/${SESSION}/begin`, { method: 'POST', headers: { ...sessionHeaders, 'Idempotency-Key': `load-begin-${i}` } }).then((r) => r.status).catch(() => 0))
        if (res === 200) samples.push(ms); else errors += 1
      })
    }
    results.push(summarize('begin', samples, errors, sessionHeaders ? { note: 'repeated begins must replay one start time; the server owns the clock' } : noSession))
  }
  {
    const samples = []
    let errors = 0
    if (sessionHeaders) {
      await pool(CONCURRENCY, Array.from({ length: ITERATIONS }), async (_, i) => {
        const clientEventId = `load-ack-${Date.now().toString(36)}-${i}`
        const { ms, res } = await timed(() => fetch(`${BASE}/api/v1/assessment-sessions/${SESSION}/messages`, {
          method: 'POST', headers: { ...sessionHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientEventId, text: `Synthetic load message ${i}: this text is generated by the load harness and is not learner work.` }),
        }).then((r) => r.status).catch(() => 0))
        if (res === 201 || res === 200) samples.push(ms); else errors += 1
      })
    }
    results.push(summarize('action_ack', samples, errors, sessionHeaders ? { note: 'includes the engine reply where the form has one; durable acknowledgement alone is not separable from the client side' } : noSession))
  }

  const report = {
    status: 'COMPLETED',
    kind: 'PILOT_LOAD_HARNESS',
    startedAt, finishedAt: new Date().toISOString(),
    target: { url: BASE, healthStatus: health.res, healthMs: Number(health.ms.toFixed(1)) },
    hardware: { platform: os.platform(), arch: os.arch(), cpus: os.cpus().length, cpuModel: os.cpus()[0]?.model || null, totalMemGb: Number((os.totalmem() / 2 ** 30).toFixed(1)), node: process.version },
    concurrency: CONCURRENCY,
    iterationsPerWorker: ITERATIONS,
    dataset: { syntheticAccounts: accounts.length, sessionSupplied: Boolean(sessionHeaders), note: 'disposable synthetic accounts only; nothing here is a real learner' },
    providerCondition: process.env.PRISM_AUDIT_AI === 'true' ? 'DETERMINISTIC_AUDIT_PROVIDER' : 'UNKNOWN_SEE_TARGET_CONFIG',
    uncertainty: 'single-host loopback client; excludes real client network, cold caches and provider variance; repeat on the pilot hardware before quoting',
    planningTargets: PLANNING_TARGETS(),
    measurements: results,
  }
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
}

main().catch((err) => {
  process.stdout.write(JSON.stringify({ status: 'FAILED', error: String(err?.message || err) }, null, 2) + '\n')
  process.exit(1)
})
