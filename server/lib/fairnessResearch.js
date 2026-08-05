// Charter §15 — fairness-research framework (Phase 3 part 2).
//
// The demographic capability stays OFF (PRISM_DEMOGRAPHICS, default off,
// HA-005 counsel + HA-012 ethics). NOTHING in the application writes
// candidate_demographics — the track4 CI test enforces that ban, and the
// write path may only land in the same commit as the documented approvals.
//
// What exists NOW is the governance framework the charter requires:
//   * separated storage (candidate_demographics, pseudonymous candidate_id,
//     consent-scoped, withdrawal column — migration 0019);
//   * mandatory minimum-group-size suppression (below);
//   * UNDERPOWERED labelling (below; the DIF jobs already apply the same
//     discipline — calibration/jobs/dif_audit.py adequately_powered);
//   * role-restriction + audit (no read surface exists at all yet);
//   * erasure interplay (privacyPlanner deletes candidate_demographics rows;
//     properly anonymized aggregates — calibration parameters, approved
//     aggregate statistics, published findings — survive erasure).

export const MIN_GROUP_SIZE = 10

export function isDemographicsEnabled() {
  return process.env.PRISM_DEMOGRAPHICS === 'true'
}

// Mandatory suppression: any subgroup below MIN_GROUP_SIZE is removed and
// replaced by a suppression marker — a suppressed group's n is NOT revealed.
// rows: [{ group, n, ...stats }]
export function suppressSmallGroups(rows, minGroupSize = MIN_GROUP_SIZE) {
  const out = []
  let suppressed = 0
  for (const row of Array.isArray(rows) ? rows : []) {
    if (Number(row?.n) >= minGroupSize) out.push(row)
    else suppressed += 1
  }
  return {
    rows: out,
    suppressedGroups: suppressed,
    note: suppressed
      ? `${suppressed} group(s) below the minimum group size (${minGroupSize}) suppressed — counts not disclosed.`
      : null,
  }
}

// Honest power labelling: no subgroup claim without adequate power.
export function powerLabel(n, adequateN) {
  if (!Number.isFinite(Number(n)) || !Number.isFinite(Number(adequateN))) return 'UNDERPOWERED'
  return Number(n) >= Number(adequateN) ? 'adequately-powered' : 'UNDERPOWERED'
}
