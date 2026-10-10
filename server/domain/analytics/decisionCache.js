// Materialised per-session sufficiency decisions (PROD-READY Phase 6).
//
// Campus analytics and growth outcomes need, for every counted student, the
// decision entry of one completed sponsored session: its form, completion
// date and the sufficiency decision per capability (growth/entries.js). The
// loader reads the session, the report, the admin hold state and every
// evidence unit, then evaluates the sufficiency rules — four queries and a
// rules pass per student, per request. This module keeps those entries in
// `session_decision_cache` (0060) and serves them only while they are
// provably current:
//
//   * a database trigger bumps `session_decision_inputs.version` in the same
//     transaction as every write that can change an entry (evidence, the
//     session's scenario/form/completion, the issued report, an admin hold or
//     invalidation, a report version, an erasure marker);
//   * a cached row is used only when its `inputs_version` equals the current
//     counter and its `fingerprint` equals the running code's fingerprint —
//     a digest of the sufficiency rules and level constants, the source of the
//     modules that compute an entry, and the catalog. Changing a threshold, a
//     label or the catalog therefore invalidates every row at once;
//   * the version is read BEFORE the entry is computed and the write is
//     conditional on it, so a write racing the computation leaves a row that
//     is never served.
//
// The cache is used only when PRISM_ANALYTICS_DECISION_CACHE is on and the
// v1 store (sessions, reports) is PostgreSQL, so that every input is covered
// by the triggers. Otherwise — and for the memory store — entries are
// computed exactly as before. The rows are derived personal data keyed by
// session only: registered in personalDataRegistry.js and deleted with the
// session by the erasure cascade.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import logger from '../../lib/logger.js'
import { DEFAULT_SUFFICIENCY_RULES, SUFFICIENCY_RULES_VERSION, CAPABILITY_RULE_OVERRIDES, RULE_FLOORS } from '../evidence/sufficiencyRules.js'
import { CAPABILITY_LEVELS, LEVEL_LABELS_STATUS } from '../evidence/levels.js'

export const DECISION_CACHE_SCHEMA = 'session-decisions.v1'

// Source files whose code decides what an entry contains. Any change to them
// (a threshold, a label, the evidence row normalisation, the loader) gives a
// new fingerprint.
const SOURCES = [
  '../evidence/sufficiency.js',
  '../evidence/sufficiencyRules.js',
  '../evidence/levels.js',
  '../evidence/evidenceUnit.js',
  '../growth/entries.js',
  '../assessments/catalog.js',
  '../../lib/sharedConstants.js',
]
let codeDigest = null
function sourceDigest() {
  if (codeDigest) return codeDigest
  const h = createHash('sha256')
  for (const rel of SOURCES) {
    try {
      h.update(rel).update(readFileSync(fileURLToPath(new URL(rel, import.meta.url))))
    } catch {
      // Unreadable source: a per-process random salt, so nothing from another
      // process (or an older deploy) is ever trusted.
      h.update(`${rel}:unreadable:${process.pid}:${Date.now()}:${Math.random()}`)
    }
  }
  codeDigest = h.digest('hex')
  return codeDigest
}

const catalogDigests = new WeakMap()
function catalogDigest(cat) {
  if (!cat || typeof cat !== 'object') return 'no-catalog'
  if (!catalogDigests.has(cat)) {
    catalogDigests.set(cat, createHash('sha256').update(JSON.stringify({ definitions: cat.definitions || [], forms: cat.forms || [] })).digest('hex'))
  }
  return catalogDigests.get(cat)
}

// The fingerprint of everything (besides the per-session inputs) an entry
// depends on. `salt` lets tests stand in for a changed constant.
export function decisionFingerprint(cat, { salt = '' } = {}) {
  return createHash('sha256')
    .update(DECISION_CACHE_SCHEMA)
    .update(JSON.stringify({ SUFFICIENCY_RULES_VERSION, DEFAULT_SUFFICIENCY_RULES, CAPABILITY_RULE_OVERRIDES, RULE_FLOORS, CAPABILITY_LEVELS, LEVEL_LABELS_STATUS }))
    .update(sourceDigest())
    .update(catalogDigest(cat))
    .update(String(salt))
    .digest('hex')
    .slice(0, 40)
}

// Stored form of an entry: the definition is kept by id (the fingerprint pins
// the catalog it is looked up in), everything else as computed.
export function serializeEntry(entry) {
  if (!entry) return null
  return { session: entry.session, definitionId: entry.definition?.id ?? null, form: entry.form ?? null, decisions: entry.decisions || {} }
}
// What campus analytics reads of an entry (analytics/service.js: the
// definition's measures, and per capability the status and level band).
export function summarizeEntry(entry) {
  if (!entry) return null
  const decisions = {}
  for (const [id, d] of Object.entries(entry.decisions || {})) decisions[id] = { status: d?.status ?? null, level: d?.level?.band ? { band: d.level.band } : null }
  return { session: entry.session, definitionId: entry.definition?.id ?? null, decisions }
}
export function deserializeSummary(stored, cat) {
  if (!stored) return null
  return {
    session: stored.session,
    definition: stored.definitionId == null ? null : (cat?.definitions || []).find((d) => d.id === stored.definitionId) || null,
    decisions: stored.decisions || {},
    summaryOnly: true,
  }
}
export function deserializeEntry(stored, cat) {
  if (!stored) return null
  return {
    session: stored.session,
    definition: stored.definitionId == null ? null : (cat?.definitions || []).find((d) => d.id === stored.definitionId) || null,
    form: stored.form ?? null,
    decisions: stored.decisions || {},
    // The growth student view adds this live; analytics never reads it.
    reportCorrectionPending: false,
  }
}

async function mapLimited(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next
      next += 1
      if (i >= items.length) return
      out[i] = await fn(items[i], i)
    }
  }))
  return out
}

/**
 * createDecisionCache({ entryFor, catalog, repo, enabled })
 *   entryFor(sessionId)  the uncached loader (growth/entries.js)
 *   repo()               the PostgreSQL cache repository, or null
 *   enabled()            flag on AND the v1 store is PostgreSQL
 * → { entriesFor(refs) → Map sessionId → entry|null, entryFor(sessionId) }
 *   refs: [{ sessionId }] (other fields are ignored)
 */
export function createDecisionCache({ entryFor, catalog, repo = () => null, enabled = () => false, concurrency = 8, fingerprintSalt = () => '' }) {
  const compute = (ids) => mapLimited(ids, concurrency, (sid) => entryFor(sid))

  // `view: 'analytics'` returns the analytics summary of each entry when it
  // is served from the cache (computed entries are returned whole).
  async function entriesFor(refs = [], { view = 'full' } = {}) {
    const ids = [...new Set(refs.filter((r) => r?.sessionId).map((r) => String(r.sessionId)))]
    const out = new Map()
    if (!ids.length) return out
    const store = enabled() ? repo() : null
    if (!store) {
      const computed = await compute(ids)
      ids.forEach((sid, i) => out.set(sid, computed[i] || null))
      return out
    }
    const cat = await catalog.getCatalog()
    const fingerprint = decisionFingerprint(cat, { salt: fingerprintSalt() })
    let state
    try {
      state = await store.read(ids, fingerprint, { view })
    } catch (err) {
      // A cache read failure is not a reason to fail the view: compute.
      logger.warn?.('decision_cache_read_failed', { code: err?.code || null })
      const computed = await compute(ids)
      ids.forEach((sid, i) => out.set(sid, computed[i] || null))
      return out
    }
    const misses = []
    for (const sid of ids) {
      const s = state.get(sid)
      if (s?.hit) out.set(sid, view === 'analytics' ? deserializeSummary(s.entry, cat) : deserializeEntry(s.entry, cat))
      else misses.push(sid)
    }
    if (misses.length) {
      const computed = await compute(misses)
      const rows = []
      misses.forEach((sid, i) => {
        const entry = computed[i] || null
        out.set(sid, entry)
        rows.push({ sessionId: sid, fingerprint, inputsVersion: state.get(sid)?.version ?? 0, entry: serializeEntry(entry), summary: summarizeEntry(entry) })
      })
      try {
        await store.write(rows)
      } catch (err) {
        logger.warn?.('decision_cache_write_failed', { code: err?.code || null })
      }
    }
    return out
  }

  return {
    entriesFor,
    async entryFor(sessionId) {
      return (await entriesFor([{ sessionId }])).get(String(sessionId)) ?? null
    },
  }
}

// PostgreSQL repository (0060). `read` returns, per session id, whether the
// cached row is current (hit) and the current inputs version (taken before
// the caller computes). `write` stores rows only while the version they were
// computed from is still current.
export function createDecisionCacheRepoPg({ query }) {
  return {
    async read(sessionIds, fingerprint, { view = 'full' } = {}) {
      const { rows } = await query(
        `SELECT ids.session_id, COALESCE(v.version, 0) AS version, ${view === 'analytics' ? 'c.summary AS entry' : 'c.entry'},
                (c.session_id IS NOT NULL AND c.fingerprint = $2 AND c.inputs_version = COALESCE(v.version, 0)) AS hit
           FROM unnest($1::text[]) AS ids(session_id)
           LEFT JOIN session_decision_inputs v ON v.session_id = ids.session_id
           LEFT JOIN session_decision_cache c ON c.session_id = ids.session_id`,
        [sessionIds, fingerprint],
      )
      return new Map(rows.map((r) => [r.session_id, { hit: Boolean(r.hit), version: Number(r.version), entry: r.entry }]))
    },
    async write(rows) {
      if (!rows.length) return 0
      const { rowCount } = await query(
        `INSERT INTO session_decision_cache (session_id, fingerprint, inputs_version, entry, summary)
         SELECT x.session_id, x.fingerprint, x.inputs_version, x.entry, x.summary
           FROM jsonb_to_recordset($1::jsonb) AS x(session_id text, fingerprint text, inputs_version bigint, entry jsonb, summary jsonb)
          WHERE COALESCE((SELECT v.version FROM session_decision_inputs v WHERE v.session_id = x.session_id), 0) = x.inputs_version
         ON CONFLICT (session_id) DO UPDATE SET
           fingerprint = EXCLUDED.fingerprint, inputs_version = EXCLUDED.inputs_version,
           entry = EXCLUDED.entry, summary = EXCLUDED.summary, computed_at = now()`,
        [JSON.stringify(rows.map((r) => ({ session_id: r.sessionId, fingerprint: r.fingerprint, inputs_version: r.inputsVersion, entry: r.entry, summary: r.summary ?? null })))],
      )
      return rowCount
    },
  }
}
