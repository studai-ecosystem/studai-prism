// PDF export for Student Report V3 (spec §14.5). Built only from the
// validated structured report — plain text lines, never HTML — so nothing
// the API did not return can appear, and nothing can be injected.
const MARGIN = 48
const WIDTH = 595 - MARGIN * 2
const LINE = 14

export function reportPdfLines(report, { visibility = null, versionNumber = null, identityText = null } = {}) {
  const lines = []
  const h = report.header
  lines.push({ text: 'Prism report', size: 18, bold: true })
  if (h.candidateName) lines.push({ text: h.candidateName, size: 12 })
  lines.push({ text: `${h.assessment.title}${h.scenarioTitle && h.scenarioTitle !== h.assessment.title ? ` — ${h.scenarioTitle}` : ''}`, size: 11 })
  if (h.sponsor) lines.push({ text: `Sponsored by ${h.sponsor.name}`, size: 10 })
  if (h.completedAt) lines.push({ text: `Completed ${new Date(h.completedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`, size: 10 })
  if (identityText) lines.push({ text: identityText, size: 10 })
  if (versionNumber) lines.push({ text: `Report version ${versionNumber}`, size: 10 })
  if (visibility) lines.push({ text: visibility, size: 10 })
  lines.push({ text: '', size: 10 })
  if (report.plainStatement) {
    lines.push({ text: report.plainStatement, size: 11 })
    lines.push({ text: '', size: 10 })
  }
  lines.push({ text: 'Capabilities', size: 14, bold: true })
  for (const c of report.summary.capabilities) {
    lines.push({ text: c.displayLabel ? `${c.displayLabel} (${c.name})` : c.name, size: 12, bold: true })
    lines.push({ text: c.level ? `Observed level: ${c.level.label} (provisional label)` : 'Not enough evidence to describe', size: 10 })
    lines.push({ text: c.summary.text, size: 10 })
  }
  const moments = report.moments || []
  if (moments.length) {
    lines.push({ text: '', size: 10 })
    lines.push({ text: 'Moments that mattered', size: 14, bold: true })
    for (const m of moments) {
      lines.push({ text: `${m.capability.displayLabel || m.capability.name}: ${m.observedBehavior}`, size: 10, bold: true })
      lines.push({ text: `Where: ${m.context}`, size: 10 })
      lines.push({ text: `Your words: "${m.quote}"`, size: 10 })
      if (m.nextBehavior) lines.push({ text: `A next behaviour: ${m.nextBehavior}`, size: 10 })
    }
  }
  if (report.evidence.length) {
    lines.push({ text: '', size: 10 })
    lines.push({ text: 'Evidence', size: 14, bold: true })
    for (const e of report.evidence) {
      lines.push({ text: `${e.capability.name}: ${e.claim}`, size: 10, bold: true })
      if (e.candidateAction.quote) lines.push({ text: `Your words: "${e.candidateAction.quote}"`, size: 10 })
      if (e.rubricAnchor) lines.push({ text: `Described behaviour: ${e.rubricAnchor.criteria}`, size: 10 })
    }
  }
  if (report.development?.priorities.length) {
    lines.push({ text: '', size: 10 })
    lines.push({ text: 'Development priorities', size: 14, bold: true })
    report.development.priorities.forEach((p, i) => {
      lines.push({ text: `${i + 1}. ${p.name}`, size: 11, bold: true })
      lines.push({ text: p.claim, size: 10 })
      if (p.behaviorToImprove) lines.push({ text: `Next step: ${p.behaviorToImprove}`, size: 10 })
    })
  }
  lines.push({ text: '', size: 10 })
  lines.push({ text: 'Levels are provisional labels. There is no single overall score and no ranking.', size: 9 })
  lines.push({ text: `Report ${report.builderVersion} · rules ${report.methodology.sufficiencyRulesVersion}`, size: 8 })
  return lines
}

export async function downloadReportPdf(report, options = {}) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  let y = MARGIN
  for (const line of reportPdfLines(report, options)) {
    doc.setFont('helvetica', line.bold ? 'bold' : 'normal')
    doc.setFontSize(line.size)
    const wrapped = line.text ? doc.splitTextToSize(line.text, WIDTH) : ['']
    for (const w of wrapped) {
      if (y > 842 - MARGIN) { doc.addPage(); y = MARGIN }
      doc.text(w, MARGIN, y)
      y += Math.max(LINE, line.size + 4)
    }
  }
  doc.save(`prism-report-${report.sessionId}.pdf`)
}
