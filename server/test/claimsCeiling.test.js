// Phase 3 Stage 3/5 — THE CLAIMS-CEILING SUITE (permanent, runs in CI forever).
//
// THE ONE LAW: a claim ships to a public surface ONLY when the study registry
// contains the immutable result that backs it. This suite greps every public
// surface (client source, index.html, CMS content) for language above the
// current ceiling. When a study lands and a human flips its row in the Stage 3
// map, the corresponding entry moves from BANNED to ALLOWED — in the same
// commit as the registry evidence, never before.
//
// Current registry state: ZERO completed studies. Ceiling accordingly:
//   allowed:  "verified", "verifiable", "cryptographically verifiable
//             evidence chain", honest reliability labels, provisional marks.
//   banned:   the entire certification/validation/proof claim family below.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')

// Each entry: [regex, unlock condition per the Stage 3 map].
const BANNED_CLAIMS = [
  [/certif/i, 'dual scorer live + calibration-run v1 + external review complete'],
  [/human-expert-level/i, 'S2 kappa at/above human-human'],
  [/κ\s*=|kappa\s*=\s*\d/i, 'S2 computed + published in the Technical Manual'],
  [/validated to increase/i, 'S1 positive result'],
  [/evasion rate/i, 'S4 red-team study computed'],
  [/fairness-tested/i, 'S6 DIF clean + adequately powered for that language'],
  [/growth measurement|skill velocity|growth percentile/i, 'S3 reliability adequate + PRISM_VELOCITY conditions'],
  // "90% coverage target … provisional until first calibration study" is the
  // honest sub-ceiling wording; the VALIDATED claim (no target/provisional
  // qualifier) stays banned until conformal coverage validates.
  [/90% coverage(?! target)/i, 'conformal coverage validated on held-out pairs'],
  [/tamper-?proof|blockchain|regulator-approved/i, 'NEVER (claim discipline, Track 2.5)'],
  [/scientifically proven|clinically/i, 'NEVER (no such registry category)'],
]

// Public surfaces: everything a candidate/employer/buyer can read.
async function publicFiles() {
  const files = [join(ROOT, 'index.html'), join(ROOT, 'server', 'data', 'content.json')]
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      if (entry.isDirectory()) await walk(p)
      else if (/\.(jsx|js|html|json)$/.test(entry.name)) files.push(p)
    }
  }
  await walk(join(ROOT, 'src'))
  return files
}

// Strip code comments — the ceiling governs what HUMANS SEE, and comments may
// legitimately reference banned words when documenting these very rules.
function visibleText(source, file) {
  if (file.endsWith('.json') || file.endsWith('.html')) return source
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
}

test('CLAIMS CEILING: no public surface carries a claim above the registry-backed ceiling', async () => {
  const files = await publicFiles()
  assert.ok(files.length > 30, `sanity: scanned ${files.length} public files`)
  const violations = []
  for (const f of files) {
    // RaterWorkbench is the token-gated internal rating tool — an operator
    // surface (it must show κ to raters), not a public/buyer surface.
    if (f.includes('RaterWorkbench')) continue
    const text = visibleText(await readFile(f, 'utf-8'), f)
    for (const [rx, unlock] of BANNED_CLAIMS) {
      const m = text.match(rx)
      if (m) violations.push(`${f.replace(ROOT, '')} → "${m[0]}" (unlocks when: ${unlock})`)
    }
  }
  assert.deepEqual(violations, [], `Above-ceiling claims found:\n${violations.join('\n')}`)
})

test('CLAIMS CEILING: the allowed claim is intact (glass-box wording, nothing stronger)', async () => {
  // The one strong claim we DO make must stay exactly at its ceiling.
  const verify = await readFile(join(ROOT, 'src', 'pages', 'Verify.jsx'), 'utf-8')
  assert.ok(verify.includes('cryptographically verified'), 'the verifiable-evidence-chain claim remains')
})

test('CLAIMS CEILING: dark features have zero public marketing copy', async () => {
  const darkFeatures = [/replay your assessment/i, /team.?fit/i, /pressure dynamics/i, /take the test in hindi|tamil assessment/i]
  for (const f of await publicFiles()) {
    // The briefing language selector is server-gated (renders only when
    // PRISM_LANG serves options) — that is a feature surface, not marketing.
    if (f.includes('Briefing.jsx')) continue
    const text = visibleText(await readFile(f, 'utf-8'), f)
    for (const rx of darkFeatures) {
      assert.ok(!rx.test(text), `dark-feature marketing in ${f}: ${rx}`)
    }
  }
})
