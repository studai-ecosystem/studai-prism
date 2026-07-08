# StudAI Prism — Feature Cost Analysis (per request, per session, all math shown)

Prices: gpt-5.4 Global $2.50/1M input, $15.00/1M output, $0.25/1M cached input; Whisper $0.006/min; neural TTS $16/1M chars (S0). Sources in AI_MODELS_AUDIT.md. Token masses measured from the prompt files in `server/prompts/` and call parameters in `server/routes/assessment.js`.

## 1. The session model (assumptions, stated)

| Symbol | Meaning | Typical | Worst case | Basis |
| --- | --- | --- | --- | --- |
| E | Exchanges per session | 10 | 12 | `MIN_EXCHANGES=6`, `MAX_EXTENSIONS=2`, 35-min wall → observed practical 8–12 |
| A | Candidate answer length | 150 tok | 300 tok | 45 s speech ≈ 110–140 words; typed longer |
| V | Avatar reply length | 250 tok | 330 tok | `max_completion_tokens 350` |
| S | Avatar system prompt | 800 tok | 920 tok | `avatar_system.v1.md` (+hi/ta ≈ +15%) |
| J | Judge panel size | 5 | 5 | `PRISM_JUDGE_SAMPLES` default |
| Jp | Judge prompt + rubric | 1,700 tok | 1,700 tok | `judge_full.v1.md` ≈1,000 + rubric ≈700 |
| Jo | Judge output | 1,200 tok | 2,000 tok | `max_completion_tokens 2000` |
| P | Consistency probes | 4 calls | 6 calls | ~20% of turns × 2 votes, 150 tok out |

Per-exchange history increment ≈ A + V ≈ 400 tok (typical). Transcript at submit ≈ E × 400 ≈ 4,000 tok.

## 2. Token budget per session (typical column computed step by step)

| Phase | Input tokens | Output tokens | Math |
| --- | --- | --- | --- |
| Opening turn | 900 | 250 | S 800 + opening prompt 45 + scenario ~55 |
| Calibration tier | 275 | 8 | prompt mass measured |
| Avatar exchanges ×10 | 27,000 | 2,500 | Σₑ₌₁..₁₀ [900 + 400(e−1)] = 9,000 + 400×45 = 27,000; 10 × 250 out |
| Judge panel ×5 | 30,000 | 6,000 | 5 × (Jp 1,700 + transcript 4,000 + wrapper 300) = 5 × 6,000; 5 × 1,200 out |
| Consistency probes ×4 | 3,600 | 600 | 4 × (judge_turn 300 + turn ctx 600); 4 × 150 out |
| **Total (typical)** | **61,775** | **9,358** | ≈ 71.1k tokens |
| **Total (worst)** | ≈ 95,000 | ≈ 16,400 | E=12, A=300, Jo=2,000, P=6 |

## 3. LLM cost per session (gpt-5.4, current production path)

- Typical: input 61,775 × $2.50/1M = $0.1544; output 9,358 × $15.00/1M = $0.1404; total **$0.2948**
- Worst: input 95,000 × $2.50/1M = $0.2375; output 16,400 × $15/1M = $0.2460; total **$0.4835**
- Cost split: **judge panel ≈ 65%** of LLM spend ($0.165 + probes $0.018 of $0.295); avatar path ≈ 31%; calibration ≈ 4%.

## 4. Voice costs

**Whisper STT (live):** ~10 spoken answers × 45 s = 7.5 min × $0.006 = **$0.045/session** (worst 12 × 60 s = 12 min = $0.072). Guards: 15 MB upload cap, 20/min/IP limiter — abuse ceiling per IP ≈ 20 min audio/min = $0.12/min/IP, bounded further by session auth.

**Neural TTS (dark, `PRISM_TTS_NEURAL` off):** 11 avatar lines × ~400 chars ≈ 4,400 chars ≈ **$0.070/session** on S0; **$0 on F0** up to 0.5M chars/mo (~110 sessions/mo free). Hard budget in code: 150 calls × 600 chars = 90k chars ($1.44) absolute worst per session. Today's cost: **$0** (browser speechSynthesis, free).

## 5. Per-session totals

| Path | LLM | STT | TTS | **Total AI COGS** |
| --- | --- | --- | --- | --- |
| Current prod (typical) | $0.295 | $0.045 | $0 | **$0.34** |
| Current prod (worst) | $0.484 | $0.072 | $0 | **$0.56** |
| + neural TTS S0 lit | $0.295 | $0.045 | $0.070 | $0.41 |
| **Optimized** (cached prefixes + mini avatars, judges untouched — math in FINOPS_RECOMMENDATIONS) | ≈ $0.175 | $0.045 | $0 | **≈ $0.22** |
| All v2 flags lit (dual scorer K=25/turn ×10 + micro-rater) | ≈ $0.62 | $0.045 | $0.070 | ≈ $0.74 — **shadow-mode only, never default-on without repricing check** |

Against the $10 price (`PRICE_PAISE=1000`, payment.js): **AI COGS = 3.4% of revenue typical, 5.6% worst.**

## 6. Non-session AI features

| Feature | Status | Cost when used |
| --- | --- | --- |
| Replay coaching | Flag dark, ≤3 turns | ≈ 3 × (900 in + 250 out) ≈ $0.018 |
| Teamfit compare | Flag dark, ≤6 turns | ≈ $0.036 |
| Report/PDF generation | Client-side render of stored JSON — **$0 AI** | — |
| Verification pages, sample report | Static/DB reads — $0 AI | — |
| Proctor telemetry, sentinels | Pure computation on stored events — $0 AI | — |

## 7. Features with zero cost because they do not exist (evidence: code search)

**Image generation, video generation, embeddings/RAG, vector DB, fine-tuning, realtime voice API, SMS/WhatsApp/Telegram: not present.** Client-side face-api.js and tesseract.js run in the candidate's browser at $0 server cost. Dedicated stubs: IMAGE_COST_ANALYSIS.md, RAG_COST_ANALYSIS.md, REALTIME_COST_ANALYSIS.md.
