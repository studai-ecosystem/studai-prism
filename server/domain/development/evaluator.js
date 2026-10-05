// Structured mission evaluator (spec §16.3 step 3; C8.04). Calls the AI
// gateway with a versioned practice prompt and a JSON output
// schema. The payload is identity-free: the learner is `{{candidate}}`, their
// name is tokenised out of their own text, and no organization, cohort or
// program name is ever included (K8). Any failure — timeout, provider error,
// unparseable output — is `available: false`; nothing is guessed.
import { renderPrompt } from '../../engine/prompts.js'
import { sanitizeCandidateText } from '../../lib/promptSecurity.js'
import { tokenizeForModel } from '../../lib/identityIsolation.js'
import { structuredWorkFor, candidateTextFor } from './validators.js'

export const EVALUATOR_PROMPT = 'mission_evaluator.v2'
export const MEANING_PROMPT = 'mission_meaning.v3'
export const MEANING_REASONS = Object.freeze(['EXPRESSED', 'NOT_EXPRESSED', 'KEYWORDS_ONLY', 'CONTRADICTED', 'NOT_JUDGEABLE'])
const EVALUATOR_REASONS = ['OBSERVED', 'NOT_OBSERVED', 'NOT_JUDGEABLE']
const MEANING_SCHEMA = {
  name: 'mission_meaning',
  description: 'Per-criterion meaning decisions with verbatim quotes.',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['criteria'],
    properties: {
      criteria: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['criterion_id', 'met', 'quote', 'reason'],
          properties: {
            criterion_id: { type: 'string' },
            met: { type: 'boolean' },
            quote: { type: 'string' },
            reason: { type: 'string', enum: [...MEANING_REASONS] },
          },
        },
      },
    },
  },
}
const OUTPUT_SCHEMA = {
  name: 'mission_criteria',
  description: 'Per-criterion practice observations with verbatim quotes.',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['criteria'],
    properties: {
      criteria: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['criterion_id', 'observed', 'confidence', 'quote'],
          properties: {
            criterion_id: { type: 'string' },
            observed: { type: 'boolean' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            quote: { type: 'string' },
            reason: { type: 'string', enum: EVALUATOR_REASONS },
          },
        },
      },
    },
  },
}

// Builds the model messages. Exported so tests can prove the payload carries
// no identity.
function promptData({ mission, criteria, work, candidateName }) {
  const sanitize = (value) => typeof value === 'string' ? sanitizeCandidateText(tokenizeForModel(value, candidateName), 8000) : value
  const artifacts = structuredWorkFor(mission, work).map((a) => ({
    ...a,
    entries: a.entries.map((e) => ({ ...e, value: sanitize(e.value) })),
  }))
  return {
    CONTEXT_JSON: JSON.stringify({
      setting: mission.scenario_context.setting,
      objective: mission.scenario_context.objective,
      situation_facts: mission.situation_facts || [],
      constraints: mission.constraints,
    }),
    WORK_JSON: JSON.stringify(artifacts),
    criteria: criteria.map((c) => ({ criterion_id: c.criterion_id, artifact_ids: c.artifact_ids, work_paths: c.work_paths || [] })),
  }
}

export function buildEvaluatorMessages({ mission, criteria, work, candidateName }) {
  const data = promptData({ mission, criteria, work, candidateName })
  const prompt = renderPrompt(EVALUATOR_PROMPT, {
    ...data,
    CRITERIA_JSON: JSON.stringify(criteria.map((c, i) => ({ ...data.criteria[i], description: c.description, guidance: c.evaluator_guidance }))),
  })
  return [
    { role: 'system', content: prompt },
    { role: 'user', content: 'Return the JSON object for the criteria listed.' },
  ]
}

function parseOutput(content) {
  let data = content
  if (typeof data === 'string') {
    const m = data.match(/\{[\s\S]*\}/)
    if (!m) return null
    try { data = JSON.parse(m[0]) } catch { return null }
  }
  if (!data || !Array.isArray(data.criteria)) return null
  if (data.criteria.some((c) => !c || typeof c.criterion_id !== 'string' || typeof c.observed !== 'boolean' || typeof c.confidence !== 'number' || !Number.isFinite(c.confidence) || c.confidence < 0 || c.confidence > 1 || typeof c.quote !== 'string')) return null
  if (data.criteria.some((c) => c.reason !== undefined && (!EVALUATOR_REASONS.includes(c.reason) || c.observed !== (c.reason === 'OBSERVED')))) return null
  if (new Set(data.criteria.map((c) => c.criterion_id)).size !== data.criteria.length) return null
  return data.criteria
    .map((c) => ({
      criterionId: c.criterion_id,
      observed: c.observed,
      confidence: c.confidence,
      quote: c.quote,
      ...(c.reason !== undefined ? { reason: c.reason } : {}),
    }))
}

// P6.4 meaning messages: intent + example phrasings per criterion. Exported
// so tests can prove the payload is identity-free.
export function buildMeaningMessages({ mission, criteria, work, candidateName }) {
  const data = promptData({ mission, criteria, work, candidateName })
  const prompt = renderPrompt(MEANING_PROMPT, {
    ...data,
    MEANING_JSON: JSON.stringify(criteria.map((c, i) => ({ ...data.criteria[i], intent: c.meaning.intent, phrasings: c.meaning.synonyms, guidance: c.evaluator_guidance }))),
  })
  return [
    { role: 'system', content: prompt },
    { role: 'user', content: 'Return the JSON object for the meaning criteria listed.' },
  ]
}

function parseMeaningOutput(content) {
  let data = content
  if (typeof data === 'string') {
    const m = data.match(/\{[\s\S]*\}/)
    if (!m) return null
    try { data = JSON.parse(m[0]) } catch { return null }
  }
  if (!data || !Array.isArray(data.criteria)) return null
  if (data.criteria.some((c) => !c || typeof c.criterion_id !== 'string' || typeof c.met !== 'boolean' || typeof c.quote !== 'string' || !MEANING_REASONS.includes(c.reason) || c.met !== (c.reason === 'EXPRESSED'))) return null
  if (new Set(data.criteria.map((c) => c.criterion_id)).size !== data.criteria.length) return null
  return data.criteria
    .map((c) => ({
      criterionId: c.criterion_id,
      met: c.met,
      quote: c.quote,
      reason: c.reason,
    }))
}

export const meaningWorkEmpty = (workTexts) => !workTexts.some((text) => text.trim())

export function createMissionEvaluator({ complete, timeoutMs = 20_000 } = {}) {
  const withTimeout = async (call) => {
    let timer
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })), timeoutMs)
      timer.unref?.()
    })
    try { return await Promise.race([call, timeout]) } finally { clearTimeout(timer) }
  }
  return {
    promptVersion: EVALUATOR_PROMPT,
    meaningPromptVersion: MEANING_PROMPT,
    async evaluate({ mission, criteria, work, candidateName }) {
      if (!criteria.length) return { available: true, results: [], model: null }
      if (!complete) return { available: false, reason: 'EVALUATOR_NOT_CONFIGURED' }
      try {
        const messages = buildEvaluatorMessages({ mission, criteria, work, candidateName })
        const call = complete({ messages, temperature: 0, max_completion_tokens: 800, json_schema: OUTPUT_SCHEMA }, { task: 'mission_evaluator', retries: 1 })
        const out = await withTimeout(call)
        const content = out?.choices?.[0]?.message?.content ?? out?.content ?? out
        const results = parseOutput(content)
        if (!results) return { available: false, reason: 'UNPARSEABLE_OUTPUT' }
        return { available: true, results, model: out?.model || null }
      } catch (err) {
        return { available: false, reason: err?.code === 'TIMEOUT' ? 'TIMEOUT' : 'PROVIDER_ERROR' }
      }
    },
    // Only empty work is decided locally. Courtesy, nonsense and concise
    // meaningful replies require the criterion's contextual meaning decision.
    async evaluateMeaning({ mission, criteria, work, candidateName }) {
      if (!criteria.length) return { available: true, results: [], model: null }
      const empty = criteria.filter((c) => meaningWorkEmpty(candidateTextFor(mission, work, c.artifact_ids, c.work_paths)))
      const active = criteria.filter((c) => !empty.includes(c))
      const emptyResults = empty.map((c) => ({ criterionId: c.criterion_id, met: false, quote: '', reason: 'EMPTY_WORK' }))
      if (!active.length) return { available: true, results: emptyResults, model: null }
      if (!complete) return { available: false, reason: 'EVALUATOR_NOT_CONFIGURED' }
      try {
        const messages = buildMeaningMessages({ mission, criteria: active, work, candidateName })
        const call = complete({ messages, temperature: 0, max_completion_tokens: 800, json_schema: MEANING_SCHEMA }, { task: 'mission_evaluator', retries: 1 })
        const out = await withTimeout(call)
        const content = out?.choices?.[0]?.message?.content ?? out?.content ?? out
        const results = parseMeaningOutput(content)
        if (!results) return { available: false, reason: 'UNPARSEABLE_OUTPUT' }
        return { available: true, results: [...emptyResults, ...results], model: out?.model || null }
      } catch (err) {
        return { available: false, reason: err?.code === 'TIMEOUT' ? 'TIMEOUT' : 'PROVIDER_ERROR' }
      }
    },
  }
}
