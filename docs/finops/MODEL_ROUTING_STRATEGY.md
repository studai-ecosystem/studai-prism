# Model Routing Strategy — StudAI Prism

The complete routing table (R1–R6), gates, and the measurement-path law live in [AI_MODELS_AUDIT.md](AI_MODELS_AUDIT.md) §5; per-plan enforcement lives in [PRICING_STRATEGY.md](PRICING_STRATEGY.md) §4.

The routing law in one table:

| Path | Model | May it be routed for cost? |
| --- | --- | --- |
| Judge panel + consistency probes (the instrument) | gpt-5.4, version-pinned | **Never.** Model changes only via deliberate upgrades with parallel-run equating |
| Avatar conversation (context, not measurement) | gpt-5.4 today → gpt-5.4-mini after A/B gate (R2) | Yes |
| Trivial classifiers (tier, entry estimator) | → gpt-5.4-mini (R3) | Yes, immediately |
| Dual-scorer channel B (when lit) | gpt-5.4-mini by design (R6) | Yes — different model is methodologically preferred |
| Replay / teamfit / future narratives | mini, Batch API where async (R8) | Yes |
| Cached-input pricing (all paths) | Same models, restructured prompts (R1) | Yes — order-only change, content identical |

Upgrade trigger definitions, savings math and rollout order: [FINOPS_RECOMMENDATIONS.md](FINOPS_RECOMMENDATIONS.md).
