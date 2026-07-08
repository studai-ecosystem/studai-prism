# Model Restrictions — StudAI Prism

Authoritative sources: [AI_MODELS_AUDIT.md](AI_MODELS_AUDIT.md) §5 (routing law) and [PRICING_STRATEGY.md](PRICING_STRATEGY.md) §4 (per-plan matrix). This card states the restrictions as policy.

1. **The certified scoring path is model-invariant across plans.** Every paid assessment — $6 retest or Enterprise seat — is judged by the same pinned `gpt-5.4` (2026-03-05) panel at J=5. Plans tier features, never validity.
2. **Version pinning is law.** Deployment versions are part of the scoring fingerprint (`model_fingerprint` persisted with judge votes). Upgrades require a parallel-run equating study, never a silent alias bump.
3. **Candidate-facing conversation may run on `gpt-5.4-mini`** after the R2 A/B gate; Enterprise may buy pinned-5.4 avatars as a line item.
4. **Coaching/practice surfaces (replay, future practice snippets) run on mini** (nano if ever deployed); they are explicitly non-certified and watermarked as such in the UI.
5. **Dual-scorer channel B must be a different, cheaper model** (`PRISM_JUDGE_MODEL_B=gpt-5.4-mini`) — disagreement detection is the point.
6. **`gpt-5.4-pro` and long-context SKUs are banned** — no use case, 12–72× price. Any future need re-enters via this document.
7. **No plan may disable the cost guards** (session wall, TTS budget, STT limits, retest gap) — they are safety and psychometric constraints, not upsell levers, except the documented B2B teamfit/replay entitlements.
