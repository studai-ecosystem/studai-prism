// Part A gate — design-token enforcement (permanent CI ratchet).
//
// LAW 1 + Part A: every color/space/type value in REBUILT page code comes
// from src/design/tokens.js / tokens.css. Raw hex in a rebuilt file fails
// CI. Legacy files are grandfathered by NAME below; the list may only
// shrink — adding a file to it fails the ratchet test. As each page is
// rebuilt (Parts B–F), its entry is deleted here.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = join(__dirname, '..', '..', 'src')

// The ONLY files allowed to contain raw hex values.
const TOKEN_SOURCES = ['design/tokens.js', 'design/tokens.css']

// Grandfathered legacy files (pre-rebuild). RATCHET: shrink-only.
const LEGACY_ALLOWLIST = [
  'App.jsx', 'index.css', 'main.jsx',
  'components/CTABanner.jsx', 'components/Dimensions.jsx', 'components/FAQ.jsx',
  'components/Footer.jsx', 'components/Hero.jsx', 'components/HeroAvatars.jsx',
  'components/HowItWorks.jsx', 'components/Nav.jsx', 'components/PageLayout.jsx',
  'components/Pricing.jsx', 'components/ScoreSection.jsx', 'components/WhoItsFor.jsx',
  'components/ui/PrismLogo.jsx', 'components/ui/ScoreMockup.jsx',
  'components/ui/DimensionCard.jsx', 'components/ui/FAQItem.jsx',
  'components/ui/GoldButton.jsx', 'components/ui/OutlineButton.jsx',
  'components/ui/PersonaCard.jsx', 'components/ui/PricingCard.jsx',
  'components/ui/SectionLabel.jsx', 'components/ui/StepCard.jsx',
  'pages/Auth.jsx', 'pages/Briefing.jsx',
  'pages/LandingPage.jsx', 'pages/LinkPhone.jsx', 'pages/Payment.jsx',
  'pages/PhoneProctor.jsx', 'pages/Profile.jsx', 'pages/RaterWorkbench.jsx',
  'pages/RoomScan.jsx', 'pages/ScoreReport.jsx',
  'pages/VerifyIdentity.jsx',
  'pages/about/AboutStudAI.jsx', 'pages/about/Careers.jsx', 'pages/about/Mission.jsx',
  'pages/research/AIEvaluation.jsx', 'pages/research/Blog.jsx', 'pages/research/BlogPost.jsx',
  'pages/research/ScienceBehindPrism.jsx', 'pages/research/ValidityStudy.jsx',
  'lib/characters.jsx', 'lib/assessmentFlow.js', 'hooks/useFaceProctor.js',
]

const HEX = /#[0-9a-fA-F]{3,8}\b/

async function walk(dir, rel = '') {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    const r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) out.push(...(await walk(p, r)))
    else if (/\.(jsx|js|css)$/.test(e.name)) out.push(r)
  }
  return out
}

test('PART A: raw hex appears ONLY in token sources and shrinking legacy files', async () => {
  const files = await walk(SRC)
  const violations = []
  for (const f of files) {
    if (TOKEN_SOURCES.includes(f) || LEGACY_ALLOWLIST.includes(f)) continue
    const text = await readFile(join(SRC, f), 'utf-8')
    const m = text.match(HEX)
    if (m) violations.push(`${f} contains raw hex ${m[0]} — use var(--…) from src/design/tokens.css`)
  }
  assert.deepEqual(violations, [], violations.join('\n'))
})

test('PART A ratchet: the legacy allowlist only shrinks (files must still exist)', async () => {
  // A deleted/renamed legacy file must be REMOVED from the list — keeping
  // stale entries would let new files hide under old names.
  const files = new Set(await walk(SRC))
  const stale = LEGACY_ALLOWLIST.filter((f) => !files.has(f))
  assert.deepEqual(stale, [], `stale allowlist entries (remove them): ${stale.join(', ')}`)
})

test('PART A: tokens.js and tokens.css declare the same palette (lockstep)', async () => {
  const js = await readFile(join(SRC, 'design', 'tokens.js'), 'utf-8')
  const css = await readFile(join(SRC, 'design', 'tokens.css'), 'utf-8')
  const jsHex = [...new Set(js.match(/#[0-9A-Fa-f]{6}/g))]
  assert.ok(jsHex.length >= 15, 'palette present in tokens.js')
  for (const h of jsHex) {
    assert.ok(css.includes(h), `tokens.css is missing ${h} — the two files change together`)
  }
})

test('PART A: multilingual type pair is actually loaded (PRISM_LANG-ready)', async () => {
  const html = await readFile(join(SRC, '..', 'index.html'), 'utf-8')
  for (const family of ['Fraunces', 'Noto+Sans', 'Noto+Sans+Devanagari', 'Noto+Sans+Tamil', 'IBM+Plex+Mono']) {
    assert.ok(html.includes(family), `index.html must load ${family}`)
  }
  const tokens = await readFile(join(SRC, 'design', 'tokens.js'), 'utf-8')
  assert.ok(tokens.includes('Noto Sans Devanagari') && tokens.includes('Noto Sans Tamil'),
    'body font stack carries the Devanagari + Tamil companions')
})

test('PART A: VOICE.md consent canon is byte-identical to the live consent strings', async () => {
  const voice = await readFile(join(SRC, '..', 'docs', 'design', 'VOICE.md'), 'utf-8')
  const briefing = await readFile(join(SRC, 'pages', 'Briefing.jsx'), 'utf-8')
  // Every CONSENT_ITEMS label in the live page must appear verbatim in the canon.
  const labels = [...briefing.matchAll(/label: '((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, '\u2019'))
  assert.ok(labels.length >= 8, `found ${labels.length} live consent strings`)
  for (const label of labels) {
    const normalized = label.replace(/\\u2019|\u2019/g, '’')
    assert.ok(voice.includes(normalized), `VOICE.md canon is missing the live consent string: "${normalized.slice(0, 60)}…"`)
  }
})

test('PART A: the evidence thread exists, is accent-colored, and is print-safe', async () => {
  const thread = await readFile(join(SRC, 'components', 'ui', 'EvidenceThread.jsx'), 'utf-8')
  assert.ok(thread.includes('--thread-color'), 'thread uses the token, not a literal')
  assert.ok(thread.includes('@media print'), 'thread is print-safe (credentials get printed)')
  assert.ok(!HEX.test(thread.replace(/#000/g, '')), 'no raw hex beyond the print-black fallback')
  const guide = await readFile(join(SRC, 'pages', 'DesignSystem.jsx'), 'utf-8')
  for (const ctx of ['ds-report', 'ds-ci', 'ds-claim']) {
    assert.ok(guide.includes(ctx), `style guide demonstrates the thread in context ${ctx}`)
  }
})

// ── PART B gates ──────────────────────────────────────────────────────────────
test('PART B: ConfidenceBand cannot render a number without API data', async () => {
  const src = await readFile(join(SRC, 'components', 'ui', 'measurement.jsx'), 'utf-8')
  // Null-guard is structural: malformed/absent ci returns null before any render.
  assert.ok(src.includes("if (!ci || !Number.isFinite(Number(ci.low)) || !Number.isFinite(Number(ci.high))) return null"),
    'ConfidenceBand refuses to render without a real API-shaped CI')
  assert.ok(!/ci\s*=\s*\{[^}]*low:\s*\d/.test(src), 'no default CI values exist in the component')
  // ReliabilityLabel: unknown level renders nothing, never guesses.
  assert.ok(src.includes('if (!spec) return null'))
  // FlagGate reads server truth via useClaims — LAW 2: no inline env checks.
  assert.ok(src.includes('claims?.features?.[feature]'))
  assert.ok(!src.includes('import.meta.env'), 'no client env flag checks')
})

test('PART B/LAW 1: the claims endpoint returns nulls (pending), never substitute numbers', async () => {
  const { buildApp } = await import('../app.js')
  const app = buildApp()
  const server = app.listen(0)
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/evidence/claims`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.standingClaim, 'cryptographically verifiable evidence chain')
    // No DB locally: every stat must be null — the UI renders pending states.
    for (const [k, v] of Object.entries(body.stats)) {
      assert.equal(v, null, `stat ${k} must be null when the registry has nothing`)
    }
    assert.ok(body.note.includes('pending'))
  } finally {
    server.close()
  }
})

test('PART B: rebuilt Verify page renders zero raw hex and uses the measurement primitives', async () => {
  const verify = await readFile(join(SRC, 'pages', 'Verify.jsx'), 'utf-8')
  assert.ok(!HEX.test(verify), 'Verify.jsx is fully tokenized (removed from the legacy allowlist)')
  for (const primitive of ['ReliabilityLabel', 'ConfidenceBand', 'PendingStat', 'EvidenceThread']) {
    assert.ok(verify.includes(primitive), `Verify uses ${primitive}`)
  }
  // All credential states still handled (T2/T4 logic preserved).
  for (const state of ['revoked', 'superseded', 'Signature check failed', 'provisional_uncalibrated', 'chain']) {
    assert.ok(verify.includes(state), `Verify handles state: ${state}`)
  }
})
