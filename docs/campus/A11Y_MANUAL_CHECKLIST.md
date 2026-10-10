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

## Addendum 2026-10-11 — PROD-READY Phase 10 (surfaces added in Phases 4–9, HA-C013)

Appended by PROD-READY Phase 10; the tables above are unchanged. Automated
evidence recorded in [PROD_READY_STATE.md](../production/PROD_READY_STATE.md)
(not re-run here):

| # | Check | Scope | Evidence | Status |
| --- | --- | --- | --- | --- |
| A12 | Support paths render and work flag-on | review request, adjustment request, identity check | `tests/e2e/prod-p04-support-routes.spec.js` (chromium), vitest `support.test.jsx` | PASS (Phase 4) |
| A13 | Demo banner: axe, no overflow at 360/768/1280 | app shells | `tests/e2e/prod-p08-demo-banner.spec.js` (chromium, mobile-chromium) | PASS (Phase 8) |
| A14 | Campus P3 UX items: axe 0 serious/critical, no overflow at 360/768/1280 | analytics tabs, missions, data tables | `tests/e2e/prod-p08-ux-polish.spec.js` | PASS (Phase 8) |
| A15 | Employer workspace journey: axe 0 serious/critical, no overflow | employer pages, employee consent | `tests/e2e/prod-p09-employer-lnd.spec.js` (chromium) | PASS (Phase 9) |

Manual rows to add to section 2 (PENDING, human — HA-C013):

| # | Check | How | Status |
| --- | --- | --- | --- |
| M9 | Screen reader: report review request, adjustment request and identity check | NVDA + Firefox, VoiceOver + Safari | PENDING |
| M10 | Screen reader and keyboard: guardian consent page `/guardian-consent/:token` (agree, decline, withdraw) — only if HA-006 chooses guardian consent | NVDA + Chrome, VoiceOver iOS | PENDING |
| M11 | Demo banner announced once and not repeated on every navigation | NVDA + Chrome | PENDING |
| M12 | Employer staff pages (overview, people, shared reports, group summaries) with a screen reader and at 400% zoom | NVDA + Chrome | PENDING |
| M13 | Employee joining an employer workspace: disclosure, prohibited-use list and acknowledgement with a screen reader and voice control | NVDA + Firefox, Voice Access | PENDING |

Materials: [RUNBOOK_CURRENCY_REVIEW.md](../production/human-actions/RUNBOOK_CURRENCY_REVIEW.md).
