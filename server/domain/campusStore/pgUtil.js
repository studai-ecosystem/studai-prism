// Shared helpers for campus Postgres repositories.
export const iso = (v) => (v == null ? null : v instanceof Date ? v.toISOString() : String(v))

// A repository set bound to one open transaction (PROD-READY Phase 3) marks
// its getPool with the transaction's client. A repository write that opens
// its own transaction inside it becomes a SAVEPOINT on that client, so the
// whole multi-write commits or rolls back as one.
const TX = Symbol('prism.campus.transaction')

// Runs fn(client) inside BEGIN/COMMIT on one pooled connection.
export async function withTransaction(getPool, fn) {
  const outer = getPool?.[TX]
  if (outer) {
    outer.seq += 1
    const savepoint = `prism_sp_${outer.seq}`
    await outer.client.query(`SAVEPOINT ${savepoint}`)
    try {
      const out = await fn(outer.client)
      await outer.client.query(`RELEASE SAVEPOINT ${savepoint}`)
      return out
    } catch (err) {
      await outer.client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`).catch(() => {})
      throw err
    }
  }
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const out = await fn(client)
    await client.query('COMMIT')
    return out
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

// Repository dependencies bound to an open transaction's client: every query
// runs on that client, and nested withTransaction calls become savepoints.
// Each plain statement runs under its own savepoint too, so a repository
// that catches a constraint error (e.g. a duplicate it treats as "already
// there") leaves the transaction usable, exactly as in autocommit mode.
export function transactionDeps(client) {
  const getPool = () => {
    throw new Error('A repository transaction has no pool of its own; use its client.')
  }
  const state = { client, seq: 0 }
  getPool[TX] = state
  // Statements are serialised so savepoints never interleave (a repository
  // may issue reads with Promise.all).
  let tail = Promise.resolve()
  const query = (text, params) => {
    const next = tail.then(() => statement(text, params))
    tail = next.catch(() => {})
    return next
  }
  const statement = async (text, params) => {
    state.seq += 1
    const savepoint = `prism_q_${state.seq}`
    await client.query(`SAVEPOINT ${savepoint}`)
    try {
      const out = await client.query(text, params)
      await client.query(`RELEASE SAVEPOINT ${savepoint}`)
      return out
    } catch (err) {
      await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`).catch(() => {})
      throw err
    }
  }
  return { query, getPool }
}

export const inTransaction = (getPool) => Boolean(getPool?.[TX])
