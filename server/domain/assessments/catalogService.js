// Catalog service: builds the catalog from the frozen bank once per process
// and mirrors it into the campus store (idempotent seed, K1) when one exists.
import { buildCatalog } from './catalog.js'

export function createCatalogService({ repos, scenarioSource }) {
  let built = null
  let seeded = null

  async function getCatalog() {
    if (!built) built = scenarioSource().then((src) => buildCatalog(src))
    try {
      return await built
    } catch (err) {
      built = null
      throw err
    }
  }

  return {
    getCatalog,
    async ensureSeeded() {
      const catalog = await getCatalog()
      if (!repos?.assessments) return catalog
      if (!seeded) seeded = repos.assessments.seedCatalog(catalog)
      try {
        await seeded
      } catch (err) {
        seeded = null
        throw err
      }
      return catalog
    },
    async getDefinition(id) {
      return (await getCatalog()).definitions.find((d) => d.id === id) || null
    },
  }
}
