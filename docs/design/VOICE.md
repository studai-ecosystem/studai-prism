# Prism Voice & Microcopy Standard (Part A.3)

**Status: DRAFT pending human/legal review** — the consent and proctoring strings below are
compliance surfaces. Once a human signs off, these exact strings are canon: UI code must match
them byte-for-byte (enforced by `server/test/designSystem.test.js`), and changing any
legal-sensitive string requires bumping `CONSENT_VERSION` in `server/lib/sharedConstants.js`.

## Registers

**Candidate-facing:** calm, specific, second-person. Never chirpy, never emoji, never
consolation-prize copy. We tell them exactly what is happening and why.

- Yes: "Your conversation is scored by a panel of AI evaluators. Here's exactly how."
- No: "Great job!! 🎉" / "Oops, something went wrong 😅"

**Institution-facing:** precise, evidence-first. Claims carry their study N and date or they
don't ship (LAW 1).

**Buttons say what they do:** "Start the assessment", "Record my answer", "Request erasure" —
never "Continue", "OK", "Got it" where the action has consequences.

**Errors say what happened and what to do next.** Never apologize vaguely.

- Yes: "Your connection dropped. Your last answer was saved. Reconnecting — nothing is lost."
- No: "Sorry! Please try again later."

## Canonical strings — consent scopes (LIVE legal copy; version 2026-07-05.1)

These are the exact strings in `src/pages/Briefing.jsx` `CONSENT_ITEMS`. They are canon.

| scope | canonical string |
| --- | --- |
| data_processing | I consent to my responses being processed to generate my skills report. |
| ai_disclosure | I understand the interviewers are AI-generated characters, not real people. |
| ai_scoring_oversight | I understand my responses are scored by an AI system, and that I can request human review of my result. |
| proctoring | I consent to proctoring (tab-switch, paste and fullscreen-exit monitoring) during the session. |
| face_analysis | I consent to my webcam feed being analysed on my device during the session — including face detection, facial-landmark and gaze estimation, and detection of additional people — with the resulting integrity events (e.g. face absent, multiple faces, looking away) recorded with my session. |
| phone_camera_relay | If I link my phone as a second proctoring camera, I consent to its camera frames being relayed through Prism’s server to my desktop in real time. Frames are relayed in memory only and are not stored. |
| research_calibration | I consent to my assessment responses, scores, and interaction patterns (such as response timing, typing rhythm and revision counts — never recordings of my voice or keystrokes) being used, in pseudonymised form, for research and for calibrating and improving the scoring system. |
| own_work | I confirm this will be my own unaided work. |

## Canonical strings — proctoring notices (in-room)

- Camera on: "Your camera is on. Only integrity events are recorded — never video."
- Face lost: "We can't see you. Please stay in view of your camera. This was recorded as an integrity event."
- Multiple faces: "More than one person detected. You must take this test alone. This was recorded as an integrity event."
- Tab switch: "Leaving this tab was recorded as an integrity event. Return to the assessment to continue."
- Phone camera lost: "Your second camera went offline. The test will resume when it reconnects."

## Canonical strings — score-pending states

- Percentile pending: "Your percentile will appear once enough candidates have completed this assessment for a fair comparison. Your score is final; the comparison is what's pending."
- Trend pending (2 attempts): "Trend available after your next assessment."
- Scoring hold: "Your conversation is being scored: a panel of AI evaluators, then consistency checks, and sometimes a human reviewer. This can take up to 24 hours. We'll email you the moment it's ready."
- Provisional language: "Scoring in this language is provisional — it has not yet been calibrated against the English scale. Your report and credential will say so until our fairness study completes."

## Canonical strings — reliability labels

- high: "High reliability — the evaluation panel agreed closely on your performance."
- moderate: "Moderate reliability — the panel mostly agreed; small differences remain."
- low: "Low agreement — this result is eligible for human review at no cost to you."

## Canonical strings — dispute flow

- Entry: "Disagree with your result? Request a human review."
- Explainer: "A trained reviewer will re-score your conversation against the same rubric. Your score can go up, stay, or go down — the reviewer's decision is recorded with reasons."
- Submitted: "Your review request is in. A human reviewer will decide within 5 working days, and the decision and its reasoning will appear here."

## Canonical strings — erasure

- Explainer: "Erasure permanently deletes your responses, scores, telemetry and credential. A deleted credential can no longer be verified by anyone — including an employer you already shared it with."
- Confirm button: "Permanently erase my data"
