# StudAI Prism — FinOps Recommendations (ranked, costed, gated)

Each item: what to change, where in code, estimated saving at 10k sessions/mo (current AI spend baseline ≈ $3,740/mo), and the safety gate. Ordered by (savings × ease) ÷ risk.

## R1 — Prompt-prefix caching (input restructure) — save ≈ $700/mo

Azure bills cached input at $0.25/1M vs $2.50 (90% off) when a request's leading tokens repeat a recent request's prefix (≥1,024 tokens, byte-stable). Two exploiters:

1. **Avatar turns:** each `/message` call resends system (800) + full history — every token except the newest exchange is a repeat of the previous call's prefix. ~22k of 27k avatar input tokens become cacheable → saves 22k × $2.25/1M ≈ $0.050/session.
2. **Judge panel:** 5 parallel calls share an identical judge-prompt+rubric prefix (1,700 tok) + identical transcript. Restructure message assembly so the static block leads and per-persona deltas (rigor/fairness/evidence) trail → 4 of 5 calls hit cache on ~5,700 tokens → ≈ $0.051/session.

**Where:** message-array assembly in `server/routes/assessment.js` (persona injection must move from the front of the system prompt to a trailing instruction). **Gate:** assert judge outputs remain schema-valid on 20 replayed transcripts; no fingerprint change (same model, same content, order-only).
**Combined ≈ $0.10/session → ~$1,100/mo at 10k.** (Conservatively booked $700 for partial hit rates.)

## R2 — Avatar conversation → gpt-5.4-mini — save ≈ $810/mo

Avatar path costs $0.105/session on gpt-5.4; on mini (already deployed, cap 100): 27k × $0.75/1M + 2.5k × $4.50/1M = $0.032. Saves $0.073/session. Avatars are context, not measurement — judges score the candidate's words. **Where:** introduce `PRISM_AVATAR_DEPLOYMENT` env read beside `MODEL()`; default unchanged. **Gate:** 50-session A/B; reviewers check persona coherence + scenario fidelity; abort on any candidate-visible regression. Raise mini capacity 100 → 300 first (free config).

## R3 — Trivial classifiers → mini/nano — save ≈ $10/mo

Calibration tier (8 tok) + entry estimator (60 tok) on mini. Trivial, zero risk, do with R2. (nano not deployed; not worth a deployment for $10.)

## R4 — History windowing after turn 8 — save ≈ $150/mo

Avatar input grows linearly; summarize exchanges 1–5 into a 150-token digest once E>8 (keep last 3 verbatim). Saves ~3–4k input tokens on long sessions. **Warning:** judges must still receive the FULL transcript (measurement integrity) — window only the avatar's conversational context. **Gate:** avatar continuity spot-check; judge path untouched.

## R5 — Judge economics: keep J=5, buy quality not volume — $0

Do **not** cut `PRISM_JUDGE_SAMPLES` below 5 to save $0.033/sample — panel variance is the product. Equally: don't raise to 25 (env max) outside studies. Pin as deployed config, document in ops runbook.

## R6 — Dual-scorer channel B on mini when Phase 2 lights — avoid +$180/mo

`PRISM_JUDGE_MODEL_B=gpt-5.4-mini` before enabling `PRISM_V2_DUAL_SCORER`. The B-channel exists to disagree with channel A — a different, cheaper model is methodologically *better* and 70% cheaper.

## R7 — Voice cost hygiene — containment, not savings

- Whisper: add per-user daily minute quota (e.g., 30 min) at S2 scale; today's 20/min/IP limiter is adequate.
- TTS when lit: run **F0 free tier** (0.5M chars ≈ 110 sessions/mo) for pilot; flip to S0 only past that; per-session ≈ $0.07 — priced into Growth+ plans only (PLAN_LIMITS).

## R8 — Batch API for non-interactive AI — save at feature-ship time

Replay narratives, teamfit summaries, future report enrichment → Batch Global at 50% off ($1.25/$7.50). These are async by nature. Build the batch submit path when the first such feature exits dark.

## R9 — Observability: put a meter on every call — prerequisite for all gates

`tokensUsed` accumulates per session today but isn't exported. Add per-call-site token/cost columns to the existing telemetry writes (audit_log discipline already exists) + a weekly Cost Management query (the exact `az rest` used in this audit is reproducible). **You cannot verify R1–R4 savings without this.** Effort: small; do first.

## R10 — Infra right-sizing calendar

- Now: nothing (B1+B1ms floor $39 is correct).
- At 500 users/mo: Redis C0 (protects live sessions through restarts — revenue protection, not cost).
- At 2k: P0v3 + autoscale rules (CPU 70%, 5-min cool).
- Review Postgres storage autogrowth quarterly; telemetry is append-only and grows ~1–2 MB/1k sessions (measured schema, batched writes).

## Sequenced net effect

| Step | AI $/session | At 10k sessions/mo |
| --- | --- | --- |
| Today | $0.340 | $3,740 |
| + R1 caching | $0.240 | $2,640 |
| + R2/R3 mini routing | $0.170 | $1,870 |
| + R4 windowing | $0.155 | $1,705 |

**≈ 54% reduction, zero change to the measurement instrument.** Implementation order: R9 → R1 → R2/R3 → R4; R5–R8 are standing policy.
