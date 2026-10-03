// Bounded personalisation guard for private preparation (P7.2). Learner text
// is untrusted data; this classifier only decides whether Prism should
// rehearse the situation at all, and whether a scoped limitation must be
// shown. Deterministic word lists: nothing here calls a model.
//   REFUSED  — harassment, coercion, deception, unauthorised disclosure,
//              or a crisis: no rehearsal, a bounded explanation instead.
//   LIMITED  — specialised legal or medical matters: the rehearsal may run,
//              but Prism says plainly that it is not professional advice.
//   OK       — ordinary workplace conversation, including firm disagreement.

const RULES = [
  { category: 'CRISIS', kind: 'REFUSED', rx: /\b(suicid\w*|kill (myself|himself|herself|themselves)|self[- ]harm\w*|end (my|their) life|hurt (myself|someone)|assault\w*|violen\w+)\b/i },
  { category: 'HARASSMENT', kind: 'REFUSED', rx: /\b(humiliat\w+|intimidat\w+|threaten\w* (him|her|them|to (hurt|expose|get|ruin))|bully\w*|harass\w*|get (him|her|them) fired|make (him|her|them) (cry|feel small|look stupid))\b/i },
  { category: 'COERCION', kind: 'REFUSED', rx: /\b(coerc\w+|blackmail\w*|or else\b|force (him|her|them) to (sign|agree|accept)|no matter what (he|she|they) say)\b/i },
  { category: 'DECEPTION', kind: 'REFUSED', rx: /\b(lie to|lying to|mislead\w*|deceiv\w+|cover up|cover-up|falsif\w+|fake (the|a|an)\b|hide the (truth|mistake|bug|defect|delay|error) from|pretend (that )?(it|we|i) (never|did not|didn't))\b/i },
  { category: 'UNAUTHORIZED_DISCLOSURE', kind: 'REFUSED', rx: /\b(leak\w*|disclose|reveal|share|forward|expose)\b[^.]{0,60}\b(confidential|salar(y|ies)|password\w*|credential\w*|personal data|customer data|client data|medical record\w*|private (file|message|email)s?)\b/i },
  { category: 'LEGAL', kind: 'LIMITED', rx: /\b(lawsuit|sue\b|suing|lawyer\w*|attorney\w*|legal (action|advice|claim)|court\b|tribunal\w*|statutory|contract law|terminat\w+ notice|wrongful dismissal)\b/i },
  { category: 'MEDICAL', kind: 'LIMITED', rx: /\b(diagnos\w+|medication\w*|prescri\w+|medical (advice|condition|leave)|mental health|therap(y|ist)|symptom\w*|psychiatr\w+)\b/i },
]

export const REFUSAL_COPY = Object.freeze({
  CRISIS: 'This sounds like a situation that needs real help now, not a rehearsal. Please contact local emergency services or someone you trust. Prism cannot prepare this conversation.',
  HARASSMENT: 'Prism does not rehearse ways to humiliate, intimidate or harass another person. It can help you prepare a firm, respectful conversation about the same problem.',
  COERCION: 'Prism does not rehearse pressuring someone into agreeing against their will. It can help you prepare a clear request with the trade-offs named.',
  DECEPTION: 'Prism does not rehearse misleading or covering something up. It can help you prepare an honest account of what happened and what you propose.',
  UNAUTHORIZED_DISCLOSURE: 'Prism does not rehearse sharing confidential or personal information that is not yours to share. Leave that detail out and describe the conversation in general terms.',
})

export const LIMITATION_COPY = Object.freeze({
  LEGAL: 'This touches a legal matter. The rehearsal practises the conversation only; it is not legal advice, and a qualified adviser should handle the legal questions.',
  MEDICAL: 'This touches a medical or health matter. The rehearsal practises the conversation only; it is not medical advice, and a qualified professional should handle the health questions.',
})

// classifyPreparationText(text) → { kind: 'OK' } | { kind: 'REFUSED', category, message } | { kind: 'LIMITED', category, message }
// REFUSED wins over LIMITED when both match.
export function classifyPreparationText(text) {
  const t = String(text ?? '')
  const hits = RULES.filter((r) => r.rx.test(t))
  const refused = hits.find((h) => h.kind === 'REFUSED')
  if (refused) return { kind: 'REFUSED', category: refused.category, message: REFUSAL_COPY[refused.category] }
  const limited = hits.find((h) => h.kind === 'LIMITED')
  if (limited) return { kind: 'LIMITED', category: limited.category, message: LIMITATION_COPY[limited.category] }
  return { kind: 'OK' }
}
