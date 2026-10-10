// Prohibited by design on employer surfaces (PROD-READY Phase 9;
// docs/PROHIBITED_USES_POLICY_v1.md items 2, 3, 7; charter Phase 9):
//   - no ranking, no sorting or filtering of people by level or score, no
//     cut-offs: any request parameter that would ask for one is REFUSED (never
//     silently ignored), so a client cannot believe it got a ranked list;
//   - no export of individual results: there is no such route, and the
//     aggregate export accepts aggregate views only;
//   - no job family outside JOB_FAMILY_SCOPE_v1: only definitions whose every
//     form uses a scenario mapped in the governed scope can be sponsored, and a
//     cohort's job family is one of the governed family ids.
import { ApiError } from '../http/errors.js'
import { JOB_FAMILY_SCOPE } from '../../lib/sharedConstants.js'

export const PROHIBITED_USE_MESSAGE = 'Prism does not rank, sort or filter people by level or score, and has no cut-offs. This workspace is for development only.'

// Parameter names (case-insensitive, any punctuation removed) that ask for an
// ordering, a filter or a threshold on results.
const PROHIBITED_KEYS = new Set([
  'sort', 'sortby', 'sortorder', 'sortfield', 'order', 'orderby', 'orderdirection', 'direction', 'dir',
  'rank', 'ranking', 'rankby', 'top', 'topn', 'limitbylevel', 'best', 'worst',
  'level', 'levels', 'minlevel', 'maxlevel', 'band', 'bands', 'minband', 'maxband',
  'score', 'scores', 'minscore', 'maxscore', 'percentile', 'grade', 'rating',
  'threshold', 'cutoff', 'passmark', 'pass', 'fail', 'passfail', 'result', 'results', 'outcome',
  'capability', 'capabilityid', 'capabilitylevel', 'status_level', 'fit', 'suitability', 'recommend', 'hire',
])
const normalize = (k) => String(k).toLowerCase().replace(/[^a-z_]/g, '').replace(/_/g, '')

export function prohibitedKeysIn(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return []
  return Object.keys(obj).filter((k) => PROHIBITED_KEYS.has(normalize(k)) || PROHIBITED_KEYS.has(String(k).toLowerCase()))
}

// Express middleware for every employer route: query and top-level body keys.
export function refuseSelectionParams(req, _res, next) {
  const keys = [...prohibitedKeysIn(req.query), ...prohibitedKeysIn(req.body)]
  if (keys.length) return next(new ApiError('PROHIBITED_USE', PROHIBITED_USE_MESSAGE, { details: { refusedParameters: [...new Set(keys)] } }))
  return next()
}

// Aggregate views an employer may export (never a per-person view).
export const EMPLOYER_EXPORT_VIEWS = Object.freeze(['capabilities', 'completion', 'missions'])

export const SCOPED_FAMILY_IDS = Object.freeze(Object.keys(JOB_FAMILY_SCOPE.families))
const SCOPED_SCENARIOS = new Set(Object.keys(JOB_FAMILY_SCOPE.scenarios))

// A definition is sponsorable by an employer only when it has forms and every
// one of them uses a scenario mapped in the governed scope.
export function definitionInScope(catalog, definitionId) {
  const forms = (catalog?.forms || []).filter((f) => f.definitionId === definitionId)
  return forms.length > 0 && forms.every((f) => SCOPED_SCENARIOS.has(f.scenarioId))
}

export function familiesOf(catalog, definitionId) {
  const families = new Set()
  for (const f of (catalog?.forms || []).filter((x) => x.definitionId === definitionId)) {
    for (const fam of JOB_FAMILY_SCOPE.scenarios[f.scenarioId]?.families || []) families.add(fam)
  }
  return SCOPED_FAMILY_IDS.filter((id) => families.has(id)).map((id) => ({ id, name: JOB_FAMILY_SCOPE.families[id] }))
}

export const JOB_FAMILY_TAG_PREFIX = 'job-family:'
export const jobFamilyTag = (id) => `${JOB_FAMILY_TAG_PREFIX}${id}`
export function jobFamilyOfCohort(cohort) {
  const tag = (cohort?.tags || []).find((t) => String(t).startsWith(JOB_FAMILY_TAG_PREFIX))
  const id = tag ? tag.slice(JOB_FAMILY_TAG_PREFIX.length) : null
  return id && JOB_FAMILY_SCOPE.families[id] ? { id, name: JOB_FAMILY_SCOPE.families[id] } : null
}

// Wording that frames a person as selected or rejected. Used by the copy
// ceiling tests on every employer surface (server copy and rendered pages);
// the governed prohibited-use lines are checked separately (each is a negation).
export const SELECTION_WORDING = [
  /\bhir(e|es|ed|ing|eable|able)\b/i,
  /\bdo not hire\b|\bno[- ]hire\b/i,
  /\bfit\b|\bfits\b|\bfitment\b/i,
  /\bsuitab(le|ility)\b|\bunsuitable\b/i,
  /\brecommend(ed|s|ation)?\s+(for|to)\s+(the\s+|a\s+)?(role|job|position|hire|promotion)/i,
  /\brank(ed|ing|ings|s)?\b|\bleaderboard/i,
  /\bshortlist/i,
  /\bpass(ed)?\s*(\/|or)\s*fail(ed)?\b|\bpass mark\b|\bpassed\b|\bfailed the\b/i,
  /\bcut-?offs?\b|\bthreshold score/i,
  /\btop (performer|candidate|talent|\d+)\b|\bbest (candidate|performer|employee)s?\b|\bstar performer/i,
  /\bjob[- ]performance (prediction|predictor)|\bpredicts?\b/i,
]

export function selectionWordingIn(text) {
  return SELECTION_WORDING.filter((re) => re.test(String(text))).map((re) => re.source)
}
