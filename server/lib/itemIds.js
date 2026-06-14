// Deterministic UUIDs that bridge the v1 string scenario ids ("group-project")
// onto the v2 UUID-keyed item model. Because they are derived (uuid v5) from a
// fixed namespace + stable names, the seeder and the live telemetry path
// compute the SAME ids without a lookup table — re-seeding is idempotent and a
// turn can resolve its probe item id on the fly.

import { v5 as uuidv5 } from 'uuid'

// Fixed namespace for all Prism v2 derived ids (a random, frozen UUID).
const PRISM_V2_NS = '2f9d6c1e-7b34-5a28-9e4f-1c0a8b6d3e57'

// The UUID shared by a scenario item and all of its probe items (items.scenario_id).
export function scenarioUuid(scenarioKey) {
  return uuidv5(`scenario-id:${scenarioKey}`, PRISM_V2_NS)
}

// item_id for the 'scenario' item.
export function scenarioItemId(scenarioKey) {
  return uuidv5(`scenario:${scenarioKey}`, PRISM_V2_NS)
}

// item_id for a per-dimension 'probe' item within a scenario.
export function probeItemId(scenarioKey, dimension) {
  return uuidv5(`probe:${scenarioKey}:${dimension}`, PRISM_V2_NS)
}
