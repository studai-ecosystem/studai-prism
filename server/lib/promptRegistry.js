// Prompt Registry (Control Centre Phase 3, plan §12).
//
// The versioned files in server/prompts remain the runtime source of truth
// (audit C15) — this module adds a database-backed WORKFLOW layer on top:
//
//   * seedPromptRegistry() imports every prompt file as a 'production'
//     version (source='file_import'), idempotently (never overwrites).
//   * promptDrift() reports any divergence between a file and its DB
//     production row — visible in the admin console, never auto-repaired.
//   * primePromptRegistry() — ONLY when PRISM_ADMIN_PROMPT_REGISTRY=true —
//     resolves the DB's production versions (including @extends directives)
//     and primes the engine prompt cache before the server starts serving,
//     making the registry lifecycle real at cut-over. Flag defaults OFF:
//     zero behavior change.
//
// Version lifecycle (enforced in canTransitionPrompt + the admin router):
//   draft → testing → approved → production → deprecated / rolled_back
//   production is dual-approved; production templates are never edited in
//   place — corrections are new versions.

import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { query } from '../db/pool.js'
import { primeCache } from '../engine/prompts.js'
import logger from './logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROMPTS_DIR = join(__dirname, '..', 'prompts')

export const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex')

// ── File parsing ─────────────────────────────────────────────────────────────
// Filenames: {base}.v{n}.{md|json} with optional language: {base}.{lang}.v{n}.md
// e.g. avatar_system.v1.md · avatar_system.hi-en.v1.md · dimension_rubric.v1.json
const FILE_RE = /^(.+?)(?:\.(hi|hi-en|ta))?\.(v\d+)\.(md|json)$/

export function parsePromptFilename(filename) {
  const m = FILE_RE.exec(filename)
  if (!m) return null
  return { name: m[1], language: m[2] || 'en', version: m[3], kind: m[4] }
}

export function extractVariables(template) {
  const vars = new Set()
  for (const m of String(template).matchAll(/\{\{([A-Z0-9_]+)\}\}/g)) vars.add(m[1])
  return [...vars].sort()
}

export function listPromptFiles() {
  return readdirSync(PROMPTS_DIR)
    .map((f) => ({ file: f, parsed: parsePromptFilename(f) }))
    .filter((e) => e.parsed)
    .map((e) => ({
      ...e.parsed,
      file: e.file,
      template: readFileSync(join(PROMPTS_DIR, e.file), 'utf8'),
    }))
}

// ── Lifecycle machine ────────────────────────────────────────────────────────
export const PROMPT_STATUSES = ['draft', 'testing', 'approved', 'production', 'deprecated', 'rolled_back']

export const PROMPT_TRANSITIONS = {
  draft: ['testing'],
  testing: ['draft', 'approved'],
  approved: ['production', 'draft'],
  production: ['deprecated', 'rolled_back'], // via publish of a successor / explicit rollback
  deprecated: ['production'],                // rollback target re-promotion only
  rolled_back: [],
}

export function canTransitionPrompt(from, to) {
  return Boolean(PROMPT_TRANSITIONS[from]?.includes(to))
}

// ── Idempotent seed from files ───────────────────────────────────────────────
export async function seedPromptRegistry() {
  let inserted = 0
  for (const entry of listPromptFiles()) {
    await query(
      `INSERT INTO prompt_definitions (prompt_id, name) VALUES ($1,$2)
       ON CONFLICT (name) DO NOTHING`,
      [randomUUID(), entry.name],
    )
    const def = await query('SELECT prompt_id FROM prompt_definitions WHERE name = $1', [entry.name])
    const promptId = def.rows[0].prompt_id
    const r = await query(
      `INSERT INTO prompt_versions
         (version_id, prompt_id, version, language, kind, template, variables,
          status, source, content_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'production','file_import',$8)
       ON CONFLICT (prompt_id, version, language) DO NOTHING
       RETURNING version_id`,
      [randomUUID(), promptId, entry.version, entry.language, entry.kind,
       entry.template, JSON.stringify(extractVariables(entry.template)), sha256(entry.template)],
    )
    if (r?.rows?.length) inserted += 1
  }
  return { inserted }
}

// ── Drift detection (file vs DB production row) ──────────────────────────────
export async function promptDrift() {
  const drift = []
  for (const entry of listPromptFiles()) {
    const r = await query(
      `SELECT v.content_hash, v.status FROM prompt_versions v
         JOIN prompt_definitions d ON d.prompt_id = v.prompt_id
        WHERE d.name = $1 AND v.version = $2 AND v.language = $3`,
      [entry.name, entry.version, entry.language],
    )
    const row = r?.rows?.[0]
    if (!row) {
      drift.push({ file: entry.file, problem: 'file has no registry row (run seed)' })
    } else if (row.status === 'production' && row.content_hash !== sha256(entry.template)) {
      drift.push({ file: entry.file, problem: 'file content differs from registry production version' })
    }
  }
  return drift
}

// ── Boot-time cache priming (flag-gated cut-over) ────────────────────────────
export function isPromptRegistryRuntime() {
  return process.env.PRISM_ADMIN_PROMPT_REGISTRY === 'true'
}

// Mirrors engine/prompts.js @extends resolution against the DB's production set.
function resolveExtends(raw, byName) {
  const ext = /^@extends\s+(\S+)\s*\n/.exec(raw)
  if (!ext) return raw
  const base = byName.get(ext[1])
  if (base == null) throw new Error(`@extends target not in registry: ${ext[1]}`)
  return `${raw.slice(ext[0].length).trim()}\n\n${resolveExtends(base, byName)}`
}

export async function primePromptRegistry() {
  if (!isPromptRegistryRuntime()) return { primed: 0, enabled: false }
  const r = await query(
    `SELECT d.name, v.version, v.language, v.kind, v.template
       FROM prompt_versions v JOIN prompt_definitions d ON d.prompt_id = v.prompt_id
      WHERE v.status = 'production'`,
  )
  const rows = r?.rows || []
  // Raw templates keyed by their resolved cache name (engine cache convention:
  // en → 'name.v1'; variants → 'name.lang.v1'; json → 'name.v1.json').
  const rawByKey = new Map()
  for (const row of rows) {
    const key = row.language === 'en' ? `${row.name}.${row.version}` : `${row.name}.${row.language}.${row.version}`
    rawByKey.set(key, { ...row, key })
  }
  const mdByName = new Map([...rawByKey.values()].filter((e) => e.kind === 'md').map((e) => [e.key, e.template]))
  const primed = new Map()
  for (const entry of rawByKey.values()) {
    if (entry.kind === 'json') {
      primed.set(`${entry.key}.json`, JSON.parse(entry.template))
    } else {
      primed.set(entry.key, resolveExtends(entry.template, mdByName))
    }
  }
  primeCache(primed)
  logger.info('prompt_registry_primed', { entries: primed.size })
  return { primed: primed.size, enabled: true }
}
