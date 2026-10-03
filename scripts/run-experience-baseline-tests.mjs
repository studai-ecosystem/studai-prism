import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(new URL('../server/package.json', import.meta.url))
const mode = process.argv[2] || 'database'
if (!['database', 'p2', 'p3', 'p4', 'browser', 'browser-smoke', 'browser-all', 'browser-p1', 'browser-sync'].includes(mode) || process.argv.length > 3) {
  throw new Error('Use database, p2, p3, p4, browser, browser-smoke, browser-all, browser-p1 or browser-sync mode; connection strings are never arguments.')
}

function run(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code, signal) => resolve(signal ? 1 : code ?? 1))
  })
}

async function freePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = server.address().port
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

let cluster
let dir
let stage = 'LOAD_TEST_DATABASE_DEPENDENCY'
let exitCode = 0
let shutdownFailed = false
try {
  const { default: EmbeddedPostgres } = await import(pathToFileURL(require.resolve('embedded-postgres')).href)
  dir = await mkdtemp(join(tmpdir(), 'prism-p0-disposable-'))
  const port = await freePort()
  cluster = new EmbeddedPostgres({
    databaseDir: join(dir, 'cluster'), user: 'p0_test', password: 'synthetic-test-only',
    port, persistent: true, postgresFlags: ['-h', '127.0.0.1'],
    initdbFlags: ['--encoding=UTF8'],
    onLog: () => {}, onError: () => {},
  })
  stage = 'INITIALIZE_DISPOSABLE_CLUSTER'
  await cluster.initialise()
  stage = 'START_DISPOSABLE_CLUSTER'
  await cluster.start()
  stage = 'CREATE_DISPOSABLE_DATABASE'
  await cluster.createDatabase('prism_p0_test')
  const connection = `postgresql://p0_test:synthetic-test-only@127.0.0.1:${port}/prism_p0_test`
  const client = cluster.getPgClient()
  await client.connect()
  await client.query('SELECT 1')
  await client.end()

  const registry = await readFile(new URL('../server/lib/flagRegistry.js', import.meta.url), 'utf8')
  const flags = [...new Set([...registry.matchAll(/\bPRISM_[A-Z0-9_]+\b/g)].map((match) => match[0]))]
  const env = { ...process.env, ...Object.fromEntries(flags.map((key) => [key, 'false'])),
    NODE_ENV: 'test', DATABASE_URL: '', PGSSLMODE: '', CI: '1',
    AWS_SECRETS_MANAGER_SECRET_ID: '', AWS_SECRETS_MANAGER_SECRET_IDS: '', AWS_SECRETS_MANAGER_REQUIRED: 'false',
    BEDROCK_STT_ENABLED: 'false', POLLY_TTS_ENABLED: 'false',
    TEST_DATABASE_URL: connection, PRISM_P0_ISOLATED_DATABASE: 'true',
    PRISM_E2E_DATABASE_URL: connection, PRISM_AUDIT_BASE_URL: '',
  }
  // Every process owns its throwaway DATA_DIR; no application data path is inherited.
  env.DATA_DIR = await mkdtemp(join(dir, 'data-'))
  env.PRISM_AUDIT_DATA_ROOT = dir
  delete env.PRISM_AUDIT_DATA_DIR
  delete env.PRISM_AUDIT_CAMPUS_DATABASE_URL
  stage = 'RUN_ISOLATED_TESTS'
  const browserArgs = ['node_modules/@playwright/test/cli.js', 'test',
    'flow-entry.spec.js', 'flow-player-layout.spec.js', 'flow-recovery.spec.js']
  if (mode === 'browser-all') browserArgs.splice(2)
  if (mode === 'browser-p1') browserArgs.splice(2, browserArgs.length, 'p1-legacy-report.spec.js', 'p1-account-entry.spec.js', 'flow-entry.spec.js')
  // Specs whose selectors track the P3-P5 UI (nav IA, Home, Report V3 first screen).
  if (mode === 'browser-sync') browserArgs.splice(2, browserArgs.length, 'campus-journey-a.spec.js', 'campus-shell.spec.js', 'ui-matrix.spec.js', 'flow-recovery.spec.js')
  if (mode === 'browser-smoke') browserArgs.push('--grep', 'returning login|pending report')
  // P3: the real-browser canonical journey (draft content on the 4174 audit
  // server only) plus the player frame, recovery and shell specs, all projects.
  if (mode === 'p3') {
    env.PRISM_AUDIT_DRAFT_CONTENT = 'true'
    browserArgs.splice(2, browserArgs.length, 'p3-real-journey.spec.js', 'flow-player-layout.spec.js', 'flow-recovery.spec.js', 'campus-shell.spec.js')
  }
  // P4: the real-browser six-stage coverage proof (draft content on the 4174
  // audit server only), desktop Chromium with 1440/390 viewport screenshots.
  if (mode === 'p4') {
    env.PRISM_AUDIT_DRAFT_CONTENT = 'true'
    browserArgs.splice(2, browserArgs.length, 'p4-six-stages.spec.js', '--project=chromium')
  }
  exitCode = await run(mode === 'database'
    ? ['--test', 'server/test/experienceBaseline.db.test.js']
    // P2.9 Layer B: action → evidence → report → practice chain on this cluster.
    : mode === 'p2' ? ['--test', '--test-concurrency=1', 'server/test/p2Slice.db.test.js'] : browserArgs, env)
} catch (error) {
  console.error(JSON.stringify({
    error: 'P0_ISOLATED_TEST_FAILED', stage,
    code: /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'SETUP_OR_RUN_ERROR',
    liveDatabaseFallback: false,
  }))
  exitCode = 1
} finally {
  if (cluster) {
    try { await cluster.stop() } catch {
      console.error('P0 temporary PostgreSQL shutdown failed; operator cleanup is required.')
      exitCode = 1
      shutdownFailed = true
    }
  }
  if (dir && !shutdownFailed) {
    try {
      await rm(dir, { recursive: true, maxRetries: 10, retryDelay: 200 })
    } catch (error) {
      console.error(JSON.stringify({
        error: 'P0_TEMPORARY_DIRECTORY_CLEANUP_FAILED',
        code: /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'CLEANUP_ERROR',
      }))
      exitCode = 1
    }
  }
}
// embedded-postgres registers an exit hook; explicitly preserve the runner verdict.
process.exit(exitCode)
