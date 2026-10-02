import test from 'node:test'
import assert from 'node:assert/strict'
import { classify, reconcile } from '../../scripts/reconcile-ownership.mjs'

const users = (ids) => (id) => ids.includes(id)

test('P1/T06 conflicting owner references are never resolved automatically', () => {
  const c = classify({ session_owner: 'a', report_owner: 'b', payment_owner: null, has_session: true, has_report: true }, users(['a', 'b']))
  assert.equal(c.category, 'CONFLICTING')
  assert.equal(c.owner, undefined)
})

test('P1/T06 unclaimed when no reference or the referenced account is missing', () => {
  assert.equal(classify({ session_owner: null, report_owner: null, payment_owner: null, has_session: true }, users([])).category, 'UNCLAIMED')
  assert.equal(classify({ session_owner: 'ghost', report_owner: null, payment_owner: null, has_session: true }, users([])).reason, 'OWNER_ACCOUNT_MISSING')
})

test('P1/CH-07 proven fill only completes null references that agree with an existing account', () => {
  const c = classify({ session_owner: 'a', report_owner: null, payment_owner: 'a', has_session: true, has_report: true, has_payment: true }, users(['a']))
  assert.deepEqual(c, { category: 'MATCHED', owner: 'a', fill: ['report_owner'], reason: 'PROVEN_FILL' })
})

test('P1/CH-08 dry run writes nothing; apply is idempotent and audited', async () => {
  const state = { reports: { s1: null }, applied: [] }
  const client = {
    calls: [],
    async query(sql, params) {
      this.calls.push(sql)
      if (sql.startsWith('CREATE TABLE')) return { rows: [] }
      if (sql.includes('FROM v1_sessions s')) return { rows: [{ session_id: 's1', session_owner: 'a', report_owner: state.reports.s1, payment_owner: null, has_session: true, has_report: true, has_payment: false }] }
      if (sql.startsWith('SELECT id FROM v1_users')) return { rows: [{ id: 'a' }] }
      if (sql.includes('FROM assessment_ownership_reconciliation')) return { rows: state.applied.map((s) => ({ session_id: s })) }
      if (sql.startsWith('UPDATE v1_reports')) { state.reports.s1 = params[1]; return { rowCount: 1 } }
      if (sql.startsWith('INSERT INTO assessment_ownership_reconciliation')) { state.applied.push(params[0]); return { rowCount: 1 } }
      return { rows: [] }
    },
  }
  const dry = await reconcile(client, { apply: false })
  assert.equal(dry.fillable, 1)
  assert.equal(dry.applied, 0)
  assert.equal(state.reports.s1, null)
  assert.ok(client.calls.every((s) => !/^UPDATE|^INSERT/.test(s)))
  const applied = await reconcile(client, { apply: true })
  assert.equal(applied.applied, 1)
  assert.equal(state.reports.s1, 'a')
  const again = await reconcile(client, { apply: true })
  assert.equal(again.applied, 0)
  assert.equal(again.alreadyApplied, 0, 'row now consistent; nothing to fill')
  assert.equal(again.MATCHED, 1)
  assert.equal(again.DELETED, null)
})
