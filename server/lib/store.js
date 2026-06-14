// v1 store dispatcher.
//
// Selects the persistence backend ONCE at module load:
//   • PRISM_PG_STORE=true AND DATABASE_URL set  → PostgreSQL (storePg.js)
//   • otherwise                                  → JSON files  (storeJson.js)
//
// Callers import from this module and never know which backend is active — the
// two implementations expose identical signatures and record shapes. With the
// flag off the app is byte-identical to the original JSON-file behavior, so v1
// stays fully reproducible (per the build rules).

import logger from './logger.js'
import { isDbConfigured } from '../db/pool.js'
import * as jsonStore from './storeJson.js'
import * as pgStore from './storePg.js'

const usePg = process.env.PRISM_PG_STORE === 'true' && isDbConfigured()
const impl = usePg ? pgStore : jsonStore

logger.info('v1_store_backend', { backend: usePg ? 'postgres' : 'json' })

export const createEntitlement = impl.createEntitlement
export const getEntitlement = impl.getEntitlement
export const createSession = impl.createSession
export const getSession = impl.getSession
export const getRecentScenarioIdsByUser = impl.getRecentScenarioIdsByUser
export const updateSession = impl.updateSession
export const saveReport = impl.saveReport
export const getReport = impl.getReport
export const getReportsByUser = impl.getReportsByUser
export const getAllOverallScores = impl.getAllOverallScores
export const recordEvent = impl.recordEvent
export const getEvents = impl.getEvents
export const recordItem = impl.recordItem
export const getItemsBySession = impl.getItemsBySession
export const getAllItems = impl.getAllItems
export const setCalibration = impl.setCalibration
export const getCalibration = impl.getCalibration
export const recordConsent = impl.recordConsent
export const getConsent = impl.getConsent
export const createDispute = impl.createDispute
export const getDispute = impl.getDispute
export const recordVerification = impl.recordVerification
export const getVerification = impl.getVerification
export const recordDeviceLink = impl.recordDeviceLink
export const getDeviceLink = impl.getDeviceLink
export const eraseSession = impl.eraseSession
