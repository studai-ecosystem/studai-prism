// Deterministic provider used only by the isolated readiness harness. It is
// unreachable in production: completionService enables it only when
// NODE_ENV=test and PRISM_AUDIT_AI=true.
const dimensions = ['criticalThinking', 'communication', 'collaboration', 'problemSolving', 'aiDigitalFluency']

function textFor(task) {
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
  const text = textFor(request?.requestMetadata?.task)
  return {
    output: { message: { content: [{ text }] } },
    stopReason: 'end_turn',
    usage: { inputTokens: 10, outputTokens: 10 },
    metrics: { latencyMs: 1 },
    $metadata: { requestId: `audit-${request?.requestMetadata?.task || 'unknown'}` },
  }
}
