// Personal-data registry (PROD-READY Phase 2, SECURITY_REVIEW S8).
//
// Every column in migrations 0001+ whose name or type suggests it can hold a
// user id, email, name, phone, free text, a verbatim quote or a JSON payload
// (PERSONAL_DATA_COLUMN_PATTERN below, plus every JSON/JSONB column) is listed
// here with what account/session erasure does to it:
//
//   DELETE        the row is removed by the cascade
//   PSEUDONYMISE  the value is replaced by a stable pseudonym (`erased:<hex>`)
//                 or an erasure marker; the row stays (append-only ledgers,
//                 audit trails, finance records)
//   DETACH        the link to the person/session is cut (NULL or a fresh
//                 random reference); the row stays without personal content
//   RETAIN        kept, with the reason written next to it (not personal
//                 data, staff/admin identity plane, a governance record, or an
//                 opaque id whose data is erased elsewhere)
//
// `via` says how the cascade finds a person's rows in that table:
//   session  — keyed by an assessment session id (erasure per session)
//   user     — keyed by the v1 account id (or email / candidate id)
//   actor    — the person appears only as the actor (staff) of a record
//   none     — no link to a learner (content, configuration, staff plane)
//
// The ratchet test (server/test/personalDataRegistry.test.js) parses every
// migration and FAILS when a matching column is not registered here, so a
// future migration cannot add personal data the cascade does not know about
// (charter law 7). The cascade itself (erasureCascade.js) lists the tables it
// touches in CASCADE_COVERAGE; every DELETE / PSEUDONYMISE / DETACH entry must
// be covered (also tested).

export const ACTIONS = Object.freeze(['DELETE', 'PSEUDONYMISE', 'DETACH', 'RETAIN'])

// Names that suggest personal data (or a link to a person/session).
export const PERSONAL_DATA_COLUMN_PATTERN = /(^|_)(user_id|user_ids|email|name|phone|text|excerpt|quote|work|raw|notes?|comment|body|message|reason|contact|details?|payload|data|meta|transcript|turns|report|answers?|what_tried|outcome|next_step|title|needs|ip|user_agent|candidate_id|author|rater_id|reviewer_id|actor|college|year|gender|attributes|handle|label|resume_url|session_id|session_ids|summary|description|observations?|card|intent|stimulus|evaluation|props|features|moment|bundle|inputs|resolution|note|address|location|target_id|resource_id|entity_id|subject|subject_ref|personal_key|idempotency_key|source_id)$|_by$|_json$|_email$|_text$|_note$|_reason$|_ref$|_hash$/

export function isPersonalDataCandidate({ column, type }) {
  return PERSONAL_DATA_COLUMN_PATTERN.test(column) || /JSON/i.test(String(type || ''))
}

const D = (note = '') => ({ action: 'DELETE', note })
const P = (note = '') => ({ action: 'PSEUDONYMISE', note })
const X = (note = '') => ({ action: 'DETACH', note })
const R = (reason) => ({ action: 'RETAIN', note: reason })

// Shared RETAIN reasons.
const CONTENT = 'Product/content/configuration data authored by staff; holds no learner data'
const STAFF = 'Staff/admin identity plane (admin_users ids), not a learner account; governed by the admin user lifecycle'
const SCORE = 'Numeric/structural values of a row the cascade deletes with the session (no separate personal content)'
const OPAQUE_SESSION = 'Opaque random session id; every row it pointed to is erased, so it no longer links to a person'
const ROW_GONE = 'Removed with the row (the row is deleted by the cascade)'

const session = (columns, note) => ({ via: 'session', note, columns })
const user = (columns, note) => ({ via: 'user', note, columns })
const actor = (columns, note) => ({ via: 'actor', note, columns })
const none = (columns, note) => ({ via: 'none', note, columns })

export const PERSONAL_DATA_REGISTRY = Object.freeze({
  // ── 0001 / 0002 telemetry & research (lib/telemetry.js eraseTelemetry + the unconditional sweep) ──
  items: none({ tier_label: R(CONTENT) }, 'Item bank'),
  item_responses: session({ session_id: D(), candidate_text: D('Candidate answer text'), micro_levels: D(ROW_GONE), behavior: D(ROW_GONE) }),
  judge_votes: session({ levels: D('Deleted through item_responses of the session') }),
  behavioral_features: session({ session_id: D(), features: D(), channelb_scores: D() }),
  ability_estimates: session({ session_id: D(), coverage: D() }),
  human_ratings: session({ session_id: D(), rater_id: D(ROW_GONE) }),
  calibration_runs: none({
    inputs_summary: R('Aggregate calibration inputs (counts/parameters), no per-candidate rows'), outputs: R('Calibration parameters (anonymised aggregate, RETENTION_POLICY §3.4)'),
    review_note: R(STAFF), reviewed_by: R(STAFF), frozen_by: R(STAFF), applied_by: R(STAFF), superseded_by: R('Id of the superseding calibration run (no personal data)'),
  }),
  audit_log: session({ session_id: D(), payload: D() }),
  // 0019 re-declares this table with CREATE TABLE IF NOT EXISTS, a no-op after 0002: the
  // live shape is 0002's (session_id key). Nothing writes it today (PRISM_DEMOGRAPHICS dark).
  candidate_demographics: session({ session_id: D(), gender: D() }),

  // ── 0003 v1 store (lib/storePg.js eraseSession; JSON twin storeJson.js) ──
  v1_users: user({
    email: R('Login identity. Deleted with the account record by an approved account-scope erasure (admin privacy request → deleteUser); self-service data erasure keeps the login (P24)'),
    name: R('Account profile; deleted with the account record (account-scope erasure), kept by self-service data erasure (P24)'),
    college: R('Account profile; as name'), year: R('Account profile; as name'), password_hash: R('Credential of the kept login; deleted with the account record'),
    candidate_id: R('Pseudonymous research key of the kept login; its research rows (assessment_timeline, credentials, demographics) are deleted'),
    age_declaration: R('Age-gating record of the kept login; deleted with the account record'),
  }, 'Account record'),
  v1_payments: session({ session_id: D(), user_id: D(), user_email: D() }, 'Existing eraseSession behaviour (finance reference survives in v1_payment_redemptions)'),
  v1_sessions: session({ session_id: D(), user_id: D(), user_email: D(), data: D('Transcript and evidence') }),
  v1_reports: session({ session_id: D(), user_id: D(), report: D() }),
  v1_events: session({ session_id: D(), meta: D() }),
  v1_items: session({ session_id: D(), item: D() }),
  v1_calibrations: session({ session_id: D(), data: D() }),
  v1_consents: session({ session_id: D(), scopes: D(), meta: D() }),
  v1_disputes: session({ session_id: D(), reason: D(), contact: D(), resolution: D() }),
  v1_verifications: session({ session_id: D(), data: D() }),
  v1_device_links: session({ session_id: D(), phone_user_agent: D() }),
  assessment_timeline: session({ candidate_id: D('Also by candidate_id on account erasure'), session_id: D(), flags_active: D(ROW_GONE), final_theta: D(ROW_GONE) }),

  // ── 0005 study runner / raters ──
  studies: none({ title: R(CONTENT), cohort_tags: R(CONTENT) }),
  study_sessions: session({ session_id: D() }),
  study_results: none({ metric_name: R('Aggregate metric name'), detail: R('Append-only pseudonymous aggregate (no per-candidate rows; RETENTION_POLICY §3.4)'), superseded_by: R('Id of the superseding aggregate result (no personal data)') }),
  raters: none({ rater_id: R('Rater identity plane (raters are not learner accounts)'), handle: R('Rater identity plane'), token_hash: R('Hashed rater token') }),
  rater_training_refs: none({ transcript: R('Synthetic/approved training transcript curated by staff (rater training material)'), reference_levels: R(CONTENT) }),
  rater_training_answers: none({ rater_id: R('Rater identity plane'), levels: R('Rater training answers') }),
  session_transcripts: session({ session_id: D(), turns: D() }),

  // ── 0006–0010 credentials, external ratings, replay, team-fit ──
  credentials: session({ session_id: D(), candidate_id: D('Also by candidate_id on account erasure'), bundle: D('Signed evidence quotes'), bundle_hash: D(ROW_GONE), revoked_reason: D(ROW_GONE), superseded_by: D(ROW_GONE), share_token_hash: D(ROW_GONE) }),
  external_ratings: session({ session_id: D(), notes: D() }),
  practice_replays: session({ source_session_id: D(), moment: D(), turns: D() }),
  teams: none({ name: R('Team name chosen by staff; no learner data') }),
  team_members: session({ member_session_id: D() }),
  teamfit_sessions: session({ candidate_session_id: D(), turns: D(), observations: D() }),

  // ── 0011–0013 admin console (staff identity plane) ──
  admin_users: none({ email: R(STAFF), name: R(STAFF), password_hash: R(STAFF), last_login_ip: R(STAFF), invited_by: R(STAFF) }),
  admin_roles: none({ title: R(CONTENT), description: R(CONTENT) }),
  admin_permissions: none({ description: R(CONTENT) }),
  admin_user_roles: none({ granted_by: R(STAFF) }),
  admin_mfa_methods: none({ label: R(STAFF) }),
  admin_sessions: none({ session_id: R('Admin console session id (staff), not an assessment session'), refresh_hash: R(STAFF), ip: R(STAFF), user_agent: R(STAFF), break_glass_reason: R(STAFF), revoke_reason: R(STAFF) }),
  admin_audit_events: user({
    admin_email: R(STAFF), roles: R(STAFF),
    entity_id: P('A learner account id (entity_type user) becomes the stable pseudonym; the person\'s session ids become session pseudonyms'),
    before: P('Profile fields (name, email, college, year) are stripped from user rows; replaced by {"erased": true} on rows about the person\'s sessions'),
    after: P('As before'),
    reason: R('Staff-written justification (operational audit, 3 years, RETENTION_POLICY §1); refers to the entity by id'),
    ip: R(STAFF), user_agent: R(STAFF),
  }, 'Immutable admin trail: the event is kept, the learner is pseudonymised (0056 erasure guard)'),
  admin_approvals: none({
    entity_id: R('Governance record of an approved admin action (dual approval); operational audit, 3 years. Privacy-request approvals reference the request id'),
    payload: R('As entity_id; approval payloads carry ids/enums'), requested_by: R(STAFF), requested_reason: R(STAFF), decided_by: R(STAFF), decided_reason: R(STAFF),
  }),
  admin_notes: user({ entity_id: D('Notes about a learner account or an erased session are deleted'), body: D() }),
  admin_notifications: none({ title: R(STAFF), body: R('Staff notification text (system events, ids)') }),
  admin_saved_views: none({ name: R(STAFF), config: R(STAFF) }),
  admin_exports: none({ filters: R('Export ledger: who exported what, never the data (RETENTION_POLICY §4)') }),
  admin_incidents: none({ title: R(STAFF), detail: R('Incident record (operational)'), opened_by: R(STAFF), resolved_by: R(STAFF) }),
  admin_session_states: session({ session_id: D(), review_reason: D(), invalid_reason: D(), exclusion_reason: D(), updated_by: D(ROW_GONE) }),
  admin_dispute_workflow: session({ session_id: D(), decided_by: D(ROW_GONE) }),
  report_versions: session({ session_id: D(), report: D('Admin-issued report versions'), reason: D(), created_by: D(ROW_GONE) }),
  report_admin_states: session({ session_id: D(), hold_reason: D(), updated_by: D(ROW_GONE) }),
  integrity_reviews: session({ session_id: D(), note: D(), reviewed_by: D(ROW_GONE) }),
  prompt_definitions: none({ name: R(CONTENT) }),
  prompt_versions: none({ variables: R(CONTENT), content_hash: R(CONTENT), author: R(STAFF), approved_by: R(STAFF), test_results: R(CONTENT) }),

  // ── 0015 CMS ──
  content_posts: none({ title: R(CONTENT), date_label: R(CONTENT), summary: R(CONTENT), body: R(CONTENT), author: R(CONTENT), tags: R(CONTENT), seo: R(CONTENT) }),
  content_post_versions: none({ snapshot: R(CONTENT), change_note: R(CONTENT), changed_by: R(STAFF) }),
  content_jobs: none({ title: R(CONTENT), location: R(CONTENT), description: R(CONTENT) }),
  job_applications: none({
    job_title: R(CONTENT),
    name: R('Careers application to StudAI (a separate relationship keyed by the email the applicant typed, not by a Prism account); retention entity job_applications in the admin privacy registry; erased by an admin privacy request in the careers plane (P26)'),
    email: R('As name (P26)'), message: R('As name (P26)'), resume_url: R('As name (P26)'),
  }),
  feature_flags: none({ description: R(CONTENT) }),
  feature_flag_changes: none({ reason: R(STAFF), requested_by: R(STAFF), decided_by: R(STAFF), decided_reason: R(STAFF), applied_note: R(STAFF) }),
  model_registry: none({ allowed_workloads: R(CONTENT), notes: R(CONTENT) }),
  system_jobs: none({ entity_id: R('Substrate table with no writer (routes/admin/system.js)'), idempotency_key: R('As entity_id'), detail: R('As entity_id') }),

  // ── 0016–0021 governance ──
  privacy_requests: none({
    candidate_user_id: R('The compliance record of the request itself (who asked for erasure/access and when); RETENTION_POLICY §3 and the Phase 6 planner preserve it. Pending counsel review of its period (HA-003)'),
    candidate_email: R('As candidate_user_id'), session_id: R('As candidate_user_id'), details: R('As candidate_user_id'),
    dry_run_plan: R('As candidate_user_id'), receipt: R('As candidate_user_id'), opened_by: R(STAFF), decided_reason: R(STAFF),
  }),
  data_retention_rules: none({ updated_by: R(STAFF) }),
  assessment_invites: none({ token_hash: R('Group invite link (hash), created by staff'), label: R(CONTENT), created_by: R(STAFF), revoke_reason: R(STAFF), plan: R(CONTENT) }),
  invite_redemptions: session({ user_id: D('Also by user id / email on account erasure'), user_email: D(), session_id: D() }),
  institution_verifications: session({ session_id: D(), note: D(), recorded_by: D(ROW_GONE) }),
  v1_accommodations: session({ session_id: D(), needs: D(), modes: D(), decision_note: D(), decided_by: D(ROW_GONE) }),
  legal_holds: none({ reason: R('Legal hold record (governance); references by id'), placed_by: R(STAFF), release_reason: R(STAFF) }),
  retention_overrides: none({ contract_ref: R('Contract reference'), recorded_by: R(STAFF) }),
  retention_runs: none({ receipt: R('Retention run receipt (counts, cutoff); no personal data'), ran_by: R(STAFF) }),
  ai_usage_events: session({ session_id: D(), tags_json: D(ROW_GONE) }),

  // ── 0022–0025 catalog, occupational graph, evidence ledger ──
  assessment_definitions: none({ title: R(CONTENT), retake_policy: R(CONTENT), constructs: R(CONTENT), hardware_requirements: R(CONTENT), description: R(CONTENT), measures: R(CONTENT), not_measured: R(CONTENT) }),
  occupational_external_refs: none({ title: R(CONTENT), metadata: R(CONTENT) }),
  occupational_nodes: none({ title: R(CONTENT), description: R(CONTENT), metadata: R(CONTENT) }),
  job_family_blueprints: none({
    name: R(CONTENT), layer1_transferable_capabilities: R(CONTENT), layer2_role_capabilities: R(CONTENT), contextual_digital_capability: R(CONTENT),
    work_activities: R(CONTENT), occupational_mappings: R(CONTENT), riasec_profile: R(CONTENT), adjacent_families: R(CONTENT),
  }),
  occupational_work_activities: none({ title: R(CONTENT), description: R(CONTENT), metadata: R(CONTENT) }),
  occupational_capabilities: none({ name: R(CONTENT), sub_constructs: R(CONTENT), rubric_anchors: R(CONTENT) }),
  occupational_graph_edges: none({ properties: R(CONTENT) }),
  behavioral_evidence_units: session({
    session_id: D(), candidate_action: D('Verbatim candidate words'), rubric_label: D(ROW_GONE), judge_agreement: D(ROW_GONE), provenance: D(ROW_GONE),
    candidate_action_json: D(), judge_agreement_json: D(ROW_GONE), provenance_json: D(ROW_GONE),
  }),
  development_missions: none({ title: R(CONTENT), challenge_briefing: R(CONTENT), interactive_workspace_artifacts: R(CONTENT), scaffolded_guidance: R(CONTENT), success_criteria: R(CONTENT) }),
  candidate_mission_attempts: session({ candidate_id: D('Also by account/candidate id'), session_id: D(), candidate_inputs: D(), observable_behaviors: D(), feedback_summary: D() }, 'Legacy 0024 table (no writer today); covered anyway'),

  // ── 0026–0029 campus identity plane ──
  organizations: none({ name: R('Institution name') }),
  campuses: none({ name: R('Institution structure') }),
  academic_departments: none({ name: R('Institution structure') }),
  academic_programs: none({ name: R('Institution structure') }),
  academic_batches: none({ name: R('Institution structure'), start_year: R('Institution structure'), end_year: R('Institution structure') }),
  cohorts: actor({ name: R('Institution structure'), owner_user_id: P('Staff owner pseudonymised when that person is erased') }),
  cohort_members: user({ user_id: D(), added_by: P('Staff actor pseudonymised on rows of other students') }),
  organization_memberships: user({ user_id: D(), scope: D(ROW_GONE), invited_by: P('Staff actor pseudonymised on other members\' rows') }),
  workspaces: user({ owner_user_id: D(), name: D(ROW_GONE) }),
  organization_invites: user({ email: D('Invites addressed to the person (by email) or accepted by them'), token_hash: D(ROW_GONE), invited_by: P('Staff actor pseudonymised on other invites'), accepted_by: D() }),
  entitlements: user({
    user_id: P('Personal entitlements without ledger rows are deleted; those referenced by the append-only consumption ledger (ON DELETE RESTRICT) keep the row with the pseudonym and are REVOKED'),
    metadata: R('Contract/billing ids and enums only (domain/billing/service.js); finance record'),
  }),
  entitlement_consumptions: user({
    user_id: P('Append-only seat ledger (billing evidence): pseudonym via the 0056 erasure guard'),
    session_id: R(OPAQUE_SESSION + '; one ledger row per seat event is billing evidence (payment_records)'),
    idempotency_key: P('Reserve keys embed the account id; replaced by an erasure marker (uniqueness kept)'),
  }),
  consent_records: user({ user_id: D('The person\'s consent records go with the person') }),
  share_grants: user({ owner_user_id: D('Grants (and their resources) owned by the person'), token_hash: D(ROW_GONE) }),
  share_grant_resources: session({ resource_id: D('Resources pointing at an erased report; orphaned grants are revoked') }),
  data_access_audit_events: user({
    actor_user_id: P('Audit event kept, actor pseudonymised (0056 erasure guard)'),
    subject_user_id: P('Audit event kept, subject pseudonymised'),
    resource_id: P('A resource id equal to the account id or to one of the person\'s session ids is pseudonymised'),
  }),
  assessment_session_scopes: session({ session_id: D(), owner_user_id: D('Also by owner on account erasure'), created_by: P('Staff/creator pseudonymised on other learners\' scopes') }),

  // ── 0030–0033 assignments, preferences, session I/O, report versions ──
  assessment_assignments: actor({
    personal_key: D('Personal (derived) assignments of the person are deleted with their roster rows'),
    accommodations_policy: R('Assignment policy authored by staff (no learner data)'), reminder_policy: R('As accommodations_policy'),
    created_by: P('Staff creator pseudonymised; personal assignments use SYSTEM'),
  }),
  assessment_assignment_targets: user({ target_id: D('USER targets naming the person are deleted') }),
  assessment_assignment_students: user({ user_id: D('Assignment roster rows'), session_id: D(ROW_GONE) }),
  user_preferences: user({ user_id: D(), larger_text: D(ROW_GONE), display_name: D() }),
  product_events: user({ actor_hash: X('Keyed actor hash cleared (events stay as anonymous counts)'), props: R('Allow-listed ids/enums only (domain/telemetry/events.js sanitizeProps)') }),
  assessment_client_events: session({ session_id: D(), response_json: D('Rendered conversation and replies') }),
  assessment_artifact_versions: session({ session_id: D(), content_json: D('Artifact edits'), saved_by: D('Also by saved_by on account erasure') }),
  student_report_versions: session({
    session_id: D('Deleted; a version referenced by a reviewed request (FK from report_review_requests) is scrubbed instead'),
    content_hash: P('Scrubbed versions get an erasure marker (unique per version)'), report_json: P('Scrubbed to {"erased": true} via the 0056 erasure guard'),
    evidence_set_hash: P('Cleared on scrubbed versions'), reason: R('Publication reason enum (INITIAL, REVIEW_CORRECTION, ...)'), publication_note: P('Cleared on scrubbed versions'),
  }),

  // ── 0034 campus operations ──
  campus_programs: actor({ name: R('Institution structure'), description: R('Institution structure'), reporting_policy: R(CONTENT), sponsorship_scope: R(CONTENT), created_by: P('Staff actor') }),
  student_import_jobs: actor({ uploaded_by: P('Staff actor'), file_name: R('File name chosen by staff (institution document name); raw rows are purged on the retention timer'), totals: R('Counts only') }),
  student_import_rows: user({
    raw: P('Rows carrying the person\'s email are scrubbed on erasure; every committed row is cleared N days after commit (IMPORT_ROW_RAW_RETENTION_DAYS, PROVISIONAL, HA-003)'),
    normalized: P('As raw (set NULL)'), errors: R('Validation codes only (EMAIL_INVALID, ...)'), outcome: R('Enum: INVITED / SKIPPED / FAILED (no personal data)'),
  }),
  org_onboarding_progress: actor({ data: R('Onboarding answers about the institution (no learner data)'), updated_by: P('Staff actor') }),
  notifications: user({ user_id: D(), payload: D('Ids/enums for the recipient; deleted with the recipient') }),
  organization_audit_events: user({
    actor_user_id: P('Event kept, actor pseudonymised (0056 erasure guard)'),
    target_id: P('A target id equal to the account id is pseudonymised; other targets are org entity ids'),
    details: R('Structured counts/ids/names of institution entities (every writer in domain/** checked); no learner fields'),
  }),

  // ── 0035 development v2 ──
  mission_versions: none({ content: R(CONTENT), content_hash: R(CONTENT) }),
  interventions: actor({ name: R('Institution structure'), created_by: P('Staff actor') }),
  intervention_memberships: user({ user_id: D('Also removed when the student leaves the cohort or organization') }),
  mission_attempts: user({
    user_id: D(), work: D('Free-text practice work'), idempotency_key: D(ROW_GONE), evaluation: D(), origin_json: D(), assistance_json: D(), stimulus_json: D(),
  }),
  practice_evidence_units: user({ user_id: D(), excerpt: D('Verbatim quotes'), provenance: D() }),
  development_plans: user({ user_id: D(), source_session_id: D() }),

  // ── 0036 growth ──
  assessment_form_equivalence: actor({ evidence_ref: R('Psychometric evidence reference (document id)'), decided_by: P('Decision actor pseudonymised if it is the person') }),
  assessment_form_equivalence_decisions: actor({ evidence_ref: R('Psychometric evidence reference (document id)'), reason: R('Psychometric decision text about form pairs (no learner data)'), decided_by: P('Append-only: actor pseudonymised via the 0056 erasure guard') }),
  reassessment_cycles: actor({ name: R('Institution structure'), created_by: P('Staff actor') }),
  capability_growth_snapshots: user({ user_id: D(), baseline_session_id: D(), reassessment_session_id: D(), uncertainty: D(ROW_GONE) }),

  // ── 0037–0039 analytics, billing, rating queue ──
  organization_analytics_settings: actor({ updated_by: P('Staff actor') }),
  campus_contracts: actor({ name: R('Contract (finance record)'), components: R('Contract components (finance)'), created_by: P('Staff actor'), activated_by: P('Staff actor'), ended_by: P('Staff actor'), end_reason: R('Finance record text about the contract') }),
  campus_contract_pricing: actor({ approved_by: P('Staff actor') }),
  invoice_exports: actor({ file_ref: R('Finance export reference (counts only)'), created_by: P('Append-only: actor pseudonymised via the 0056 erasure guard') }),
  evidence_rating_items: session({
    evidence_ref: X('Replaced by a fresh random hash: the item can no longer be traced to the erased evidence unit'),
    session_ref: X('Replaced by a fresh random hash (detached from the session)'),
    excerpt: P('Tokenised candidate words replaced by an erasure marker'),
    enqueued_by: P('Pseudonymised when it is the person'),
    source_method_json: P('Cleared (NULL)'),
  }, 'Kept as a content-free shell so the append-only ratings (ON DELETE RESTRICT) and inter-rater agreement survive'),
  evidence_unit_ratings: none({ rater_id: R('Rater identity plane; ratings hold no learner data and stay attached to the detached item') }),

  // ── 0040–0046 durable actions, timing, opportunities, review requests, practice allowance ──
  assessment_candidate_actions: session({ session_id: D(), payload_hash: D(ROW_GONE), payload_json: D('Candidate messages'), result_json: D() }),
  assessment_jobs: session({ session_id: D() }),
  assessment_erasure_markers: session({ session_id: R('Erasure tombstone: the opaque id is what stops a late worker from writing the erased session back (CR-03)') }),
  assessment_run_timing: session({ session_id: D(), policy_json: D(ROW_GONE), begin_idempotency_key: D(ROW_GONE) }),
  assessment_opportunities: session({ session_id: D(), render_hash: D(ROW_GONE), stimulus_json: D() }),
  report_review_requests: user({
    session_id: R(OPAQUE_SESSION + ' (kept only on requests that carry a reviewer decision)'),
    user_id: P('Requests without a decision are deleted; requests with an append-only decision keep the row with the pseudonym'),
    reason: P('Learner text replaced by an erasure marker'),
  }),
  practice_allowances: user({ user_id: D() }),

  // ── 0047–0055 preparation, grants, preview, content review, payments ──
  preparation_attempts: user({ user_id: D(), intent_json: D(), title: D(), observations_json: D(), application_json: D() }),
  preparation_turns: user({ actor: D(ROW_GONE), text: D('Deleted with the attempt (ON DELETE CASCADE)') }),
  action_cards: user({ user_id: D(), card_json: D() }),
  application_checkins: user({ user_id: D(), source_id: D(ROW_GONE), what_tried: D(), outcome: D(), next_step: D() }),
  product_grants: user({
    user_id: P('Finance record retained under policy (0048, payment_records): pseudonymised, never deleted'),
    included_json: R('Package contents (product definition)'), purchase_ref: R('Provider purchase reference (finance record)'),
  }),
  preview_attempts: user({ token_hash: D(ROW_GONE), payload_json: D('Guest answer claimed by the account'), claimed_user_id: D() }),
  content_attachments: none({ text: R(CONTENT), created_by: R(STAFF) }),
  content_comments: none({ author: R(STAFF), text: R(CONTENT) }),
  content_review_decisions: none({ reviewer_id: R(STAFF), reason: R(CONTENT) }),
  content_form_drafts: none({ package_json: R(CONTENT), created_by: R(STAFF) }),
  report_review_decisions: user({
    reviewer_id: P('Pseudonymised when the reviewer is the person'),
    reason: P('Reviewer text about the learner\'s report replaced by an erasure marker (append-only; 0056 erasure guard)'),
    correction_json: R('Evidence unit ids withheld by a correction (ids only, the units are erased with the session)'),
  }),
  v1_payment_redemptions: session({ session_id: X('Existing eraseSession behaviour (Phase 1S)'), user_id: X('Detached by session and by account id') }),

  // ── 0058 V3 support routes (PROD-READY Phase 4) ──
  // report_review_requests.request_kind is an enum (MOMENT / HUMAN_REVIEW), not personal data.
  assessment_accommodation_requests: user({
    user_id: D(), session_id: D('Deleted with the session (per-session cascade) and with the account'),
    needs: D('Accommodation needs text — may reference disability (ACCOMMODATIONS_POLICY_v1 §3)'), modes: D(ROW_GONE),
    decision_note: D('Staff decision note about the learner request'), decided_by: D(ROW_GONE),
  }, 'Pre-start accommodation requests on V3 assignments; linked to the session at start'),

  // ── 0059 background job queue (PROD-READY Phase 5) ──
  // Payloads are references only (kinds.js validates them with .strict()
  // schemas: ids and a time bucket, never an address or free text);
  // last_error is sanitised (no addresses, links or numbers); dedupe_key
  // repeats ids already in the payload.
  jobs: user({
    subject_user_id: D('Account a job concerns (assignment reminders); the account step deletes the jobs of the person in every state'),
    payload: D('Ids only (an invite id, an assignment id and the account id of the reminder); deleted with the row — invite-email jobs are found through the invites sent to the address of the person'),
    result: D(ROW_GONE),
    locked_by: R('Worker id (host:pid:random) of the replica holding the lease; not a person'),
  }, 'Background jobs; finished rows are pruned after 30 days by the jobs.prune job'),

  // ── 0060 materialised sufficiency decisions (PROD-READY Phase 6) ──
  // Derived data: recomputed from the session's evidence and report whenever
  // needed, so erasure simply deletes it (per session and per account).
  session_decision_cache: session({
    session_id: D('Deleted by the per-session cascade (after the session data, so no trigger re-creates it)'),
    entry: D('Derived decision entry (form, completion date, sufficiency decisions with evidence ids); no free text or quotes'),
    summary: D('The analytics subset of the entry (definition id, status and level band per capability); deleted with the row'),
  }, 'Materialised per-session sufficiency decisions for campus analytics and growth outcomes; kept only as long as the session'),
  session_decision_inputs: session({
    session_id: D('Per-session version counter for cache invalidation; deleted with the session'),
  }, 'Version counter bumped by triggers on every write that can change a cached decision'),

  // ── 0061 demo organizations (PROD-READY Phase 8) ──
  // Every account listed here was created by server/db/seedDemoOrg.js and is
  // synthetic; the marker goes with the account like any other account row.
  demo_accounts: user({
    user_id: D('Synthetic demo account marker; deleted with the account (after its memberships, so the isolation triggers never see a half-erased account)'),
  }, 'Marker of the synthetic accounts of a demo organization (no real person)'),

  // ── 0062 under-18 guardian consent (PROD-READY Phase 8, dark: PRISM_UNDER18_PATH) ──
  guardian_consents: user({
    user_id: D('The learner the request is about; every request of the person is deleted with the account'),
    guardian_email: D('Guardian contact address (the only guardian detail collected); deleted with the learner\'s account, and requests never verified are deleted 30 days after they ended (guardian_consents_unverified, PROVISIONAL, HA-003)'),
    token_hash: D(ROW_GONE),
  }, 'Guardian consent requests and records for learners under 18 (AGE_GATING_POLICY_v1 addendum; copy DRAFT pending HA-006/HA-005)'),

  // ── 0056 erasure ledger (this phase) ──
  privacy_erasure_runs: none({
    subject_ref: R('Keyed one-way hash of the account id (no personal data); lets an operator prove completion'),
    initiated_by: R('Enum: SELF_SERVICE / ADMIN_REQUEST / OPERATOR'),
    pending_session_ids: R('Transient work list of a RUNNING/FAILED run so a rerun can resume; cleared (NULL) when the run completes (CHECK)'),
    last_error: R('Error code/message of the failed step (no values)'),
  }),
  privacy_erasure_steps: none({ detail: R('Per-table row counts only') }),
})

export function registryEntry(table, column) {
  return PERSONAL_DATA_REGISTRY[table]?.columns?.[column] || null
}

export function registeredColumns() {
  const out = []
  for (const [table, t] of Object.entries(PERSONAL_DATA_REGISTRY)) {
    for (const [column, e] of Object.entries(t.columns)) out.push({ table, column, via: t.via, ...e })
  }
  return out
}
