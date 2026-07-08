# StudAI Prism — Infrastructure Cost (real SKUs, real bills, scale ladder)

Sources: `az resource list` / `az appservice plan show` / `az postgres flexible-server list` on 2026-07-08; Azure Cost Management ActualCost month-to-date (July 1–8, INR); Azure retail list prices for forward projections.

## 1. What is running right now

| Resource | SKU (verified) | Region | MTD actual (8 days) | Run-rate/mo |
| --- | --- | --- | --- | --- |
| App Service plan `studai-prism-plan` (webapp `studai-prism` → prism.studai.one) | **B1 Basic**, 1 instance (1 vCPU / 1.75 GB) | centralindia | ₹233.61 | ≈ ₹900 ≈ **$10.8** |
| PostgreSQL Flexible `studai-prism-db` | **Standard_B1ms Burstable**, 32 GB, v16 | centralindia | ₹391.10 | ≈ ₹1,500 ≈ **$18.0** |
| Bandwidth | — | — | ₹0.00 | ~$0 (within free 100 GB egress) |
| Trusted Signing `studai-prism-signing` | Basic | eastus | pending validation | **$9.99** |
| Azure OpenAI + AI Services | Shared account in sub `3e8183b6` (rg `studai-one-platform`) | eastus/eastus2 | Cost Management shows ₹0 App Service + ₹427.74 Container Apps in that RG; AOAI consumption currently drawn against **sponsorship credits** (pay-as-you-go meters, no committed spend) | Variable — see per-session math |
| Redis, CDN, queues, search, storage accounts for Prism | **None deployed** | — | $0 | $0 |

**Fixed floor today ≈ $39/month** ($10.8 + $18.0 + $9.99, excluding sponsored AI consumption). DNS/domain held at registrar (outside Azure billing).

## 2. Capacity reality of the current floor

- **B1 App Service:** Node/Express with in-memory session cache. Sessions are I/O-bound (AI latency dominates); a session issues ~1 LLM call/30–60 s. Concurrency ceiling estimate: **~40–60 concurrent live sessions** (memory-bound by session cache + socket.io proctor relays, 5 MB buffer each) — beyond that, upgrade.
- **B1ms Postgres:** telemetry writes are batched, append-only; judge vote persistence is fire-and-forget. Comfortable to **~10k sessions/month**; the burstable CPU is the limit during calibration exports, which are operator-run and can be scheduled off-peak.
- **AOAI GlobalStandard capacity 1000** (≈1,000K tokens/min): a session consumes ~71k tokens spread over ~25 min plus a ~36k-token burst at submit (5 judges in parallel, mapLimit 6). Submit bursts of **~25 simultaneous evaluations** fit in the minute window. Adequate to ~50k sessions/month before requesting capacity.

## 3. Scale ladder (what to change, when, and what it costs)

| Stage | Users (candidates/mo) | Changes | Infra $/mo (list) |
| --- | --- | --- | --- |
| S0 (today) | 1–500 | Nothing | **$39** |
| S1 | 500–2,000 | Add Redis session cache (Basic C0 $16) so restarts don't drop live sessions; PG → B2s ($30) | ≈ $67 |
| S2 | 2k–10k | App Service → **P0v3** ($62) or 2×B1; PG B2ms + 64 GB (~$60); enable App Service autoscale | ≈ $150 |
| S3 | 10k–50k | P1v3 ×2 ($250), PG General Purpose D2ds ($140), Azure Front Door/CDN for static ($35), Redis C1 ($40) | ≈ $470 |
| S4 | 50k–200k | P1v3 ×3–4 + slots, PG D4ds + HA ($560), AOAI capacity raise (request; GlobalStandard has no premium), log analytics budget | ≈ $1,300 |
| S5 | 1M | Multi-region pair, PG zone-redundant HA + read replica, Front Door premium, PTU evaluation for AOAI (only if tokens/mo × PAYG > PTU floor — at ~$0.18/session optimized, 1M sessions ≈ $180k/yr tokens; evaluate PTU/batch mix then) | ≈ $4–6k + AI |

Key structural point: **infrastructure is never the cost story — AI consumption scales linearly with sessions and dominates from ~2k sessions/month onward.** See USER_COST_SIMULATION.md.

## 4. Non-Azure fixed costs

| Item | $/mo | Note |
| --- | --- | --- |
| Domain studai.one | ~$3 (amortized) | registrar |
| Razorpay | 2–3% of GMV when live | keys currently dead; `PRISM_DUMMY_PAYMENTS=true` |
| SMTP | $0 today (dark) | if enabled: free tiers cover pilot volume |
| GitHub Actions CI | $0 | public/free tier usage observed |
