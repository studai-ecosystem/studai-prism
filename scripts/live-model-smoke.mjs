#!/usr/bin/env node
// P9.5 authorized live-model staging — runbook harness.
//
//   node scripts/live-model-smoke.mjs            → prints the run manifest and the
//                                                  list of BLOCKED live checks (exit 3)
//   PRISM_LIVE_MODEL_AUTHORIZED=true + provider credentials + PRISM_LIVE_MODEL_SPEND_LIMIT_USD
//                                                → runs the real learner sequence against
//                                                  PRISM_LIVE_MODEL_TARGET_URL (not implemented
//                                                  past the gate in this build: see below)
//
// This script NEVER fabricates a transcript, evidence or a report. Without
// operator authorization and credentials it documents exactly which live
// checks remain blocked and why, as JSON on stdout. With authorization it
// still refuses when the spend limit, consent/data class or target are
// missing. The live sequence itself is executed by an operator following
// docs/experience/ROLLOUT.md with this manifest attached; this build records
// lineage inputs and gates, it does not spend money on its own.
import { execSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = process.env

function git(cmd) { try { return execSync(`git ${cmd}`, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return null } }
function schemaHead() {
  try {
    const files = readdirSync(join(root, 'server', 'db', 'migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f) && !f.includes('.down.')).sort()
    return files.at(-1) || null
  } catch { return null }
}

const { DRAFT_SEGMENT_ID, DRAFT_CORE_TEAMREADY_A_HANDOVER, SLICE_METHOD_VERSION } = await import('../server/domain/assessments/draftSegments.js')
const { aiProvider, conversationModel, judgeModel, fastModel } = await import('../server/services/ai/modelRouter.js')
const safe = (fn) => { try { return fn() || null } catch { return null } }

const manifest = {
  kind: 'LIVE_MODEL_RUN_MANIFEST',
  createdAt: new Date().toISOString(),
  build: { sha: git('rev-parse HEAD'), branch: git('rev-parse --abbrev-ref HEAD'), dirty: Boolean(git('status --porcelain')) },
  schema: { head: schemaHead() },
  form: { segmentId: DRAFT_SEGMENT_ID, version: DRAFT_CORE_TEAMREADY_A_HANDOVER.version, status: DRAFT_CORE_TEAMREADY_A_HANDOVER.status, rubricRef: DRAFT_CORE_TEAMREADY_A_HANDOVER.rubricRef, methodVersion: SLICE_METHOD_VERSION },
  models: { provider: safe(aiProvider), conversation: safe(conversationModel), judge: safe(judgeModel), fast: safe(fastModel), promptVersions: 'from prompt registry at run time (server/lib/credentials.js activePromptVersions)' },
  consent: { dataClass: env.PRISM_LIVE_MODEL_DATA_CLASS || null, consentVersion: env.PRISM_LIVE_MODEL_CONSENT_VERSION || null, participants: 'operator/staff synthetic persona only; no learner until HA gate is signed' },
  approvals: {
    content: env.PRISM_LIVE_MODEL_CONTENT_APPROVAL_REF || null,
    measurement: env.PRISM_LIVE_MODEL_MEASUREMENT_APPROVAL_REF || null,
    securityPrivacy: env.PRISM_LIVE_MODEL_SECURITY_PRIVACY_APPROVAL_REF || null,
  },
  spend: { limitUsd: env.PRISM_LIVE_MODEL_SPEND_LIMIT_USD ? Number(env.PRISM_LIVE_MODEL_SPEND_LIMIT_USD) : null, costTags: 'services/ai/costTracker.js tags per call' },
  target: { url: env.PRISM_LIVE_MODEL_TARGET_URL || null },
}

const LIVE_CHECKS = [
  { id: 'L1', check: 'existing account → old report readable in original format' },
  { id: 'L2', check: 'approved pilot form → actual intro with pinned facts → explicit Begin (one start time)' },
  { id: 'L3', check: 'meaningful messages and a board edit are durably acknowledged before any model reply' },
  { id: 'L4', check: 'refresh/resume keeps scenario, artifact versions and conversation' },
  { id: 'L5', check: 'finish → leased evaluation → strict units with verbatim quotes against the real model' },
  { id: 'L6', check: 'evidence-backed report published once; second read serves the same version' },
  { id: 'L7', check: 'relevant practice created; retry is a new practice record; formal snapshot unchanged' },
  { id: 'L8', check: 'actions, opportunities, evaluation attempts, units and publication link to the same run id' },
  { id: 'L9', check: 'cost and lineage recorded per call under the spend limit' },
]

const blockers = []
if (env.PRISM_LIVE_MODEL_AUTHORIZED !== 'true') blockers.push({ code: 'NO_OPERATOR_AUTHORIZATION', dependency: 'PRISM_LIVE_MODEL_AUTHORIZED=true set by the operator who owns the spend', owner: 'operations lead' })
const hasCreds = Boolean(env.AWS_ACCESS_KEY_ID || env.AWS_PROFILE || env.AWS_ROLE_ARN || env.OPENAI_API_KEY || env.PRISM_AI_API_KEY)
if (!hasCreds) blockers.push({ code: 'NO_PROVIDER_CREDENTIALS', dependency: 'provider credentials in the operator environment (never in files)', owner: 'operations lead' })
if (!manifest.spend.limitUsd || !(manifest.spend.limitUsd > 0)) blockers.push({ code: 'NO_SPEND_LIMIT', dependency: 'PRISM_LIVE_MODEL_SPEND_LIMIT_USD approved amount', owner: 'product/finance' })
if (!manifest.consent.dataClass || !manifest.consent.consentVersion) blockers.push({ code: 'NO_CONSENT_DATA_CLASS', dependency: 'PRISM_LIVE_MODEL_DATA_CLASS and PRISM_LIVE_MODEL_CONSENT_VERSION from the privacy owner', owner: 'security/privacy' })
if (!manifest.approvals.content) blockers.push({ code: 'NO_CONTENT_APPROVAL', dependency: 'PRISM_LIVE_MODEL_CONTENT_APPROVAL_REF for the exact form/rubric/prompt package', owner: 'content owner' })
if (!manifest.approvals.measurement) blockers.push({ code: 'NO_MEASUREMENT_APPROVAL', dependency: 'PRISM_LIVE_MODEL_MEASUREMENT_APPROVAL_REF for intended use, method and interpretation', owner: 'measurement lead' })
if (!manifest.approvals.securityPrivacy) blockers.push({ code: 'NO_SECURITY_PRIVACY_APPROVAL', dependency: 'PRISM_LIVE_MODEL_SECURITY_PRIVACY_APPROVAL_REF for consent, data class, retention and access', owner: 'security/privacy owner' })
if (!manifest.target.url) blockers.push({ code: 'NO_TARGET', dependency: 'PRISM_LIVE_MODEL_TARGET_URL of the staging deployment with the real model stack', owner: 'engineering lead' })
if (manifest.form.status !== 'APPROVED') blockers.push({ code: 'FORM_NOT_APPROVED', dependency: `pilot form ${manifest.form.segmentId} is ${manifest.form.status}; content review sign-off required (HA register)`, owner: 'content owner / measurement lead' })

const out = {
  status: blockers.length ? 'BLOCKED' : 'READY_FOR_OPERATOR_RUN',
  manifest,
  blockers,
  liveChecks: LIVE_CHECKS.map((c) => ({ ...c, state: 'BLOCKED', evidenceNeeded: 'run id, job attempts, unit ids, report version and cost rows from the staging database — recorded by the operator, not by this script' })),
  note: 'No transcript, evidence or report is produced here. A pending authorization is never a passing test. Layer C evidence must come from the live run itself.',
}
process.stdout.write(JSON.stringify(out, null, 2) + '\n')
process.exit(blockers.length ? 3 : 0)
