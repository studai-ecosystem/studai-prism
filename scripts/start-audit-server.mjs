import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateKeyPairSync } from 'node:crypto'

const { privateKey } = generateKeyPairSync('ed25519')

process.env.NODE_ENV = 'test'
process.env.PORT = process.env.PORT || '4173'
process.env.DATA_DIR = process.env.PRISM_AUDIT_DATA_DIR || mkdtempSync(join(tmpdir(), 'prism-audit-'))
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

await import('../server/index.js')
