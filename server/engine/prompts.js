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
