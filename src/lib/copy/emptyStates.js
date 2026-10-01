// Governed customer-facing copy for empty/insufficient states (spec §40).
// Kept in one module so copy review (HA-C005) touches a single file.
export const EMPTY_COPY = {
  home: {
    title: 'No assessments yet',
    description: 'Complete your first Prism assessment to start building an evidence-based picture of how you work.',
  },
  assessments: {
    title: 'No assessments yet',
    description: 'When you start an assessment, or your institution assigns one, it appears here with its status.',
  },
  capabilities: {
    title: 'You do not have a formal capability profile yet.',
    description: 'Complete your first Prism assessment to begin building one.',
  },
  evidence: {
    title: 'No evidence recorded yet',
    description: 'Evidence appears here after you complete an assessment. Each item shows what you did and which capability it relates to.',
  },
  development: {
    title: 'No development plan yet',
    description: 'After your first report, Prism suggests practice missions for up to three priorities. Practice never changes your formal results.',
  },
  growth: {
    title: 'Growth appears after a comparable reassessment',
    description: 'Prism only shows change between assessments that have been approved as comparable. Until then, no change is shown.',
  },
  sharing: {
    title: 'Nothing shared yet',
    description: 'You decide who sees your results. Links you create appear here, and you can revoke them at any time.',
  },
  campusCohort: {
    title: 'No assessment data yet.',
    description: 'Create an assignment for this cohort.',
  },
  assignmentUnavailable: {
    title: 'This assessment is not available',
    description: 'It may have ended, or it is not assigned to your current workspace.',
  },
  notYetAvailable: {
    title: 'This view is not available yet',
    description: 'Use the current version of this page for now.',
  },
}

export const START_ASSESSMENT_PATH = '/payment'
