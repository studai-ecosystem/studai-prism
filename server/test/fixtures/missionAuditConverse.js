import { auditConverse as legacyAuditConverse } from '../../services/ai/auditConverse.js'

// Test-only adapter for the old phrase fixture; it proves wiring, not semantics.
export async function auditConverse(request) {
  const system = (request.system || []).map((s) => s.text || '').join('\n').replace(/\r\n/g, '\n')
  if (request.requestMetadata?.task !== 'mission_evaluator' || !system.includes('LEARNER WORK (JSON)') || !system.includes('MEANING CRITERIA (JSON)')) return legacyAuditConverse(request)
  const spec = JSON.parse(system.split('MEANING CRITERIA (JSON)\n')[1].split('\n')[0])
  const artifacts = JSON.parse(system.split('<candidate_transcript>').pop().split('</candidate_transcript>')[0].trim())
  const criteria = []
  let response
  for (const criterion of spec) {
    const texts = artifacts.filter((a) => criterion.artifact_ids.includes(a.artifact_id)).flatMap((a) =>
      a.entries.filter((e) => e.source === 'LEARNER' && e.kind === 'text' && (!criterion.work_paths.length || criterion.work_paths.some((p) => p.artifact_id === a.artifact_id && p.path === e.path))).map((e) => e.value))
    const legacySystem = system.replace(/\n<candidate_transcript>[\s\S]*?<\/candidate_transcript>/, `\n<candidate_transcript>\n${texts.join('\n')}\n</candidate_transcript>`)
    response = await legacyAuditConverse({ ...request, system: [{ text: legacySystem }] })
    if (process.env.PRISM_AUDIT_AI_FAULT === 'malformed') return response
    const result = JSON.parse(response.output.message.content[0].text)
    criteria.push(result.criteria.find((c) => c.criterion_id === criterion.criterion_id))
  }
  return { ...response, output: { ...response.output, message: { ...response.output.message, content: [{ text: JSON.stringify({ criteria }) }] } } }
}
