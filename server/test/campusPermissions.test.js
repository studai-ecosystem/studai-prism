// C3.06 — permission matrix (spec §29.1), table-driven, deny by default.
import test from 'node:test'
import assert from 'node:assert/strict'
import { can } from '../domain/permissions/can.js'
import { ROLES } from '../domain/permissions/roles.js'
import { MATRIX, PERMISSION_KEYS, permissionsForRole, scopeFor } from '../domain/permissions/matrix.js'

const ORG = 'org-1'
const OTHER = 'org-2'
const member = (role, extra = {}) => ({ userId: 'actor', memberships: [{ organizationId: ORG, role, status: 'ACTIVE', departmentId: 'dept-1', scope: { cohortIds: ['cohort-1'] }, ...extra }] })

// Spec §29.1 table, verbatim: Owner | Director | Officer | Dept Coordinator | Faculty Mentor | Student.
const SPEC = {
  'org.manage': ['ALL', 'LIMITED', null, null, null, null],
  'team.manage': ['ALL', 'ALL', 'LIMITED', null, null, null],
  'cohorts.read': ['ALL', 'ALL', 'ASSIGNED', 'DEPARTMENT', 'ASSIGNED', null],
  'programs.write': ['ALL', 'ALL', 'ALL', 'LIMITED', null, null],
  'assignments.write': ['ALL', 'ALL', 'ALL', 'LIMITED', null, null],
  'analytics.read': ['ALL', 'ALL', 'ASSIGNED', 'DEPARTMENT', 'ASSIGNED', null],
  'students.sponsored_result.read': ['ALL', 'ALL', 'ASSIGNED', 'DEPARTMENT', 'ASSIGNED', 'OWN'],
  'personal_result.read': [null, null, null, null, null, null],
  'exports.cohort': ['ALL', 'ALL', 'PERMISSION', 'PERMISSION', null, null],
}
const SPEC_ROLES = ['ORG_OWNER', 'PLACEMENT_DIRECTOR', 'PLACEMENT_OFFICER', 'DEPARTMENT_COORDINATOR', 'FACULTY_MENTOR', 'STUDENT']

test('matrix encodes the spec §29.1 table exactly', () => {
  for (const [perm, row] of Object.entries(SPEC)) {
    SPEC_ROLES.forEach((role, i) => assert.equal(scopeFor(role, perm), row[i], `${role} × ${perm}`))
  }
})

test('personal_result.read is granted to no organization role, ever', () => {
  for (const role of ROLES) {
    assert.equal(scopeFor(role, 'personal_result.read'), null, role)
    const d = can(member(role), 'personal_result.read', { organizationId: ORG, ownerUserId: 'actor' })
    assert.equal(d.allowed, false, role)
    assert.ok(!permissionsForRole(role, { permissions: PERMISSION_KEYS }).includes('personal_result.read'))
  }
})

test('unknown roles, unknown permissions, inactive memberships and other orgs are denied', () => {
  assert.equal(can(member('WIZARD'), 'cohorts.read', { organizationId: ORG }).allowed, false)
  assert.equal(can(member('ORG_OWNER'), 'cohorts.delete_everything', { organizationId: ORG }).allowed, false)
  for (const status of ['INVITED', 'SUSPENDED', 'REMOVED']) {
    assert.equal(can(member('ORG_OWNER', { status }), 'cohorts.read', { organizationId: ORG }).allowed, false, status)
  }
  assert.equal(can(member('ORG_OWNER'), 'cohorts.read', { organizationId: OTHER }).reason, 'NOT_A_MEMBER')
  assert.equal(can({ userId: null, memberships: [] }, 'cohorts.read', { organizationId: ORG }).allowed, false)
  assert.equal(can(member('ORG_OWNER'), 'cohorts.read', {}).allowed, false)
})

test('every role × permission cell is decided by the matrix (full table)', () => {
  for (const role of ROLES) {
    for (const perm of PERMISSION_KEYS) {
      const scope = MATRIX[perm][role] || null
      const d = can(member(role, { scope: { cohortIds: ['cohort-1'], permissions: PERMISSION_KEYS } }), perm, {
        organizationId: ORG, ownerUserId: 'actor', cohortId: 'cohort-1', departmentId: 'dept-1',
      })
      assert.equal(d.allowed, scope !== null, `${role} × ${perm}`)
      if (scope) assert.equal(d.scope, scope)
    }
  }
})

test('ASSIGNED, DEPARTMENT, PERMISSION and OWN scopes restrict to the named resources', () => {
  const officer = member('PLACEMENT_OFFICER')
  assert.equal(can(officer, 'cohorts.read', { organizationId: ORG, cohortId: 'cohort-1' }).allowed, true)
  assert.equal(can(officer, 'cohorts.read', { organizationId: ORG, cohortId: 'cohort-9' }).allowed, false)
  assert.equal(can(officer, 'cohorts.read', { organizationId: ORG, cohortId: null }).allowed, false)
  assert.deepEqual(can(officer, 'cohorts.read', { organizationId: ORG }).cohortIds, ['cohort-1'], 'list request returns the filter')

  const coord = member('DEPARTMENT_COORDINATOR')
  assert.equal(can(coord, 'students.sponsored_result.read', { organizationId: ORG, departmentId: 'dept-1' }).allowed, true)
  assert.equal(can(coord, 'students.sponsored_result.read', { organizationId: ORG, departmentId: 'dept-2' }).allowed, false)
  assert.equal(can(member('DEPARTMENT_COORDINATOR', { departmentId: null }), 'cohorts.read', { organizationId: ORG }).reason, 'NO_DEPARTMENT')

  assert.equal(can(officer, 'exports.cohort', { organizationId: ORG }).allowed, false, 'PERMISSION needs an explicit grant')
  assert.equal(can(member('PLACEMENT_OFFICER', { scope: { permissions: ['exports.cohort'] } }), 'exports.cohort', { organizationId: ORG }).allowed, true)

  const student = member('STUDENT')
  assert.equal(can(student, 'students.sponsored_result.read', { organizationId: ORG, ownerUserId: 'actor' }).allowed, true)
  assert.equal(can(student, 'students.sponsored_result.read', { organizationId: ORG, ownerUserId: 'someone-else' }).allowed, false)
})

test('an actor with two roles gets the wider scope', () => {
  const actor = { userId: 'actor', memberships: [
    { organizationId: ORG, role: 'FACULTY_MENTOR', status: 'ACTIVE', scope: { cohortIds: [] } },
    { organizationId: ORG, role: 'PLACEMENT_DIRECTOR', status: 'ACTIVE', scope: {} },
  ] }
  const d = can(actor, 'cohorts.read', { organizationId: ORG, cohortId: 'cohort-x' })
  assert.equal(d.allowed, true)
  assert.equal(d.scope, 'ALL')
})

test('the campus navigation keys (K21) are all defined in the matrix', () => {
  for (const key of ['org.overview.read', 'students.read', 'cohorts.read', 'programs.read', 'assignments.read', 'interventions.read', 'reassessments.read', 'analytics.read', 'reports.read', 'team.read', 'integrations.read', 'billing.read', 'org.settings.read']) {
    assert.ok(PERMISSION_KEYS.includes(key), key)
  }
})
