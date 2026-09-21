import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const outputDir = join(root, 'audit-results')
mkdirSync(outputDir, { recursive: true })

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

function walk(dir, result = []) {
  for (const name of readdirSync(dir)) {
    if (['.git', 'node_modules', 'dist', 'audit-results', 'playwright-report', 'test-results'].includes(name)) continue
    const path = join(dir, name)
    const entry = statSync(path)
    if (entry.isDirectory()) walk(path, result)
    else result.push(path)
  }
  return result
}

const textExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.py', '.md', '.json', '.yml', '.yaml', '.sql'])
const files = walk(root).filter((path) => textExtensions.has(path.slice(path.lastIndexOf('.')).toLowerCase()))
const routes = []
const findings = []
const secretPatterns = [
  ['aws_access_key', /AKIA[0-9A-Z]{16}/g],
  ['private_key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['razorpay_secret_assignment', /RAZORPAY_KEY_SECRET\s*=\s*[^\s#]+/g],
]

for (const path of files) {
  const rel = relative(root, path).replaceAll('\\', '/')
  const content = readFileSync(path, 'utf8')
  for (const match of content.matchAll(/router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g)) {
    routes.push({ file: rel, method: match[1].toUpperCase(), path: match[2] })
  }
  for (const [kind, pattern] of secretPatterns) {
    const count = [...content.matchAll(pattern)].length
    if (count) findings.push({ kind, file: rel, count, severity: 'review' })
  }
  const markerCount = (content.match(/\b(TODO|FIXME|placeholder|mock|dummy)\b/gi) || []).length
  if (markerCount) findings.push({ kind: 'implementation_marker', file: rel, count: markerCount, severity: 'inventory' })
}

const payload = {
  evidenceId: `PRISM-EV-STATIC-${new Date().toISOString().replace(/[:.]/g, '-')}`,
  generatedAt: new Date().toISOString(),
  environment: { node: process.version, platform: `${process.platform}-${process.arch}` },
  commit: git('rev-parse', 'HEAD'),
  branch: git('branch', '--show-current'),
  worktreeStatus: git('status', '--short'),
  inventory: { scannedFiles: files.length, routes: routes.sort((a, b) => `${a.file}${a.path}`.localeCompare(`${b.file}${b.path}`)) },
  findings,
  note: 'Pattern results are leads for human review, not proof of a vulnerability or production configuration.',
}

writeFileSync(join(outputDir, 'static-audit.json'), `${JSON.stringify(payload, null, 2)}\n`)
writeFileSync(join(outputDir, 'static-audit.md'), [
  '# Prism Static Audit Evidence',
  '',
  `- Evidence ID: ${payload.evidenceId}`,
  `- Commit: \`${payload.commit}\``,
  `- Generated: ${payload.generatedAt}`,
  `- Files scanned: ${payload.inventory.scannedFiles}`,
  `- Express route declarations: ${payload.inventory.routes.length}`,
  `- Review leads: ${payload.findings.length}`,
  '',
  'The JSON companion contains the route inventory and exact file-level review leads.',
  '',
].join('\n'))

console.log(`Wrote ${relative(root, join(outputDir, 'static-audit.json'))} and static-audit.md`)
