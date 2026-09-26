// Student CSV import parsing and row validation (spec §23; C7.04). Pure
// functions: RFC 4180 CSV (quoted fields, escaped quotes, CRLF/LF, BOM),
// header aliases, and per-row validation that never throws — every problem
// becomes a named row error shown in the preview before anything is written.

export const IMPORT_LIMITS = Object.freeze({ maxRows: 2000, maxBytes: 1_000_000 })
export const IMPORT_COLUMNS = Object.freeze(['email', 'name', 'student_identifier', 'department', 'cohort'])
const ALIASES = {
  email: ['email', 'e-mail', 'email address', 'student email'],
  name: ['name', 'full name', 'student name'],
  student_identifier: ['student_identifier', 'student id', 'student_id', 'roll number', 'roll no', 'enrolment number', 'enrollment number'],
  department: ['department', 'dept', 'branch'],
  cohort: ['cohort', 'cohort name', 'section', 'batch'],
}
// A practical email check (the invite link is the real proof of ownership).
const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[^\s@<>()[\]\\,;:"]{1,253}\.[A-Za-z]{2,63}$/

export function parseCsv(text) {
  const src = String(text || '').replace(/^\uFEFF/, '')
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i += 1 } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"' && field === '') quoted = true
    else if (c === ',') { row.push(field); field = '' } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''))
}

export function mapHeader(headerRow) {
  const index = {}
  headerRow.forEach((h, i) => {
    const key = String(h || '').trim().toLowerCase()
    for (const [col, names] of Object.entries(ALIASES)) if (names.includes(key) && index[col] === undefined) index[col] = i
  })
  return index
}

const clean = (v, max) => {
  const s = String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  return s.length > max ? s.slice(0, max) : s
}

/**
 * Validates parsed rows against the organization's state.
 * @param ctx.cohortsByName Map<lowercased name, cohort> the uploader may use
 * @param ctx.defaultCohort cohort chosen in the wizard (optional)
 * @param ctx.memberEmails  Set of lowercased emails already ACTIVE students
 * @param ctx.pendingEmails Set of lowercased emails with a pending student invite
 */
export function validateImport(rows, { cohortsByName = new Map(), defaultCohort = null, memberEmails = new Set(), pendingEmails = new Set() } = {}) {
  if (!rows.length) return { error: 'EMPTY_FILE' }
  const header = mapHeader(rows[0])
  if (header.email === undefined) return { error: 'MISSING_EMAIL_COLUMN' }
  const body = rows.slice(1)
  if (body.length > IMPORT_LIMITS.maxRows) return { error: 'TOO_MANY_ROWS' }
  const seen = new Map()
  const out = body.map((cells, i) => {
    const rowNumber = i + 2 // the header is row 1
    const raw = Object.fromEntries(IMPORT_COLUMNS.filter((c) => header[c] !== undefined).map((c) => [c, clean(cells[header[c]], 320)]))
    const errors = []
    const email = String(raw.email || '').toLowerCase()
    if (!email) errors.push('EMAIL_MISSING')
    else if (!EMAIL.test(email)) errors.push('EMAIL_INVALID')
    else if (seen.has(email)) errors.push('DUPLICATE_IN_FILE')
    if (email && !seen.has(email)) seen.set(email, rowNumber)
    const cohortName = clean(raw.cohort, 160)
    const cohort = cohortName ? cohortsByName.get(cohortName.toLowerCase()) || null : defaultCohort
    if (cohortName && !cohort) errors.push('UNKNOWN_COHORT')
    if (!cohortName && !defaultCohort) errors.push('COHORT_MISSING')
    const normalized = errors.length ? null : {
      email,
      name: clean(raw.name, 160) || null,
      studentIdentifier: clean(raw.student_identifier, 80) || null,
      department: clean(raw.department, 160) || null,
      cohortId: cohort.id,
      cohortName: cohort.name,
    }
    let action = 'ERROR'
    if (!errors.length) action = memberEmails.has(email) ? 'ALREADY_MEMBER' : 'INVITE'
    return { rowNumber, raw, normalized, errors, action, pendingInvite: !errors.length && pendingEmails.has(email) }
  })
  const totals = {
    rows: out.length,
    invite: out.filter((r) => r.action === 'INVITE').length,
    alreadyMember: out.filter((r) => r.action === 'ALREADY_MEMBER').length,
    errors: out.filter((r) => r.action === 'ERROR').length,
  }
  return { rows: out, totals }
}

// Spreadsheet formula injection guard for CSV exports (OWASP CSV injection).
export function csvCell(value) {
  let s = value == null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
