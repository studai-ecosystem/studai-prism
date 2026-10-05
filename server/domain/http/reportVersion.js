import { ApiError } from './errors.js'

export function readReportVersion(query) {
  const value = query?.version
  if (value == null) return null
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new ApiError('VALIDATION_FAILED', 'Choose a valid report version.')
  }
  return Number(value)
}
