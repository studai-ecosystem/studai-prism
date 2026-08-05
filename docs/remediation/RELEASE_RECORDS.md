# RELEASE RECORDS — append-only production release ledger

One entry per production release attempt (including failures and rollbacks),
per [DEPLOYMENT_RUNBOOK_v1.md](../DEPLOYMENT_RUNBOOK_v1.md) §7. Entries are
NEVER edited or deleted after being appended.

Baseline: production currently runs image tag `ad4be54df1ad`
(pre-remediation commit ad4be54), deployed before this ledger existed.
No remediation commit has been deployed yet.

---

## 2026-08-05T06:15Z — 2b84e13c07f2

- image: 158346964832.dkr.ecr.ap-south-1.amazonaws.com/prod/prism:2b84e13c07f2
- commit: 2b84e13c07f2cb02d76adf96e6aafe83a5ccf120 (fix(remediation-p6): add missing 0017 down migration) — carries the full remediation series d2efbd9..2b84e13 (Phases 1–5 + release prep)
- CI: run 30980599973 SUCCESS (incl. first §20 JSON→PG rehearsal on real Postgres); build: run 30980670490 SUCCESS (ECR scan gate clean)
- backups before deploy: RDS manual snapshot `prism-remediation-p6-20260805` (available, 100%); EFS recovery point COMPLETED 2026-08-04; JSON store copied out-of-pod, SHA-256-verified + parse-checked (assessments.json 1,183,588 B / users.json 12,063 B)
- migrations applied: 0018_candidate_governance, 0019_accommodations_retention, 0020_commercial (in-pod via runWithRuntimeSecrets after rollout)
- verified by: agent (operator authorized autonomous execution; evidence in FINAL_REPORT_2026-08-05.md §H)
- health checks: pass — boot clean (35 keys, backend json, items 96), live bundle index-DCrdqvtl.js matches the commit's build, full §21 battery green, 0 error log lines post-battery
- flags: ALL dark flags confirmed dark post-deploy; PRISM_STANDARDIZED_CORE NOT flipped (HA-021 requires explicit operator authorization — ONE LAW)
- rollback: not needed | command: `kubectl set image deployment/prism prism=158346964832.dkr.ecr.ap-south-1.amazonaws.com/prod/prism:ad4be54df1ad -n prism`
