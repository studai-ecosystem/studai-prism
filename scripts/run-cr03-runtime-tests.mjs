import { createRequire } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'

const require = createRequire(new URL('../server/package.json', import.meta.url))
const root = fileURLToPath(new URL('../', import.meta.url))
const dir = await mkdtemp(join(tmpdir(), 'prism-cr03-disposable-'))
let cluster
let stopped = false
try {
  const server = createServer()
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const port = server.address().port
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  const { default: EmbeddedPostgres } = await import(pathToFileURL(require.resolve('embedded-postgres')).href)
  cluster = new EmbeddedPostgres({
    databaseDir: join(dir, 'cluster'), user: 'cr03_test', password: 'synthetic-test-only', port, persistent: true,
    postgresFlags: ['-h', '127.0.0.1'], initdbFlags: ['--encoding=UTF8'], onLog: () => {}, onError: () => {},
  })
  await cluster.initialise()
  await cluster.start()
  await cluster.createDatabase('prism_cr03_test')
  const connection = `postgresql://cr03_test:synthetic-test-only@127.0.0.1:${port}/prism_cr03_test`
  const client = cluster.getPgClient()
  await client.connect()
  await client.query('SELECT 1')
  await client.end()
  for (const testFile of ['server/test/migration.db.test.js', 'server/test/evidenceAudit.db.test.js', 'server/test/cr03Runtime.db.test.js']) {
    const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--test', testFile], {
      cwd: root, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test', CI: '1', DATABASE_URL: connection,
        TEST_DATABASE_URL: connection, PRISM_P0_ISOLATED_DATABASE: 'true', PGSSLMODE: '', DATA_DIR: join(dir, 'data'),
        AWS_SECRETS_MANAGER_SECRET_ID: '', AWS_SECRETS_MANAGER_SECRET_IDS: '', AWS_SECRETS_MANAGER_REQUIRED: 'false' },
    })
    child.once('error', reject)
    child.once('exit', (exitCode, signal) => resolve(signal ? 1 : exitCode ?? 1))
    })
    process.exitCode = code
    if (code !== 0) break
  }
} finally {
  if (cluster) { await cluster.stop(); stopped = true }
  if (stopped || !cluster) await rm(dir, { recursive: true, force: true })
}
// embedded-postgres registers an exit hook; preserve the test verdict after
// its server has stopped and the runner-owned directory has been removed.
process.exit(process.exitCode ?? 0)
