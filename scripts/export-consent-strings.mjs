#!/usr/bin/env node
// Counsel packet export (PROD-READY Phase 10; HA-C005, HA-005, HA-004, HA-006).
//
// Writes docs/production/human-actions/COUNSEL_PACKET_CONSENT_STRINGS.md: every
// consent, disclosure, sharing, employer and guardian string in the product,
// with the exact text, the source file and line, where it appears (API route /
// page), the policy it implements and its review status.
//
// The text is read from the code itself, never retyped:
//   - `module` sources are imported and their named exports flattened (a
//     function is called with placeholders named after its parameters, e.g.
//     `{org}`), so the packet shows exactly what the code would render;
//   - `snippets` sources are literal substrings that must still be present in
//     the file (inline JSX / email text); a missing snippet fails the export;
//   - `jsxSection` sources extract the visible text of a JSX function body
//     (markup stripped, entities decoded).
//
// Usage:
//   node scripts/export-consent-strings.mjs           write the packet
//   node scripts/export-consent-strings.mjs --check   exit 1 if the committed packet is stale
//
// The ratchet test server/test/consentPacket.test.js fails when a consent /
// disclosure copy constant is added anywhere in server/domain, server/lib or
// src/lib/copy without being listed here (PACKET_SOURCES) or explicitly
// excluded with a reason (NOT_COUNSEL_COPY), and when the committed packet is
// stale. Nothing here approves any text: every entry stays DRAFT or
// "not counsel-reviewed" until counsel signs (law 2).

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const PACKET_PATH = 'docs/production/human-actions/COUNSEL_PACKET_CONSENT_STRINGS.md'

const DRAFT_EMPLOYER = 'DRAFT in code (`EMPLOYER_COPY_STATUS`), pending HA-005 and HA-004'
const DRAFT_GUARDIAN = 'DRAFT in code (`GUARDIAN_CONSENT_COPY_STATUS`), pending HA-006 and HA-005'
const DRAFT_CAMPUS = 'DRAFT (version id `…-draft`), pending HA-C005'
const LIVE_UNREVIEWED = 'Live wording; no counsel approval on record (HA-003 / HA-005)'

// Every source of counsel-relevant copy. `exports` lists named exports; a
// dotted entry (`REPORT_COPY.share`) selects one key of an exported object.
export const PACKET_SOURCES = [
  // ── Employer development use (Phase 9) ─────────────────────────────────────
  {
    id: 'employer-server', group: 'Employer', kind: 'module', file: 'server/domain/employer/copy.js',
    exports: ['EMPLOYER_COPY_STATUS', 'EMPLOYER_COPY_PENDING_ON', 'EMPLOYER_DISCLOSURE_COPY_VERSION', 'EMPLOYER_ASSESSMENT_DISCLOSURE_COPY_VERSION', 'EMPLOYER_PURPOSE', 'employerProhibitedUses', 'employerJoinDisclosure', 'employerAssessmentDisclosure', 'EMPLOYER_STAFF_COPY'],
    where: 'Join disclosure: `GET /api/v1/org-invites/:token` and `GET /api/v1/organizations/:orgId/employer/disclosure`, rendered on `/app/campus-invite/:token` (ConsentScopePanel); accepting records consent type `EMPLOYER_DEVELOPMENT_DISCLOSURE`. Assessment disclosure: student assignment briefing (`/app/assessments/:id/briefing`, `/app/campus/:orgId/assignments/:id/briefing`), acknowledged by `POST /api/v1/assessment-assignments/:id/acknowledge` (`EMPLOYER_ASSESSMENT_DISCLOSURE`). Staff copy: `/employer/:organizationId/*` pages via `/api/v1/employer/organizations/:orgId/*`',
    policy: 'PROHIBITED_USES_POLICY_v1 items 1, 2, 3, 9; BUYER_ACCESS_SPEC_v1 (candidate-authorized access); JOB_FAMILY_SCOPE_v1; consent types from migration 0063',
    flag: 'PRISM_EMPLOYER_LND (OFF)', status: DRAFT_EMPLOYER, counsel: ['HA-005', 'HA-004'],
  },
  {
    id: 'employer-client', group: 'Employer', kind: 'module', file: 'src/lib/copy/employer.js',
    exports: ['EMPLOYER_COPY_STATUS', 'EMPLOYER_DISCLOSURE_VERSION', 'EMPLOYER_ASSESSMENT_DISCLOSURE_VERSION', 'EMPLOYER_ROLE_LABELS', 'EMPLOYER_SHELL_LABEL', 'EMPLOYER_SPONSORED_NOTE', 'EMPLOYER_REPORT_VISIBILITY', 'EMPLOYER_SHARED_VISIBILITY', 'EMPLOYER_CAN_SEE', 'EMPLOYER_CANNOT_SEE', 'employerProhibitedUses'],
    where: 'Employee side of an employer workspace: "What can they see?" panel (ConsentScopePanel), sponsored card, report visibility line, share dialog; employer shell. Lists and prohibited-use lines are identical to the server copy (vitest `employer.test.jsx`)',
    policy: 'As employer-server', flag: 'PRISM_EMPLOYER_LND (OFF)', status: DRAFT_EMPLOYER, counsel: ['HA-005', 'HA-004'],
  },
  {
    id: 'employer-pages', group: 'Employer', kind: 'module', file: 'src/lib/copy/employerPages.js',
    exports: ['EMPLOYER_PAGE_COPY'],
    where: '`/employer/:organizationId/{overview,people,people/:userId,shared-reports,shared-reports/:sessionId,assessments,development,insights}`',
    policy: 'PROHIBITED_USES_POLICY_v1; development and structured onboarding only (P93)', flag: 'PRISM_EMPLOYER_LND (OFF)', status: DRAFT_EMPLOYER, counsel: ['HA-005', 'HA-004'],
  },
  {
    id: 'employer-prohibited-message', group: 'Employer', kind: 'module', file: 'server/domain/employer/prohibitedUse.js',
    exports: ['PROHIBITED_USE_MESSAGE'],
    where: '422 `PROHIBITED_USE` error body on `/api/v1/employer/*` when a ranking / sort / level / cut-off parameter is sent',
    policy: 'PROHIBITED_USES_POLICY_v1 items 2, 3 (P97)', flag: 'PRISM_EMPLOYER_LND (OFF)', status: DRAFT_EMPLOYER, counsel: ['HA-004'],
  },
  {
    id: 'hire-handoff', group: 'Employer', kind: 'module', file: 'server/domain/integrations/hire/index.js',
    exports: ['HIRE_HANDOFF_CONTRACT_VERSION', 'HIRE_HANDOFF_PENDING_ON', 'HIRE_HANDOFF_MAX_DAYS', 'HIRE_HANDOFF_CONTRACT'],
    where: '`GET /api/v1/integrations/hire/handoff` (contract description); `POST` answers 501. Not connected; no consent text exists yet for the hand-off itself',
    policy: 'ECOSYSTEM_SEPARATION_POLICY_v1 rules 2 and 5; BUYER_ACCESS_SPEC_v1 (raw transcripts never); HIRE_HANDOFF_INTERFACE.md', flag: 'PRISM_EMPLOYER_LND (OFF); connection needs HA-025',
    status: 'DRAFT contract (`hire-evidence-handoff.v0-draft`), pending HA-025, HA-005, HA-004', counsel: ['HA-025', 'HA-005', 'HA-004'],
  },
  // ── Under-18 guardian consent (Phase 8) ────────────────────────────────────
  {
    id: 'guardian-server', group: 'Guardian and age', kind: 'module', file: 'server/domain/guardian/copy.js',
    exports: ['GUARDIAN_CONSENT_COPY_STATUS', 'GUARDIAN_CONSENT_PENDING_ON', 'GUARDIAN_CONSENT_COPY_VERSION', 'GUARDIAN_DECLARATION_VERSION', 'GUARDIAN_DECLARATION_BASIS', 'GUARDIAN_LINK_DAYS', 'GUARDIAN_CONSENT_COPY'],
    where: '`GET /api/guardian-consent/:token`, rendered on `/guardian-consent/:token` (GuardianConsentPage); the version is stored in `guardian_consents.copy_version` (migration 0062) and as the learner declaration version',
    policy: 'AGE_GATING_POLICY_v1 + Phase 8 addendum; RETENTION_POLICY_v1 (`guardian_consents_unverified`, 30 days, PROVISIONAL)', flag: 'PRISM_UNDER18_PATH (OFF)', status: DRAFT_GUARDIAN, counsel: ['HA-006', 'HA-005', 'HA-003'],
  },
  {
    id: 'guardian-page', group: 'Guardian and age', kind: 'module', file: 'src/lib/copy/guardianConsent.js',
    exports: ['GUARDIAN_PAGE_COPY_STATUS', 'GUARDIAN_PAGE_COPY'],
    where: '`/guardian-consent/:token` page chrome', policy: 'AGE_GATING_POLICY_v1 addendum', flag: 'PRISM_UNDER18_PATH (OFF)', status: DRAFT_GUARDIAN, counsel: ['HA-006', 'HA-005'],
  },
  {
    id: 'guardian-email', group: 'Guardian and age', kind: 'snippets', file: 'server/lib/mailer.js',
    snippets: [
      "subject: 'Your consent is requested for a learner under 18 (Prism)'",
      'told us they are under 18 and named you as their parent or guardian.',
      'They can take a Prism development assessment only if you agree. Open this link to read what that means and to agree or decline:',
      'If you do not know this learner, you can ignore this email.',
    ],
    where: 'Email to the guardian (`sendGuardianConsentEmail`), sent from `/api/auth/register` (under-18 branch) and `POST /api/auth/guardian-consent/resend`',
    policy: 'AGE_GATING_POLICY_v1 addendum', flag: 'PRISM_UNDER18_PATH (OFF)', status: 'Inline email text, not marked DRAFT in code; part of the DRAFT guardian path (HA-006, HA-005)', counsel: ['HA-006', 'HA-005'],
  },
  {
    id: 'age-constants', group: 'Guardian and age', kind: 'module', file: 'server/lib/sharedConstants.js',
    exports: ['AGE_DECLARATION_VERSION', 'AGE_DECLARATION_TEXT'],
    where: 'Registration checkbox (`/register`), Settings age re-confirmation (`/app/settings`), legacy briefing (`/briefing`); stored in `v1_users.age_declaration` (migration 0018) via `/api/auth/register` and `/api/auth/confirm-age`',
    policy: 'AGE_GATING_POLICY_v1 (charter §12)', flag: 'live', status: LIVE_UNREVIEWED, counsel: ['HA-005', 'HA-006'],
  },
  {
    id: 'age-inline', group: 'Guardian and age', kind: 'snippets', file: 'src/pages/Auth.jsx',
    snippets: [
      '${AGE_DECLARATION_TEXT} Prism is currently available to candidates aged 18 or older.',
      'Please confirm that you are 18 or older. Prism is currently available to adult candidates only.',
      'Your assessment conversation is processed for scoring only and is not shared with employers or',
      'third parties without your consent.',
    ],
    where: '`/register` and `/login` (Auth page): age checkbox label, error, footer privacy line', policy: 'AGE_GATING_POLICY_v1; Privacy Policy', flag: 'live', status: LIVE_UNREVIEWED, counsel: ['HA-005', 'HA-006'],
  },
  {
    id: 'age-settings', group: 'Guardian and age', kind: 'snippets', file: 'src/features/settings/pages/SettingsPage.jsx',
    snippets: [
      'Age declaration before assessment',
      'Prism is currently available to adult candidates. No date of birth is collected.',
      'Your personal workspace holds assessments you bought or were given yourself.',
      'If you join an institution, it gets its own workspace. In that workspace, when authorised, the institution can see:',
      'It cannot see, unless you share it:',
    ],
    where: '`/app/settings` (age declaration callout; Privacy panel, which also renders `CAMPUS_CAN_SEE` / `CAMPUS_CANNOT_SEE`)', policy: 'AGE_GATING_POLICY_v1; campus spec §36', flag: 'live (V3 shell)', status: LIVE_UNREVIEWED, counsel: ['HA-005', 'HA-C005'],
  },
  {
    id: 'age-legacy-briefing', group: 'Guardian and age', kind: 'snippets', file: 'src/pages/Briefing.jsx',
    snippets: ['{AGE_DECLARATION_TEXT} Prism is currently available to candidates aged 18 or older.'],
    where: 'Legacy `/briefing` age confirmation (its `CONSENT_ITEMS` are identical to `ASSESSMENT_CONSENT_ITEMS`, test `player.test.jsx`)', policy: 'AGE_GATING_POLICY_v1', flag: 'live', status: LIVE_UNREVIEWED, counsel: ['HA-005'],
  },
  // ── Assessment consent ─────────────────────────────────────────────────────
  {
    id: 'assessment-consent', group: 'Assessment consent and disclosures', kind: 'module', file: 'src/lib/copy/assessmentConsent.js',
    exports: ['CONSENT_VERSION', 'ASSESSMENT_CONSENT_ITEMS'],
    where: 'V3 system check before start (`/app/assessments/:id/system-check`, `/app/campus/:orgId/assignments/:id/system-check`); identical wording in the legacy `/briefing` (`CONSENT_ITEMS`). Stored with every consent (`v1_consents`, migration 0003; `consent_version` on the session spine, 0004); required scopes enforced by `REQUIRED_CONSENT_SCOPES`',
    policy: 'DPDP consent for processing, AI disclosure, proctoring and on-device face analysis, phone-camera relay, research/calibration use; Privacy Policy', flag: 'live (`phone_camera_relay` only when PRISM_PROCTOR_PHONE_CAM is on)', status: LIVE_UNREVIEWED, counsel: ['HA-005', 'HA-C005'],
  },
  {
    id: 'policy-notices', group: 'Assessment consent and disclosures', kind: 'module', file: 'server/lib/sharedConstants.js',
    exports: ['PILOT_NOTICE', 'NOT_SOLE_BASIS_POLICY', 'ALTERNATE_ADMINISTRATION_DISCLOSURE', 'ASSURANCE_LEVELS'],
    where: 'Report, verification, marketing and institutional surfaces and report emails (pilot notice, not-sole-basis policy); legacy report for an approved alternate administration (`routes/assessment.js`); report and verification identity-level text',
    policy: 'Charter §2 (verbatim policy strings), §9 identity assurance (Level 3 needs HA-007), §13 alternate administration (ACCOMMODATIONS_POLICY_v1)', flag: 'live', status: LIVE_UNREVIEWED, counsel: ['HA-004', 'HA-005', 'HA-007'],
  },
  {
    id: 'research-permission', group: 'Assessment consent and disclosures', kind: 'module', file: 'server/domain/preferences/repository.js',
    exports: ['SUPPORT_DISCLOSURE'],
    where: '`GET/PUT /api/v1/me/preferences`; onboarding intent step on `/app/home`', policy: 'Research permission separate from scoring (migration 0053); FAIRNESS_RESEARCH_FRAMEWORK_v1', flag: 'live (V3 shell)', status: LIVE_UNREVIEWED, counsel: ['HA-005'],
  },
  {
    id: 'research-permission-inline', group: 'Assessment consent and disclosures', kind: 'snippets', file: 'src/features/home/components/IntentStep.jsx',
    snippets: [
      'Shown only on your own screens. Never used in any assessment, evaluation or report.',
      'Separately: you may use my pseudonymous practice data for research',
      'Optional and separate from the choices above. Nothing is used for research until a research plan is approved; you can change this at any time in Settings.',
    ],
    where: '`/app/home` onboarding (display name hint, research permission checkbox)', policy: 'FAIRNESS_RESEARCH_FRAMEWORK_v1; migration 0053', flag: 'live (V3 shell)', status: LIVE_UNREVIEWED, counsel: ['HA-005', 'HA-012'],
  },
  {
    id: 'support', group: 'Assessment consent and disclosures', kind: 'module', file: 'src/lib/copy/support.js',
    exports: ['SUPPORT_EMAIL', 'REVIEW_COPY', 'ACCOMMODATION_COPY', 'IDENTITY_COPY', 'SUPPORT_SETTINGS_COPY'],
    where: 'Report page (human review request, identity check), briefing (adjustment request), `/app/settings` Assessment support section; API `/api/v1/me/support-requests`, accommodation and identity routes (Phase 4)',
    policy: 'APPEALS_SUPERSESSION_POLICY_v1 (review target, not an SLA), ACCOMMODATIONS_POLICY_v1, IDENTITY_ASSURANCE_SPEC_v1', flag: 'PRISM_V3_SUPPORT_ROUTES (OFF)', status: 'DRAFT per file header (comment only, no status constant), pending HA-005', counsel: ['HA-005'],
  },
  {
    id: 'student-briefing', group: 'Campus (institution) disclosures', kind: 'module', file: 'src/lib/copy/student.js',
    exports: ['BRIEFING_COPY.accommodations', 'BRIEFING_COPY.personalScope', 'SPONSORED_DISCLOSURE_VERSION', 'SPONSORED_DISCLOSURE'],
    where: 'Assessment briefing (`/app/assessments/:id/briefing`, `/app/campus/:orgId/assignments/:id/briefing`); the sponsored disclosure is acknowledged with `campus-assessment-disclosure.v1-draft` (`CAMPUS_ASSESSMENT_DISCLOSURE`, migration 0029)',
    policy: 'Campus spec §11 (sponsored disclosure); ACCOMMODATIONS_POLICY_v1', flag: 'PRISM_ASSESSMENT_WORKSPACE_V3 / PRISM_CAMPUS_ENABLED (OFF)', status: DRAFT_CAMPUS, counsel: ['HA-C005', 'HA-005'],
  },
  {
    id: 'campus-privacy', group: 'Campus (institution) disclosures', kind: 'module', file: 'src/lib/copy/privacy.js',
    exports: ['CAMPUS_DISCLOSURE_VERSION', 'CAMPUS_CAN_SEE', 'CAMPUS_CANNOT_SEE', 'ROLE_LABELS', 'PERSONAL_PRIVACY_NOTE', 'SPONSORED_PRIVACY_NOTE'],
    where: 'Campus invitation (`/app/campus-invite/:token`, accepted as `CAMPUS_SPONSORSHIP_DISCLOSURE`), sponsored workspace panels, privacy badge, `/app/settings` Privacy panel, campus members page',
    policy: 'Campus spec §36.1 / §36.2', flag: 'PRISM_CAMPUS_ENABLED (OFF)', status: DRAFT_CAMPUS, counsel: ['HA-C005', 'HA-005'],
  },
  {
    id: 'campus-versions', group: 'Campus (institution) disclosures', kind: 'module', file: 'server/domain/sharing/copyVersions.js',
    exports: ['CAMPUS_DISCLOSURE_COPY_VERSION', 'CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION'],
    where: 'Stored in `consent_records.copy_version` (migration 0029) for invitation acceptance and sponsored-assessment acknowledgement', policy: 'Campus spec §11, §36', flag: 'PRISM_CAMPUS_ENABLED (OFF)', status: DRAFT_CAMPUS, counsel: ['HA-C005'],
  },
  {
    id: 'campus-consent-preview', group: 'Campus (institution) disclosures', kind: 'module', file: 'server/domain/campusAdmin/service.js',
    exports: ['consentPreviewFor'],
    where: '`GET /api/v1/organizations/:orgId/consent-preview` (campus admin onboarding step "Review privacy")', policy: 'Campus spec §11', flag: 'PRISM_CAMPUS_ENABLED (OFF)', status: DRAFT_CAMPUS, counsel: ['HA-C005'],
  },
  {
    id: 'campus-admin-privacy', group: 'Campus (institution) disclosures', kind: 'module', file: 'src/lib/copy/campus.js',
    exports: ['STUDENT_DETAIL_PRIVACY', 'ONBOARDING_STEP_COPY.privacy', 'ANALYTICS_COPY.suppressed', 'ANALYTICS_COPY.scopeNote', 'ANALYTICS_COPY.noRanking', 'ANALYTICS_COPY.thresholdHelp'],
    where: 'Campus admin: student detail, onboarding checklist, analytics (`/campus/:organizationId/*`)', policy: 'Campus spec §27.2 (suppression), §36', flag: 'PRISM_CAMPUS_ENABLED / PRISM_CAMPUS_ANALYTICS (OFF)', status: 'Campus copy; not marked DRAFT in code; part of HA-C005 / HA-C010 review', counsel: ['HA-C005', 'HA-C010'],
  },
  {
    id: 'campus-inline', group: 'Campus (institution) disclosures', kind: 'snippets', file: 'src/components/campus/ConsentScopePanel.jsx',
    snippets: ['{organizationName} can see', '{organizationName} cannot see, unless you share it', 'How {organizationName} may use Prism'],
    where: 'Headings of the can-see / cannot-see panel (campus and employer invitation, sponsored workspace)', policy: 'Campus spec §36; PROHIBITED_USES_POLICY_v1 (employer)', flag: 'PRISM_CAMPUS_ENABLED (OFF)', status: DRAFT_CAMPUS, counsel: ['HA-C005', 'HA-005'],
  },
  {
    id: 'privacy-badge-inline', group: 'Campus (institution) disclosures', kind: 'snippets', file: 'src/components/campus/PrivacyScopeBadge.jsx',
    snippets: ['Private to you', 'Summaries to ${org}', 'Visible to ${org}'],
    where: 'Workspace header privacy badge (tooltip: `PERSONAL_PRIVACY_NOTE`, `SPONSORED_PRIVACY_NOTE`, `EMPLOYER_SPONSORED_NOTE`)', policy: 'Campus spec §4.3, §7.1', flag: 'PRISM_APP_SHELL_V3 / PRISM_CAMPUS_ENABLED (OFF)', status: DRAFT_CAMPUS, counsel: ['HA-C005'],
  },
  {
    id: 'campus-invite-inline', group: 'Campus (institution) disclosures', kind: 'snippets', file: 'src/features/workspaces/pages/CampusInvitePage.jsx',
    snippets: ['You can see and revoke anything you choose to share from Sharing in your personal workspace.', 'I have read what ${org} can and cannot see'],
    where: '`/app/campus-invite/:token` (campus invitation acknowledgement)', policy: 'Campus spec §36', flag: 'PRISM_CAMPUS_ENABLED (OFF)', status: DRAFT_CAMPUS, counsel: ['HA-C005'],
  },
  // ── Sharing and visibility ─────────────────────────────────────────────────
  {
    id: 'report-sharing', group: 'Sharing and visibility', kind: 'module', file: 'src/lib/copy/report.js',
    exports: ['REPORT_COPY.visibility', 'REPORT_COPY.share', 'SHARE_EXPIRY_OPTIONS'],
    where: 'Report page (`/app/reports/:sessionId`), share dialog, `/app/sharing`, shared view `/shared/:token`, campus report view; share grants are `SHARE_GRANT` consent records with disclosure level SUMMARY/FULL (migration 0029), at most 180 days',
    policy: 'BUYER_ACCESS_SPEC_v1 (candidate-authorized access); campus spec §36', flag: 'PRISM_STUDENT_REPORT_V3 (OFF)', status: 'Product copy; not marked DRAFT in code; part of HA-C005 review', counsel: ['HA-C005', 'HA-005'],
  },
  {
    id: 'share-dialog-inline', group: 'Sharing and visibility', kind: 'snippets', file: 'src/features/reports/components/ShareReportDialog.jsx',
    snippets: ["Shared with ${created.organizationName || 'your institution'} until ${formatDate(created.expiresAt)}.", 'Private link'],
    where: 'Share dialog confirmation', policy: 'BUYER_ACCESS_SPEC_v1', flag: 'PRISM_STUDENT_REPORT_V3 (OFF)', status: 'Product copy; part of HA-C005 review', counsel: ['HA-C005'],
  },
  {
    id: 'player-visibility', group: 'Sharing and visibility', kind: 'module', file: 'src/lib/copy/player.js',
    exports: ['PLAYER_COPY.personalVisibility', 'PLAYER_COPY.sponsoredVisibility', 'PLAYER_COPY.employerVisibility'],
    where: 'V3 assessment player header (`/app/assessments/:id/play` and campus variant)', policy: 'Campus spec §36; employer aggregate-only visibility (P92)', flag: 'PRISM_ASSESSMENT_WORKSPACE_V3 (OFF)', status: 'Product copy; part of HA-C005 / HA-005 review', counsel: ['HA-C005', 'HA-005'],
  },
  // ── Public legal pages ─────────────────────────────────────────────────────
  {
    id: 'legal-privacy', group: 'Public legal pages', kind: 'jsxSection', file: 'src/pages/legal/LegalPages.jsx',
    start: 'export function PrivacyPolicy()', end: 'export function TermsOfService()',
    where: '`/privacy` (effective date constant `EFFECTIVE` in the same file)', policy: 'DPDP transparency; RETENTION_POLICY_v1', flag: 'live (public)', status: 'Live; file header says "pending formal legal review"', counsel: ['HA-003', 'HA-005'],
  },
  {
    id: 'legal-terms', group: 'Public legal pages', kind: 'jsxSection', file: 'src/pages/legal/LegalPages.jsx',
    start: 'export function TermsOfService()', end: 'export function RefundPolicy()',
    where: '`/terms`', policy: 'Terms of service; AGE_GATING_POLICY_v1 (see finding F2)', flag: 'live (public)', status: 'Live; file header says "pending formal legal review"', counsel: ['HA-003', 'HA-004', 'HA-006'],
  },
]

// Exports whose names look like consent / disclosure copy but are not text a
// person reads. Each needs a reason; the ratchet test fails on any new
// matching export that is neither here nor in PACKET_SOURCES.
export const NOT_COUNSEL_COPY = {
  'server/domain/assessments/sessionService.js:REQUIRED_CONSENT_SCOPES': 'scope ids enforced at start; their wording is ASSESSMENT_CONSENT_ITEMS',
  'server/domain/guardian/repository.js:eraseGuardianConsentsFromMemory': 'erasure code',
  'server/domain/guardian/repository.js:createGuardianConsentRepo': 'repository factory',
  'server/domain/guardian/service.js:publicConsent': 'serialises the record; text is GUARDIAN_CONSENT_COPY',
  'server/domain/guardian/service.js:createGuardianConsentService': 'service factory',
  'server/domain/privacy/guardianConsentRetention.js:purgeUnverifiedGuardianConsents': 'retention job code',
  'server/domain/reports/v3/build.js:DISCLOSURE_LEVELS': 'enum SUMMARY/FULL; the wording is REPORT_COPY.share',
  'server/domain/reports/v3/build.js:projectDisclosure': 'projection code',
  'server/domain/reports/v3/service.js:MAX_SHARE_DAYS': 'number (180) stated in the sharing section',
  'server/lib/mailer.js:sendGuardianConsentEmail': 'email text exported as snippets (guardian-email)',
  'server/lib/retentionEnforcement.js:GUARDIAN_CONSENT_UNVERIFIED_ENTITY': 'retention entity id',
  'server/lib/retentionEnforcement.js:GUARDIAN_CONSENT_UNVERIFIED_RETENTION_DAYS': 'number (30) quoted in GUARDIAN_CONSENT_COPY.deletion',
  'server/lib/store.js:recordConsent': 'store code', 'server/lib/store.js:getConsent': 'store code', 'server/lib/store.js:listConsents': 'store code',
  'server/lib/storeJson.js:recordConsent': 'store code', 'server/lib/storeJson.js:getConsent': 'store code', 'server/lib/storeJson.js:listConsents': 'store code',
  'server/lib/storePg.js:recordConsent': 'store code', 'server/lib/storePg.js:getConsent': 'store code', 'server/lib/storePg.js:listConsents': 'store code',
  'server/lib/sharedConstants.js:CONSENT_VERSION': 'exported in the packet through its client re-export (assessment-consent)',
  'server/lib/teamfit.js:TEAMFIT_CONSENT_SCOPE': 'scope id of the legacy team-fit feature',
  'server/lib/teamfit.js:verifyTeamConsent': 'consent check code',
  'src/api/guardian.js:fetchGuardianConsent': 'API client', 'src/api/guardian.js:decideGuardianConsent': 'API client', 'src/api/guardian.js:withdrawGuardianConsent': 'API client',
  'src/features/campus/hooks.js:useConsentPreview': 'React Query hook; text is consentPreviewFor',
  'src/features/guardian/GuardianConsentPage.jsx:GuardianConsentPage': 'renders GUARDIAN_CONSENT_COPY (server) and GUARDIAN_PAGE_COPY; no own text',
  'src/pages/admin/AdminPrivacy.jsx:AdminPrivacy': 'staff console for privacy requests (not shown to candidates)',
}

// Files under src/lib/copy that hold no consent / disclosure / sharing text.
export const COPY_FILES_NOT_IN_PACKET = {
  'src/lib/copy/emptyStates.js': 'empty-state wording ("Nothing shared yet" is not a disclosure)',
  'src/lib/copy/evidence.js': 'evidence-status vocabulary (covered by the HA-C002 memo, not counsel copy)',
}

// The pattern the ratchet uses to find consent / disclosure copy exports.
export const COPY_EXPORT_PATTERN = /export\s+(?:default\s+)?(?:const|function|async\s+function)\s+([A-Za-z0-9_]*(?:CONSENT|DISCLOSURE|PRIVACY|SHARE|SHARING|GUARDIAN|PROHIBITED|NOT_SOLE|PILOT_NOTICE|AGE_DECLARATION|VISIBILITY|Consent|Disclosure|Privacy|ProhibitedUse|Visibility|EMPLOYER_[A-Z_]*COPY|EMPLOYER_PURPOSE|CAN_SEE|CANNOT_SEE)[A-Za-z0-9_]*)/g

// ── extraction ────────────────────────────────────────────────────────────────

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')

function lineOf(text, needle) {
  const i = text.indexOf(needle)
  return i < 0 ? null : text.slice(0, i).split('\n').length
}

function exportLine(text, name) {
  const m = new RegExp(`export\\s+(?:const|function|async\\s+function)\\s+${name}\\b`).exec(text)
    || new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).exec(text)
  if (!m) return null
  return text.slice(0, m.index).split('\n').length
}

function paramNames(fn) {
  const src = Function.prototype.toString.call(fn)
  const m = /^(?:async\s*)?(?:function\s*[A-Za-z0-9_$]*\s*)?\(([^)]*)\)/.exec(src) || /^([A-Za-z0-9_$]+)\s*=>/.exec(src)
  if (!m) return []
  return m[1].split(',').map((p) => p.replace(/=.*$/, '').trim()).filter(Boolean)
}

const callWithPlaceholders = (fn) => fn(...paramNames(fn).map((p) => `{${p}}`))

// Flatten a value into [path, text] rows. Strings verbatim; numbers and
// booleans as JSON; functions called with placeholders.
export function flatten(value, path, out = []) {
  if (typeof value === 'function') return flatten(callWithPlaceholders(value), `${path}(${paramNames(value).map((p) => `{${p}}`).join(', ')})`, out)
  if (typeof value === 'string') { out.push([path, value]); return out }
  if (value === null || typeof value !== 'object') { out.push([path, JSON.stringify(value)]); return out }
  if (Array.isArray(value)) {
    value.forEach((v, i) => flatten(v, `${path}[${i}]`, out))
    if (value.length === 0) out.push([path, '[]'])
    return out
  }
  for (const [k, v] of Object.entries(value)) flatten(v, `${path}.${k}`, out)
  return out
}

const ENTITIES = { '&ldquo;': '“', '&rdquo;': '”', '&lsquo;': '‘', '&rsquo;': '’', '&middot;': '·', '&amp;': '&', '&nbsp;': ' ', '&mdash;': '—', '&ndash;': '–' }

// Visible text of a JSX region: each element's text on its own line, markup
// and attributes removed, `{CONST}` expressions kept as written.
export function jsxText(source) {
  const BREAK = '\u0001'
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\s+/g, ' ')
    .replace(/<LegalShell title="([^"]*)" subtitle="([^"]*)">/g, `${BREAK}## $1${BREAK}$2${BREAK}`)
    .replace(/<(H|DocH)>/g, `${BREAK}## `)
    .replace(/<li[^>]*>/g, `${BREAK}- `)
    .replace(/<\/?(p|ul|ol|li|H|DocH|div|section|LegalShell)(\s[^>]*)?>/g, BREAK)
    .replace(/<\/?[A-Za-z][^>]*>/g, '')
    .replace(/&[a-z]+;/g, (e) => ENTITIES[e] ?? e)
    .split(BREAK)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => /[A-Za-z]/.test(l.replace(/\breturn\b/g, '')) && l !== '##' && l !== '-')
}

export async function collect() {
  const sections = []
  for (const src of PACKET_SOURCES) {
    const text = read(src.file)
    const rows = []
    if (src.kind === 'module') {
      const mod = await import(pathToFileURL(join(ROOT, src.file)).href)
      for (const name of src.exports) {
        const [head, ...rest] = name.split('.')
        if (!(head in mod)) throw new Error(`${src.file}: export ${head} not found (update PACKET_SOURCES)`)
        let value = mod[head]
        for (const key of rest) {
          if (value == null || !(key in value)) throw new Error(`${src.file}: ${name} not found (update PACKET_SOURCES)`)
          value = value[key]
        }
        const line = exportLine(text, head)
        for (const [path, val] of flatten(value, name)) rows.push({ key: path, line, text: val })
      }
    } else if (src.kind === 'snippets') {
      for (const s of src.snippets) {
        const line = lineOf(text, s)
        if (line === null) throw new Error(`${src.file}: snippet not found (the copy changed; update PACKET_SOURCES): ${s}`)
        rows.push({ key: 'inline', line, text: s })
      }
    } else if (src.kind === 'jsxSection') {
      const a = text.indexOf(src.start)
      const b = text.indexOf(src.end)
      if (a < 0 || b < 0 || b < a) throw new Error(`${src.file}: section ${src.start} … ${src.end} not found`)
      const line = lineOf(text, src.start)
      for (const t of jsxText(text.slice(a + src.start.length, b))) rows.push({ key: 'text', line, text: t })
    } else {
      throw new Error(`unknown kind ${src.kind}`)
    }
    sections.push({ ...src, rows })
  }
  return sections
}

// ── rendering ────────────────────────────────────────────────────────────────

const FINDINGS = [
  ['F1', 'Campus sponsored-assessment disclosure has two wordings under one version id `campus-assessment-disclosure.v1-draft`: the student briefing (`SPONSORED_DISCLOSURE`, src/lib/copy/student.js) says the institution "can access this sponsored assessment result and program-related development progress"; the admin preview (`consentPreviewFor`, server/domain/campusAdmin/service.js) says it "can see that you were assigned this assessment and whether you completed it" and "can see the report from this sponsored assessment". No test compares them. Counsel should approve one text; engineering then makes both read from it.'],
  ['F2', 'The Terms of Service (`/terms`) say "You must be at least 18 years old, or have the consent of a guardian." The live product has no guardian path (PRISM_UNDER18_PATH off, no registration control) and AGE_GATING_POLICY_v1 says 18+ only. See the HA-006 memo.'],
  ['F3', 'The Privacy Policy describes camera and microphone as active during an assessment, voice answers and identity-document reading; several of these depend on flags and on the legacy versus V3 player (V3 is text-only today, `RESPONSE_MODES = [\'TEXT\']`). Counsel should check each statement against the configuration that will be live at the pilot.'],
  ['F4', 'Support copy (`src/lib/copy/support.js`) is marked DRAFT only in a comment; there is no status constant a test can check.'],
  ['F5', 'The employer prohibited-use line follows PROHIBITED_USES_POLICY_v1 "sole or primary basis" wording, not an absolute ban (risk row, P93). HA-004 decides whether that is the right standard.'],
  ['F6', '`GUARDIAN_CONSENT_COPY.learnerPending` is not shown on any page or returned by any route today.'],
]

export function render(sections) {
  const out = []
  const push = (...l) => out.push(...l)
  push(
    '# Counsel packet — consent, disclosure, sharing, employer and guardian strings',
    '',
    '<!-- GENERATED by scripts/export-consent-strings.mjs — do not edit by hand. Regenerate with `node scripts/export-consent-strings.mjs`; `--check` fails when stale (server/test/consentPacket.test.js). -->',
    '',
    'PROD-READY Phase 10 — one packet for **HA-C005** (campus disclosure, consent and sharing copy), **HA-005** (DPDP review: age gating, accommodations, research consent, erasure), **HA-004** (employment-law review of buyer use and prohibited uses), with the guardian strings for **HA-006** and the hand-off contract for **HA-025**.',
    '',
    '**Nothing in this packet is approved.** Every string is either marked DRAFT in the code or is live wording with no counsel approval on record. The text below is extracted from the code by the script, so it is exactly what the product shows (functions are rendered with placeholders such as `{org}` for the organization name). Line numbers point at the export or the snippet in the source file.',
    '',
    'How to use it: counsel marks each section approved / changed / rejected in a copy of this file or a separate memo and returns it. Engineering then replaces the text **under a new version id** (consent records keep the version the person saw) and links the approval from the register rows. Engineering does not edit approved wording.',
    '',
    '## Findings for counsel (prepared by engineering)',
    '',
  )
  for (const [id, text] of FINDINGS) push(`- **${id}.** ${text}`)
  push('', '## Contents', '')
  const groups = [...new Set(sections.map((s) => s.group))]
  for (const g of groups) {
    push(`- ${g}`)
    for (const s of sections.filter((x) => x.group === g)) push(`  - \`${s.id}\` — \`${s.file}\``)
  }
  for (const g of groups) {
    push('', `## ${g}`)
    for (const s of sections.filter((x) => x.group === g)) {
      push(
        '',
        `### \`${s.id}\` — \`${s.file}\``,
        '',
        `- **Where it appears:** ${s.where}`,
        `- **Policy it implements:** ${s.policy}`,
        `- **Flag:** ${s.flag}`,
        `- **Status:** ${s.status}`,
        `- **Review items:** ${s.counsel.join(', ')}`,
        `- **Extraction:** ${s.kind === 'module' ? 'module exports (imported)' : s.kind === 'snippets' ? 'literal snippets (must be present in the file)' : 'visible JSX text (markup stripped)'}`,
        '',
      )
      for (const r of s.rows) {
        const loc = r.line ? `L${r.line}` : 'L?'
        const text = r.text.replace(/\r?\n/g, ' ↵ ')
        push(s.kind === 'jsxSection' ? `- ${text.startsWith('## ') ? `**${text.slice(3)}**` : text.replace(/^- /, '• ')}` : `- \`${r.key}\` (${loc}): ${text}`)
      }
    }
  }
  push(
    '',
    '## Sign-off (counsel)',
    '',
    '| Section ids | Decision (approved / changed / rejected) | Counsel | Date | Reference |',
    '| --- | --- | --- | --- | --- |',
    '| `______` | `______` | `______` | `______` | `______` |',
    '',
  )
  return out.join('\n')
}

export async function generate() {
  return render(await collect())
}

async function main() {
  const check = process.argv.includes('--check')
  const text = await generate()
  const path = join(ROOT, PACKET_PATH)
  if (check) {
    let current = ''
    try { current = readFileSync(path, 'utf8') } catch { /* missing */ }
    if (current.replace(/\r\n/g, '\n') !== text) {
      console.error(`${PACKET_PATH} is stale: run node scripts/export-consent-strings.mjs`)
      process.exit(1)
    }
    console.log(`${PACKET_PATH} is current`)
    return
  }
  writeFileSync(path, text)
  console.log(`wrote ${relative(ROOT, path)} (${text.split('\n').length} lines)`)
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((err) => { console.error(err.message || err); process.exit(1) })
}
