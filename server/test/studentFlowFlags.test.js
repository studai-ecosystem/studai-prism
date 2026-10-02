import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkStudentFlowFlags } from '../../scripts/check-student-flow-flags.mjs'

test('all-dark flags are consistent and the checker never modifies configuration', () => {
  const env = Object.freeze({})
  assert.deepEqual(checkStudentFlowFlags(env), [])
})

test('Personal Prism does not require Campus, analytics, development or growth flags', () => {
  assert.deepEqual(checkStudentFlowFlags(Object.freeze({
    PRISM_APP_SHELL_V3: 'true',
    PRISM_ASSESSMENT_WORKSPACE_V3: 'true',
    PRISM_STUDENT_REPORT_V3: 'true',
    PRISM_EVIDENCE_FAIL_CLOSED: 'true',
    DATABASE_URL: 'synthetic-test-database',
  })), [])
})

test('workspace and report flags cannot be configured without their shell dependency', () => {
  const errors = checkStudentFlowFlags({ PRISM_ASSESSMENT_WORKSPACE_V3: 'true', PRISM_STUDENT_REPORT_V3: 'true' })
  assert.ok(errors.includes('PRISM_ASSESSMENT_WORKSPACE_V3 requires PRISM_APP_SHELL_V3=true.'))
  assert.ok(errors.includes('PRISM_STUDENT_REPORT_V3 requires PRISM_APP_SHELL_V3=true.'))
  assert.ok(errors.includes('PRISM_STUDENT_REPORT_V3 requires PRISM_EVIDENCE_FAIL_CLOSED=true.'))
  assert.ok(errors.includes('PRISM_ASSESSMENT_WORKSPACE_V3 requires PRISM_EVIDENCE_FAIL_CLOSED=true.'))
})

test('workspace release prerequisites include the existing evidence fail-closed flag', () => {
  assert.deepEqual(checkStudentFlowFlags({
    PRISM_APP_SHELL_V3: 'true', PRISM_ASSESSMENT_WORKSPACE_V3: 'true', DATABASE_URL: 'synthetic-test-database',
  }), ['PRISM_ASSESSMENT_WORKSPACE_V3 requires PRISM_EVIDENCE_FAIL_CLOSED=true.'])
})

test('V3 production configuration cannot silently rely on JSON or memory storage', () => {
  const env = {
    NODE_ENV: 'production', PRISM_APP_SHELL_V3: 'true',
    PRISM_ASSESSMENT_WORKSPACE_V3: 'true', PRISM_EVIDENCE_FAIL_CLOSED: 'true',
    DATABASE_URL: 'synthetic-test-database',
  }
  assert.deepEqual(checkStudentFlowFlags(env), ['V3 production requires PRISM_PG_STORE=true; JSON/memory persistence is not a production fallback.'])
  assert.deepEqual(checkStudentFlowFlags({ ...env, PRISM_PG_STORE: 'true' }), [])
})

test('workspace and report configuration requires a store but never prints its URL', () => {
  assert.ok(checkStudentFlowFlags({ PRISM_APP_SHELL_V3: 'true', PRISM_ASSESSMENT_WORKSPACE_V3: 'true', DATABASE_URL: ' ' }).some((e) => e.includes('DATABASE_URL')))
  const env = { PRISM_APP_SHELL_V3: 'false', PRISM_ASSESSMENT_WORKSPACE_V3: 'true', DATABASE_URL: 'synthetic-do-not-disclose' }
  assert.ok(!JSON.stringify(checkStudentFlowFlags(env)).includes(env.DATABASE_URL))
})

test('analytics depends on Campus only when analytics is enabled', () => {
  assert.deepEqual(checkStudentFlowFlags({ PRISM_CAMPUS_ANALYTICS: 'true' }), ['PRISM_CAMPUS_ANALYTICS requires PRISM_CAMPUS_ENABLED=true.'])
  assert.deepEqual(checkStudentFlowFlags({ PRISM_CAMPUS_ANALYTICS: 'false' }), [])
})

test('invalid boolean configuration is explicit rather than silently treated as dark', () => {
  assert.deepEqual(checkStudentFlowFlags({ PRISM_APP_SHELL_V3: 'TRUE' }), ['PRISM_APP_SHELL_V3 must be exactly true or false when configured.'])
})
