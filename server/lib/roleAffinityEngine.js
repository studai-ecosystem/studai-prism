// Role exploration (spec §18): explains what is known and unknown — never a
// percentage, score or "match". Self-reported interests and demonstrated
// capability evidence are separate reason types; with no interests supplied
// there are no interest reasons, and nothing is ever assumed on the
// candidate's behalf (no default interest vectors).

export const RIASEC_KEYS = Object.freeze(['R', 'I', 'A', 'S', 'E', 'C'])
const RIASEC_NAMES = { R: 'Realistic', I: 'Investigative', A: 'Artistic', S: 'Social', E: 'Enterprising', C: 'Conventional' }
const PRIMARY_TO_KEY = { REALISTIC: 'R', INVESTIGATIVE: 'I', ARTISTIC: 'A', SOCIAL: 'S', ENTERPRISING: 'E', CONVENTIONAL: 'C' }
const DEMONSTRATED_BANDS = new Set(['DEMONSTRATED', 'STRONG'])
const ADMISSIBLE = new Set(['PROVISIONAL', 'SUFFICIENT'])

// Accepts only a caller-supplied interest object: known RIASEC keys, values
// in [0, 1], at least one positive. Anything else → null (no interests).
export function sanitizeInterests(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out = {}
  for (const k of RIASEC_KEYS) {
    const v = raw[k]
    if (v === undefined) continue
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) return null
    out[k] = v
  }
  return Object.values(out).some((v) => v > 0) ? out : null
}

function topInterests(interests) {
  if (!interests) return []
  const max = Math.max(...Object.values(interests))
  return Object.entries(interests).filter(([, v]) => v === max && v > 0).map(([k]) => k)
}

function blueprintCapabilities(bp) {
  return [...(bp.layer1_transferable_capabilities || []), ...(bp.layer2_role_capabilities || [])]
    .map((c) => ({ id: c.id || c.capability_id, name: c.name || c.id || c.capability_id }))
    .filter((c) => c.id)
}

export class RoleAffinityEngine {
  async computeRoleAffinity(capabilityProfile = {}, candidateInterests = null) {
    const { default: occupationalGraph } = await import('./occupationalGraph.js')
    const families = await occupationalGraph.getAllJobFamilies()
    const blueprints = await Promise.all(families.map((f) => occupationalGraph.getJobFamilyBlueprint(f.job_family_id)))
    return this.evaluateAffinity({ candidateInterests, capabilityProfile, blueprints: blueprints.filter(Boolean) })
  }

  evaluateAffinity({ candidateInterests = null, capabilityProfile = {}, blueprints = [] } = {}) {
    const interests = sanitizeInterests(candidateInterests)
    const top = topInterests(interests)
    const results = blueprints.map((bp) => {
      const whyShown = []
      const unknowns = []
      for (const cap of blueprintCapabilities(bp)) {
        const p = capabilityProfile[cap.id]
        if (p && ADMISSIBLE.has(p.status) && p.level && DEMONSTRATED_BANDS.has(p.level.band)) {
          whyShown.push({
            type: 'DEMONSTRATED_CAPABILITY',
            capabilityId: cap.id,
            status: p.status,
            evidenceIds: p.unit_ids || [],
            statement: `Your assessment evidence shows ${p.level.label.toLowerCase()} ${cap.name}${p.status === 'PROVISIONAL' ? ' (provisional)' : ''}.`,
          })
        } else if (!p || !ADMISSIBLE.has(p.status)) {
          unknowns.push({ capabilityId: cap.id, name: cap.name, note: `No formal evidence yet for ${cap.name}.` })
        }
      }
      const primaryKey = PRIMARY_TO_KEY[bp.riasec_profile?.primary]
      if (primaryKey && top.includes(primaryKey)) {
        whyShown.push({
          type: 'SELF_REPORTED_INTEREST',
          interest: primaryKey,
          statement: `You said you enjoy ${RIASEC_NAMES[primaryKey]} work, which is central to ${bp.name}.`,
        })
      }
      const demonstrated = whyShown.filter((w) => w.type === 'DEMONSTRATED_CAPABILITY').length
      const selfReported = whyShown.length - demonstrated
      return {
        roleId: bp.job_family_id,
        title: bp.name,
        track: bp.track || null,
        basis: demonstrated && selfReported ? 'BOTH' : demonstrated ? 'DEMONSTRATED' : selfReported ? 'SELF_REPORTED' : 'NONE',
        whyShown,
        unknowns,
        nextStep: unknowns.length > 0
          ? { type: 'FORMAL_ASSESSMENT', label: 'Complete an assessment that covers the capabilities we have no evidence for yet.' }
          : { type: 'EXPLORE', label: 'Talk to someone who works in this role about a typical week.' },
        _order: [demonstrated, selfReported],
      }
    })
    // Deterministic order: more evidence-backed reasons first, then title.
    return results
      .sort((a, b) => b._order[0] - a._order[0] || b._order[1] - a._order[1] || String(a.title).localeCompare(String(b.title)))
      .map(({ _order, ...r }) => r)
  }
}

export default new RoleAffinityEngine()
