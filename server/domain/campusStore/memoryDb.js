// In-memory tables shared by every campus memory repository (unit tests and
// the contract suite). Same semantics as the Postgres schema (0026–0029):
// unique keys, append-only ledgers, no defaults on status columns.
import { randomUUID } from 'node:crypto'

export function createMemoryDb({ clock = () => new Date() } = {}) {
  return {
    clock,
    id: () => randomUUID(),
    organizations: new Map(),
    departments: new Map(),
    cohorts: new Map(),
    cohortMembers: new Map(), // `${cohortId}:${userId}` → row
    memberships: new Map(),
    workspaces: new Map(),
    invites: new Map(),
    entitlements: new Map(),
    consumptions: [], // append-only
    consents: [],
    shareGrants: new Map(),
    shareGrantResources: [],
    dataAccessEvents: [], // append-only
    sessionScopes: new Map(),
  }
}

export const clone = (v) => (v == null ? v : structuredClone(v))
