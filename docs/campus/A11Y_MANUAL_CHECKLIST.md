# Prism Campus — Accessibility Checklist (critical journeys)

Phase 12, C12.06 (spec §42, §48.5, §52), 2026-09-26. Target: WCAG 2.2 AA.
"Automated" rows were executed by the agent with Playwright + axe-core
(chromium 1440×900 and mobile-chromium Pixel 7). "Manual" rows need a person
with assistive technology and are **PENDING** (HA-C013) — the agent does not
mark them done.

## 1. Automated (executed)

| # | Check | Journeys / routes | Evidence | Result |
| --- | --- | --- | --- | --- |
| A1 | axe-core: no serious or critical violations | every campus admin route (16), student campus routes (4), rater page; plus the Journey A–E, analytics, development, growth, shell and student specs | `tests/e2e/campus-a11y-sweep.spec.js` + each `campus-*.spec.js` (`expectNoSeriousAxe`) | PASS (chromium + mobile-chromium) |
| A2 | No horizontal overflow at the viewport | same routes, desktop and mobile | `expectNoHorizontalOverflow` | PASS |
| A3 | Every page has one visible h1 | same routes | sweep spec | PASS |
| A4 | Skip link is the first tab stop and moves focus to `main` (mandatory: the sweep fails if a campus page has none) | campus + student shells | sweep spec `keyboardCheck`, `campus-shell.spec.js` | PASS |
| A5 | Keyboard focus always lands on a visible element (first 6 tab stops per route). This checks the focused element is visible; it does not measure the focus ring's contrast (covered by the design-system `focus-visible` token, and by M6 in forced-colors) | same routes | sweep spec | PASS |
| A6 | Form errors are announced (`role=alert`), fields `aria-invalid` + described | import, assign, reports target, privacy threshold, usage download, rating | vitest suites (`analytics.test.jsx`, `billing.test.jsx`, `EvidenceRatingPage.test.jsx`, campus admin tests) | PASS |
| A7 | Every chart has a table equivalent in the accessibility tree | analytics, overview, reports, growth | `analytics.test.jsx`, `growth.test.jsx` | PASS |
| A8 | Status never by colour alone (text + marker) | status chips, heatmap cells ("X of N"), seat counts | `Badge.jsx` StatusChip; UX audit P10 | PASS |
| A9 | Focus moves to new content after an action (report generated, dialog opened, next rating item) | reports, dialogs, rater page | `campus-analytics.spec.js` (`toBeFocused`), Modal tests | PASS |
| A10 | Reduced motion respected | app shell | design tokens + `prefers-reduced-motion` CSS | PASS (code review) |
| A11 | Keyboard-only walkthroughs, no mouse (every control reached with Tab, focus asserted on it, operated with Enter / Space / typing): Journey C (create cohort, create program with the cohort, assign an assessment through the wizard), Journey B (student acknowledges the disclosure and accepts the invitation), Journey E (consent, begin, answer, connection drop, reconnect) | admin + student + workspace | `tests/e2e/campus-keyboard.spec.js` | PASS (chromium, firefox, mobile-chromium; WebKit with links focused directly, because WebKit keeps links out of the Tab order like Safari's default — K105) |

## 2. Manual (PENDING, human — HA-C013)

| # | Check | How | Status |
| --- | --- | --- | --- |
| M1 | Screen reader walkthrough of Journey B (join campus, disclosure, sponsored assessment) | NVDA + Firefox, VoiceOver + Safari (macOS and iOS) | PENDING |
| M2 | Screen reader walkthrough of Journey C (admin: cohort, import, program, assign, monitor, analytics) | NVDA + Chrome | PENDING |
| M3 | Assessment workspace with a screen reader, including network interruption (Journey E) | NVDA + Chrome | PENDING |
| M4 | Keyboard-only on real hardware and OS focus settings for the steps not covered by A11 (CSV file picker in the import, PDF download, Journey A legacy pages), and Safari with "Press Tab to highlight each item" on and off (Option+Tab to links) | Windows + macOS | PENDING |
| M5 | 200% and 400% zoom / 320 CSS px reflow on report, analytics and billing pages | Chrome + Safari | PENDING |
| M6 | Windows high-contrast / forced-colors mode | Edge | PENDING |
| M7 | Voice control (select links and radios by label) on the rater page and consent screens | Voice Access / Voice Control | PENDING |
| M8 | Usability session with students who use assistive technology (accommodations policy) | moderated | PENDING |
