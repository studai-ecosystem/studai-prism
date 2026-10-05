import test from 'node:test'
import assert from 'node:assert/strict'
import { buildStudentReportV2, buildEmployeeReportV2 } from '../lib/reportV2.js'
import evidenceGraph from '../lib/evidenceGraph.js'

test('legacy formatted GET helpers read their issued snapshots without querying or aggregating later evidence', async () => {
  const originalGet = evidenceGraph.getEvidenceUnits
  const originalAggregate = evidenceGraph.aggregateCapabilityProfile
  evidenceGraph.getEvidenceUnits = async () => { throw new Error('A read must not load new evidence.') }
  evidenceGraph.aggregateCapabilityProfile = async () => { throw new Error('A read must not infer new findings.') }
  const original = {
    issuedViews: {
      studentV2: { reportType: 'STUDENT', marker: 'Explicitly issued fixture A' },
      employeeV2: { reportType: 'EMPLOYEE', marker: 'Same explicitly issued fixture A' },
    },
  }
  try {
    assert.deepEqual(await buildStudentReportV2('synthetic', {}, original), original.issuedViews.studentV2)
    assert.deepEqual(await buildEmployeeReportV2('synthetic', {}, original), original.issuedViews.employeeV2)
    const read = await buildStudentReportV2('synthetic', {}, original)
    read.marker = 'Client mutation'
    assert.equal(original.issuedViews.studentV2.marker, 'Explicitly issued fixture A')
    await assert.rejects(buildStudentReportV2('unsupported-original', {}, {}), { code: 'LEGACY_VIEW_UNAVAILABLE' })
  } finally {
    evidenceGraph.getEvidenceUnits = originalGet
    evidenceGraph.aggregateCapabilityProfile = originalAggregate
  }
})
