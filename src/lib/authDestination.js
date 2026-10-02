const SEGMENT = '[A-Za-z0-9._~-]+'
const APP = new RegExp(`^/app(?:/(?:home|settings|sharing|evidence|growth|explore|development(?:/missions/${SEGMENT})?|missions/${SEGMENT}|assessment/${SEGMENT}|reports/${SEGMENT}|capabilities(?:/${SEGMENT})?|assessments(?:/${SEGMENT}(?:/(?:briefing|system-check))?)?|campus-invite/${SEGMENT}|campus/${SEGMENT}(?:/(?:home|assignments(?:/${SEGMENT}(?:/(?:briefing|system-check))?)?|development(?:/missions/${SEGMENT})?|growth|reports/${SEGMENT}))?))?$`)
const LEGACY = new RegExp(`^/(?:dashboard|profile|payment|briefing|verify-identity|link-phone|room-scan|assessment|score|explore|invite/${SEGMENT}|workspace/${SEGMENT}|report/${SEGMENT}/(?:v2|employee)|missions(?:/${SEGMENT})?)$`)
const CAMPUS = new RegExp(`^/campus/${SEGMENT}(?:/${SEGMENT})*$`)

export function parseAuthDestination(search) {
  const raw = new URLSearchParams(search).get('next')
  if (raw === null) return { next: null, invalid: false }
  try {
    const decoded = decodeURIComponent(raw)
    if (!raw.startsWith('/') || raw.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(decoded)) return { next: null, invalid: true }
    const url = new URL(raw, 'https://prism.invalid')
    const pathname = decodeURIComponent(url.pathname)
    if (url.origin !== 'https://prism.invalid' || decoded.split(/[?#]/)[0].split('/').some((part) => part === '.' || part === '..')) {
      return { next: null, invalid: true }
    }
    if (!APP.test(pathname) && !LEGACY.test(pathname) && !CAMPUS.test(pathname)) return { next: null, invalid: true }
    return { next: raw, invalid: false }
  } catch {
    return { next: null, invalid: true }
  }
}

export function accountDestination(next, invitation) {
  return next || (invitation ? `/invite/${encodeURIComponent(invitation)}` : '/app')
}
