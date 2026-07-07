// Voice + app-shell gates (PRISM_TTS_NEURAL dark by default; personas always
// voice-mapped; the /speech endpoint can only replay what the avatar said).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.DATA_DIR = process.env.DATA_DIR || mkdtempSync(join(tmpdir(), 'prism-voice-test-'))
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-voice-suite'

import { SCENARIOS } from '../routes/assessment.js'
import { isTtsEnabled, escapeSsml, buildSsml } from '../lib/azureSpeech.js'
import { rankVoices, voiceGender, assignCastVoices } from '../../src/lib/voice.js'

const { buildApp } = await import('../app.js')
const app = buildApp()
const server = app.listen(0)
await new Promise((r) => server.once('listening', r))
const base = `http://127.0.0.1:${server.address().port}`
test.after(() => server.close())

const __dirname = dirname(fileURLToPath(import.meta.url))

function withEnv(vars, fn) {
  const saved = {}
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    })
}

// ── the flag is dark: the endpoints say so ───────────────────────────────────

test('VOICE: tts-status reports disabled and /speech is 404 while the flag is dark', async () => {
  const status = await (await fetch(`${base}/api/assessment/tts-status`)).json()
  assert.deepEqual(status, { enabled: false, provider: null })

  const speech = await fetch(`${base}/api/assessment/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: 'x', speaker: 'A', text: 'hello' }),
  })
  assert.equal(speech.status, 404, 'the endpoint does not exist for the public while dark')
})

test('VOICE: flag on but session unknown / text unspoken → honest rejections, no synth call', () =>
  withEnv({ PRISM_TTS_NEURAL: 'true', AZURE_SPEECH_KEY: 'test-key', AZURE_SPEECH_REGION: 'centralindia' }, async () => {
    const missing = await fetch(`${base}/api/assessment/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'does-not-exist', speaker: 'Nurse Latha', text: 'hello' }),
    })
    assert.equal(missing.status, 404, 'unknown session rejected before any synthesis')

    const tooLong = await fetch(`${base}/api/assessment/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'x', speaker: 'A', text: 'a'.repeat(700) }),
    })
    assert.equal(tooLong.status, 413, 'oversized line rejected')

    const bad = await fetch(`${base}/api/assessment/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'x' }),
    })
    assert.equal(bad.status, 400, 'missing fields rejected')
  }))

// ── new proctor event types ──────────────────────────────────────────────────

test('APP: display_mode and app_blur are accepted event types; junk still rejected', async () => {
  // Unknown type → 400 regardless of session (type check precedes lookup).
  const junk = await fetch(`${base}/api/assessment/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: 'any', type: 'made_up_event' }),
  })
  assert.equal(junk.status, 400)

  // Valid new types pass the allowlist (404 = reached the session lookup).
  for (const type of ['display_mode', 'app_blur']) {
    const res = await fetch(`${base}/api/assessment/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'no-such-session', type }),
    })
    assert.equal(res.status, 404, `${type} passes the allowlist and hits the session check`)
  }
})

// ── the app launcher's licence check ─────────────────────────────────────────

test('APP: /api/payment/licence requires auth and reports honest store facts', async () => {
  const unauth = await fetch(`${base}/api/payment/licence`)
  assert.equal(unauth.status, 401, 'licence status is never public')

  // Register a user, then check the empty-state licence shape.
  const email = `licence-${Date.now()}@example.com`
  const reg = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Licence Test', email, college: 'QA', year: 'Graduated', password: 'licence-pass-1!' }),
  })
  assert.equal(reg.status, 201, 'registration works in the test store')
  const { token } = await reg.json()

  const res = await fetch(`${base}/api/payment/licence`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  assert.equal(res.status, 200)
  const lic = await res.json()
  assert.equal(lic.email, email)
  assert.equal(lic.completed, 0, 'no invented history')
  assert.equal(lic.pendingSessionId, null, 'no invented pending session')
  assert.equal(typeof lic.canPurchase, 'boolean')
  assert.ok(['dummy', 'paid'].includes(lic.mode))
})

test('APP: the Windows installer is published at /download', async () => {
  const { stat } = await import('node:fs/promises')
  const s = await stat(join(__dirname, '..', '..', 'public', 'download', 'Prism-Assessment-Setup.exe'))
  assert.ok(s.size > 500_000, 'installer present and non-trivial')
})

// ── cast metadata ────────────────────────────────────────────────────────────

test('VOICE: every ACTIVE scenario participant carries tts metadata (gender + azure voice)', () => {
  const active = SCENARIOS.filter((s) => !s.retired)
  assert.equal(active.length, 8, 'frozen bank stays at 8 active scenarios')
  for (const s of active) {
    assert.equal(s.participants.length, 3, `${s.id} keeps its 3-person cast`)
    for (const p of s.participants) {
      assert.ok(p.tts, `${s.id}/${p.name} has tts metadata`)
      assert.ok(['male', 'female'].includes(p.tts.gender), `${s.id}/${p.name} gender declared`)
      assert.match(p.tts.azureVoice, /^en-IN-[A-Za-z]+Neural$/, `${s.id}/${p.name} uses an Indian-English neural voice`)
    }
    // Distinct voices within a scenario — three people must not share a voice.
    const voices = s.participants.map((p) => p.tts.azureVoice)
    assert.equal(new Set(voices).size, 3, `${s.id} cast voices are distinct`)
  }
})

// ── client voice engine (pure functions) ─────────────────────────────────────

const FAKE_VOICES = [
  { name: 'Microsoft Neerja Online (Natural) - English (India)', lang: 'en-IN' },
  { name: 'Microsoft Prabhat Online (Natural) - English (India)', lang: 'en-IN' },
  { name: 'Microsoft Zira Desktop - English (United States)', lang: 'en-US' },
  { name: 'Microsoft David Desktop - English (United States)', lang: 'en-US' },
  { name: 'Google français', lang: 'fr-FR' },
]

test('VOICE: ranking prefers natural + Indian-English and drops non-English', () => {
  const ranked = rankVoices(FAKE_VOICES)
  assert.equal(ranked.length, 4, 'non-English voices filtered out')
  assert.match(ranked[0].name, /Natural/, 'a natural voice ranks first')
  assert.match(ranked[0].lang, /en-IN/i)
})

test('VOICE: gender inference reads voice names', () => {
  assert.equal(voiceGender(FAKE_VOICES[0]), 'female') // Neerja
  assert.equal(voiceGender(FAKE_VOICES[1]), 'male') // Prabhat
  assert.equal(voiceGender(FAKE_VOICES[3]), 'male') // David
})

test('VOICE: cast assignment is deterministic, gender-matched and distinct', () => {
  const cast = SCENARIOS.find((s) => s.id === 'clinic-triage').participants
  const a = assignCastVoices(cast, FAKE_VOICES)
  const b = assignCastVoices(cast, FAKE_VOICES)
  for (const p of cast) {
    assert.ok(a.get(p.name), `${p.name} got an assignment`)
    assert.equal(a.get(p.name).voice?.name, b.get(p.name).voice?.name, 'stable across calls')
  }
  // Nurse Latha (female) must get a female-marked voice when one exists.
  assert.equal(voiceGender(a.get('Nurse Latha').voice), 'female')
  // The two male personas both get male-marked voices.
  assert.equal(voiceGender(a.get('Mr. Joshi').voice), 'male')
  assert.equal(voiceGender(a.get('Dr. Kamat').voice), 'male')
  // No two personas share one voice when the device has enough voices.
  const names = cast.map((p) => a.get(p.name).voice?.name)
  assert.equal(new Set(names).size, 3, 'three distinct voices assigned')
})

// ── server flag + SSML safety ────────────────────────────────────────────────

test('VOICE: PRISM_TTS_NEURAL is dark by default', () => {
  assert.notEqual(process.env.PRISM_TTS_NEURAL, 'true', 'flag must not be on in the test env')
  assert.equal(isTtsEnabled(), false)
})

test('VOICE: SSML builder escapes injection and rejects bogus voice names', () => {
  const ssml = buildSsml('<script>alert("x")</script> & more', 'en-IN-NeerjaNeural')
  assert.ok(!ssml.includes('<script>'), 'tags escaped')
  assert.ok(ssml.includes('&lt;script&gt;'), 'escaped form present')
  assert.ok(ssml.includes('&amp; more'))
  const bad = buildSsml('hello', '"><voice name="evil')
  assert.ok(bad.includes('en-IN-NeerjaNeural'), 'invalid voice falls back to the default')
  assert.equal(escapeSsml(`a'b"c`), 'a&apos;b&quot;c')
})

// ── PWA manifest ─────────────────────────────────────────────────────────────

test('APP: the web manifest is a valid standalone app definition', async () => {
  const raw = await readFile(join(__dirname, '..', '..', 'public', 'manifest.webmanifest'), 'utf-8')
  const m = JSON.parse(raw)
  assert.equal(m.display, 'standalone')
  assert.equal(m.start_url, '/')
  assert.ok(m.name && m.short_name)
  assert.ok(Array.isArray(m.icons) && m.icons.length >= 2, 'any + maskable icons declared')
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'), 'a maskable icon exists')
  for (const icon of m.icons) {
    const iconPath = join(__dirname, '..', '..', 'public', icon.src.replace(/^\//, ''))
    await readFile(iconPath) // throws if the asset is missing
  }
})

test('APP: the service worker never touches /api and never caches non-GET', async () => {
  const sw = await readFile(join(__dirname, '..', '..', 'public', 'sw.js'), 'utf-8')
  assert.ok(sw.includes("startsWith('/api/')"), 'explicit /api guard present')
  assert.ok(sw.includes("req.method !== 'GET'"), 'non-GET pass-through present')
})
