// P10.6 — static route usage inventory (NO deletion). Reads the client
// router and the server mounts, classifies each route as LEGACY_CREATION
// (a duplicate new-run creation path, retirement candidate after a monitored
// drain window), LEGACY_READER (keep: owned reports / shares still have valid
// consumers) or V3 (canonical). Output is JSON; nothing is modified.
//
//   node scripts/route-usage-inventory.mjs
import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const CLASSES = Object.freeze(['LEGACY_CREATION', 'LEGACY_READER', 'V3', 'OTHER'])
const root = new URL('../', import.meta.url)

// Legacy creation: starts/pays for a run outside the V3 allocation gate.
const LEGACY_CREATION = [/^\/assessment$/, /^\/payment$/, /^\/workspace\/:sessionId$/, /^\/missions(\/:missionId)?$/, /^\/explore$/]
// Legacy readers: historical result/share readers. Always keep.
const LEGACY_READER = [/^\/score$/, /^\/report\/:sessionId\/(v2|employee)$/, /^\/shared\/:token$/]
const V3 = [/^\/app(\/|$)/]
const SERVER_LEGACY_CREATION = ['/api/assessment', '/api/payment']
const SERVER_LEGACY_READER = ['/api/replay', '/api/credentials', '/api/evidence']
const SERVER_V3 = ['/api/v1']

const classify = (path) => (LEGACY_READER.some((r) => r.test(path)) ? 'LEGACY_READER'
  : LEGACY_CREATION.some((r) => r.test(path)) ? 'LEGACY_CREATION'
    : V3.some((r) => r.test(path)) ? 'V3' : 'OTHER')

export async function inventoryRoutes() {
  const router = await readFile(new URL('src/app/AppRouter.jsx', root), 'utf8')
  const app = await readFile(new URL('server/app.js', root), 'utf8')
  const client = [...router.matchAll(/<Route\s+path="([^"]+)"\s+element=\{([\s\S]*?)\}\s*\/>/g)].map(([, path, element]) => {
    const cls = classify(path)
    const alias = /LegacyAlias/.test(element) ? 'LegacyAlias' : /V3Route/.test(element) ? 'V3Route' : /Navigate/.test(element) ? 'Redirect' : null
    return {
      path, class: cls, alias,
      // Retirement is a decision after the drain window, never an inventory output.
      retire: false,
      retirementCriteria: cls === 'LEGACY_CREATION' ? 'DRAIN_WINDOW_AND_ROUTE_TESTS' : cls === 'LEGACY_READER' ? 'KEEP_WHILE_CONSUMERS_EXIST' : null,
    }
  })
  const server = [...app.matchAll(/app\.use\('(\/[^']*)'\s*,\s*([A-Za-z0-9_]+)/g)].map(([, mount, handler]) => ({
    mount, handler,
    class: SERVER_V3.includes(mount) ? 'V3' : SERVER_LEGACY_CREATION.includes(mount) ? 'LEGACY_CREATION' : SERVER_LEGACY_READER.includes(mount) ? 'LEGACY_READER' : 'OTHER',
  }))
  const summary = Object.fromEntries(CLASSES.map((c) => [c, client.filter((r) => r.class === c).length + server.filter((r) => r.class === c).length]))
  return {
    kind: 'P10_ROUTE_INVENTORY_NOT_A_DELETION',
    deletionsPerformed: 0,
    drainWindow: {
      status: 'NOT_STARTED',
      criteria: [
        'No active V3/universal run depends on a LEGACY_CREATION route (rollback.canDisable true for every serving flag).',
        'Zero new sessions created through LEGACY_CREATION routes for an operator-agreed window (proposal: 14 days) measured from route telemetry, not assumed.',
        'Route tests (legacyReadersRetained.test.js, AppRouter route tests) green on the deployment candidate.',
        'Every LEGACY_READER keeps working for owned historical reports and approved shares after the creation path is removed.',
        'Operator sign-off recorded in docs/experience/ROLLOUT.md; HA-C007 covers the deploy itself.',
      ],
    },
    summary,
    client,
    server,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length > 2) {
    console.error('route-usage-inventory takes no arguments.')
    process.exit(2)
  }
  console.log(JSON.stringify(await inventoryRoutes(), null, 2))
}
