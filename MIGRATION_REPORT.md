# AWS Bedrock Migration Report

**Date:** 2026-07-16  
**Repository:** `studai-ecosystem/studai-prism`  
**Branch:** `main`  
**Scope:** Cloud AI provider migration; application hosting and databases were
not replatformed.

## Executive Summary

All runtime cloud AI calls have moved from Azure OpenAI, OpenAI Whisper, and
Azure Speech to a centralized AWS service layer. Text and audio-understanding
calls use Amazon Bedrock Runtime; optional output-only persona speech uses
Amazon Polly. The OpenAI SDK and both previous provider modules were removed.

Score arithmetic, panel aggregation, audit events, feature flags, consent,
session APIs, report shapes, local OCR, face-presence checks, and offline
calibration models remain intact.

The code migration is complete and all executable non-database tests pass.
Production cutover is not scientifically approved until Claude Sonnet 5 is
shadow-scored against the fixed transcript/human anchor set. Software tests
cannot establish psychometric equivalence.

## Architecture Before

- One OpenAI-compatible client lived inside `server/routes/assessment.js`.
- Azure OpenAI GPT-5.4 handled calibration, roleplay, micro-rating, and judges.
- Replay and teamfit imported the route's client function directly.
- OpenAI/Azure Whisper used a separate OpenAI SDK client.
- Azure Speech used a direct REST call and subscription key.
- Model provenance depended on `AZURE_OPENAI_DEPLOYMENT`.
- Retries existed only around chat completions; timeouts and per-call cost logs
  were not centralized.

## Architecture After

`server/services/ai/` is the only cloud AI integration boundary:

| Module | Responsibility |
| --- | --- |
| `modelRouter.js` | Task-to-model policy, allowlist, timeouts, fallback rules |
| `bedrockClient.js` | Bedrock Runtime clients, retries, abort timeouts |
| `completionService.js` | Converse message conversion and compatibility envelope |
| `responseParser.js` | Text extraction, Guardrail stop handling, robust JSON recovery |
| `costTracker.js` | Token, cache, latency, and estimated-cost logs |
| `promptManager.js` | Facade over versioned prompt files/registry cache |
| `embeddingService.js` | Titan/Cohere text embedding adapter, dormant by default |
| `speechToTextService.js` | In-memory Bedrock AudioBlock transcription |
| `textToSpeechService.js` | Authorized Amazon Polly synthesis |

The route layer supplies only a task name and product inputs. It does not know
AWS command shapes or credentials.

## Models Selected

| Workload | Model/service | Decision |
| --- | --- | --- |
| Authoritative judges | `global.anthropic.claude-sonnet-5` | Highest reasoning/evidence fit; pinned; no automatic fallback |
| Roleplay/teamfit/replay | `mistral.mistral-large-3-675b-instruct` | Strong multilingual capability and Mumbai in-Region availability |
| Calibration/micro-rater | `mistral.ministral-3-14b-instruct` | Fast, low-cost structured task model in Mumbai |
| Non-scoring fallback | `global.amazon.nova-2-lite-v1:0` | Low-cost operational fallback; global routing must be approved |
| Speech-to-text | `mistral.voxtral-mini-3b-2507` | Raw WebM AudioBlock, Mumbai, no S3 persistence |
| Embeddings | `amazon.titan-embed-text-v2:0` | Future-only adapter; no RAG added |
| Multimodal | Mistral Large 3 | Future India-local image analysis; no feature enabled |
| Text-to-speech | Amazon Polly | Output only; exact-line authorization; dark by default |

## Behavior Preservation

- `/api/assessment/start`, `/message`, `/evaluate`, `/calibrate`, `/transcribe`,
  and `/speech` retain their public request/response shapes.
- Completion responses are normalized to the existing `choices/message/usage`
  envelope so downstream score code is unchanged.
- Existing server-side score clamping and weighted recomputation are unchanged.
- Completed-session evaluation remains idempotent by returning the stored report.
- Judge dropouts still reduce the effective panel, force low reliability below
  the minimum, and create audit records.
- Replay remains unable to write scores or credentials.
- Teamfit remains qualitative and structurally rejects numeric fit outputs.
- TTS remains behind `PRISM_TTS_NEURAL`; it additionally requires
  `POLLY_TTS_ENABLED=true`.
- STT remains text input only. No emotion, tone, prosody, or sentiment is sent
  to scoring.

## Security Changes

- Removed `AZURE_OPENAI_*`, `AZURE_WHISPER_*`, `AZURE_SPEECH_*`, and direct
  OpenAI key configuration from the runtime contract.
- Removed the `openai` package.
- Uses the AWS SDK default credential provider chain.
- Production rejects `AWS_BEARER_TOKEN_BEDROCK` and long-lived access keys
  without an STS session token.
- Production requires explicit approval for any `global.*` inference profile.
- Model overrides are restricted to configured model IDs.
- Score-affecting judge tasks cannot use the fallback model.
- Request logs exclude prompt, transcript, audio, and PII content.
- Raw audio remains a memory buffer and is never written to disk or S3.
- Optional Bedrock Guardrail ID/version can be attached to inference.
- Polly receives plain text, not SSML, preventing markup injection.

## Files Created

- `README.md`
- `AI_ARCHITECTURE.md`
- `MIGRATION_REPORT.md`
- `docs/aws/bedrock-runtime-policy.json`
- `server/services/ai/bedrockClient.js`
- `server/services/ai/completionService.js`
- `server/services/ai/costTracker.js`
- `server/services/ai/embeddingService.js`
- `server/services/ai/index.js`
- `server/services/ai/modelRouter.js`
- `server/services/ai/promptManager.js`
- `server/services/ai/responseParser.js`
- `server/services/ai/speechToTextService.js`
- `server/services/ai/textToSpeechService.js`
- `server/prompts/speech_transcription.v1.md`
- `server/test/aiGateway.test.js`
- `server/test/aiModelRouter.test.js`

## Files Removed

- `server/lib/openaiWhisper.js`
- `server/lib/azureSpeech.js`

## Important Modified Surfaces

- Assessment, replay, teamfit, micro-rater, and dual-scorer call sites
- Judge fingerprint and credential provenance
- Admin integration/model health API and UI
- Environment sample and deployment warning
- Voice cast metadata and provider-facing research copy
- CI fingerprint check and security/voice/telemetry tests
- Server dependencies and lockfile

## Dependencies

Removed:

- `openai`

Added:

- `@aws-sdk/client-bedrock-runtime` 3.1088.0
- `@aws-sdk/client-polly` 3.1088.0

Both AWS SDK versions are exact pins. The judge fingerprint records the Bedrock
Runtime SDK version and CI verifies it against `server/package.json`.

Hardened within this migration:

- Applied non-breaking audit fixes in both dependency trees.
- Upgraded `nodemailer` to 9.0.3, removing the remaining server high findings.
- Upgraded `uuid` to 11.1.1, removing its buffer-bounds advisory.

## Environment Variables

Required for production:

- `AI_PROVIDER=aws-bedrock`
- `AWS_REGION`
- `BEDROCK_PRIMARY_MODEL`
- `BEDROCK_CONVERSATION_MODEL`
- `BEDROCK_FAST_MODEL`
- `BEDROCK_FALLBACK_MODEL`
- `BEDROCK_EMBEDDING_MODEL`
- `BEDROCK_STT_MODEL`
- `BEDROCK_ALLOW_GLOBAL_INFERENCE=true` when any `global.*` model is configured

Optional:

- `BEDROCK_TIMEOUT_MS`, `BEDROCK_JUDGE_TIMEOUT_MS`
- `BEDROCK_PROMPT_CACHE`
- `BEDROCK_GUARDRAIL_ID`, `BEDROCK_GUARDRAIL_VERSION`
- `BEDROCK_COST_RATES_JSON`
- `BEDROCK_STT_ENABLED`
- `POLLY_TTS_ENABLED`, `POLLY_REGION`, `POLLY_TIMEOUT_MS`

## AWS Permissions

The runtime needs least-privilege `bedrock:InvokeModel` access to only the
configured foundation models and inference profiles. Polly is optional. See
`docs/aws/bedrock-runtime-policy.json`. The policy intentionally grants no S3
access for candidate audio.

## Database and API Changes

**Database changes:** none. No migration was necessary because model IDs already
fit existing text columns/JSON provenance fields.

**Public candidate API changes:** none in request or response shape.

**Operational API changes:**

- `/api/assessment/tts-status.provider`: `azure-speech` to `amazon-polly`
- `/api/admin/system/health`: `azureOpenAI` replaced by `bedrock`
- `/api/admin/system/models`: canonical `judgeModel`, `anchoredModel`, provider,
  region, conversation/fast/fallback models; old deployment aliases retained
- Evidence bundle adds `aiProvider` and `judgeModel`; `judgeDeployment` remains
  as a backward-compatible alias carrying the model ID

## Testing Report

### Before Migration

| Check | Result |
| --- | --- |
| Server tests | 241 discovered; 230 passed; 11 DB-gated skipped; 0 failed |
| Client production build | Passed; existing >500 kB chunk warning |
| Python calibration | 57 passed |
| Response quality | No human-labelled production baseline; not quantified |
| Known latency | Historical synthetic observations only, not a controlled benchmark |
| Typical cost | About $0.295 LLM + $0.045 STT = $0.34/session |

### After Migration

| Check | Result |
| --- | --- |
| Server tests | 257 discovered; 246 passed; 11 DB-gated skipped; 0 failed |
| Bedrock contract/security tests | 16 added; all passed |
| Client production build | Passed; same existing chunk warning |
| Python calibration | 57 passed |
| Provider boundary scan | Passed; no route/engine/scorer imports a cloud AI SDK |
| Previous SDK scan | Passed; `openai` absent, AWS clients present |
| Live Bedrock quality | Not run: local `bedrock` SSO token expired |
| Live Bedrock latency | Not measured for the same reason |
| Projected text cost | About $0.15/session during Sonnet promotion; about $0.22 afterward |
| Speech cost | Token accounting implemented; live audio-token measurement pending |

Dependency audit after remediation:

- Server: 0 findings. Optional Sentry was upgraded to 10.66.0, removing the
  vulnerable OpenTelemetry transitive chain; logger initialization and exception
  capture were smoke-tested after the upgrade.
- Frontend: five findings (two low, one moderate, two high) in Vite development
  tooling and the legacy face-api/TensorFlow tree. Available fixes require major
  Vite or face-api changes and are not mixed into the AI-provider migration.
- The added AWS SDK clients are not the source of the remaining advisories.

The 11 skipped server tests require `DATABASE_URL`; this environment did not
provide one. No database result is claimed.

## Quality and Rollout Gates

1. Restore AWS SSO/model access in a staging account.
2. Run fixed transcript JSON-schema, persona-coherence, and injection tests.
3. Shadow the full judge panel against previous GPT-5.4 outputs and human ratings.
4. Measure per-dimension bias/shift, agreement, malformed rate, p50/p95 latency,
   throttle rate, fallback rate, and actual cost.
5. Confirm Hindi, Hinglish, and Tamil transcription quality before `PRISM_LANG`.
6. Update candidate cross-border disclosure before allowing global inference.
7. Keep paid/external scoring off until the agreement gate passes.
8. Set `PRISM_DRIFT_HARD=true` after the first frozen calibration anchor.

Service availability was documentation-validated on 2026-07-16: Voxtral Mini,
Mistral Large 3, Ministral 14B, Titan Text Embeddings V2, and Polly neural voices
list `ap-south-1`. Account entitlement, quota, and real request validation remain
staging gates because the local AWS SSO session was expired.

## Rollback

There is no runtime fallback to the previous providers because their code and
credentials were intentionally removed. Operational rollback is a Git revert of
the migration commit followed by restoration of the old provider settings. A
judge model must never be silently switched during an incident.
