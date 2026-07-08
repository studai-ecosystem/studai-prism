# Voice Cost Analysis — StudAI Prism

Voice in Prism is **speech-to-text input and text-to-speech output only** — no voice-emotion, prosody or tone scoring exists anywhere in the system (prohibited by build rules; verified by code search).

## 1. Speech-to-text (live in production)

| Item | Value | Source |
| --- | --- | --- |
| Engine | Azure Whisper, deployment `whisper` on `studa-motw4d5c-eastus2` | env `AZURE_WHISPER_*` |
| Price | **$0.006 / audio minute** ($0.36/hr batch meter) | Azure Retail Prices API |
| Usage/session | ~10 answers × 45 s ≈ 7.5 min → **$0.045** | session model, FEATURE_COST_ANALYSIS §1 |
| Worst case | 12 × 60 s = 12 min → $0.072 | |
| Guards | 15 MB upload cap (multer), 20/min/IP limiter, session auth | server/routes + security.js |
| ASR confidence | may down-weight a turn, never changes a score directly | build rules, scoring code |

## 2. Text-to-speech

| Mode | Status | Cost |
| --- | --- | --- |
| Browser `speechSynthesis` (per-persona ranked voices, `src/lib/voice.js`) | **Live** | $0 |
| Azure neural TTS (en-IN neural voices per cast, `server/lib/azureSpeech.js`) | Shipped, **flag dark** (`PRISM_TTS_NEURAL`) | F0: 0.5M chars/mo free (~110 sessions); S0: $16/1M chars → ~4,400 chars/session ≈ **$0.070** |
| Hard budget in code | 150 calls × 600 chars/session; text must match an avatar line verbatim | absolute worst $1.44/session, no free-TTS proxy abuse |

## 3. Realtime voice API

Not used — see [REALTIME_COST_ANALYSIS.md](REALTIME_COST_ANALYSIS.md). The turn-based Whisper+TTS design costs ~$0.12/session for full voice; a realtime-API session of the same length would cost roughly 10–20× that at current realtime audio-token rates, for no measurement benefit (scoring needs text transcripts anyway).

## 4. Plan treatment

STT minutes are included in every paid SKU (the assessment requires it). Neural TTS is a Growth/Enterprise plan feature when lit ([PRICING_STRATEGY.md](PRICING_STRATEGY.md) §3), pilot on F0 free tier first (recommendation R7).
