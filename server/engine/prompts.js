// Loads versioned prompt files from server/prompts (spec: no inline prompt
// strings in route handlers / engine). Cached after first read.
//
// Track 4.1 — language variants: `loadPrompt('avatar_system.v1', 'hi')`
// resolves server/prompts/avatar_system.hi.v1.md when it exists, falling back
// to the English base (with a warning-free silent fallback: English is always
// the canonical source of truth). A variant file may start with
// `@extends <base-name>` on its first line, in which case its remaining text
// is PREPENDED to the base prompt — so rubric/rules stay single-sourced in
// the English file and the variant carries only the language directive.

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROMPTS_DIR = join(__dirname, '..', 'prompts')
const _cache = new Map()

// Control Centre Phase 3: when PRISM_ADMIN_PROMPT_REGISTRY=true the registry
// primes this cache from the database at boot (lib/promptRegistry.js). Entries
// use the same keys as the file loader, so callers are unaffected. Flag off →
// this is never called and prompts remain purely file-based (audit C15).
export function primeCache(entries) {
  for (const [key, value] of entries) _cache.set(key, value)
}

// 'avatar_system.v1' + 'hi' → 'avatar_system.hi.v1' (variant naming per spec:
// {name}.{lang}.v{n}.md). English ('en', empty) → the base name unchanged.
export function variantName(name, language) {
  if (!language || language === 'en') return name
  const m = /^(.*)\.(v\d+)$/.exec(name)
  if (!m) return `${name}.${language}`
  return `${m[1]}.${language}.${m[2]}`
}

function readPrompt(name) {
  const raw = readFileSync(join(PROMPTS_DIR, `${name}.md`), 'utf8')
  const ext = /^@extends\s+(\S+)\s*\n/.exec(raw)
  if (ext) {
    const base = readPrompt(ext[1])
    return `${raw.slice(ext[0].length).trim()}\n\n${base}`
  }
  return raw
}

// name e.g. 'micro_rater.v1' → contents of server/prompts/micro_rater.v1.md.
// With a language, resolves the variant file when present, else the base.
export function loadPrompt(name, language = 'en') {
  const resolved = variantName(name, language)
  const key = resolved
  if (_cache.has(key)) return _cache.get(key)
  const target = existsSync(join(PROMPTS_DIR, `${resolved}.md`)) ? resolved : name
  const text = readPrompt(target)
  _cache.set(key, text)
  return text
}

// name e.g. 'dimension_rubric.v1' → parsed server/prompts/dimension_rubric.v1.json
// (versioned prompt FRAGMENTS — rubric anchors, avatar styles — audit C15).
export function loadPromptJson(name) {
  const key = `${name}.json`
  if (_cache.has(key)) return _cache.get(key)
  const data = JSON.parse(readFileSync(join(PROMPTS_DIR, `${name}.json`), 'utf8'))
  _cache.set(key, data)
  return data
}

// Render a versioned prompt template, substituting every {{KEY}} placeholder.
// Throws if a placeholder has no value — a silent hole in a scoring prompt is
// exactly the reproducibility bug the versioned-prompts rule exists to prevent.
// `language` resolves the prompt's language variant (Track 4.1).
export function renderPrompt(name, vars = {}, language = 'en') {
  const template = loadPrompt(name, language)
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => {
    if (!(key in vars) || vars[key] === undefined || vars[key] === null) {
      throw new Error(`renderPrompt(${name}): missing placeholder value for {{${key}}}`)
    }
    return String(vars[key])
  }).trim()
}
