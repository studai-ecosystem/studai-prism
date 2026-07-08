# StudAI Prism — AI Models Audit, Provider Matrix & Routing Strategy

All prices pulled from the Azure Retail Prices API (`prices.azure.com`, service **Foundry Models** / Cognitive Services, USD) on 2026-07-08. All deployments verified with `az cognitiveservices account deployment list` against the live account.

## 1. Deployed models (account `studai-openai-286274596`, rg `studai-one-platform`, eastus)

| Deployment | Model version | SKU | Capacity | Used by Prism? | Where |
| --- | --- | --- | --- | --- | --- |
| `gpt-5.4` | 2026-03-05 | GlobalStandard | 1000 | **Yes — primary** | `MODEL()` in server/routes/assessment.js reads `AZURE_OPENAI_DEPLOYMENT` (prod value: `gpt-5.4`) |
| `gpt-5.4-mini` | 2026-03-17 | GlobalStandard | 100 | Available, unused by default | Candidate for `PRISM_JUDGE_MODEL_B` / avatar routing (this doc, §5) |
| `gpt-4` (gpt-4.1) | — | Standard | 10 | No | Legacy, other StudAI products |
| `text-embedding-3-large` | — | Standard | 50 | **No** (verified: zero call sites) | — |
| `whisper` | — | — | — | **Yes** | Separate AI Services resource `studa-motw4d5c-eastus2`, `AZURE_WHISPER_DEPLOYMENT=whisper` |
| Azure Speech neural TTS | en-IN neural voices | F0/S0 | — | Code shipped, **flag dark** (`PRISM_TTS_NEURAL`) | server/lib/azureSpeech.js |

API version in code: `2025-04-01-preview` (chat completions), api-version pinned per call site.

## 2. Verified price sheet (USD)

| Meter | Input /1M | Cached input /1M | Output /1M | Notes |
| --- | --- | --- | --- | --- |
| gpt-5.4 Global | **$2.50** | **$0.25** | **$15.00** | primary production path |
| gpt-5.4 Data-zone | $2.75 | $0.275 | $16.50 | +10% if data residency forced |
| gpt-5.4 Batch Global | $1.25 | — | $7.50 | 50% off, async ≤24 h |
| gpt-5.4-mini Global | **$0.75** | $0.075 | **$4.50** | 30% of big-model price |
| gpt-5.4-nano Global | $0.20 | — | $1.25 | not deployed; candidate for trivial calls |
| gpt-5.4-pro Global | $30.00 | — | $180.00 | not deployed; no Prism use case |
| gpt-5.4 long-context | $5.00 | — | $22.50 | not needed (transcripts ≪ 128k) |
| Whisper batch | **$0.36/hour = $0.006/min** | — | — | regional $0.396/hr |
| Neural TTS S0 | $16.00 / 1M characters | — | — | F0: 0.5M chars/month free |

## 3. Which model does what, and why (current state)

| Call site (file) | Model today | Max out | Temp | Why this model |
| --- | --- | --- | --- | --- |
| Opening turn (assessment.js) | gpt-5.4 | 350 | 0.8 | Candidate-facing persona quality |
| Per-exchange avatar (assessment.js) | gpt-5.4 | 350 | 0.85 | Candidate-facing; carries scenario logic |
| Calibration tier (v1, 8 tok) | gpt-5.4 | 8 | — | Trivial classification — over-modeled today |
| Entry estimator (v2 flag, 60 tok) | gpt-5.4 | 60 | — | Same — over-modeled |
| **Judge panel ×5 (evaluate)** | gpt-5.4 pinned | 2000 | 0.2/0.3/0.4 | **The product's measurement instrument.** Model version is part of the scoring fingerprint (`model_fingerprint` in judge_votes); do not float |
| Consistency probes (~20% turns) | gpt-5.4 | 150 | — | Same fingerprint rule |
| Dual scorer K_A/K_B (dark) | gpt-5.4 / `PRISM_JUDGE_MODEL_B` | 150 | 0.7 | Designed for two-model disagreement detection |
| Micro-rater (dark, exec path) | gpt-5.4 | 150 | — | Adaptive-stop signal only |
| Whisper STT | whisper | — | — | Only ASR wired |
| Neural TTS (dark) | en-IN neural | — | — | Persona voices |

## 4. Provider matrix (why Azure, what would change)

| Criterion | Azure OpenAI (current) | OpenAI direct | Anthropic | Google Vertex | Verdict |
| --- | --- | --- | --- | --- | --- |
| gpt-5.4-class price | $2.50/$15.00 | Same list price | Comparable tier | Comparable tier | Parity — price is not the differentiator |
| Cached-input discount | 90% off input | Similar | Similar | Similar | Parity |
| Data processing terms | No training on inputs; enterprise DPA; regional/data-zone options | Weaker default posture for a psychometric vendor | Good | Good | **Azure wins for assessment data** |
| Scoring reproducibility | Pinned deployment versions (`2026-03-05`) — fingerprint law satisfiable | Model aliases can drift | Aliases drift | Aliases drift | **Azure wins** — pinned versions are load-bearing for IRT calibration |
| Whisper + TTS + LLM one bill | Yes | No TTS parity | No | Partial | Azure wins on consolidation |
| Sponsorship credits | Active on both subscriptions | No | No | No | Azure wins today |

**Decision: stay on Azure OpenAI.** Multi-provider adds fingerprint drift risk to a psychometric instrument for zero price advantage. Revisit only if a provider offers >40% sustained price advantage on a pinnable model version.

## 5. Model routing strategy (recommended target state)

Routing principle: **the measurement path stays expensive and pinned; the conversation path gets cheap.** Judges define validity; avatars only need to be believable.

| Route | From → To | Savings | Risk | Gate |
| --- | --- | --- | --- | --- |
| R1. Calibration tier + entry estimator → `gpt-5.4-mini` | $2.50 → $0.75 input | ~$0.001/session (small but free) | None — 8–60 token classifications | Ship immediately |
| R2. Avatar turns (opening + exchanges) → `gpt-5.4-mini` | ~$0.081 → ~$0.026/session | Persona quality | A/B 50 sessions; rubric: candidate-visible coherence. Avatars are **not scored output** — judge inputs are candidate answers + avatar lines as context; mini keeps context quality | Behind env swap `PRISM_AVATAR_DEPLOYMENT` (add ~6-line change) |
| R3. Judge panel → **keep gpt-5.4 pinned** | — | — | The whole product | Never route for cost. Re-fingerprint only on deliberate model upgrades with parallel-run equating (spec Part C) |
| R4. Cached input on static prefixes | 90% off repeated prefix tokens | ~$0.08–0.11/session | None (automatic on GlobalStandard when prefixes are byte-stable ≥1024 tok) | Restructure prompt assembly: static system+rubric first, variable content last (see FINOPS_RECOMMENDATIONS §1) |
| R5. Dual scorer (when lit) K_B → `gpt-5.4-mini` | 5×150-tok calls at 30% price | Designed for it — B-channel is intentionally a different model | Set `PRISM_JUDGE_MODEL_B=gpt-5.4-mini` | Config only |
| R6. Batch API for replay/teamfit narratives (when lit) | 50% off | Latency (async OK for these) | Post-MVP | — |

**Per-plan model restrictions** (enforce server-side via entitlements → see PRICING_STRATEGY.md §4): practice/replay features on mini; certified assessments always on the pinned judge model regardless of plan — **a cheaper plan must never mean a less valid certificate**, it means fewer features, not a worse instrument.
