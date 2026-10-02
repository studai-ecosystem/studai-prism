// Deterministic provider used only by the isolated readiness harness. It is
// unreachable in production: completionService enables it only when
// NODE_ENV=test and PRISM_AUDIT_AI=true.
const dimensions = ['criticalThinking', 'communication', 'collaboration', 'problemSolving', 'aiDigitalFluency']

// Layer B fault injection for the evidence evaluator only. Read ONLY when
// NODE_ENV=test (this provider itself is unreachable otherwise): 'throw'
// (provider failure), 'malformed' (unparseable output), 'mismatch' (quote
// the candidate never wrote), 'evidence-write' (a value the store rejects).
const AUDIT_FAULTS = new Set(['throw', 'malformed', 'mismatch', 'evidence-write'])
export function auditFault() {
  if (process.env.NODE_ENV !== 'test') return null
  const mode = process.env.PRISM_AUDIT_AI_FAULT
  return AUDIT_FAULTS.has(mode) ? mode : null
}

function textFor(task, request) {
  if (task === 'mission_evaluator') {
    const system = (request?.system || []).map((s) => s.text || '').join('\n')
    // P6.4 meaning harness: a criterion is met only when one of its listed
    // phrasings appears inside a real sentence of the learner's work (at
    // least six words, not mostly phrasing words). A bare keyword list is
    // KEYWORDS_ONLY, so tests can show paraphrase acceptance without a model.
    if (/MEANING CRITERIA \(JSON\)/.test(system)) {
      const spec = (() => { try { return JSON.parse(/MEANING CRITERIA \(JSON\)\s*([^\r\n]+)/.exec(system)?.[1] || '[]') } catch { return [] } })()
      const work = (system.split('<candidate_transcript>').pop() || '').split('</candidate_transcript>')[0].trim()
      const sentences = work.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean)
      const allPhraseWords = new Set(spec.flatMap((c) => (c.phrasings || []).flatMap((p) => String(p).toLowerCase().split(/\s+/))))
      const criteria = spec.map((c) => {
        const phrasings = (c.phrasings || []).map((p) => String(p).toLowerCase())
        for (const s of sentences) {
          const lower = s.toLowerCase()
          const hit = phrasings.find((p) => lower.includes(p))
          if (!hit) continue
          const words = lower.split(/\s+/).filter(Boolean)
          const stuffed = words.filter((w) => allPhraseWords.has(w.replace(/[^a-z0-9']/g, ''))).length / words.length >= 0.5
          if (words.length >= 6 && !stuffed) return { criterion_id: c.criterion_id, met: true, quote: s, reason: 'EXPRESSED' }
          return { criterion_id: c.criterion_id, met: false, quote: '', reason: 'KEYWORDS_ONLY' }
        }
        return { criterion_id: c.criterion_id, met: false, quote: '', reason: 'NOT_EXPRESSED' }
      })
      return JSON.stringify({ criteria })
    }
    // Deterministic harness answer: every asked criterion is "not observed"
    // with high confidence, so only deterministic checks can demonstrate.
    const ids = [...system.matchAll(/"criterion_id":"([A-Z0-9_-]+)"/g)].map((m) => m[1])
    return JSON.stringify({ criteria: [...new Set(ids)].map((id) => ({ criterion_id: id, observed: false, confidence: 0.9, quote: '' })) })
  }
  if (task === 'evidence_evaluator') {
    const fault = auditFault()
    if (fault === 'malformed') return '{"units": [ not json'
    // Deterministic slice evaluator: one unit for the opportunity in the
    // request, quoting the first 40 characters of the chosen candidate
    // action (a board patch: its longest changed value) at anchor level 2;
    // abstains (TOO_SPARSE) under 20 characters.
    const system = (request?.system || []).map((s) => s.text || '').join('\n')
    const opp = (() => { try { return JSON.parse(/OPPORTUNITY \(JSON\)\s*([^\r\n]+)/.exec(system)?.[1] || 'null') } catch { return null } })()
    const actions = (() => { try { return JSON.parse(/<candidate_transcript>\s*([^\r\n]+)/.exec(system)?.[1] || '[]') } catch { return [] } })()
    const messages = actions.filter((a) => a.kind === 'MESSAGE')
    const chosen = /BOARD/.test(opp?.id || '') ? actions.find((a) => a.kind === 'ARTIFACT')
      : /HANDOVER/.test(opp?.id || '') ? messages[messages.length - 1]
        : messages[0] || actions[0]
    const base = { opportunityId: opp?.id || null, capabilityId: opp?.capabilityId || null, behaviourId: opp?.behaviourId || null, contraryEvidence: '', ambiguity: '' }
    // A board patch is judged on its most substantive changed value (the
    // store may reorder object keys, so "first line" is not stable).
    const text = typeof chosen?.text === 'string' ? (chosen.kind === 'ARTIFACT' ? chosen.text.split('\n').reduce((a, b) => (b.length > a.length ? b : a), '') : chosen.text) : ''
    if (!chosen) return JSON.stringify({ units: [{ ...base, sourceActionId: null, excerpt: '', observedBehavior: '', anchorLevel: null, abstainReason: 'NOT_ADDRESSED' }] })
    if (text.length < 20) return JSON.stringify({ units: [{ ...base, sourceActionId: chosen.actionId, excerpt: '', observedBehavior: '', anchorLevel: null, abstainReason: 'TOO_SPARSE' }] })
    const unit = { ...base, sourceActionId: chosen.actionId, excerpt: text.slice(0, 40), observedBehavior: 'The candidate addressed the opportunity in their own words.', anchorLevel: 2, abstainReason: '' }
    // Layer B fault hooks (test-only, see auditFault()): a quotation the
    // candidate never wrote, or a value the evidence store must reject.
    if (fault === 'mismatch') unit.excerpt = 'words the candidate never wrote'
    if (fault === 'evidence-write') unit.observedBehavior = 'Rejected by the store:\u0000'
    return JSON.stringify({ units: [unit] })
  }
  if (task === 'preparation_participant') {
    // Deterministic rehearsal counterpart: one bounded pushback line.
    return 'I hear you. Before I agree, what would change if we kept the current date, and who owns the next step?'
  }
  if (task === 'preparation_action_card') {
    return JSON.stringify({
      situation: 'You are preparing to raise a timing concern with a counterpart.',
      plan: ['State the constraint you named in one sentence.', 'Offer one realistic alternative and its trade-off.', 'Ask who owns the next step and when you will check in.'],
      keyMessage: 'I want to agree a date we can both hold, so here is the constraint I am working with.',
      risks: ['The counterpart may ask for a detail you have not prepared.'],
      checkpoint: 'Ownership and the next check-in are agreed before the conversation ends.',
    })
  }
  if (task === 'opening' || task === 'conversation') {
    return JSON.stringify({
      messages: [{ speaker: 'Facilitator', role: 'Project Lead', content: 'What would you do first, and what evidence would you need before deciding?' }],
    })
  }
  if (task === 'calibration') return 'intermediate'
  if (task === 'entry_estimator') {
    return JSON.stringify(Object.fromEntries(dimensions.map((key) => [key, 2])))
  }
  if (task === 'micro_rater' || task === 'judge_turn') {
    return JSON.stringify(Object.fromEntries(dimensions.map((key) => [key, 2])))
  }
  if (task === 'judge_full') {
    return JSON.stringify({
      scores: Object.fromEntries(dimensions.map((key) => [key, 60])),
      feedback: Object.fromEntries(dimensions.map((key) => [key, 'Provisional audit-fixture feedback.'])),
      evidence: Object.fromEntries(dimensions.map((key) => [key, ['The candidate asked for evidence before deciding.']])),
      highlights: ['Structured the decision around evidence.'],
      growthAreas: ['State trade-offs more explicitly.'],
    })
  }
  return JSON.stringify({ ok: true })
}

export async function auditConverse(request) {
  if (request?.requestMetadata?.task === 'evidence_evaluator' && auditFault() === 'throw') {
    throw Object.assign(new Error('audit provider unavailable'), { name: 'ServiceUnavailableException', code: 'PROVIDER_DOWN' })
  }
  const text = textFor(request?.requestMetadata?.task, request)
  return {
    output: { message: { content: [{ text }] } },
    stopReason: 'end_turn',
    usage: { inputTokens: 10, outputTokens: 10 },
    metrics: { latencyMs: 1 },
    $metadata: { requestId: `audit-${request?.requestMetadata?.task || 'unknown'}` },
  }
}
