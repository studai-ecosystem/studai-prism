// Prism Campus C2.13 — customer copy ceiling. Internal programme names,
// section-count marketing, emoji headers, precision/percent blocks and
// fabricated dialogue never reach customer-visible surfaces.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..')
const SRC = join(REPO, 'src')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(jsx?|tsx?)$/.test(name) && !/\.test\.(jsx?|tsx?)$/.test(name)) out.push(p)
  }
  return out
}

const ALL = walk(SRC)
const rel = (p) => relative(REPO, p).replace(/\\/g, '/')

test('no internal programme name or section-count marketing anywhere in src', () => {
  const hits = []
  for (const f of ALL) {
    const lines = readFileSync(f, 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (/PRISM NEXT|Prism Next|PRISM Next|\b12-Section\b/.test(line)) hits.push(`${rel(f)}:${i + 1}`)
    })
  }
  assert.deepEqual(hits, [])
})

// Surfaces rebuilt fail-closed in Phase 2 (plus every campus strict zone).
const FAIL_CLOSED_PAGES = [
  'src/pages/StudentReportV2.jsx',
  'src/pages/EmployeeReportV2.jsx',
  'src/pages/DevelopmentMission.jsx',
  'src/pages/ExploreMode.jsx',
  'src/pages/AssessmentWorkspace.jsx',
]
const STRICT = ALL.filter((f) => /src[\\/](app|layouts|features|api|components[\\/](ui|navigation|capability|evidence|reports|states))[\\/]/.test(f)).map(rel)
// Same ranges as the campus scan's EMOJI_LABEL rule (arrows are not emoji).
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}]/u

test('fail-closed surfaces carry no emoji labels', () => {
  const hits = []
  for (const f of [...FAIL_CLOSED_PAGES, ...STRICT]) {
    readFileSync(join(REPO, f), 'utf8').split('\n').forEach((line, i) => {
      if (EMOJI.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 80)}`)
    })
  }
  assert.deepEqual(hits, [])
})

test('fail-closed pages render no precision, percentages, rubric numbers or readiness', () => {
  const banned = [
    /Standard Error|Confidence Interval|\bSEM\b/,
    /Math\.round\([^)]*\*\s*100\)/,
    /%\s*(Match|match)|Match Score|Readiness Level|readinessScore|Mobility Readiness/,
    /Rubric Level|Level \{|\/\s*5\b|Score:\s*\{/,
    /levelAchieved|observableBehaviors/,
  ]
  const hits = []
  for (const f of FAIL_CLOSED_PAGES) {
    const src = readFileSync(join(REPO, f), 'utf8')
    for (const re of banned) if (re.test(src)) hits.push(`${f} matches ${re}`)
  }
  assert.deepEqual(hits, [])
})

test('fail-closed pages use the API client (no raw fetch, no ad-hoc token key)', () => {
  for (const f of FAIL_CLOSED_PAGES) {
    const src = readFileSync(join(REPO, f), 'utf8')
    assert.doesNotMatch(src, /\bfetch\(/, `${f} calls fetch directly`)
    assert.doesNotMatch(src, /localStorage\.getItem\(['"]token['"]\)/, `${f} reads an ad-hoc token key`)
  }
})

test('the assessment workspace never scripts participant dialogue or hard-codes a scenario', () => {
  const src = readFileSync(join(REPO, 'src/pages/AssessmentWorkspace.jsx'), 'utf8')
  assert.doesNotMatch(src, /speaker:\s*'(?!You')/, 'only the candidate\'s own turns are created client-side')
  assert.doesNotMatch(src, /scenarioId:\s*['"]/, 'no hard-coded scenario id')
  assert.doesNotMatch(src, /ART-[A-Z]+-\d+/, 'no hard-coded artifact ids')
})

test('work materials render only server data: no sample scenario content, fake confirmations or raw fetch', () => {
  const files = [...walk(join(SRC, 'components', 'artifacts')), join(SRC, 'lib', 'artifactStore.js')]
  const banned = [
    [/Lumina|Elena|Marcus|Devika|Priya/, 'sample scenario names'],
    [/₹\s?\d/, 'hard-coded currency figures'],
    [/\|\|\s*(['"`])(?!\1)|\|\|\s*\[\s*\{|\|\|\s*\{\s*\w+:/, 'literal fallback content'],
    [/ART-[A-Z]+-\d+/, 'hard-coded artifact ids'],
    [/recorded into session evidence|Deployed to Session|Growth Diagnostic Clue|Qualitative Insight/, 'false confirmations or hints'],
    [/\bfetch\(|localStorage\.getItem\(['"]token['"]\)/, 'raw fetch / ad-hoc token key'],
    [/alert\(/, 'blocking alert instead of an inline state'],
  ]
  const hits = []
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    for (const [re, why] of banned) if (re.test(src)) hits.push(`${rel(f)}: ${why}`)
    src.split('\n').forEach((line, i) => { if (EMOJI.test(line)) hits.push(`${rel(f)}:${i + 1}: emoji`) })
  }
  assert.deepEqual(hits, [])
})

// PROD-READY Phase 9 — employer development-use surfaces. Every string
// literal on an employer surface (pages, shell, API layer, client and server
// copy) is free of selection wording: hire / fit / suitable / recommend for
// role / rank / shortlist / pass-fail / cut-off / top performer / predict.
// The governed prohibited-use lines (PROHIBITED_USES_POLICY_v1 restated for an
// employer) necessarily name ranking and cut-offs; each is a negation ("may
// not", "no ranking") and they live only in the two copy modules. Rendered
// pages are checked the same way in src/features/employer/employer.test.jsx.
const { SELECTION_WORDING } = await import('../domain/employer/prohibitedUse.js')
const EMPLOYER_SURFACES = [
  ...walk(join(SRC, 'features', 'employer')),
  join(SRC, 'layouts', 'EmployerShell.jsx'),
  join(SRC, 'api', 'employer.js'),
  join(SRC, 'lib', 'copy', 'employer.js'),
  join(SRC, 'lib', 'copy', 'employerPages.js'),
  join(REPO, 'server', 'domain', 'employer', 'copy.js'),
  join(REPO, 'server', 'routes', 'v1', 'employer.js'),
]
const GOVERNED_NEGATION = /\bmay not\b|\bno ranking\b/
const COPY_MODULES = new Set(['src/lib/copy/employer.js', 'server/domain/employer/copy.js'])

function stringLiterals(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
  const out = []
  const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g
  let m
  while ((m = re.exec(code))) out.push(m[1] ?? m[2] ?? m[3])
  // JSX text between tags.
  for (const t of code.matchAll(/>([^<>{}\n]*[A-Za-z][^<>{}\n]*)</g)) out.push(t[1])
  return out
}

test('employer surfaces carry no selection wording; prohibited-use lines are governed negations', () => {
  const hits = []
  let scanned = 0
  for (const f of EMPLOYER_SURFACES) {
    const r = rel(f)
    for (const s of stringLiterals(readFileSync(f, 'utf8'))) {
      scanned += 1
      if (GOVERNED_NEGATION.test(s)) {
        if (!COPY_MODULES.has(r)) hits.push(`${r}: governed prohibited-use line outside the copy modules: ${s.slice(0, 80)}`)
        continue
      }
      for (const re of SELECTION_WORDING) if (re.test(s)) hits.push(`${r}: "${s.slice(0, 100)}" matches ${re}`)
    }
  }
  assert.ok(scanned > 300, `sanity: scanned ${scanned} employer strings`)
  assert.deepEqual(hits, [])
})

test('employer surfaces render no sortable column, bulk selection or individual export', () => {
  const hits = []
  for (const f of EMPLOYER_SURFACES.filter((x) => /\.jsx$/.test(x))) {
    const src = readFileSync(f, 'utf8')
    if (/\bsortable\s*:|onSortChange|\bselectable\b|onSelectedChange/.test(src)) hits.push(`${rel(f)}: sort or bulk selection`)
    if (/students\/export|people\/export|exportStudents|exportPeople/.test(src)) hits.push(`${rel(f)}: individual export`)
  }
  const api = readFileSync(join(SRC, 'api', 'employer.js'), 'utf8')
  assert.doesNotMatch(api, /\b(sort|orderBy|minLevel|threshold|rank)\b\s*[:=]/, 'the API layer sends no ordering or threshold parameter')
  assert.deepEqual(hits, [])
})
