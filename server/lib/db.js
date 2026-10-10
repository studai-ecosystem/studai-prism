// v1 user-store dispatcher.
//
// Selects the backend ONCE at module load:
//   • PRISM_PG_STORE=true AND DATABASE_URL set  → PostgreSQL (dbPg.js)
//   • otherwise                                  → JSON files  (dbJson.js)
//
// Identical signatures + record shapes both ways. Flag off → byte-identical v1.

import { isDbConfigured } from '../db/pool.js'
import * as jsonDb from './dbJson.js'
import * as pgDb from './dbPg.js'

const usePg = process.env.PRISM_PG_STORE === 'true' && isDbConfigured()
const impl = usePg ? pgDb : jsonDb

export const findUserByEmail = impl.findUserByEmail
export const findUserById = impl.findUserById
export const findUsersByIds = impl.findUsersByIds
export const findUsersByEmails = impl.findUsersByEmails
// Where accounts live, so campus directory reads can join them in SQL when
// they are in the same database (PROD-READY Phase 6).
export const USER_STORE_BACKEND = usePg ? 'pg' : 'json'
export const createUser = impl.createUser
export const updateUser = impl.updateUser
export const publicUser = impl.publicUser
export const countUsers = impl.countUsers
export const listUsers = impl.listUsers
export const updateUserAccount = impl.updateUserAccount
export const recordAgeDeclaration = impl.recordAgeDeclaration
export const clearGuardianAgeDeclaration = impl.clearGuardianAgeDeclaration
export const deleteUser = impl.deleteUser
