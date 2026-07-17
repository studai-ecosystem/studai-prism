# AWS Deployment

Prism runs on a dedicated ECS Fargate cluster in the existing production VPC.
The service uses private subnets with NAT egress, an encrypted EFS access point
for the JSON operational store, and host-based routing on the shared production
ALB. The task role reads one deployment-specific Secrets Manager JSON object
and invokes only the approved Bedrock models and Polly.

## Topology

- ECS cluster/service: `studai-prism-prod` / `web`
- ECR repository: `prod/prism`
- Runtime secret: `/studai/prism/aws-prod/runtime`
- CloudWatch logs: `/ecs/studai-prism-prod`
- Public hostname: `prism-aws.studai.one`
- Persistent data: encrypted EFS mounted at `/home/data/prism`
- Desired tasks: one. Do not scale above one until the PostgreSQL operational
  store and shared Redis session cache are enabled.

## Deploy

GitHub Actions builds only the committed source and authenticates to AWS through
OIDC. No long-lived AWS or registry credential is stored in GitHub.

```powershell
./scripts/deploy-aws.ps1
```

The script dispatches the manual `Deploy AWS` workflow. The workflow builds and
pushes a commit-tagged image, validates the CloudFormation template, deploys the
stack, waits for ECS stability, and checks the health endpoint through the ALB.

## DNS

The `studai.one` DNS zone is hosted outside Route 53. Add this CNAME after the
stack succeeds:

```text
prism-aws.studai.one -> studai-prod-alb-1680476985.ap-south-1.elb.amazonaws.com
```

The ALB certificate covers `*.studai.one`. HTTP requests for this host redirect
to HTTPS; unrelated hosts continue to receive the existing fixed response.

## Verification

```powershell
Invoke-RestMethod https://prism-aws.studai.one/api/health
aws ecs describe-services --cluster studai-prism-prod --services web `
  --profile studai-bedrock-prod --region ap-south-1
aws logs tail /ecs/studai-prism-prod --since 10m `
  --profile studai-bedrock-prod --region ap-south-1
```

Expected startup logs include `runtime_secrets_loaded` with only a key count and
version ID. Secret values must never appear in ECS, CloudFormation, or logs.

## Rollback

Re-run the script from the previous Git commit to register its task definition
and update the service. ECS deployment circuit breaker rollback is enabled. EFS
is retained if the stack is deleted.
