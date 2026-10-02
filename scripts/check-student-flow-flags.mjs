import { pathToFileURL } from 'node:url'

const DEPENDENCIES = Object.freeze({
  PRISM_ASSESSMENT_WORKSPACE_V3: ['PRISM_APP_SHELL_V3', 'PRISM_EVIDENCE_FAIL_CLOSED'],
  PRISM_STUDENT_REPORT_V3: ['PRISM_APP_SHELL_V3', 'PRISM_EVIDENCE_FAIL_CLOSED'],
  PRISM_CAMPUS_ANALYTICS: ['PRISM_CAMPUS_ENABLED'],
})
const FLAGS = [...new Set([...Object.keys(DEPENDENCIES), ...Object.values(DEPENDENCIES).flat(), 'PRISM_PG_STORE'])]

export function checkStudentFlowFlags(env) {
  const errors = []
  for (const flag of FLAGS) {
    if (env[flag] !== undefined && !['true', 'false'].includes(env[flag])) {
      errors.push(`${flag} must be exactly true or false when configured.`)
    }
  }
  for (const [flag, dependencies] of Object.entries(DEPENDENCIES)) {
    if (env[flag] !== 'true') continue
    for (const dependency of dependencies) {
      if (env[dependency] !== 'true') errors.push(`${flag} requires ${dependency}=true.`)
    }
  }
  if ((env.PRISM_ASSESSMENT_WORKSPACE_V3 === 'true' || env.PRISM_STUDENT_REPORT_V3 === 'true') && !env.DATABASE_URL?.trim()) {
    errors.push('Assessment Workspace V3 and Report V3 require DATABASE_URL and an available, migrated store.')
  }
  if (env.NODE_ENV === 'production' && ['PRISM_APP_SHELL_V3', 'PRISM_ASSESSMENT_WORKSPACE_V3', 'PRISM_STUDENT_REPORT_V3'].some((flag) => env[flag] === 'true') && env.PRISM_PG_STORE !== 'true') {
    errors.push('V3 production requires PRISM_PG_STORE=true; JSON/memory persistence is not a production fallback.')
  }
  return errors
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = checkStudentFlowFlags(process.env)
  if (errors.length) {
    for (const error of errors) console.error(error)
    process.exitCode = 1
  } else {
    console.log('Student-flow flag configuration is consistent. This is not production release approval; store health, P0 gates and governance must still pass.')
  }
}
