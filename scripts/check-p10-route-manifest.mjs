import { readFile, writeFile } from 'node:fs/promises'
import { DIRECT_ROUTE_IDS, INTEGRATED_RESOURCES } from './handover-route-manifest.mjs'

const root = new URL('../', import.meta.url)
const routeResults = JSON.parse(await readFile(new URL('audit-results/p10-route-results.json', root), 'utf8'))
const playwright = JSON.parse(await readFile(new URL('audit-results/prism-e2e-results.json', root), 'utf8'))

if (routeResults.environment !== 'LOCAL_CI_SYNTHETIC' || routeResults.credentialsIncluded !== false || routeResults.tokensIncluded !== false) {
  throw new Error('P10_ROUTE_RESULTS_UNSAFE_OR_WRONG_ENVIRONMENT')
}
const byId = new Map(routeResults.results.map((result) => [result.id, result]))
for (const id of DIRECT_ROUTE_IDS) {
  const result = byId.get(id)
  if (!result) throw new Error(`P10_ROUTE_RESULT_MISSING:${id}`)
  if (result.status !== 'PASS' || Number(result.httpStatus) >= 500) throw new Error(`P10_ROUTE_RESULT_FAILED:${id}`)
  if (/:[A-Za-z]|token=[^&]/i.test(result.resolvedPath)) throw new Error(`P10_ROUTE_UNRESOLVED_OR_UNSAFE:${id}`)
}

const passing = []
function walk(value, file = '', titles = []) {
  if (!value || typeof value !== 'object') return
  const nextFile = typeof value.file === 'string' ? value.file : file
  const nextTitles = typeof value.title === 'string' ? [...titles, value.title] : titles
  if (typeof value.title === 'string' && Array.isArray(value.tests)) {
    const passed = value.tests.some((entry) => Array.isArray(entry.results)
      && entry.results.some((result) => result.status === 'passed'))
    if (passed) passing.push({ file: nextFile, title: nextTitles.join(' › ') })
  }
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach((entry) => walk(entry, nextFile, nextTitles))
    else if (child && typeof child === 'object') walk(child, nextFile, nextTitles)
  }
}
walk(playwright)

for (const resource of INTEGRATED_RESOURCES) {
  const found = passing.some((test) => test.file.endsWith(resource.evidenceFile) && test.title.includes(resource.titleIncludes))
  if (!found) throw new Error(`P10_INTEGRATED_RESOURCE_NOT_PASSED:${resource.id}`)
}

const summary = {
  validator: 'P10_ROUTE_MANIFEST',
  status: 'PASS',
  directRoutes: DIRECT_ROUTE_IDS.length,
  integratedResources: INTEGRATED_RESOURCES.length,
  environment: routeResults.environment,
}
await writeFile(new URL('docs/experience/p10-route-manifest-results.json', root), `${JSON.stringify({
  schemaVersion: 'p10.routes.v1',
  environment: routeResults.environment,
  credentialsIncluded: false,
  tokensIncluded: false,
  directRoutes: routeResults.results,
  integratedResources: INTEGRATED_RESOURCES.map((resource) => ({
    id: resource.id,
    routePattern: resource.routePattern,
    status: 'PASS',
    evidenceFile: `tests/e2e/${resource.evidenceFile}`,
  })),
  humanJourneyStatus: 'NOT_RUN',
}, null, 2)}\n`)
console.log(JSON.stringify(summary))
