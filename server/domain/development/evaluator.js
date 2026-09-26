// Structured mission evaluator (spec §16.3 step 3; C8.04). Calls the AI
// gateway with the versioned prompt `mission_evaluator.v1` and a JSON output
// schema. The payload is identity-free: the learner is `{{candidate}}`, their
// name is tokenised out of their own text, and no organization, cohort or
// program name is ever included (K8). Any failure — timeout, provider error,
// unparseable output — is `available: false`; nothing is guessed.
import { renderPrompt } from '../../engine/prompts.js'
import { sanitizeCandidateText } from '../../lib/promptSecurity.js'
import { tokenizeForModel } from '../../lib/identityIsolation.js'

export const EVALUATOR_PROMPT = 'mission_evaluator.v1'
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
          },
        },
      },
    },
  },
}

// Builds the model messages. Exported so tests can prove the payload carries
// no identity.
export function buildEvaluatorMessages({ mission, criteria, workTexts, candidateName }) {
  const text = workTexts.map((t) => sanitizeCandidateText(tokenizeForModel(t, candidateName), 4000)).join('\n\n---\n\n')
  const prompt = renderPrompt(EVALUATOR_PROMPT, {
    MISSION_OBJECTIVE: mission.scenario_context.objective,
    CRITERIA_JSON: JSON.stringify(criteria.map((c) => ({ criterion_id: c.criterion_id, description: c.description, guidance: c.evaluator_guidance }))),
    WORK_TEXT: text,
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
  return data.criteria
    .filter((c) => c && typeof c.criterion_id === 'string' && typeof c.observed === 'boolean')
    .map((c) => ({
      criterionId: c.criterion_id,
      observed: c.observed,
      confidence: Number.isFinite(Number(c.confidence)) ? Math.min(1, Math.max(0, Number(c.confidence))) : 0,
      quote: typeof c.quote === 'string' ? c.quote : '',
    }))
}

export function createMissionEvaluator({ complete, timeoutMs = 20_000 } = {}) {
  return {
    promptVersion: EVALUATOR_PROMPT,
    async evaluate({ mission, criteria, workTexts, candidateName }) {
      if (!criteria.length) return { available: true, results: [], model: null }
      if (!complete) return { available: false, reason: 'EVALUATOR_NOT_CONFIGURED' }
      try {
        const messages = buildEvaluatorMessages({ mission, criteria, workTexts, candidateName })
        const call = complete({ messages, temperature: 0, max_completion_tokens: 800, json_schema: OUTPUT_SCHEMA }, { task: 'mission_evaluator', retries: 1 })
        const timeout = new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })), timeoutMs).unref?.())
        const out = await Promise.race([call, timeout])
        const content = out?.choices?.[0]?.message?.content ?? out?.content ?? out
        const results = parseOutput(content)
        if (!results) return { available: false, reason: 'UNPARSEABLE_OUTPUT' }
        return { available: true, results, model: out?.model || null }
      } catch (err) {
        return { available: false, reason: err?.code === 'TIMEOUT' ? 'TIMEOUT' : 'PROVIDER_ERROR' }
      }
    },
  }
}
