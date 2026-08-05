# POWER-ANALYSIS INPUT FRAMEWORK v1

**DRAFT — inputs framework only (charter §17). The analyses themselves are
human/data-gated (HA-008, HA-013); running them requires real sessions.
Nothing here is a sample-size promise or a study result.**

## Purpose

Before any validity study is declared adequately powered, its minimum-n must
be computed from these declared inputs — never assumed. Underpowered results
are labelled UNDERPOWERED wherever surfaced (existing convention: DIF jobs,
§15 suppression).

## Standard inputs per study

| Input | Convention |
| --- | --- |
| Effect size of interest | declared in the preregistered protocol, not post hoc |
| α | 0.05 two-sided unless the protocol states otherwise |
| Target power | 0.80 minimum; 0.90 for gate-flipping claims |
| Design | per protocol (paired for retest; clustered by cohort where applicable) |
| Attrition/exclusion allowance | declared %, from pilot operations data |

## Existing per-study floors (already coded, kept honest)

| Study | Current floor | Where enforced |
| --- | --- | --- |
| S2 human–AI agreement | ≥100 double-rated sessions; ≥4 qualified raters | pilot dashboard gates |
| S3 retest | ≥30 retest pairs | dashboard + retest job `insufficient_data` |
| DIF / fairness | ≥150 per language group; ≥10 per demographic cell (suppression) | dif_audit + fairnessResearch lib |
| Conformal calibration | ≥30 calibration / ≥100 total | dashboard gates |
| Transfer correlation | n ≥ 30 | transfer_corr job |

These floors are OPERATIONAL minimums, not power claims: the psychometrician
(HA-008) must replace or ratify them with computed values from this
framework before any adequacy claim is made.

## Reporting rule

Every analysis output must state: n available, floor/required n, and either
`adequately_powered: true` with the computation reference, or
`UNDERPOWERED` — there is no third state.
