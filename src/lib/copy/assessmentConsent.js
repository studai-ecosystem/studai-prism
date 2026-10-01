// Formal assessment consent (DPDP / EU AI Act) for the V3 start. The wording
// and scope set are IDENTICAL to the legacy briefing (src/pages/Briefing.jsx)
// and share its CONSENT_VERSION, so every consent record stays traceable to
// the exact wording accepted. A test fails if the two ever drift.
export { CONSENT_VERSION } from '../../../server/lib/sharedConstants.js'

export const ASSESSMENT_CONSENT_ITEMS = Object.freeze([
  { scope: 'data_processing', label: 'I consent to my responses being processed to generate my skills report.' },
  { scope: 'ai_disclosure', label: 'I understand the interviewers are AI-generated characters, not real people.' },
  { scope: 'ai_scoring_oversight', label: 'I understand my responses are scored by an AI system, and that I can request human review of my result.' },
  { scope: 'proctoring', label: 'I consent to proctoring (tab-switch, paste and fullscreen-exit monitoring) during the session.' },
  { scope: 'face_analysis', label: 'I consent to my webcam feed being analysed on my device during the session — including face detection, facial-landmark and gaze estimation, and detection of additional people — with the resulting integrity events (e.g. face absent, multiple faces, looking away) recorded with my session.' },
  { scope: 'phone_camera_relay', label: 'If I link my phone as a second proctoring camera, I consent to its camera frames being relayed through Prism\u2019s server to my desktop in real time. Frames are relayed in memory only and are not stored.' },
  { scope: 'research_calibration', label: 'I consent to my assessment responses, scores, and interaction patterns (such as response timing, typing rhythm and revision counts — never recordings of my voice or keystrokes) being used, in pseudonymised form, for research and for calibrating and improving the scoring system.' },
  { scope: 'own_work', label: 'I confirm this will be my own unaided work.' },
])
