# StudAI Prism — Pricing Strategy, Plan Limits & Portfolio Frame

Grounding: unit economics from FEATURE_COST_ANALYSIS.md (AI COGS $0.22–0.34/session); the $10 price already in `server/routes/payment.js`; entitlement machinery already in the codebase (per-assessment entitlements + licence endpoint `/api/payment/licence`). Prism today is transactional (pay-per-assessment), not subscription — the plans below extend, not replace, that model.

## 1. Pricing principles

1. **Price the certificate, not the tokens.** A verified, anti-fraud, proctored behavioral credential competes with $25–$300 assessment-industry SKUs, not with $0.34 of COGS. Value-based, not cost-plus.
2. **The instrument never degrades by plan.** Cheaper plans get fewer features — never a smaller judge panel, never a cheaper judge model. (Routing law in AI_MODELS_AUDIT §5.)
3. **B2C is the wedge, B2B is the business.** Institutions buy in seats; unit COGS is identical, so volume discounts are pure margin trade, floor-bounded at $1/seat (10× worst-case COGS).
4. **No free full assessments.** Free tier = sample report + verification + practice snippet, all $0-COGS artifacts that already exist. Protects both cash and the frozen 8-scenario calibration bank.

## 2. Candidate (B2C) plans

| Plan | Price | What's included | COGS | Margin |
| --- | --- | --- | --- | --- |
| **Free** | $0 | Sample report, credential verification, readiness checklist, desktop app download | ~$0 | — |
| **Assessment** (today's SKU) | **$10** | 1 full proctored assessment + certified report + shareable credential + PDF | $0.34 | 94% after fees |
| **Assessment+** | **$18** | Assessment + replay coaching (when `PRISM_REPLAY` ships, ≤3 turns ≈ $0.02) + 1 discounted retest after the 90-day gap | $0.38 avg | 95% |
| **Retest** | $6 | Returning candidates past the 90-day gap (code-enforced) | $0.34 | 92% |

India-market note: list in INR at parity-adjusted ₹499 / ₹899 / ₹299 rather than FX conversion; Razorpay is already the rail.

## 3. Institutional (B2B) plans — PLAN LIMITS table

| Limit / feature | Starter | Growth | Enterprise |
| --- | --- | --- | --- |
| Price | **$99/mo** | **$399/mo** | custom, floor $1,500/mo |
| Included assessments/mo | 25 (then $5/seat) | 120 (then $4/seat) | pooled, $2.50–3.50/seat |
| Voice (STT) minutes/session | 15 (code default) | 15 | 15 |
| Neural TTS voices | — | ✓ (when flag ships) | ✓ |
| Cohort dashboard + CSV export | ✓ | ✓ | ✓ |
| Teamfit compare (when shipped) | — | ✓ (≤6 turns, $0.04 COGS) | ✓ |
| API access (results webhook) | — | ✓ | ✓ + SLA |
| SSO | — | — | ✓ |
| White-label report page | — | — | ✓ |
| Audit-log export (already in schema) | — | ✓ | ✓ |
| Proctor evidence retention | 90 d | 1 yr | custom |
| Support | email | priority | named |

Seat-price COGS check: worst plan ($2.50/seat Enterprise) vs worst COGS ($0.56) → 78% margin floor. Healthy.

## 4. Model restrictions per plan (enforced server-side via entitlements)

| Capability | Free | Assessment | Assessment+ | B2B tiers |
| --- | --- | --- | --- | --- |
| Certified judge panel (pinned gpt-5.4, J=5) | — | ✓ | ✓ | ✓ (identical for all — validity is not tiered) |
| Avatar conversation model | — | mini (post-R2) | mini | mini; Enterprise may pin 5.4 avatars as a premium line item |
| Replay coaching model | — | — | gpt-5.4-mini | gpt-5.4-mini |
| Practice snippet (future) | nano/mini, 2 turns | — | — | — |
| Dual-scorer research channel | Internal only — never a sellable tier until Phase 2 agreement gate passes | | | |

## 5. Portfolio frame — the other StudAI products

**Honesty note (per audit rules):** Engage, BOS, Hire, Loop, Career, Creator and Training Programs have **no codebase in this repository** — nothing below is an audit; it is a pricing *template* to be re-grounded per product with this same method (measure token budgets → price meters → per-action COGS → plan limits).

| Product | Likely billing atom (to verify in its repo) | Template model |
| --- | --- | --- |
| StudAI Engage | conversation / resolved thread | per-seat SaaS + metered conversations |
| StudAI BOS | workflow run | platform fee + per-run |
| StudAI Hire | candidate screened | per-candidate credits (natural Prism bundle: Hire seat includes Prism assessments at internal transfer price $0.35) |
| StudAI Loop | learner-month | per-active-learner |
| StudAI Career | roadmap/session | freemium + one-time reports |
| StudAI Creator | generation job | credit packs (image/video COGS must be measured — 10–100× LLM text costs) |
| Training Programs | cohort seat | course pricing; Prism attached as the assessment layer at bundle price |

Cross-sell law: any StudAI product may resell a Prism assessment at internal COGS + $1 floor; the certificate is the ecosystem's trust anchor.
