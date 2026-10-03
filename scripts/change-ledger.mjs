export const CHANGE_LEDGER_VERSION = 'p10.ch.v1'

const row = (id, decision, status, implementation, evidence, blockers = []) => ({
  id, decision, status, implementation, evidence, blockers,
})

const D = 'DEFERRED'
const I = 'IMPLEMENTED'
const R = 'RETAINED'
const X = 'EXTERNAL_GATE'
const A = 'ADAPTER'

export const CHANGE_LEDGER = Object.freeze([
  row('CH-01', 'K', R, ['src/design/tokens.js', 'src/components/ui/PrismLogo.jsx'], ['server/test/designSystem.test.js']),
  row('CH-02', 'K', R, ['server/domain/scopes', 'server/routes/v1/workspaces.js'], ['server/test/identityIsolation.test.js']),
  row('CH-03', 'U', I, ['server/domain/reports/v3/service.js'], ['server/test/reportClaims.test.js']),
  row('CH-04', 'K', I, ['server/domain/evidence', 'server/domain/development'], ['server/test/preparation.test.js']),
  row('CH-05', 'U', I, ['src/features/home/pages/HomePage.jsx'], ['src/features/student/studentPages.test.jsx']),
  row('CH-06', 'U', I, ['src/app/AppRouter.jsx', 'src/pages/Auth.jsx'], ['tests/e2e/p1-account-entry.spec.js']),
  row('CH-07', 'U', I, ['server/domain/student/sessionDirectory.js'], ['server/test/studentHistory.test.js']),
  row('CH-08', 'A', I, ['scripts/reconcile-ownership.mjs'], ['server/test/ownershipReconciliation.test.js']),
  row('CH-09', 'U', I, ['src/features/assessments/pages/AssessmentPlayerPage.jsx', 'server/domain/assessments/sessionService.js'], ['tests/e2e/p3-real-journey.spec.js']),
  row('CH-10', 'R', A, ['src/app/routing.jsx', 'scripts/route-usage-inventory.mjs'], ['server/test/legacyReadersRetained.test.js'], ['RETIRE_AFTER_MONITORED_DRAIN']),
  row('CH-11', 'U', I, ['src/layouts/AssessmentShell.jsx'], ['tests/e2e/flow-player-layout.spec.js']),
  row('CH-12', 'U', I, ['src/features/assessments/pages/AssessmentPlayerPage.jsx'], ['src/features/assessments/player.test.jsx']),
  row('CH-13', 'U', I, ['server/domain/assessments/timingPolicy.js'], ['server/test/runTiming.test.js'], ['TIMING_POLICY_HUMAN_APPROVAL']),
  row('CH-14', 'U', I, ['server/domain/assessments/sessionService.js'], ['server/test/universalRun.test.js']),
  row('CH-15', 'A', I, ['server/domain/assessments/universalForm.js'], ['server/test/universalForm.test.js'], ['CONTENT_AND_MEASUREMENT_APPROVAL']),
  row('CH-16', 'U', I, ['server/domain/assessments/universalForm.js'], ['server/test/evidenceSufficiency.test.js'], ['MEASUREMENT_APPROVAL']),
  row('CH-17', 'A', I, ['server/domain/assessments/sessionIoRepository.js'], ['server/test/director.test.js']),
  row('CH-18', 'U', I, ['server/domain/assessments/director.js'], ['server/test/director.test.js']),
  row('CH-19', 'A', I, ['src/components/artifacts/PlanBoard.jsx'], ['src/features/assessments/p3Player.test.jsx']),
  row('CH-20', 'U', I, ['server/domain/assessments/sessionService.js'], ['server/test/faultInjection.test.js']),
  row('CH-21', 'U', I, ['server/domain/evidence/sliceEvaluator.js'], ['server/test/p2Slice.db.test.js'], ['LAYER_C_NOT_RUN']),
  row('CH-22', 'A', I, ['server/domain/assessments/sessionContract.js'], ['tests/e2e/p5-report-states.spec.js']),
  row('CH-23', 'U', I, ['server/domain/reports/v3/service.js'], ['server/test/reportReviewCorrection.test.js']),
  row('CH-24', 'A', I, ['src/features/reports/components/CapabilityMap.jsx'], ['src/features/reports/reports.test.jsx'], ['HUMAN_COMPREHENSION_NOT_RUN']),
  row('CH-25', 'A', I, ['src/features/reports/components/MomentCard.jsx'], ['server/test/reportMoments.test.js']),
  row('CH-26', 'U', I, ['src/features/capabilities/pages/CapabilityDetailPage.jsx'], ['src/features/capabilities/capabilityDetail.test.jsx']),
  row('CH-27', 'R', I, ['src/features/reports/components/ReportView.jsx'], ['tests/e2e/p5-report-states.spec.js']),
  row('CH-28', 'R', I, ['src/pages/ScoreReport.jsx'], ['server/test/legacyReadersRetained.test.js']),
  row('CH-29', 'A', I, ['server/domain/reports/v3/repository.js'], ['server/test/reportReviewCorrection.test.js']),
  row('CH-30', 'A', I, ['server/domain/development/missionLibrary.p6.js'], ['server/test/missionsEndToEnd.test.js'], ['TEN_MISSIONS_DRAFT_NOT_APPROVED']),
  row('CH-31', 'U', I, ['server/domain/development/evaluate.js'], ['server/test/missionsEndToEnd.test.js'], ['LAYER_C_NOT_RUN']),
  row('CH-32', 'A', I, ['server/domain/development/service.js'], ['server/test/practiceReplay.test.js']),
  row('CH-33', 'A', I, ['server/domain/development/service.js'], ['server/test/practiceReplay.test.js']),
  row('CH-34', 'A', I, ['server/domain/preparation/service.js'], ['server/test/preparation.test.js'], ['PRIVACY_AND_CONTENT_APPROVAL']),
  row('CH-35', 'A', I, ['server/domain/preparation/service.js'], ['server/test/preparation.test.js']),
  row('CH-36', 'U', I, ['server/domain/growth/service.js'], ['server/test/growthEligibility.test.js'], ['T46_FORM_COMPARABILITY_BLOCKED']),
  row('CH-37', 'U', I, ['server/routes/v1/studentScope.js'], ['server/test/commerceGaps.test.js'], ['CAMPUS_PRIVACY_APPROVAL']),
  row('CH-38', 'U', I, ['server/lib/legacyReportGuard.js', 'server/routes/v1/reports.js'], ['server/test/reportAudiences.test.js']),
  row('CH-39', 'U', I, ['server/lib/campusErasure.js'], ['server/test/rollback.test.js'], ['RETENTION_POLICY_APPROVAL']),
  row('CH-40', 'U', I, ['server/domain/assessments/sessionIoRepository.js'], ['server/test/faultInjection.test.js']),
  row('CH-41', 'A', I, ['scripts/check-experience-baseline.mjs', 'server/domain/release/config.js'], ['server/test/release.test.js'], ['REAL_ENVIRONMENT_NOT_PROBED']),
  row('CH-42', 'U', I, ['server/domain/commerce/products.js'], ['server/test/commerceGaps.test.js'], ['PRICE_AND_RECOVERY_POLICY_NOT_APPROVED']),
  row('CH-43', 'A', I, ['server/domain/commerce/preview.js'], ['server/test/preview.test.js'], ['DEMAND_RESEARCH_NOT_RUN']),
  row('CH-44', 'A', I, ['server/domain/metrics'], ['server/test/metricsDefinitions.test.js'], ['LAYER_C_COST_LINEAGE_BLOCKED']),
  row('CH-45', 'A', X, ['docs/experience/VALIDATION_PLAN.md'], ['docs/experience/RESEARCH_PROTOCOLS.md'], ['HUMAN_VALIDATION_NOT_RUN']),
  row('CH-46', 'D', D, ['docs/experience/ROLLOUT.md'], ['docs/experience/IMPLEMENTATION_STATE.md'], ['SOURCE_DEFERRED']),
  row('CH-47', 'D', D, ['docs/experience/DECISIONS.md'], ['docs/experience/IMPLEMENTATION_STATE.md'], ['SOURCE_DEFERRED']),
  row('CH-48', 'R', I, ['src/features/home/pages/HomePage.jsx'], ['src/features/student/studentPages.test.jsx']),
  row('CH-49', 'U', R, ['server/lib/proctorSocket.js'], ['server/test/runTiming.test.js'], ['POLICY_AND_ACCESSIBILITY_APPROVAL']),
  row('CH-50', 'R', A, ['server/domain/assessments/universalForm.js', 'server/lib/scenarioBank.js'], ['server/test/universalForm.test.js'], ['FORMAL_CONTENT_APPROVAL']),
  row('CH-51', 'D', D, ['server/domain/commerce/products.js'], ['docs/experience/DECISIONS.md'], ['VOLUNTARY_REPEAT_VALUE_NOT_PROVEN']),
  row('CH-52', 'R', I, ['server/domain/reports/v3/service.js', 'server/domain/assessments/sessionService.js'], ['server/test/p2Slice.db.test.js']),
])

export const CHANGE_STATUS = Object.freeze([I, R, X, A, D])
