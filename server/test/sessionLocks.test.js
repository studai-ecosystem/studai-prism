import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { createMemorySessionLocks, createPgSessionLocks, sessionLockKey } from '../domain/assessments/sessionLocks.js'

function fakePg() {
  const holders = new Map()
  const clients = []
  let sequence = 0
  const pool = {
    async connect() {
      const client = new EventEmitter()
      client.id = ++sequence
      client.calls = []
      client.release = (destroy) => {
        client.released = true
        client.destroyed = destroy
        if (destroy) for (const [key, holder] of holders) if (holder === client.id) holders.delete(key)
      }
      client.query = async (sql, [key]) => {
        client.calls.push({ sql, key })
        if (sql.includes('pg_try_advisory_lock')) {
          const locked = !holders.has(key)
          if (locked) holders.set(key, client.id)
          return { rows: [{ locked }] }
        }
        const unlocked = holders.get(key) === client.id
        if (unlocked) holders.delete(key)
        return { rows: [{ unlocked }] }
      }
      clients.push(client)
      return client
    },
  }
  return { pool, clients, holders }
}

test('operation keys are stable signed bigint hashes and never contain resource identifiers', () => {
  const key = sessionLockKey('synthetic-session-private-reference')
  assert.match(key, /^-?\d+$/)
  assert.equal(key, sessionLockKey('synthetic-session-private-reference'))
  assert.notEqual(key, sessionLockKey('another-resource'))
  assert.ok(BigInt(key) >= -(2n ** 63n) && BigInt(key) < 2n ** 63n)
  assert.throws(() => sessionLockKey(''), { code: 'VALIDATION_FAILED' })
})

test('memory lock releases after failure and permits unrelated resources', async () => {
  const locks = createMemorySessionLocks()
  let active = 0
  await Promise.all(Array.from({ length: 4 }, () => locks.withLock('same', async () => {
    active += 1
    assert.equal(active, 1)
    await delay(2)
    active -= 1
  })))
  await assert.rejects(locks.withLock('same', async () => { throw new Error('synthetic-work-failure') }))
  assert.equal(await locks.withLock('same', async () => 'after-failure'), 'after-failure')
  let simultaneous = 0
  await Promise.all(['first', 'second'].map((key) => locks.withLock(key, async () => {
    simultaneous += 1
    await delay(5)
  })))
  assert.equal(simultaneous, 2)
})

test('independent PG lock objects serialize a shared resource on their own connections', async () => {
  const db = fakePg()
  const first = createPgSessionLocks({ getPool: () => db.pool, pollMs: 1 })
  const second = createPgSessionLocks({ getPool: () => db.pool, pollMs: 1 })
  let active = 0
  const work = async () => {
    active += 1
    assert.equal(active, 1)
    await delay(8)
    active -= 1
    return 'accepted'
  }
  assert.deepEqual(await Promise.all([first.withLock('same', work), second.withLock('same', work)]), ['accepted', 'accepted'])
  assert.equal(db.holders.size, 0)
  for (const client of db.clients) {
    assert.equal(client.released, true)
    assert.equal(client.destroyed, false)
    assert.equal(client.calls.at(-1).sql, 'SELECT pg_advisory_unlock($1::bigint) AS unlocked')
    assert.equal(new Set(client.calls.map((c) => c.key)).size, 1)
  }
})

test('a busy lock times out without executing the operation or releasing another holder', async () => {
  const db = fakePg()
  db.holders.set(sessionLockKey('busy'), 'another-connection')
  const locks = createPgSessionLocks({ getPool: () => db.pool, waitMs: 0 })
  let ran = false
  await assert.rejects(locks.withLock('busy', async () => { ran = true }), { code: 'UPSTREAM_UNAVAILABLE' })
  assert.equal(ran, false)
  assert.equal(db.holders.get(sessionLockKey('busy')), 'another-connection')
  assert.equal(db.clients[0].calls.length, 1)
  assert.equal(db.clients[0].released, true)
})

test('work failures retain their original error and still unlock the same connection', async () => {
  const db = fakePg()
  const locks = createPgSessionLocks({ getPool: () => db.pool })
  const failure = Object.assign(new Error('synthetic-domain-error'), { code: 'SCENARIO_NOT_FOUND' })
  await assert.rejects(locks.withLock('work', async () => { throw failure }), (error) => error === failure)
  assert.equal(db.holders.size, 0)
  assert.equal(db.clients[0].destroyed, false)
})

test('PG locking fails closed when its connection pool is unavailable', async () => {
  const locks = createPgSessionLocks({ getPool: () => null })
  let ran = false
  await assert.rejects(locks.withLock('work', async () => { ran = true }), { code: 'CAMPUS_STORE_UNAVAILABLE' })
  assert.equal(ran, false)
})

test('connection loss makes the operation outcome explicit and destroys the connection', async () => {
  const db = fakePg()
  const locks = createPgSessionLocks({ getPool: () => db.pool })
  await assert.rejects(locks.withLock('work', async () => {
    db.clients[0].emit('error', Object.assign(new Error('synthetic-disconnect'), { code: 'ECONNRESET' }))
    return 'must-not-be-acknowledged'
  }), { code: 'UPSTREAM_UNAVAILABLE' })
  assert.equal(db.clients[0].destroyed, true)
  assert.equal(db.holders.size, 0)
})

test('failed unlock destroys the physical connection instead of pooling a held lock', async () => {
  const db = fakePg()
  const connect = db.pool.connect
  db.pool.connect = async () => {
    const client = await connect()
    const query = client.query
    client.query = (sql, args) => sql.includes('pg_advisory_unlock')
      ? Promise.reject(Object.assign(new Error('synthetic-unlock-failure'), { code: 'ECONNRESET' }))
      : query(sql, args)
    return client
  }
  const locks = createPgSessionLocks({ getPool: () => db.pool })
  assert.equal(await locks.withLock('work', async () => 'committed'), 'committed')
  assert.equal(db.clients[0].destroyed, true)
  assert.equal(db.holders.size, 0)
})
