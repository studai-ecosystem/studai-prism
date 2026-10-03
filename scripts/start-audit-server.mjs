import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateKeyPairSync } from 'node:crypto'

const { privateKey } = generateKeyPairSync('ed25519')

process.env.NODE_ENV = 'test'
process.env.PORT = process.env.PORT || '4173'
process.env.DATA_DIR = process.env.PRISM_AUDIT_DATA_DIR || mkdtempSync(join(process.env.PRISM_AUDIT_DATA_ROOT || tmpdir(), 'prism-audit-'))
process.env.JWT_SECRET = 'isolated-prism-audit-secret-never-for-production'
process.env.PRISM_CREDENTIAL_SIGNING_KEY = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64')
process.env.PRISM_GLASS_BOX = 'true'
process.env.ADMIN_TOKEN = 'isolated-prism-audit-admin-token'
process.env.PRISM_DUMMY_PAYMENTS = 'true'
process.env.PRISM_SKIP_VERIFICATION = 'true'
process.env.PRISM_AUDIT_AI = 'true'
process.env.PRISM_AUDIT_E2E = 'true'
process.env.PRISM_JUDGE_SAMPLES = '5'
process.env.PRISM_PG_STORE = 'false'
process.env.PRISM_V2_TELEMETRY = 'false'
process.env.POLLY_TTS_ENABLED = 'false'
process.env.BEDROCK_STT_ENABLED = 'false'

// Campus e2e harness (K2): a SECOND isolated audit server started by
// playwright.config.js with PRISM_AUDIT_CAMPUS=true enables the campus flags
// inside this throwaway test process only. Never used for real environments.
const CAMPUS_FLAGS = [
  'PRISM_APP_SHELL_V3', 'PRISM_EVIDENCE_FAIL_CLOSED', 'PRISM_STUDENT_REPORT_V3',
  'PRISM_ASSESSMENT_WORKSPACE_V3', 'PRISM_CAMPUS_ENABLED', 'PRISM_CAMPUS_ANALYTICS',
  'PRISM_DEVELOPMENT_V2', 'PRISM_GROWTH_ENABLED', 'PRISM_ROLE_EXPLORATION_V2',
]
if (process.env.PRISM_AUDIT_CAMPUS === 'true') {
  for (const flag of CAMPUS_FLAGS) process.env[flag] = 'true'
  // P3 real journey (runner mode p3 only): the DRAFT universal form is
  // offered to non-production dev entitlements inside this throwaway campus
  // audit process. Never set in .env or any real environment.
  if (process.env.PRISM_AUDIT_DRAFT_CONTENT === 'true') process.env.PRISM_DRAFT_CONTENT = 'true'
  // P7 real journey (runner mode p7 only): private preparation routes and
  // nav inside this throwaway campus audit process. Never set in .env or
  // any real environment.
  if (process.env.PRISM_AUDIT_PREPARATION === 'true') process.env.PRISM_PREPARATION_V1 = 'true'
  // Campus store for org/membership e2e (Journey B): ONLY a throwaway test
  // database handed in by the runner (local PGlite / CI service container).
  if (process.env.PRISM_AUDIT_CAMPUS_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PRISM_AUDIT_CAMPUS_DATABASE_URL
    const { migrateUp } = await import('../server/db/migrate.js')
    await migrateUp()
  }
}

await import('../server/index.js')
