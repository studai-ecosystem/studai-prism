import { register } from 'node:module'

if (process.env.NODE_ENV !== 'test' || process.env.PRISM_P0_ISOLATED_DATABASE !== 'true') {
  throw new Error('The browser audit provider requires the isolated disposable test runner')
}
register('./browserAuditProviderLoader.mjs', import.meta.url)
