# StudAI Prism — Profitability Report

Inputs: FEATURE_COST_ANALYSIS.md (COGS), INFRASTRUCTURE_COST.md (fixed), USER_COST_SIMULATION.md (scale), PRICING_STRATEGY.md (prices). Currency USD; fees 2.5% GMV.

## 1. Unit economics per SKU (current cost profile)

| SKU | Price | AI COGS | Payment fee | **Contribution** | **Margin** |
| --- | --- | --- | --- | --- | --- |
| Assessment $10 | $10.00 | $0.34 | $0.25 | $9.41 | **94.1%** |
| Assessment+ $18 | $18.00 | $0.38 | $0.45 | $17.17 | 95.4% |
| Retest $6 | $6.00 | $0.34 | $0.15 | $5.51 | 91.8% |
| B2B Enterprise floor $2.50/seat | $2.50 | $0.34 | ~0 (invoiced) | $2.16 | 86.4% |
| Catastrophic session (worst tokens + TTS lit) | $10.00 | $0.63 | $0.25 | $9.12 | 91.2% |

**There is no realistic input in which a paid session loses money.** The worst engineered abuse case inside the code's own guards (35-min wall, token caps, TTS budget) cannot push COGS past ≈ $1.90 (TTS budget maxed) — still 78% margin.

## 2. Monthly P&L snapshots (from the simulation)

| Scale | Revenue | Total direct cost | Gross profit | Gross margin |
| --- | --- | --- | --- | --- |
| 100 users/mo | $1,100 | $104 | $996 | 91% |
| 1k | $11,000 | $716 | $10,284 | 93% |
| 10k | $110,000 | $6,640 | $103,360 | 94% |
| 100k | $1.10 M | $66,200 | $1.03 M | 94% |

Gross margin asymptotes at ~94–95% (fees + AI). This is a software-margin business whose scaling costs are almost entirely the AI meter — which optimization R-set cuts by ~45% (FINOPS_RECOMMENDATIONS).

## 3. Break-even

- **Cash break-even: 5 paid assessments/month** covers the $39 infra floor (+$0.59 variable each).
- Break-even including a $2k/mo founder-ops allowance: ~215 assessments/mo.
- B2B: one Growth logo ($399) covers infra 10× over.

## 4. CAC / LTV frame (assumption-labeled — no marketing data exists yet)

| Assumption set | Conservative | Base | Optimistic |
| --- | --- | --- | --- |
| B2C CAC (performance + content) | $8 | $5 | $2 (organic/credential-share loop) |
| B2C LTV (1 assessment + 25% Assessment+ mix + 15% retest/yr) | $11.9 | $13.4 | $15.8 |
| Contribution LTV | $11.2 | $12.6 | $14.9 |
| **LTV:CAC** | 1.4 | **2.5** | 7.4 |
| B2B CAC (founder-led sales) | $600 | $400 | $250 |
| B2B LTV (Growth, 14-mo median life) | $5,586 | $5,586 | $8,400 (upsell) |
| **LTV:CAC** | 9.3 | **14.0** | 33.6 |

Reading: B2C at base assumptions is viable but thin at $10 — the shareable credential (already built: public verification page) is the CAC-killer to invest in. **B2B is where the profit pool is**; every institutional seat carries B2C-identical COGS at near-zero incremental CAC.

## 5. Free-tier burn discipline

Free tier as designed (sample report, verification, downloads) costs ≈ $0/user. If a free *full* assessment were ever offered: $0.34 × N + item-bank exposure damage to the frozen ≤8-scenario calibration corpus (irreversible until the first IRT run — see build rules). **Standing rule: marketing gives discount codes on paid SKUs, never free sessions.** A 50%-off code still yields 88% margin.

## 6. Sensitivities

| Shock | Margin impact at 10k users |
| --- | --- |
| Azure list price +25% on gpt-5.4 | 94.0% → 93.1% |
| Judge panel 5 → 7 samples (quality push) | −$0.066/session → 93.4% |
| Price cut $10 → $7 (competitive response) | 94% → 91.5% |
| INR pricing at ₹499 (≈$6) B2C-India | 90.6% on that SKU |
| All v2 research flags default-on without repricing | 94% → 91% — acceptable, but gate on the Phase-2 agreement rule first |

Every plausible shock leaves gross margin above 90%. The business risk is demand, not cost.
