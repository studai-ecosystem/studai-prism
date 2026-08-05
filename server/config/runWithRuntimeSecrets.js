import { config } from 'dotenv'
import { dirname, join } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { loadRuntimeSecrets } from './runtimeSecrets.js'

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ALLOWED_TARGETS = new Set([
  'db/migrate.js',
  'db/migrateStore.js',
  'db/seedAdmin.js',
  'db/seedItems.js',
])

config({ path: join(SERVER_ROOT, '.env') })

const target = String(process.argv[2] || '').replaceAll('\\', '/')
if (!ALLOWED_TARGETS.has(target)) {
  console.error(JSON.stringify({
    level: 'error',
    msg: 'runtime_command_rejected',
    code: 'RUNTIME_COMMAND_NOT_ALLOWED',
  }))
  process.exit(1)
}

try {
  const status = await loadRuntimeSecrets()
  if (status.enabled) {
    console.log(JSON.stringify({
      level: 'info',
      msg: 'runtime_secrets_loaded',
      provider: 'aws-secrets-manager',
      keyCount: status.keyCount,
      versionId: status.versionId,
    }))
  }
  // The target scripts gate their CLI behaviour on `argv[1] === <own path>`;
  // when imported through this wrapper argv[1] is the wrapper itself and the
  // script silently does nothing. Hand over argv so the target believes it is
  // the entry point (its own CLI args follow the target name).
  const targetPath = join(SERVER_ROOT, target)
  process.argv = [process.argv[0], targetPath, ...process.argv.slice(3)]
  await import(pathToFileURL(targetPath).href)
} catch (error) {
  console.error(JSON.stringify({
    level: 'error',
    msg: 'runtime_command_failed',
    code: error?.code || error?.name || 'unknown',
  }))
  process.exit(1)
}