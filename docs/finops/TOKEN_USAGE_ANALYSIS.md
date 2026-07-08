# Token Usage Analysis — StudAI Prism

Measured per-call-site token budgets, derived from prompt files in `server/prompts/` and call parameters in `server/routes/assessment.js`. Full arithmetic and cost conversion live in [FEATURE_COST_ANALYSIS.md](FEATURE_COST_ANALYSIS.md) §1–3; this file is the per-call reference table.

## Per call site

| Call site | Frequency | Input tokens | Max output | Prompt source |
| --- | --- | --- | --- | --- |
| Opening turn | 1/session | ~900 | 350 | avatar_system.v1.md (~800) + opening_turn (~45) |
| Avatar exchange | ~10/session | 900 + 400×(e−1), full history resent | 350 | avatar_system.v1.md + history |
| Calibration tier (v1) | 1/session | ~275 | 8 | inline classifier |
| Entry estimator (v2 flag) | 1/session | ~275 | 60 | entry_estimator prompt |
| Judge (full) | 5/session at submit | ~6,000 (judge_full ~1,000 + rubric ~700 + transcript ~4,000 + wrapper) | 2,000 | judge_full.v1.md |
| Consistency probe | ~4/session | ~900 | 150 | judge_turn.v1.md (~300) |
| Micro-rater (v2 flag, dark) | 1/turn | ~525 | 150 | micro_rater prompt (~225) |
| Dual scorer votes (v2 flag, dark) | (K_A=20 + K_B=5)/turn | ~900 | 150 | judge_turn.v1.md |
| Replay (flag dark) | ≤3 turns | ~900 | 350 | replay prompt |
| Teamfit (flag dark) | ≤6 turns | ~900 | 350 | teamfit prompt |

Language variants (hi/ta) add ~10–15% prompt mass.

## Session totals (typical E=10)

| Metric | Value |
| --- | --- |
| Total input | ≈ 61,800 tokens |
| Total output | ≈ 9,400 tokens |
| Grand total | ≈ 71,200 tokens |
| Worst case (E=12, long answers, max judge output) | ≈ 111,400 tokens |
| Cacheable share of input (post-R1 restructure) | ≈ 45% |

Runtime accounting: `tokensUsed` accumulates `response.usage.total_tokens` per session in the session store — export per-call-site breakdowns per recommendation R9.
