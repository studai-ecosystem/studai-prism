// Track 4.1 — multilingual assessment path (flag PRISM_LANG, default OFF).
//
// Languages: English (calibrated) + Hinglish, Hindi, Tamil (human decision
// 2026-07-05: Hindi + Tamil selected alongside Hinglish).
//
// CRITICAL DISCIPLINE (spec 4.1): rubric TRANSLATION is not rubric
// EQUIVALENCE. Every non-English session is marked provisional/uncalibrated
// in EVERY artifact (report, credential bundle, timeline, verify page) until
// the multilingual DIF study (docs/studies/MULTILINGUAL_DIF_PROTOCOL.md)
// reports on real data. Nothing in this module can change a score.

export const SUPPORTED_LANGUAGES = {
  en: {
    label: 'English',
    nativeLabel: 'English',
    asr: 'en', // ASR language hint
    scoringStatus: 'calibrated',
  },
  'hi-en': {
    label: 'Hinglish',
    nativeLabel: 'Hinglish (Hindi + English mix)',
    asr: null, // code-switched speech — let ASR auto-detect rather than force a script
    scoringStatus: 'provisional_uncalibrated',
  },
  hi: {
    label: 'Hindi',
    nativeLabel: 'हिन्दी',
    asr: 'hi',
    scoringStatus: 'provisional_uncalibrated',
  },
  ta: {
    label: 'Tamil',
    nativeLabel: 'தமிழ்',
    asr: 'ta',
    scoringStatus: 'provisional_uncalibrated',
  },
}

export function isLangEnabled() {
  return process.env.PRISM_LANG === 'true'
}

// Resolve an untrusted requested language to a supported code. English unless
// the flag is on AND the code is supported — a manipulated client can never
// switch scoring semantics via this field.
export function resolveLanguage(requested) {
  if (!isLangEnabled()) return 'en'
  const code = typeof requested === 'string' ? requested.trim().toLowerCase() : ''
  return Object.hasOwn(SUPPORTED_LANGUAGES, code) ? code : 'en'
}

// The provisional/uncalibrated marking every artifact must carry (spec 4.1).
export function scoringStatusFor(language) {
  return SUPPORTED_LANGUAGES[language]?.scoringStatus || 'provisional_uncalibrated'
}

// Speech-to-text language hint for a session language (null = auto-detect).
export function asrHintFor(language) {
  return SUPPORTED_LANGUAGES[language]?.asr ?? null
}

// Public list for the client language selector.
export function languageOptions() {
  return Object.entries(SUPPORTED_LANGUAGES).map(([code, l]) => ({
    code,
    label: l.label,
    nativeLabel: l.nativeLabel,
    provisional: l.scoringStatus !== 'calibrated',
  }))
}
