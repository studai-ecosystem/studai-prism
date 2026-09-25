// Side-effect import: give this test process its own JSON store so concurrent
// `node --test` files never race on a shared assessments.json. Import FIRST.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'prism-test-store-'))
process.env.DATA_DIR = dir
process.on('exit', () => {
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* temp dir; OS cleans up */ }
})
