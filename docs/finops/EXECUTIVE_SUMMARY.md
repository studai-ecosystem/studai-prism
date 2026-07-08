# StudAI Prism — Executive Summary (FinOps & Pricing Audit)

**Date:** 2026-07-08 · **Scope:** the `studai-prism` codebase (the only product codebase in this repository) · **Method:** every number below traces to code (file:line), to live Azure resource queries, or to the Azure Retail Prices API pulled on the audit date. Nothing is guessed. Where a sibling StudAI product has no code here, this audit says so instead of inventing findings.

---

## The one-paragraph verdict

Prism is a **structurally cheap, high-margin AI product**. A complete paid assessment costs **≈ $0.34 in AI + speech** (worst case ≈ $0.56–0.63) against a **$10 price** already hard-coded in the payment route — a **93–97% gross margin on COGS** before payment fees. Fixed infrastructure is **≈ $40/month** today (B1 App Service + B1ms Postgres + code-signing), so the business breaks even at **~5 paid assessments per month**. The dominant cost driver is the **judge panel** (5 × gpt-5.4 calls over the full transcript at submit = ~65% of AI spend), and it is also the product's core value claim — spend there is defensible. The two highest-leverage optimizations (Azure **cached-input pricing** on the static prompt prefixes, and **gpt-5.4-mini for avatar turns** while judges stay pinned to gpt-5.4) cut AI COGS by **~50%** with zero measurement risk to the scoring fingerprint.

## Key facts (all verified)

| Fact | Value | Source |
| --- | --- | --- |
| Primary model | `gpt-5.4` (2026-03-05), GlobalStandard, 1000 cap | deployment list, account `studai-openai-286274596` |
| gpt-5.4 price | **$2.50 / 1M in · $15.00 / 1M out · $0.25 / 1M cached-in** | Azure Retail Prices API, meters `5.4 inp/opt/cd inp Gl` |
| gpt-5.4-mini (already deployed) | $0.75 / 1M in · $4.50 / 1M out | same API |
| Whisper STT | **$0.006 / minute** | meter `Speech-to-Text-Batch-Whisper-glbl` $0.36/hr |
| Neural TTS (dark, flag off) | F0 tier: 0.5M chars/mo **free**; S0 $16/1M chars (published) | Azure Speech pricing |
| AI cost / typical session | **$0.295 tokens + $0.045 STT ≈ $0.34** | calculation in FEATURE_COST_ANALYSIS.md |
| AI cost / worst-case session | ≈ $0.56 ($0.63 with neural TTS lit) | same |
| Price in code | **$10.00** (`PRICE_PAISE = 1000`, USD) | server/routes/payment.js |
| Fixed infra (actuals) | App Service B1 ₹234 + PG B1ms ₹391 (month-to-date, 8 days) → **≈ $28/mo run-rate** + $9.99 signing | Cost Management API |
| Features that do NOT exist | embeddings, vector DB/RAG, image/video gen, fine-tuning, realtime API, SMS/WhatsApp/Telegram | code search (absence verified) |
| Cost-capping guards in code | 35-min session wall, TTS 150-call/600-char budget, 20/min STT limiter, 90-day retest gap, replay ≤3 turns, teamfit ≤6 turns | server/lib/security.js + routes |

## The three decisions for founders

1. **Adopt the two-lever cost plan** (cached prefixes + mini avatar): AI COGS $0.34 → **≈ $0.17–0.22**; at 10k assessments/mo this is ~$1,900/mo saved. Judges stay on pinned gpt-5.4 — the model-drift fingerprint law is untouched.
2. **Price candidates at $10–12 retail, institutions at $5–6/seat** (cohort). Unit economics hold catastrophic-case margins > 90%. Full ladder in PRICING_STRATEGY.md.
3. **Do not build a free assessment tier.** A free full assessment costs real money ($0.34) *and* burns the frozen 8-scenario item bank's exposure budget — the calibration corpus is worth more than the marketing. Free tier = sample report + verification pages (zero marginal cost), which the site already ships.

## Deliverable map

| File | Contents |
| --- | --- |
| SYSTEM_ARCHITECTURE.md | Full stack, request flows, every external dependency |
| AI_MODELS_AUDIT.md | Every model, exact IDs, prices, capabilities, restrictions & routing |
| FEATURE_COST_ANALYSIS.md | Per-feature, per-request cost math (token/voice/absent features) |
| INFRASTRUCTURE_COST.md | Real SKUs, real bills, scale ladder 1 → 1M users |
| USER_COST_SIMULATION.md | 1 / 10 / 100 / 1k / 10k / 100k / 1M user simulations |
| PRICING_STRATEGY.md | Plans, limits, portfolio frame (non-Prism products labeled strategy-only) |
| PROFITABILITY_REPORT.md | Margins, break-even, CAC/LTV frame, free-tier burn |
| FINOPS_RECOMMENDATIONS.md | Ranked optimizations with estimated savings |
