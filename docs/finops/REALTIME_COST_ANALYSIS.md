# Realtime Cost Analysis — StudAI Prism

**Finding: Prism does not use any realtime AI API (no WebRTC/WebSocket streaming AI sessions). Cost: $0.**

Evidence:

- No realtime API endpoints, no ephemeral-token minting, no `realtime` deployments on the account serving Prism.
- The only WebSocket in the system is the **socket.io phone-proctor relay** — an in-memory frame relay between the candidate's phone and desktop (5 MB buffer, no AI involvement). Its cost is bandwidth only, ₹0 month-to-date.
- Voice interactivity is deliberately turn-based: record → Whisper transcript → judged as text ([VOICE_COST_ANALYSIS.md](VOICE_COST_ANALYSIS.md)). Total ≈ $0.12/session with TTS lit.

Why this is the right call (cost + method):

1. Realtime audio models bill audio tokens at roughly $32–40/1M input and $64–80/1M output — a 25-minute spoken session would cost **$3–6, i.e. 10–20× the entire current session COGS**, inverting the margin structure at the $10 price point.
2. The scoring pipeline is transcript-based by design (judges consume text; ASR confidence may down-weight a turn but never scores voice qualities — build rule). Realtime audio adds latency polish, not measurement validity.

Revisit only for a premium Enterprise interview-simulation SKU priced ≥ $30/session, and re-cost here first.
