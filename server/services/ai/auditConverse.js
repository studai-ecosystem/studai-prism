// Deterministic provider used only by the isolated readiness harness. It is
// unreachable in production: completionService enables it only when
// NODE_ENV=test and PRISM_AUDIT_AI=true.
const dimensions = ['criticalThinking', 'communication', 'collaboration', 'problemSolving', 'aiDigitalFluency']

function textFor(task, request) {
  if (task === 'mission_evaluator') {
    // Deterministic harness answer: every asked criterion is "not observed"
    // with high confidence, so only deterministic checks can demonstrate.
    const system = (request?.system || []).map((s) => s.text || '').join('\n')
    const ids = [...system.matchAll(/"criterion_id":"([A-Z0-9_-]+)"/g)].map((m) => m[1])
    return JSON.stringify({ criteria: [...new Set(ids)].map((id) => ({ criterion_id: id, observed: false, confidence: 0.9, quote: '' })) })
  }
  if (task === 'evidence_evaluator') {
    // Deterministic slice evaluator: one unit for the opportunity in the
    // request, quoting the first 40 characters of the chosen candidate
    // action at anchor level 2; abstains (TOO_SPARSE) under 20 characters.
    const system = (request?.system || []).map((s) => s.text || '').join('\n')
    const opp = (() => { try { return JSON.parse(/OPPORTUNITY \(JSON\)\s*([^\r\n]+)/.exec(system)?.[1] || 'null') } catch { return null } })()
    const actions = (() => { try { return JSON.parse(/<candidate_transcript>\s*([^\r\n]+)/.exec(system)?.[1] || '[]') } catch { return [] } })()
    const messages = actions.filter((a) => a.kind === 'MESSAGE')
    const chosen = /BOARD/.test(opp?.id || '') ? actions.find((a) => a.kind === 'ARTIFACT')
      : /HANDOVER/.test(opp?.id || '') ? messages[messages.length - 1]
        : messages[0] || actions[0]
    const base = { opportunityId: opp?.id || null, capabilityId: opp?.capabilityId || null, behaviourId: opp?.behaviourId || null, contraryEvidence: '', ambiguity: '' }
    const text = typeof chosen?.text === 'string' ? (chosen.kind === 'ARTIFACT' ? chosen.text.split('\n')[0] : chosen.text) : ''
    if (!chosen) return JSON.stringify({ units: [{ ...base, sourceActionId: null, excerpt: '', observedBehavior: '', anchorLevel: null, abstainReason: 'NOT_ADDRESSED' }] })
    if (text.length < 20) return JSON.stringify({ units: [{ ...base, sourceActionId: chosen.actionId, excerpt: '', observedBehavior: '', anchorLevel: null, abstainReason: 'TOO_SPARSE' }] })
    return JSON.stringify({ units: [{ ...base, sourceActionId: chosen.actionId, excerpt: text.slice(0, 40), observedBehavior: 'The candidate addressed the opportunity in their own words.', anchorLevel: 2, abstainReason: '' }] })
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
  const text = textFor(request?.requestMetadata?.task, request)
  return {
    output: { message: { content: [{ text }] } },
    stopReason: 'end_turn',
    usage: { inputTokens: 10, outputTokens: 10 },
    metrics: { latencyMs: 1 },
    $metadata: { requestId: `audit-${request?.requestMetadata?.task || 'unknown'}` },
  }
}
