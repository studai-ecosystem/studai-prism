// Prism assessment flow — the 30-minute staged timeline.
//
// The timer counts DOWN from DURATION_SECONDS, so each stage is keyed to
// `atSecond` = seconds ELAPSED since the conversation began.
//
// This is the single source of truth for the staged experience. Features are
// added "one by one": set `overlay` to the component key once it is built.
// Stages without an overlay simply drive the conversation + the progress label.

export const DURATION_SECONDS = 30 * 60 // 30 minutes

export const ASSESSMENT_FLOW = [
  { id: 'intro',     atSecond: 0,    label: 'Conversation',      overlay: null },
  { id: 'scenario',  atSecond: 7 * 60,  label: 'Scenario Briefing', overlay: 'scenario_card' }, // ✅ built
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
