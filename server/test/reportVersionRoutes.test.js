import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createReportsRouter } from '../routes/v1/reports.js'
import { createOrganizationsRouter } from '../routes/v1/organizations.js'
import { v1ErrorHandler } from '../routes/v1/index.js'

process.env.PRISM_APP_SHELL_V3 = 'true'
process.env.PRISM_STUDENT_REPORT_V3 = 'true'
process.env.PRISM_CAMPUS_ENABLED = 'true'

test('owner, sponsor and share HTTP reads forward the same validated snapshot version, without publication', async () => {
  const reads = []
  const forward = (audience) => async ({ reportVersion }) => { reads.push({ audience, version: reportVersion }); return { selectedVersion: reportVersion } }
  const next = (_req, _res, done) => done()
  const campus = {
    storeAvailable: () => true,
    resolveWorkspace: (req, _res, done) => { req.workspace = { type: 'PERSONAL' }; done() },
    reports: {
      forOwner: forward('OWNER'), forSponsor: forward('SPONSOR'), forShare: forward('SHARE'),
      publish: () => { throw new Error('A GET must not publish.') },
    },
    requireCampus: next, requireOrgPermission: () => next,
    repos: { organizations: { getOrganization: async (id) => ({ id, status: 'ACTIVE' }) } },
  }
  const app = express()
  const requireUser = (req, _res, done) => { req.user = { id: 'synthetic-reader' }; done() }
  app.use(createReportsRouter({ requireUser, campus }))
  app.use(createOrganizationsRouter({ requireUser, campus }))
  app.use(v1ErrorHandler)
  const server = app.listen(0)
  const base = `http://127.0.0.1:${server.address().port}`
  const paths = ['/assessment-sessions/synthetic-session/report', '/organizations/11111111-1111-4111-8111-111111111111/sessions/synthetic-session/report', '/shared/synthetic-share-token-123456']
  try {
    for (const path of paths) {
      const selected = await fetch(`${base}${path}?version=1`)
      assert.equal(selected.status, 200)
      assert.equal((await selected.json()).data.selectedVersion, 1)
      for (const value of ['0', '-1', '1.2', 'NaN', '9007199254740992', '1&version=2', '']) {
        const invalid = await fetch(`${base}${path}?version=${value}`)
        assert.equal(invalid.status, 422, value)
        assert.equal((await invalid.json()).error.code, 'VALIDATION_FAILED')
      }
    }
    assert.deepEqual(reads, [{ audience: 'OWNER', version: 1 }, { audience: 'SPONSOR', version: 1 }, { audience: 'SHARE', version: 1 }])
  } finally { await new Promise((resolve) => server.close(resolve)) }
})
