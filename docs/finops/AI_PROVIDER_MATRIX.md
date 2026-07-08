# AI Provider Matrix — StudAI Prism

The full provider comparison and the stay-on-Azure decision live in [AI_MODELS_AUDIT.md](AI_MODELS_AUDIT.md) §4 (single source of truth).

Decision summary:

| Question | Answer |
| --- | --- |
| Current provider | Azure OpenAI (account `studai-openai-286274596`, eastus, GlobalStandard) + Azure AI Services (Whisper, eastus2) + Azure Speech (TTS, dark) |
| Price vs alternatives | Parity — gpt-5.4 at $2.50/$15.00 per 1M matches direct list pricing; no provider offers a decisive discount on a pinnable frontier model |
| Deciding factor | **Pinned model versions** (`2026-03-05`) satisfy the scoring-fingerprint/IRT-calibration requirement; alias-based providers drift |
| Secondary factors | Enterprise data terms for psychometric data; one bill for LLM+STT+TTS; active sponsorship credits on both subscriptions |
| Switch trigger | A provider offering >40% sustained price advantage on a version-pinnable model — re-run the §4 matrix then |
| Multi-provider stance | Rejected for the measurement path (fingerprint drift risk); permitted for the dual-scorer B-channel by design (`PRISM_JUDGE_MODEL_B`) |
