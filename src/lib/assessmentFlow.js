// Prism assessment flow — the 30-minute staged timeline.
//
// The timer counts DOWN from DURATION_SECONDS, so each stage is keyed to
// `atSecond` = seconds ELAPSED since the conversation began.
//
// This is the single source of truth for the staged experience. Features are
// added "one by one": set `overlay` to the component key once it is built.
// Stages without an overlay simply drive the conversation + the progress label.

export const DURATION_SECONDS = 10 * 60 // 10 minutes (temporary — revert to 30 * 60 later)

// Spoken question types for the voice-only test. The candidate hears the avatar
// ask the question (TTS) and answers by speaking into the mic; the audio is
// transcribed server-side (Whisper) and fed into the AI loop. `answerSeconds`
// is the suggested speaking window the UI can enforce per type (null = open).
export const SPOKEN_QUESTION_TYPES = {
  speaking:  { id: 'speaking',  label: 'Speaking',  answerSeconds: null, hint: 'Speak your answer naturally.' },
  listening: { id: 'listening', label: 'Listening', answerSeconds: null, hint: 'Listen to the passage, then answer aloud.' },
  repeat:    { id: 'repeat',    label: 'Repeat',    answerSeconds: 30,   hint: 'Repeat the sentence exactly as you heard it.' },
  describe:  { id: 'describe',  label: 'Describe',  answerSeconds: 60,   hint: 'Describe the image on screen for 60 seconds.' },
  opinion:   { id: 'opinion',   label: 'Opinion',   answerSeconds: 90,   hint: 'Give your opinion on the topic for 90 seconds.' },
  decision:  { id: 'decision',  label: 'Decision',  answerSeconds: 90,   hint: 'Pick one option and defend it aloud.' },
}

export const ASSESSMENT_FLOW = [
  { id: 'scenario',  atSecond: 0,       label: 'Scenario Briefing', overlay: 'scenario_card' }, // ✅ shown up front
  { id: 'intro',     atSecond: 1,       label: 'Conversation',      overlay: null },
  { id: 'timed',     atSecond: 10 * 60, label: 'Timed Question',    overlay: null },             // ⏳ next
  { id: 'decision',  atSecond: 13 * 60, label: 'Decision Moment',   overlay: null },             // ⏳ next
  { id: 'pushback',  atSecond: 17 * 60, label: 'Challenge',         overlay: null },
  { id: 'writing',   atSecond: 20 * 60, label: 'Writing Task',      overlay: null },             // ⏳ next
  { id: 'listening', atSecond: 23 * 60, label: 'Listening Task',    overlay: null },             // ⏳ next
  { id: 'wrapup',    atSecond: 26 * 60, label: 'Wrap-up',           overlay: null },
]

// The stage the candidate is currently in, given seconds elapsed.
export function currentStage(elapsedSeconds) {
  let stage = ASSESSMENT_FLOW[0]
  for (const s of ASSESSMENT_FLOW) {
    if (elapsedSeconds >= s.atSecond) stage = s
  }
  return stage
}

// Stages whose overlay should fire at or before the given elapsed time.
export function overlayStagesDue(elapsedSeconds) {
  return ASSESSMENT_FLOW.filter((s) => s.overlay && elapsedSeconds >= s.atSecond)
}
