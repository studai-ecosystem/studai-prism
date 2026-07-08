# StudAI Prism — User Cost Simulation (1 → 1,000,000)

**Stated assumptions (every one explicit).** 1 candidate = 1 paid assessment ($10) per purchase; the 90-day retest gap in code caps a user at ≤4/yr, so we model 1.1 sessions per user per month-cohort (10% retakes/edge). AI COGS per session: current $0.34 typical / optimized $0.22 (math in FEATURE_COST_ANALYSIS.md). Infra stages from INFRASTRUCTURE_COST.md §3. Payment fee 2.5% of GMV. USD throughout; ₹→$ at 83.

## 1. Monthly simulation — CURRENT cost profile ($0.34/session AI)

| Users/mo | Sessions | Revenue | AI COGS | Infra | Payment fees | **Total cost** | **Gross profit** | **Margin** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | $10 | $0.34 | $39 | $0.25 | $39.59 | −$29.59 | −296% |
| 10 | 11 | $110 | $3.74 | $39 | $2.75 | $45.49 | $64.51 | 59% |
| 100 | 110 | $1,100 | $37.40 | $39 | $27.50 | $103.90 | $996.10 | 91% |
| 1,000 | 1,100 | $11,000 | $374 | $67 (S1) | $275 | $716 | $10,284 | 93% |
| 10,000 | 11,000 | $110,000 | $3,740 | $150 (S2) | $2,750 | $6,640 | $103,360 | 94% |
| 100,000 | 110,000 | $1.10 M | $37,400 | $1,300 (S4) | $27,500 | $66,200 | $1.034 M | 94% |
| 1,000,000 | 1,100,000 | $11.0 M | $374,000 | $6,000 (S5) | $275,000 | $655,000 | $10.35 M | 94% |

## 2. Monthly simulation — OPTIMIZED profile ($0.22/session AI, R1+R2+R4 from AI_MODELS_AUDIT §5)

| Users/mo | Sessions | AI COGS | Total cost | Gross profit | Margin |
| --- | --- | --- | --- | --- | --- |
| 100 | 110 | $24.20 | $90.70 | $1,009 | 92% |
| 1,000 | 1,100 | $242 | $584 | $10,416 | 95% |
| 10,000 | 11,000 | $2,420 | $5,320 | $104,680 | 95% |
| 100,000 | 110,000 | $24,200 | $53,000 | $1.047 M | 95% |
| 1,000,000 | 1,100,000 | $242,000 | $523,000 | $10.48 M | 95% |

Optimization is worth **$132/mo at 1k users, $13.2k/mo at 100k, $132k/mo at 1M** — implement before scale, not after.

## 3. Break-even & stress cases

- **Break-even (current):** fixed $39 + $0.59 variable vs $10 → **4.15 → 5 paid assessments/month.**
- **Worst-case session universe:** if every session hit the $0.56 worst case, margin at 10k users falls 94% → 92%. The model is insensitive to token-budget noise.
- **All-v2-flags-on universe ($0.74/session):** margin at 10k users = 91%. Even the full research stack stays >90% — but shadow-mode features should still be repriced into plans before default-on (see PRICING_STRATEGY).
- **Free-tier stress:** every free full assessment costs $0.34 hard cash + burns item-bank exposure (frozen ≤8 scenario bank per build rules). 10k free users/mo = $3,740/mo pure burn **plus calibration contamination risk**. This is why the free tier is a sample report, not a free assessment (PRICING_STRATEGY §2).
- **Whisper-only abuse ceiling:** transcribe limiter 20/min/IP on 15 MB clips → worst sustained ≈ $0.12/min/IP; global 300/min API limiter bounds fleet-wide abuse. Acceptable; add per-user daily STT-minute quota at S2 scale (recommendation R7).

## 4. AOAI capacity vs scale (tokens/minute reality)

Peak-hour model: 12% of daily sessions in the busiest hour, uniformly distributed submits. At 10k sessions/mo → ~44 peak-hour sessions → ~2.9 submits/min × 36k tokens = **~105k tok/min at submit peaks + ~50k conversational** — within GlobalStandard 1000 (≈1M TPM) with 6× headroom. At 100k sessions/mo, request capacity 2000+ or shard across a second deployment (config-only; both are pinned model version `2026-03-05` so the fingerprint law holds).
