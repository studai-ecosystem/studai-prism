# RATER MANUAL DRAFT v1

**DRAFT — pending science-lead review and SME workshop (HA-008, HA-011).
Rater recruitment/qualification are human-gated (HA-009, HA-010). This
manual trains raters on the EXISTING workbench; it makes no validity claim.**

## Role

Human raters independently score blinded assessment transcripts on the five
Prism dimensions (0–4 levels per the rubric anchors). Ratings feed the S2
human–AI agreement study and rater-anchored calibration — they never change
a candidate's issued report.

## Blinding (enforced by the system, not by discipline)

The workbench serves transcript turns only: no candidate name/email, no AI
scores, no other raters' ratings, no session outcome. Do not attempt to
identify candidates; report any identity leakage immediately (it is a defect).

## Rating procedure

1. Complete the training references first (the workbench withholds the
   live queue until qualification).
2. Read the full transcript once before scoring anything.
3. Score each dimension independently against the level anchors — not
   against other candidates, not against a curve.
4. Evidence rule: every score must be justifiable by quotable transcript
   evidence. If a dimension has no observable evidence, use the
   insufficient-evidence marking — never guess a middle score.
5. Do not penalize language errors on non-language dimensions; score the
   observable behaviour (fairness rules mirror the AI judge instructions).
6. No speed target: accuracy over throughput.

## Qualification and drift (existing machinery)

- Qualification gate: quadratic weighted kappa ≥ 0.6 against reference
  ratings (server-computed; the workbench enforces it — unqualified raters
  cannot rate live sessions).
- Ongoing IRR monitoring on double-rated sessions; drift sentinels flag
  raters whose agreement collapses.
- Superseded ratings are never edited in place — the chain is append-only.

## Conduct

Transcripts are confidential candidate data: no copying, no discussion
outside the programme, no AI-assistance in producing your ratings (the point
is an independent HUMAN anchor).
