// Shared helpers for campus Postgres repositories.
export const iso = (v) => (v == null ? null : v instanceof Date ? v.toISOString() : String(v))

// Runs fn(client) inside BEGIN/COMMIT on one pooled connection.
export async function withTransaction(getPool, fn) {
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
