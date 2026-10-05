const original = new URL('../../server/services/ai/auditConverse.js', import.meta.url).href
const adapter = new URL('./browserAuditProvider.mjs', import.meta.url).href
const adapterImplementation = new URL('../../server/test/fixtures/missionAuditConverse.js', import.meta.url).href

export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context)
  // The adapter itself still delegates non-mission requests to the original
  // controlled provider; this exclusion prevents an import/delegation cycle.
  if (resolved.url === original && context.parentURL !== adapterImplementation) {
    return { ...resolved, url: adapter }
  }
  return resolved
}
