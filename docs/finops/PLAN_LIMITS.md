# Plan Limits — StudAI Prism

The authoritative plan/limits matrix lives in [PRICING_STRATEGY.md](PRICING_STRATEGY.md) §2 (B2C) and §3 (B2B). This file is the quick-reference card of every enforceable limit and where it is (or should be) enforced.

| Limit | Value | Enforcement point |
| --- | --- | --- |
| Session wall clock | 35 min | code, `SESSION_LIMIT_MS` (410 after) — live |
| Exchanges | min 6, +2 extensions, time-capped ≈ 8–12 | code — live |
| Retest gap | 90 days (`PRISM_REASSESSMENT_GAP_DAYS`) | code — live |
| STT | 15 MB/clip, 20/min/IP; add 30 min/user/day at S2 scale | code — live / planned R7 |
| TTS (when lit) | 150 calls × 600 chars/session; verbatim-line check | code — live (dark) |
| Replay | ≤3 turns (Assessment+ and up) | code (dark) + entitlements |
| Teamfit | ≤6 turns (Growth and up) | code (dark) + entitlements |
| Included assessments | Starter 25/mo, Growth 120/mo, Enterprise pooled | entitlements — to build with B2B plans |
| Overage seat price | $5 / $4 / $2.50–3.50 | billing — to build |
| API access / SSO / white-label / audit export | per §3 matrix | entitlements — to build |
| Judge panel size & model | J=5, pinned gpt-5.4, identical for every plan | ops config — **never plan-tiered** |
