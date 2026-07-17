# StudAI Prism

Prism is a psychometric AI-skills assessment platform. Candidates complete a
scenario-based conversation; a server-side panel evaluates transcript evidence
across five dimensions, clamps and recomputes every score, and records an audit
trail. The browser never calls a cloud AI service directly.

The cloud AI layer uses Amazon Bedrock Runtime. Candidate speech-to-text uses a
Bedrock audio model without writing audio to disk or S3. Optional persona speech
uses Amazon Polly. Browser-local Tesseract OCR and face-presence checks remain
on-device and never affect a score.

## Stack

- React 18, Vite, React Router, Tailwind CSS
- Express on Node.js 22
- PostgreSQL for telemetry/admin/scientific records
- JSON or PostgreSQL for the v1 operational store
- Amazon Bedrock Runtime for text, multimodal, embedding, and speech-to-text AI
- Amazon Polly for optional output-only persona speech
- Tauri v2 Windows shell

## Prerequisites

- Node.js 22+
- Python 3.12 for calibration jobs
- PostgreSQL when telemetry, the admin console, or the PG store is enabled
- An AWS account with model access for the configured Bedrock models
- AWS CLI v2 for local SSO authentication

## Install

```powershell
npm install
Set-Location server
npm install
Copy-Item .env.example .env
```

Configure non-secret settings in `server/.env`. Keep credentials out of the
file. For local development, use AWS SSO:

```powershell
aws sso login --profile bedrock
$env:AWS_PROFILE = 'bedrock'
$env:AWS_REGION = 'ap-south-1'
```

The AWS SDK default credential provider chain is used. Production should use an
IAM role or federated temporary credentials. Prism refuses to start in
production with a Bedrock bearer API key or a long-lived access key.

## Runtime Secrets

Production application settings are stored as one JSON object in AWS Secrets
Manager. The server retrieves `AWSCURRENT` before importing modules that read
`process.env`; secret values override duplicate host settings. Production fails
closed when retrieval or validation fails. Logs include only the loaded key
count and secret version ID.

The host retains runtime mode, temporary AWS identity configuration, and these
bootstrap settings:

```dotenv
AWS_SECRETS_MANAGER_SECRET_ID=/studai/prism/prod/runtime
AWS_SECRETS_MANAGER_REGION=ap-south-1
AWS_SECRETS_MANAGER_REQUIRED=true
AWS_AZURE_FEDERATED_ROLE_ARN=arn:aws:iam::123456789012:role/studai-prism-azure-aws-runtime
AWS_AZURE_FEDERATED_AUDIENCE=api://00000000-0000-0000-0000-000000000000
```

Do not put `NODE_ENV`, `PORT`, Azure managed-identity endpoint/header values,
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, session tokens, role settings,
profiles, or the bootstrap settings inside the JSON payload. The loader rejects
those keys to preserve fail-closed startup and prevent circular or long-lived
credentials.
The same hydration runs for `npm run migrate`, `npm run seed:items`, and
`npm run seed:admin`.

On Azure App Service, the server requests a managed-identity token for the
configured audience and exchanges it with AWS STS using
`AssumeRoleWithWebIdentity`. The returned one-hour credentials are cached and
refreshed before expiry, then shared by Secrets Manager, Bedrock, and Polly.
`IDENTITY_ENDPOINT` and `IDENTITY_HEADER` are supplied by App Service and must
not be copied into the JSON secret.

## Bedrock Configuration

Required production settings:

```dotenv
AI_PROVIDER=aws-bedrock
AWS_REGION=ap-south-1
BEDROCK_PRIMARY_MODEL=global.anthropic.claude-sonnet-5
BEDROCK_CONVERSATION_MODEL=mistral.mistral-large-3-675b-instruct
BEDROCK_FAST_MODEL=mistral.ministral-3-14b-instruct
BEDROCK_FALLBACK_MODEL=global.amazon.nova-2-lite-v1:0
BEDROCK_EMBEDDING_MODEL=amazon.titan-embed-text-v2:0
BEDROCK_MULTIMODAL_MODEL=mistral.mistral-large-3-675b-instruct
BEDROCK_STT_MODEL=mistral.voxtral-mini-3b-2507
BEDROCK_TIMEOUT_MS=25000
BEDROCK_JUDGE_TIMEOUT_MS=60000
```

The default primary and fallback use global inference. Production startup
therefore also requires this explicit data-residency approval:

```dotenv
BEDROCK_ALLOW_GLOBAL_INFERENCE=true
```

Do not set it until cross-border processing is approved and candidate
disclosures are updated. To avoid global routing, configure only in-Region
models, including a non-global fallback.

Optional controls:

```dotenv
BEDROCK_PROMPT_CACHE=true
BEDROCK_GUARDRAIL_ID=your-guardrail-id
BEDROCK_GUARDRAIL_VERSION=1
BEDROCK_STT_ENABLED=true
POLLY_TTS_ENABLED=true
POLLY_REGION=ap-south-1
PRISM_TTS_NEURAL=true
```

`PRISM_TTS_NEURAL` remains off by default. STT falls back to browser dictation
when `BEDROCK_STT_ENABLED` is not true.

## AWS Permissions

Start from [docs/aws/bedrock-runtime-policy.json](docs/aws/bedrock-runtime-policy.json).
Replace the account ID and guardrail ID placeholders, remove unused model ARNs,
and validate the result with IAM Access Analyzer. The runtime needs:

- `secretsmanager:GetSecretValue` for `/studai/prism/prod/runtime` only
- `bedrock:InvokeModel` for the configured models/inference profiles
- `bedrock:ApplyGuardrail` only when a Bedrock Guardrail is configured
- `polly:SynthesizeSpeech` only when Polly TTS is enabled

No S3 permission is required for candidate audio.

## Run Locally

From the repository root:

```powershell
npm run dev
```

The Vite client defaults to `http://localhost:5173`; the API defaults to
`http://localhost:3001`.

## Database

```powershell
Set-Location server
npm run migrate
npm run seed:items
```

Keep the active scenario bank at eight until a frozen IRT calibration run has
succeeded. Do not enable science-gated flags without the existing flip-check.

## Test

```powershell
Set-Location server
npm test

Set-Location ..
npm run build

Set-Location calibration
py -3.12 -m pytest tests -q
```

Database-gated server tests require `DATABASE_URL` and must run serially:

```powershell
Set-Location server
npm test -- --test-concurrency=1
```

Live Bedrock validation additionally requires an active AWS session and model
access. Run the fixed transcript shadow set before enabling paid or externally
verified scoring.

## Deployment

The current application host remains Azure App Service; only the cloud AI plane
has migrated. For that topology, use AWS IAM Roles Anywhere or workload identity
federation so the default credential chain receives temporary credentials. Do
not store long-lived AWS access keys in App Service settings.

After configuring AWS federation and the environment variables above, use the
existing serial prebuilt-zip deployment process in `scripts/`. Verify the live
bundle hash, health endpoint, admin Bedrock health panel, and one synthetic
assessment. Do not enable paid/external scoring until the shadow agreement gate
in [AI_ARCHITECTURE.md](AI_ARCHITECTURE.md) passes.

For a future single-cloud topology, deploy the Node service to ECS Fargate behind
an ALB with a task role, move the v1 store to PostgreSQL, and keep calibration
jobs as separately scheduled containers. This avoids cross-cloud credentials
and supports the existing WebSocket proctor channel.

## Architecture Documents

- [AI_ARCHITECTURE.md](AI_ARCHITECTURE.md)
- [MIGRATION_REPORT.md](MIGRATION_REPORT.md)
- [docs/PRISM_v2_System_Spec.md](docs/PRISM_v2_System_Spec.md)
