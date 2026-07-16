# PRISM v2 — System Specification & GitHub Copilot Build Plan

> Implementation note (2026-07-16): cloud AI inference now uses the centralized
> Amazon Bedrock/Polly layer described in `../AI_ARCHITECTURE.md`. Provider names
> below describe the original design baseline; psychometric requirements remain
> authoritative.

**StudAI One · Confidential · June 2026**
**Codename: MASA-2 (Multi-stage Adaptive Skill Assessment, v2)**
**Companion to: Prism v2 Research Blueprint (deep research report)**

---

# PART A — WHAT PRISM v2 IS

## A1. The one-line difference

> **Prism v1** = one LLM, three prompts, one final score.
> **Prism v2** = a measurement system: a rubric-steered conversation engine that *hunts for evidence*, a dual-channel scorer that *cross-checks itself*, a confidence engine that *knows when it's unsure*, and a calibration layer that makes every score *comparable, equated, and auditable*.

The candidate still experiences "a 30-minute conversation with 3 AI colleagues." Everything that changes happens in how the conversation is steered and how the score is produced and defended.

## A2. v1 → v2 delta map

| Component | v1 (today) | v2 (target) |
|---|---|---|
| Difficulty calibration | Writing sample → hard tier bucket (foundational/intermediate/advanced) | Writing sample → **continuous Bayesian prior θ₀**, updated every turn |
| Conversation director | Fixed rules: challenger every 3–4 turns, rotating question styles | **Executive Engine**: tracks evidence coverage per dimension in real time, deploys probes/challenger *where evidence is thin* |
| Test length | Fixed 30 min / fixed turn count | **Adaptive stop**: ends early when score confidence interval is tight; extends (one extra probe) when wide |
| Scoring | One low-temp GPT call on full transcript | **Dual-Channel Scorer**: (A) ensemble LLM judges, turn-level, 20× vote + regression; (B) interpretable behavioral feature model. Disagreement → re-evaluation/human flag |
| Score confidence | Hardcoded "±3" | **Real conformal prediction interval** per session, shown on report |
| Percentile | Count of past scores below | Same, but on an **equated scale** (scenario severity corrected) with confidence band |
| Scenario difficulty | Assumed by tier label | **Measured**: every scenario+probe logged as an item; IRT/Rasch calibration from response data |
| Comparability | None (different scenarios = different tests) | **Cross-scenario equating** via many-facet Rasch scenario-severity parameters |
| Fairness | None measured | **DIF audit dashboard**: gender, language-medium, college tier; ASR-confidence down-weighting |
| Evaluator model | Azure GPT (version drift risk) | Phase 2: **distilled proprietary evaluator** (fine-tuned small open model, version-locked) |
| Cost per assessment | ~₹35–50 AI cost | Falls toward **~₹15–25** (batch scoring + caching + distilled judge) despite doing more |

## A3. v2 system architecture

```
┌─────────────────────────────  BROWSER (React 18)  ─────────────────────────────┐
│  Chat UI · Voice capture · On-device proctoring ML · (unchanged from v1)       │
│  NEW: live "thinking depth" indicator · adaptive-length messaging               │
└───────────────────────────────────┬─────────────────────────────────────────────┘
                                    │ REST /api
┌───────────────────────────────────▼─────────────────────────────────────────────┐
│                        EXPRESS API SERVER (Node.js)                              │
│                                                                                   │
│  ┌──────────────────────── MASA-2 PIPELINE ────────────────────────┐            │
│  │                                                                   │            │
│  │  S1 ADAPTIVE ENTRY ESTIMATOR                                      │            │
│  │     writing sample → prior θ₀ (mean, variance) → scenario pick    │            │
│  │                                                                   │            │
│  │  S2 PRISM-DIRECTOR EXECUTIVE ENGINE          ┌────────────────┐  │            │
│  │     EvidenceLedger (5 dims × coverage)  ───▶ │ probe selector │  │            │
│  │     adaptive challenger · adaptive stop      └────────────────┘  │            │
│  │                                                                   │            │
│  │  S3 ITEM TELEMETRY  →  every scenario/probe/turn logged as item  │            │
│  │                                                                   │            │
│  │  S4 DUAL-CHANNEL SCORER (async, post-submit)                      │            │
│  │     Channel A: PoLL judge ensemble, turn-level, k-vote → modal    │            │
│  │               → regression to human anchor                        │            │
│  │     Channel B: behavioral feature extractor → GBM/logistic model  │            │
│  │     Reconciler: |A−B| > τ → re-evaluate → human-review queue      │            │
│  │     Conformal engine: score → calibrated CI                       │            │
│  │                                                                   │            │
│  │  S5 CALIBRATED REPORTING                                          │            │
│  │     equate (scenario severity) → percentile + CI → report JSON    │            │
│  └───────────────────────────────────────────────────────────────────┘            │
│                                                                                   │
│  OFFLINE JOBS (cron/queue):  IRT-Rasch calibration runs · DIF audit ·            │
│  conformal recalibration · judge-drift monitor · human double-rating sampler     │
└───────────────┬───────────────────────────────────────────┬─────────────────────┘
                │                                           │
     ┌──────────▼──────────┐                     ┌──────────▼──────────────┐
     │ Azure OpenAI         │                     │ PostgreSQL              │
     │ · Director (live)    │                     │ · sessions / transcripts│
     │ · Judge ensemble     │                     │ · items / responses     │
     │   (Batch API, 50% ↓) │                     │ · judge_votes           │
     │ · Whisper STT        │                     │ · behavioral_features   │
     │ Phase 2: distilled   │                     │ · calibration_runs      │
     │ evaluator (8B, local │                     │ · human_ratings         │
     │ or serverless)       │                     │ · audit_log             │
     └──────────────────────┘                     └─────────────────────────┘
```

Key principle preserved from v1: **the browser never talks to the AI; the server owns every prompt, every number, and clamps/recomputes everything.**

---

# PART B — HOW EACH STAGE WORKS

## B1. Stage 1 — Adaptive Entry Estimator (replaces tier calibration)

**What changes:** the writing sample no longer outputs a label; it outputs a **prior ability estimate** `θ₀ ~ N(μ₀, σ₀²)` on a standardized scale (mean 0, SD 1 across the population).

**How it works:**
1. The calibration prompt scores the writing sample on 4 micro-anchors (structure, specificity, reasoning, self-reflection), each 0–3.
2. Sum (0–12) maps to `μ₀` via a lookup learned from data (bootstrap: linear map; later: regression against final scores).
3. `σ₀` starts wide (≈0.8) — the prior is weak on purpose; the conversation is the real measurement.
4. Scenario selection: pick from the bank where calibrated scenario difficulty `b_s` is closest to `μ₀` (max information), excluding scenarios this candidate has seen.
5. Fallback unchanged: heuristic (length/structure) if the AI call fails. Flow never blocks.

**Why it matters:** continuous θ feeds the turn-level Bayesian update in Stage 2 and the adaptive stop rule. Tier buckets can't do that.

## B2. Stage 2 — PRISM-Director Executive Engine

This is the biggest conversational upgrade and the core of the "rubric-steered multi-agent elicitation" patent claim.

### B2.1 The EvidenceLedger

A server-side object, updated after every candidate turn:

```js
EvidenceLedger = {
  dimensions: {
    critical_thinking: { evidence_count, last_quality, coverage: 0–1, anchors_hit: [...] },
    communication:     { ... },
    collaboration:     { ... },
    problem_solving:   { ... },
    ai_fluency:        { ... }
  },
  theta: { mean, variance },        // running Bayesian ability estimate
  exchange_count, elapsed_seconds
}
```

After each candidate answer, a **fast, cheap micro-rating call** (small model or distilled judge, temperature 0, ~150 tokens) rates the single turn against each dimension's behavioral anchors: `{dimension: level 0–4 or NA}`. This updates:
- `coverage` per dimension (how much usable evidence exists),
- `θ` via a simple Bayesian update (each rated turn is an observation; precision-weighted mean update — see B4 formulas).

### B2.2 Probe selection (the "Executive" decision)

Before generating the next AI turn, the server computes the **evidence-thinnest dimension** (lowest coverage × highest weight) and injects a directive into the director prompt:

```
DIRECTOR DIRECTIVE (this turn):
- Target dimension: COLLABORATION (coverage 0.2, lowest)
- Probe style: stakeholder-disagreement (have the CHALLENGER push back on the
  candidate's last proposal from Sneha Iyer's PR perspective)
- Pressure level: θ=+0.4 → intermediate-advanced probe
- Anti-repetition: facets already probed this session: [cost, first-step, risk]
  → probe a NEW facet: [people-reaction | success-metric | tradeoff]
```

**The challenger is now adaptive, not periodic:** it fires when (a) collaboration/resilience evidence is thin, or (b) the candidate's position has not yet been stress-tested — never more than 2 consecutive turns, and the directive includes the fairness framing rules (Grade 6–7 language, offer two options if stuck) unchanged from v1.

### B2.3 Adaptive stop rule (conversation-CAT)

After exchange 6, check every turn:
- **Stop early** if `var(θ) < σ²_stop` AND every dimension coverage ≥ 0.6 → "We have what we need" (candidate experiences a shorter test — delight + cost saving).
- **Extend** (+1 probe, max +2) if any dimension coverage < 0.4 at the time limit → targeted final probe at that dimension.
- Hard ceiling unchanged (server enforces; HTTP 410 after limit + grace).

**Psychological note (from research):** message before the test: *"The conversation ends when we have enough evidence — finishing early is normal and often a good sign."* This kills the "it ended fast, I failed" anxiety spiral.

## B3. Stage 3 — Item telemetry & Scenario-IRT Bank

**Everything becomes an item.** Each scenario, and each probe-template within it, gets an `item_id`. Every candidate response to a probe is an `item_response` with the micro-rating level as the graded response.

**Offline calibration job (weekly, then monthly):**
1. Pull all `item_responses` where the item has ≥ N_min responses (start N_min = 30 provisional, 200 stable).
2. Fit a **graded response model / partial credit Rasch** → per-item difficulty `b`, discrimination `a`; per-scenario severity `S_s` via many-facet Rasch (facets: candidate θ, item b, scenario severity, judge severity).
3. Write results to `calibration_runs`; flag misfitting items (infit/outfit out of [0.7, 1.3]) for retirement/rewrite.
4. New AI-generated scenarios enter the bank as **provisional** (severity = tier average) and only become **certified-eligible** after calibration — Duolingo's exact item lifecycle.

**Bootstrap rule for July 2026 cohort:** freeze the bank at **≤ 8 scenarios** so per-item N accumulates fast. Do not generate new scenarios until the first calibration run succeeds.

## B4. Stage 4 — Dual-Channel Scorer

Runs **asynchronously after submission** (the candidate sees "Generating your certified report…", target < 90 seconds). All judge calls go through the **Azure Batch API** path where latency allows (50% cost cut) with prompt caching on the rubric.

### Channel A — Judge ensemble (PoLL)

Per scored turn (not whole transcript at once):
1. **k-vote**: call the judge **k=20 times** (temperature 0.7, cheap small model + 1 mid model from a different family; Phase 2 adds the distilled evaluator) → each returns `{dimension levels 0–4 or NA}`.
2. **Modal level** per dimension per turn; NA if ≥ 1 vote is NA (Vantage recipe).
3. **Consistency checks** on a sampled 20% of turns: re-judge with paraphrased candidate text and with speaker labels swapped; if the modal level shifts > 1 band, mark the turn `unstable` and exclude from scoring (and log for rubric repair).
4. **Aggregation to dimension scores:** regression model (start: weighted mean of turn levels with recency/quality weights; after ≥100 human-double-rated sessions: ridge regression from turn-level features to the human-anchored conversation score, validated leave-one-out).

### Channel B — Behavioral feature model (interpretable, cheap, hard to game)

Extracted from transcript + timing telemetry, no LLM needed:

| Feature family | Examples |
|---|---|
| Engagement | turn latency, answer length distribution, completion of probes |
| Inquiry | question-asking rate, clarifying vs rhetorical questions |
| Reasoning structure | claim+reason+implication detection, hedging rate, tradeoff terms |
| Adaptivity | position-update markers after challenger turns ("you're right", "I'd adjust") |
| Language quality | lexical diversity, ASR confidence (used to **down-weight**, never to penalize) |

Model: gradient-boosted trees (or regularized logistic) per dimension, trained against human-anchored scores. Until trained, Channel B runs in **shadow mode** (computed, stored, not used in the score).

### Reconciliation + conformal gate

```
finalDim = w_A · channelA + w_B · channelB        (start w_A=1.0, w_B=0; shadow)
if |channelA − channelB| > τ (start τ=12 pts):     → automatic re-evaluation pass
if still divergent OR conformal CI width > W_max:  → human-review queue, report
                                                      held max 24h, candidate told
                                                      "quality review in progress"
```

**Conformal engine:** maintain a calibration set (held-out human-rated sessions). For a new session, the nonconformity score → a CI at 90% coverage. The CI is **printed on the report** (replaces the hardcoded ±3). Wide-CI sessions are exactly the ones that get the human look — this is the fairness story AND the quality story in one mechanism.

**Server still does not trust anyone's math:** clamp 0–100, recompute weighted overall (25/25/20/20/10), idempotent scoring, stored-report-on-resubmit — all unchanged from v1.

## B5. Stage 5 — Calibrated reporting & equating

1. **Equate**: adjust dimension scores for scenario severity `S_s` (a candidate who drew a harder scenario is not penalized): `score_equated = score_raw + κ·S_s` (κ from the Rasch run; 0 until first calibration).
2. **Percentile with band**: percentile computed on equated scores; report shows "86th (82nd–89th)".
3. **Report additions (employer-facing):**
   - Score confidence interval (real, per-session)
   - "Reliability of this session" indicator (Strong / Standard / Reviewed-by-human)
   - Per-dimension evidence quotes (unchanged) + **count of evidence moments** ("Collaboration: 4 scored moments")
   - Methods footer: "Scored by a multi-judge AI panel with human-anchored calibration and statistical confidence bounds. Independently logged for fairness audit." — this single line is worth real money in institutional sales.
4. **Verification page** now also shows the scale version and calibration run ID — scores are traceable to a frozen calibration (the 2-year validity promise becomes honest).

## B6. Compliance guardrails (hard rules, build into code review)

- **Never** score facial expression, prosody, tone, or "emotion." Voice = STT input only. (EU AI Act Art. 5(1)(f) prohibition zone; HireVue lesson.)
- ASR confidence may **down-weight** a turn's contribution, never reduce a score directly.
- Every score-affecting decision (probe choice, judge votes, reconciliation, human review) writes to `audit_log` — this becomes the DIF dashboard's data source and the NYC LL144-style audit artifact.
- DPDP: transcripts pseudonymized in the research/training store; consent checkbox text updated to cover calibration research use.

---

# PART C — DATA MODEL ADDITIONS (PostgreSQL)

```sql
-- Items: every scenario and probe-template is an item
CREATE TABLE items (
  item_id        UUID PRIMARY KEY,
  scenario_id    UUID NOT NULL,
  kind           TEXT CHECK (kind IN ('scenario','probe')),
  dimension      TEXT,                 -- primary dimension probed (nullable for scenario)
  facet          TEXT,                 -- cost | risk | first-step | people | metric | tradeoff
  tier_label     TEXT,                 -- legacy tier, kept for bootstrap
  difficulty_b   NUMERIC,              -- IRT difficulty (null until calibrated)
  discrimination_a NUMERIC,
  severity       NUMERIC,              -- scenario severity (Rasch facet)
  status         TEXT CHECK (status IN ('provisional','calibrated','retired')),
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- One row per candidate response to a probe
CREATE TABLE item_responses (
  response_id    UUID PRIMARY KEY,
  session_id     UUID NOT NULL,
  item_id        UUID REFERENCES items,
  exchange_no    INT,
  candidate_text TEXT,
  latency_ms     INT,
  asr_confidence NUMERIC,
  micro_levels   JSONB,                -- {dimension: 0–4|NA} from the live micro-rater
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE judge_votes (
  vote_id        UUID PRIMARY KEY,
  response_id    UUID REFERENCES item_responses,
  judge_model    TEXT,                 -- model id + version (drift tracking)
  vote_no        INT,                  -- 1..k
  levels         JSONB,                -- {dimension: 0–4|NA}
  stability_flag TEXT,                 -- ok | paraphrase_unstable | swap_unstable
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE behavioral_features (
  session_id     UUID PRIMARY KEY,
  features       JSONB,                -- full feature vector
  channelB_scores JSONB,               -- {dimension: score} (shadow until trained)
  model_version  TEXT
);

CREATE TABLE ability_estimates (
  session_id     UUID,
  exchange_no    INT,
  theta_mean     NUMERIC,
  theta_var      NUMERIC,
  coverage       JSONB,                -- {dimension: 0–1}
  PRIMARY KEY (session_id, exchange_no)
);

CREATE TABLE human_ratings (            -- the gold anchor set
  rating_id      UUID PRIMARY KEY,
  session_id     UUID,
  rater_id       TEXT,
  dimension      TEXT,
  score          INT,
  rubric_version TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE calibration_runs (
  run_id         UUID PRIMARY KEY,
  run_type       TEXT,                 -- irt | rasch | conformal | channelB_train
  inputs_summary JSONB,
  outputs        JSONB,                -- item params, severities, CI tables, model metrics
  frozen         BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  session_id     UUID,
  event_type     TEXT,                 -- probe_selected | judge_disagreement | human_review | ...
  payload        JSONB,
  created_at     TIMESTAMPTZ DEFAULT now()
);
```

---

# PART D — GITHUB COPILOT BUILD INSTRUCTIONS

How to run this: work phase by phase. Each phase below contains (1) scope, (2) a ready-to-paste Copilot master prompt, (3) acceptance criteria. Paste the master prompt into Copilot Chat (Claude Opus mode) at repo root with `@workspace`. Commit per phase; never mix phases in one branch.

**Repo-level setup first:** add the file `/.github/copilot-instructions.md`:

```markdown
# Prism v2 (MASA-2) build rules
- This is a psychometric assessment system. Server is the source of truth:
  every score is clamped 0–100 and recomputed server-side; the browser never
  calls AI; scoring is idempotent per session.
- NEVER add scoring of facial expression, voice prosody, tone or emotion.
  Voice is speech-to-text input only. ASR confidence may down-weight a turn,
  never directly change a score.
- Every score-affecting decision must write an audit_log row.
- All judge/director prompts live in /server/prompts as versioned files; no
  inline prompt strings in route handlers.
- All new tables per /docs/PRISM_v2_System_Spec.md Part C. Use migrations.
- Feature flags: every v2 behavior ships behind a flag (PRISM_V2_*) defaulting
  off; v1 behavior must remain reproducible.
- Tests required for: theta update math, clamp/recompute, adaptive stop rule,
  reconciliation thresholds, idempotency.
```

## PHASE 0 — Telemetry & item logging (1 week) — *do this before anything else*

**Scope:** no behavior change. Create the Part C tables + migrations; assign `item_id`s to the existing ≤8 scenarios and their probe templates; log every exchange as an `item_response` with latency and ASR confidence; add `audit_log`. Backfill item rows for existing scenarios.

**Copilot master prompt:**
```
@workspace You are upgrading Prism (Node/Express + PostgreSQL + React) to v2.
Phase 0: telemetry only, zero behavior change, everything behind flag
PRISM_V2_TELEMETRY=true.

1. Create migrations for these tables exactly as specified in
   docs/PRISM_v2_System_Spec.md Part C: items, item_responses, judge_votes,
   behavioral_features, ability_estimates, human_ratings, calibration_runs,
   audit_log.
2. Write a seed script that creates one 'scenario' item per existing scenario
   and one 'probe' item per probe template/facet in the director prompt config,
   status='provisional', tier_label preserved.
3. In the conversation route, after each candidate message is stored, also
   insert an item_response row: session_id, matched item_id (the probe the
   director directive targeted; for now infer from scenario + exchange_no),
   candidate_text, latency_ms (server receive time minus previous AI message
   sent time), asr_confidence (from Whisper response if present, else null),
   micro_levels = null for now.
4. Add an auditLog(eventType, sessionId, payload) helper and call it from:
   scenario selection, each AI turn generation, submission, scoring.
5. Add tests: migration up/down, item_response written per exchange,
   audit rows written, and that with the flag off nothing new executes.
Do not modify any prompt, scoring, or UI behavior in this phase.
```

**Acceptance:** run a full demo assessment → every exchange has an `item_response` row; audit_log shows the full session trail; flag off = v1 identical.

## PHASE 1 — Executive Engine + Entry Estimator (2–3 weeks) — *ship for July cohort*

**Scope:** Stage 1 + Stage 2. Micro-rater, EvidenceLedger, directive injection, adaptive challenger, adaptive stop (extend-only at first: keep fixed minimum length, allow +1/+2 probes; enable early-stop after first cohort data).

**Copilot master prompt:**
```
@workspace Phase 1 of Prism v2, flag PRISM_V2_EXECUTIVE=true.

1. /server/engine/entryEstimator.js — replace tier output with
   {theta0_mean, theta0_var}. Map the existing calibration rubric (4 anchors
   0–3, sum 0–12) linearly to mean in [-1.2, +1.2], var = 0.64. Keep the
   heuristic fallback returning {0, 1.0}. Keep returning the legacy tier label
   too (scenario bank still uses it until IRT calibration exists).
2. /server/engine/microRater.js — after each candidate message, one chat call
   (temperature 0, max 150 tokens, strict JSON) rating the single turn against
   the 5 dimensions' behavioral anchors, returning {dim: 0-4|"NA"}. Prompt file
   /server/prompts/micro_rater.v1.md. Store result in
   item_responses.micro_levels. On failure: null, never block the flow.
3. /server/engine/evidenceLedger.js — class holding per-dimension
   {evidence_count, coverage, anchors_hit}, plus theta {mean, var}. Update rule
   per rated turn: treat level L (0-4) as observation y=(L/4)*2-1 with
   observation variance 0.35; posterior precision-weighted update:
   var' = 1/(1/var + 1/0.35); mean' = var' * (mean/var + y/0.35).
   coverage = min(1, evidence_count/3) per dimension. Persist snapshot to
   ability_estimates after each exchange.
4. /server/engine/probeSelector.js — pick target dimension = argmax of
   (weight * (1 - coverage)); pick a facet not yet probed this session; decide
   challenger_on = (target is collaboration OR last proposal unchallenged) AND
   challenger not used in last 2 turns. Output a DIRECTOR DIRECTIVE block.
5. Modify the director call to inject the directive block at the top of the
   system prompt each turn. Remove the fixed every-3-4-turns challenger rule
   when the flag is on. Log every directive to audit_log.
6. Adaptive length: at the configured time/turn limit, if any coverage < 0.4,
   allow up to 2 extra targeted probes (extend server deadline accordingly);
   add report flag extended_for_evidence=true. Early stop OFF by default
   (config PRISM_V2_EARLY_STOP=false).
7. Tests: ledger math (golden values), probe selector never repeats a facet,
   challenger spacing constraint, directive logged, flag-off = v1 behavior.
```

**Acceptance:** demo runs show directives in audit_log targeting thin dimensions; challenger fires adaptively; coverage visible per exchange in `ability_estimates`; with flag off, v1 byte-identical prompts.

## PHASE 2 — Dual-Channel Scorer + conformal CI (3–4 weeks)

**Scope:** Stage 4. Turn-level k-vote ensemble (start k=20 on a cheap model + 5 on a second family — tune for cost), modal aggregation, consistency checks on a 20% sample, weighted aggregation to dimension scores, behavioral feature extractor in shadow mode, reconciler + human-review queue, conformal CI from a calibration table.

**Copilot master prompt:**
```
@workspace Phase 2 of Prism v2, flag PRISM_V2_DUAL_SCORER=true. Scoring is
async post-submit; keep the existing single-call scorer as fallback and as a
shadow comparison.

1. /server/scoring/judgePanel.js — for each item_response with non-null
   candidate_text: run k1=20 votes on JUDGE_MODEL_A and k2=5 votes on
   JUDGE_MODEL_B (different family), temperature 0.7, strict JSON
   {dim: 0-4|"NA"}, prompt /server/prompts/judge_turn.v1.md (rubric with
   behavioral anchors per dimension, fairness rules: never penalize missing
   domain knowledge; AI-fluency NA if topic never arose). Persist every vote
   to judge_votes with model+version. Modal level per dim; NA if any vote NA
   (Vantage rule). Use the batch/queue path, concurrency-limited, exponential
   backoff on 429/5xx.
2. /server/scoring/consistency.js — on a random 20% of turns: re-judge once
   with (a) paraphrased candidate text (cheap model paraphrase) and (b)
   speaker-label-swapped context. If modal level shifts >1 band, set
   stability_flag and exclude that turn from aggregation; audit_log it.
3. /server/scoring/aggregate.js — dimension score = 100 * weighted mean of
   (level/4) over stable rated turns, weights = (0.5 + 0.5*asr_confidence) *
   recency_weight(exchange_no). Then clamp, recompute overall 25/25/20/20/10
   server-side exactly as v1. Persist alongside (not replacing) the v1 score
   while in shadow.
4. /server/scoring/features.js — extract the Part B Channel-B feature vector
   (regex/heuristic detectors are fine for v1 of this), store in
   behavioral_features. channelB_scores = null (shadow; no model yet).
5. /server/scoring/reconciler.js — compare panel score vs legacy single-call
   score (until Channel B trained): if any dimension differs >12 points, run
   one re-evaluation pass (fresh panel, k=10); if still >12, insert into
   human-review queue (new table or status field) and mark report
   reliability='Reviewed'. Report release waits max 24h for review.
6. /server/scoring/conformal.js — maintain calibration_runs entry of
   (panel_score, human_score) pairs from human_ratings; nonconformity =
   |panel - human|; CI = panel ± quantile_0.9 of nonconformity. Until ≥30
   pairs exist, fall back to ±6 and label CI 'provisional'. Print CI on the
   report JSON.
7. Admin CLI or simple route to enqueue human double-rating for a random 30%
   of sessions (writes to human_ratings).
8. Tests: modal/NA logic, exclusion on instability, clamp+recompute identical
   to v1 function, reconciler thresholds, idempotency (re-submit returns
   stored report), conformal fallback path.
```

**Acceptance:** a scored session shows ≥ 25 votes/turn in `judge_votes`; report carries a CI; forced disagreement (test fixture) lands in the review queue; cost per scored session logged and ≤ target.

## PHASE 3 — Calibration jobs + equating + DIF dashboard (4–6 weeks, after ≥300 sessions)

**Scope:** Stage 3 + Stage 5 + audit. Python offline jobs (separate `/calibration` workspace — Copilot handles Python fine): graded-response IRT + many-facet Rasch (use `py-irt`/`girth`/custom Stan or `pyro`; scenario severity facet), item misfit flags, equating constant κ, percentile-with-band on equated scores, DIF analysis (Mantel-Haenszel by gender, language-medium, college tier), reliability report (G-coefficient via variance components), and a minimal internal dashboard page. Train Channel B (GBM via `lightgbm`) once ≥100 double-rated sessions exist; flip `w_B` to 0.2 only after it beats baseline in leave-one-out.

**Copilot master prompt (abbreviated):**
```
@workspace Create /calibration (Python 3.11, poetry). Jobs, each reading
Postgres and writing a calibration_runs row:
1. irt_fit.py — graded response model on item_responses.micro_levels merged
   with judge modal levels; per-item a, b; flag infit/outfit outside [0.7,1.3].
2. rasch_facets.py — many-facet model: candidate theta + item difficulty +
   scenario severity + judge-model severity; output severity table.
3. equate.py — compute κ and write per-scenario adjustment constants.
4. dif_audit.py — Mantel-Haenszel DIF on each item by gender, language_medium,
   college_tier (fields already on user profile; add if missing). Output
   flagged items + effect sizes.
5. reliability.py — variance components (person, scenario, residual) →
   G-coefficient; output with CI.
6. conformal_refresh.py — rebuild the CI quantile table from human_ratings.
7. channelB_train.py — lightgbm per dimension on behavioral_features vs
   human_ratings; LOO-CV metrics; export model artifact + version.
Each job: deterministic seed, run summary JSON, never writes to live scoring
tables directly — the Node server reads frozen calibration_runs only.
Add /admin/psychometrics route in the Node app rendering the latest run:
reliability, item table, DIF flags, judge drift (vote distribution by model
version over time).
```

**Acceptance:** first full calibration run on cohort data produces an item table, scenario severities, a G-coefficient, and a DIF report; equating constants applied behind `PRISM_V2_EQUATING=true`; the dashboard renders.

## PHASE 4 — Distilled proprietary evaluator (parallel track, month 4–9)

**Scope:** fine-tune an 8B-class open model (Llama-3.1-8B / Qwen-2.5-7B) on `(turn context → human-anchored judge output)` pairs from your accumulated double-rated corpus; deploy serverless or on a small GPU instance; add to the panel as JUDGE_MODEL_C; once its agreement with human anchors ≥ the hosted judges', promote it to primary and demote hosted models to consistency-check duty. Version-lock it — this kills score drift and cuts judge cost ~10–50×. (This phase is a training pipeline, not a Copilot-in-the-repo task; spec it separately when the corpus reaches ~5k rated turns.)

---

# PART E — ROLLOUT, RISK, AND THE MONEY ANGLE

**Rollout sequence:** Phase 0 now → Phase 1 live for the **July 1 Cohort 01** (every cohort participant = calibration data; price unchanged ₹499) → Phase 2 shadow-scoring through July–August (publish nothing until panel-vs-human agreement ≥ human-vs-human on your 30% double-rated sample) → Phase 3 after ~300 sessions → Technical Manual v1 published ~Oct–Nov 2026 → Phase 4 distillation when corpus permits.

**Risk controls:**
- Every phase behind a flag; v1 always reproducible (a certified score issued under v1 must remain explainable under v1 rules).
- No public claims ("IRT-calibrated", "statistically equated") until the corresponding calibration run is frozen — over-claiming is the one unrecoverable credibility error in this market.
- Judge model version pinned in config; any version change triggers a forced recalibration run before scoring resumes.

**Why this is worth building (the crore-scale lens):**
- **Institutional contracts:** the Technical Manual + DIF dashboard is what SRMIST-scale placement departments and international acceptors actually ask for — it converts Prism from a ₹499 B2C product into a per-seat institutional contract with a defensible artifact attached.
- **Fundraising:** "panel-of-judges with conformal confidence bounds, IRT-calibrated scenario bank, human-anchored agreement ≥ human-human" is a research-asset slide no Indian competitor can show — it directly repairs the investability gap flagged in the Kumaran pitch (4.5/10).
- **Cost:** v2 *reduces* marginal cost (batch + caching + distilled judge) while raising price-justification — margin expands in both directions.
- **IP:** Phases 1+2 together form the system patent claim (rubric-steered elicitation + dual-channel uncertainty-gated scoring); the double-rated corpus is the trade-secret moat that compounds with every cohort.
