// Loads versioned prompt files from server/prompts (spec: no inline prompt
// strings in route handlers / engine). Cached after first read.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROMPTS_DIR = join(__dirname, '..', 'prompts')
const _cache = new Map()

// name e.g. 'micro_rater.v1' → contents of server/prompts/micro_rater.v1.md
export function loadPrompt(name) {
  if (_cache.has(name)) return _cache.get(name)
  const text = readFileSync(join(PROMPTS_DIR, `${name}.md`), 'utf8')
  _cache.set(name, text)
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
export function renderPrompt(name, vars = {}) {
  const template = loadPrompt(name)
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => {
    if (!(key in vars) || vars[key] === undefined || vars[key] === null) {
      throw new Error(`renderPrompt(${name}): missing placeholder value for {{${key}}}`)
    }
    return String(vars[key])
  }).trim()
}
