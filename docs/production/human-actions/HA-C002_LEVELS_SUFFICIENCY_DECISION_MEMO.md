# HA-C002 — Decision memo: capability level labels and sufficiency thresholds

PROD-READY Phase 10. **DRAFT memo — no value here is approved.** The decision
belongs to the psychometrics lead (register row HA-C002 in
[CAMPUS_HUMAN_ACTIONS.md](../../campus/CAMPUS_HUMAN_ACTIONS.md); spec §20.2,
§33.2). Engineering lists the values in the code today, what each one changes
in reports, and what data is needed to revisit them. No study result exists
for any of these values; they are engineering defaults chosen to fail closed
(decision K35 in [CAMPUS_PROGRAM_STATE.md](../../campus/CAMPUS_PROGRAM_STATE.md)).

Line numbers refer to branch `prod/p10-human-actions` (2026-10-11).

## 1. Headline

The shipped rules carry `calibration_state: 'UNCALIBRATED'` and
`approval_status: 'PROVISIONAL'`. Because of that `evaluateCapability`
**can never return SUFFICIENT** (`server/domain/evidence/sufficiency.js:69-70`).
PROVISIONAL is the highest status any capability reaches today. Everything
that depends on SUFFICIENT is therefore unreachable:

- growth comparison (`server/domain/growth/snapshot.js:24-25`);
- report claim status `SUPPORTED` (`server/domain/reports/v3/build.js:114,123,135`);
- SUFFICIENT counts in campus analytics, employer summaries and the pilot
  technical report (always 0).

Approving HA-C002 means approving **values** and also switching
`calibration_state` to `CALIBRATED` and `approval_status` to `APPROVED`
(with a new `SUFFICIENCY_RULES_VERSION`). Engineering implements that in a
reviewed change after the signed decision; the campus claims
CAMPUS-LEVEL-LABELS and CAMPUS-SUFFICIENCY stay PENDING until then
([CAMPUS_CLAIMS_REGISTER.md](../../campus/CAMPUS_CLAIMS_REGISTER.md)).

## 2. Current values (exact, from code)

### 2.1 Level labels — `server/domain/evidence/levels.js`

| Constant | Value | Line |
| --- | --- | --- |
| `LEVEL_LABELS_STATUS` | `'PROVISIONAL'` | 6 |
| `EVIDENCE_STATUSES` | `INSUFFICIENT_EVIDENCE`, `PROVISIONAL`, `SUFFICIENT`, `HUMAN_REVIEW_REQUIRED` | 8 |
| `CAPABILITY_LEVELS[0]` | band `INSUFFICIENT` → `INSUFFICIENT_EVIDENCE_LABEL` = `'Insufficient evidence'` (`server/lib/sharedConstants.js:55`) | 12 |
| `CAPABILITY_LEVELS[1]` | band `EARLY` → `'Early evidence'` | 13 |
| `CAPABILITY_LEVELS[2]` | band `DEVELOPING` → `'Developing'` | 14 |
| `CAPABILITY_LEVELS[3]` | band `DEMONSTRATED` → `'Demonstrated'` | 15 |
| `CAPABILITY_LEVELS[4]` | band `STRONG` → `'Strongly demonstrated'` | 16 |

### 2.2 Cut points (rubric median → band) — `bandForRubricLevel`, `levels.js:21-27`

The rubric is the 1–5 anchored rubric; the input is the **median** rubric
level of the capability's eligible evidence units (`sufficiency.js:72-74`).

| Rubric median | Band | Line |
| --- | --- | --- |
| not a finite number | `INSUFFICIENT` | 22 |
| ≥ 4.5 | `STRONG` | 23 |
| ≥ 3.5 and < 4.5 | `DEMONSTRATED` | 24 |
| ≥ 2.5 and < 3.5 | `DEVELOPING` | 25 |
| < 2.5 | `EARLY` | 26 |

### 2.3 Sufficiency rules — `server/domain/evidence/sufficiencyRules.js`

| Rule | Value | Line | Read by |
| --- | --- | --- | --- |
| `SUFFICIENCY_RULES_VERSION` | `'sufficiency-rules.v1-provisional'` | 5 | every decision (`sufficiency.js:46`) |
| `minimum_evidence_units` | 3 | 8 | `sufficiency.js:57` → INSUFFICIENT_EVIDENCE below it |
| `minimum_independent_opportunities` | 2 | 9 | `sufficiency.js:58` → INSUFFICIENT_EVIDENCE below it |
| `required_anchor_coverage` | 1 | 10 | `sufficiency.js:64` → PROVISIONAL below it |
| `minimum_judge_agreement` | 0.7 | 11 | `sufficiency.js:66` → PROVISIONAL (capability mean); `evidenceUnit.js:103-106` → a unit below it is HUMAN_REVIEW_REQUIRED |
| `minimum_evidence_quality` | `'JUDGED_WITH_PROVENANCE'` | 12 | **not read** by `sufficiency.js` (eligibility is coded at `sufficiency.js:26-30`: a finite rubric level, a candidate action, provenance) |
| `calibration_state` | `'UNCALIBRATED'` | 13 | `sufficiency.js:69` → reason `RUBRIC_NOT_CALIBRATED` |
| `human_review_requirement` | `'ON_DISAGREEMENT'` | 14 | `sufficiency.js:49` → any unit needing review makes the capability HUMAN_REVIEW_REQUIRED |
| `approval_status` | `'PROVISIONAL'` | 15 | `sufficiency.js:70` → reason `RULES_NOT_APPROVED` |
| `CAPABILITY_RULE_OVERRIDES` | `{}` (none approved) | 19 | `rulesFor` (34-36) |
| `RULE_FLOORS` | `minimum_evidence_units: 3`, `minimum_independent_opportunities: 2` | 23 | `withFloors` (25-32): no value may go below a floor |

Independent opportunities are counted by `opportunityGroup`, else
`source_turn`, else `source_artifact_id`, else the evidence id
(`sufficiency.js:16-21`). There is no separate "distinct scenario / form" rule.

### 2.4 Related governed values the decision touches

| Value | Where | Note |
| --- | --- | --- |
| `DEMONSTRATED_FLOOR = 3` (rubric level) | `server/domain/development/recommendations.js:12` | Behaviour-level practice gaps are units with `rubric_level < 3`; independent of the 3.5 cut point |
| `BAND_ORDER` `{EARLY:0, DEVELOPING:1, DEMONSTRATED:2, STRONG:3}` | `server/domain/reports/v3/build.js:23`, `server/domain/growth/snapshot.js:8`, `server/domain/student/readModels.js:22` | Hard-coded in three places; a band added or renamed must change all three |
| `NEEDS_METHOD` text naming `"Demonstrated"` | `server/domain/analytics/service.js:26` | Hard-coded label; not derived from `CAPABILITY_LEVELS` |
| Pilot report `levelLabels: 'PROVISIONAL (HA-C002)'` | `server/domain/pilotReport/service.js:176` | Hard-coded; not read from `LEVEL_LABELS_STATUS` |
| Client display fallbacks | `src/lib/copy/evidence.js:47-54` (`LEVEL_BAND_LABELS`), `src/lib/copy/report.js:11` (`mapBands`) | Same four labels duplicated; the server copy normally wins |
| PDF line "Observed level: … (provisional label)" | `src/lib/reportPdf.js:27`, `:60` | Wording changes if labels are approved |
| Rubric version for the V3 rating queue | `RATING_RUBRIC_VERSION = 'evidence-rubric.v1-provisional'` (`server/domain/validation/ratingQueue.js:9`) | The rubric itself is provisional (HA-C008) |
| Minimum group size | `DEFAULT_MIN_GROUP_SIZE = 10`, `MIN_GROUP_FLOOR = 5` (`server/domain/analytics/service.js:17-18`) | Not part of HA-C002 (that is HA-C010), listed because it decides which of the cells below are shown |

## 3. What each choice changes in reports

Two different timing rules apply, and the decision should know them:

- **Student reports are pinned.** A V3 run stores its rules at allocation
  (`server/domain/assessments/frozenMethod.js:54-58`), and the report builder
  uses the pinned rules (`server/domain/reports/v3/build.js:82-91`). Issued
  report versions are immutable, and student read models read the stored
  version (`server/domain/student/readModels.js:40-75`). A change affects
  **new** runs (and unpinned legacy runs) only.
- **Analytics are recomputed live.** Campus analytics, employer group
  summaries and the pilot technical report recompute decisions with the
  current rules (`server/domain/growth/entries.js:35`, through the decision
  cache `server/domain/campusStore/context.js:165-179`). A change **re-buckets
  historical sessions at once**. The decision cache fingerprints every rule
  and label constant (`server/domain/analytics/decisionCache.js:80-89`), so
  cached rows are invalidated automatically.

| Choice | Student report V3 (`reports/v3/build.js`) | Legacy V2 report (`lib/reportV2.js`) | Growth (`growth/snapshot.js`, `growth/service.js`) | Campus analytics + employer summaries (`analytics/service.js`, `employer/service.js:196-219`) | Pilot technical report (`pilotReport/service.js`) | Development recommendations (`development/recommendations.js`) |
| --- | --- | --- | --- | --- | --- | --- |
| **Label text** | New versions show the new text on cards, priorities and development-claim text (":… placed it at Developing", 129-138). Stored versions keep the old text | Claim text `${name}: ${label}.` (84-88) | `from`/`to` use the **current** label (`snapshot.js:35-36`), even for older snapshots | `bucketLabels` change (`analytics/service.js:20,170`); `NEEDS_METHOD` text does not (hard-coded) | Band table headings | None (works on bands) |
| **Cut points (2.5 / 3.5 / 4.5)** | Band moves; decides development priority (EARLY/DEVELOPING, 22, 129-138), priority order (202-205), STRETCH page state (`readModels.js:190-193`) | STRENGTH (DEMONSTRATED/STRONG) vs DEVELOPMENT_NEED (EARLY/DEVELOPING) claims (18-20) | Direction HIGHER/SAME/LOWER changes | Students move between buckets; `topNeeds` / employer `developmentFocus` change (167-179) | Band cells and their suppression change (132-146) | Capabilities move into or out of PRACTICE priorities and STRETCH gaps (21-43) |
| **`minimum_evidence_units` / `minimum_independent_opportunities` up** | More capabilities INSUFFICIENT_EVIDENCE: no level, absence text (140), possibly a bounded observation (229-250) | Overall status INSUFFICIENT_EVIDENCE more often (106) | Fewer comparable capabilities | More students in the INSUFFICIENT bucket; `sufficiency()` counts shift (182-198) | INSUFFICIENT cells and rate grow | Gaps move from priorities to bounded observations |
| **Down** | Not possible below the floors 3 / 2 (`sufficiencyRules.js:23`) | — | — | — | — | — |
| **`minimum_judge_agreement` (0.7)** | Units below it are HUMAN_REVIEW_REQUIRED (`evidenceUnit.js:103-106`), which makes the whole capability HUMAN_REVIEW_REQUIRED (no level) under `ON_DISAGREEMENT`; raising it sends more to review; lowering it lets more through as PROVISIONAL/SUFFICIENT | Same via `lib/evidenceGraph.js:118-147` | Fewer/more SUFFICIENT pairs | Review counts in `sufficiency()` (`insufficient` = INSUFFICIENT_EVIDENCE + HUMAN_REVIEW_REQUIRED) | Same | Fewer/more priorities |
| **`required_anchor_coverage` (1)** | Below it: PROVISIONAL, never SUFFICIENT | — | Gate on SUFFICIENT | PROVISIONAL count | PROVISIONAL cell | — |
| **`human_review_requirement`** | `'NEVER'` would stop disagreement from blocking a level (not recommended without a study) | — | — | — | — | — |
| **`calibration_state` → `CALIBRATED` + `approval_status` → `APPROVED`** | Capabilities meeting every rule become SUFFICIENT; claims become `SUPPORTED` | Still never SUFFICIENT overall (106) | Growth comparison becomes possible (still needs an APPROVED form pair, HA-C004, and the same rules version) | SUFFICIENT counts become non-zero | SUFFICIENT shown for the first time | — |
| **New `SUFFICIENCY_RULES_VERSION`** | Stamped in methodology (349-353) | Stamped (107) | Pairs across versions are not comparable: `DIFFERENT_EVIDENCE_RULES` (`snapshot.js:27-28`) | Cache invalidated | — | — |

Tests that pin today's values and must change, with a reason recorded, in the
implementing change: `server/test/evidenceSufficiency.test.js` (labels and
band mapping at :176-182; thresholds and floors at :99-162),
`server/test/growthEligibility.test.js:54`, `server/test/campusGrowth.test.js:202,263`,
`server/test/pilotReport.test.js:158` ("never SUFFICIENT under uncalibrated rules"),
`server/test/campusAnalytics.test.js:120,186`, `server/test/campusScale.test.js:182`,
`server/test/evidenceAudit.db.test.js:32` (rules version string), and the
frontend tests that hard-code label strings (`src/features/reports/reports.test.jsx`,
`src/components/evidence/evidenceSystem.test.jsx`, `src/features/growth/growth.test.jsx`,
`src/features/employer/employer.test.jsx` and others). Also
`server/test/campusClaims.test.js`, which requires HA-C002 to stay `OPEN`
while the CAMPUS-LEVEL-LABELS / CAMPUS-SUFFICIENCY claims are PENDING.

## 4. Data needed to revisit (none of it exists yet)

| Question | Data needed | Source / dependency | Today |
| --- | --- | --- | --- |
| Are the labels the right words for the bands? | Standard-setting study (e.g. bookmark or contrasting groups) with SMEs; student and staff comprehension check of the label wording | HA-011 (SME workshops), HA-008 (psychometrician) | Not started |
| Where should the cut points sit? | Human-rated sessions per capability with level judgements; distribution of rubric medians in real pilot data | HA-009/HA-010 (raters), HA-C008 (rating queue), a pilot | 0 raters; no real V3 sessions |
| Is 3 units / 2 opportunities enough? | Reliability of the capability decision vs number of units (e.g. split-half or generalisability analysis), decision consistency across retest | HA-013 (S3 retest), HA-C008 | Not started |
| Is 0.7 judge agreement the right gate? | AI judge vs human agreement per capability (`evidence_agreement_v3`, `MIN_PAIRS = 30` per coefficient, `server/domain/validation/agreement.js:9`) | HA-C008, HA-009/HA-010 | No double-rated items |
| Can the rubric be called calibrated? | Calibration evidence for the 1–5 rubric anchors (`evidence-rubric.v1-provisional`) | HA-C008, HA-011 | Not started |
| Do decisions differ unfairly across groups? | DIF / fairness review on a consented sample | HA-C008, HA-005, HA-012 | Not started |
| Operational floors | POWER_ANALYSIS_FRAMEWORK_v1 floors (e.g. S2 ≥ 100 double-rated sessions, ≥ 4 qualified raters) — operational minimums to be ratified by the psychometrician | HA-008 | Not ratified |

## 5. Options (for the psychometrics lead)

1. **Keep everything PROVISIONAL** (today). Reports stay honest: levels are
   labelled provisional and nothing is SUFFICIENT; growth stays off. No
   engineering change.
2. **Approve the labels only** (wording), keep thresholds provisional. Text
   changes in new reports and analytics; statuses unchanged. Claim
   CAMPUS-LEVEL-LABELS still needs the standard-setting evidence.
3. **Approve labels, cut points and thresholds with evidence**, switch to
   `CALIBRATED` + `APPROVED` under a new rules version. Unlocks SUFFICIENT,
   `SUPPORTED` claims and (with HA-C004) growth.

## 6. Decision record (to be completed by humans)

| Field | Value |
| --- | --- |
| Option | `______` |
| Approved labels (exact text per band) | `______` |
| Approved cut points | `______` |
| Approved rule values (each rule in §2.3) | `______` |
| Evidence relied on (study ids / `study_results` rows) | `______` |
| New rules version id | `______` |
| Signed by (psychometrics lead) / date | `______` |

Until this is signed, HA-C002 stays `OPEN` in the campus register.
